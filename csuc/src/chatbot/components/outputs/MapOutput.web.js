import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { getPlaceDetails } from '../../../../maps-api/places';
import { getRoutes } from '../../../../maps-api/directions';
import PlaceInfo from './map/PlaceInfo';
import StepsList from './map/StepsList';

// Web fork of MapOutput. Metro resolves this file instead of
// MapOutput.js when bundling for web — react-native-maps is native-only.
// Mirrors the native layout: full-screen map (Google Maps Embed API
// iframe) with the same @gorhom bottom sheet at the bottom hosting the
// card content. The Directions REST API blocks browser CORS, so the
// ETA/turn-by-turn list stays mobile-only — the directions iframe draws
// the route and ETA on the map itself.

const MINI_H = 150;

const EMBED_BASE = 'https://www.google.com/maps/embed/v1';
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const MODES = [
  { key: 'walking', label: 'Walk' },
  { key: 'driving', label: 'Drive' },
];

// Same formatting as the native MapOutput: 45 -> "45 min", 328 -> "5 hr 28 min"
function formatDuration(minutes) {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (h < 24) return remMin ? `${h} hr ${remMin} min` : `${h} hr`;
  const d = Math.floor(h / 24);
  const remHr = h % 24;
  return remHr ? `${d} d ${remHr} hr` : `${d} d`;
}

function MapFrame({ src, style }) {
  // Plain DOM iframe — react-native-web renders to the DOM, so this is
  // legal in a .web.js file.
  return (
    <iframe
      src={src}
      style={{ border: 0, display: 'block', width: '100%', height: '100%', ...style }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Map"
    />
  );
}

/**
 * Props:
 *   map - { label: string, lat: number, lng: number, address?: string }
 */
export default function MapOutput({ map }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('walking');
  // Browser geolocation for the directions origin; null until granted.
  const [origin, setOrigin] = useState(null);
  const [placeInfo, setPlaceInfo] = useState(null);
  // Route (via the Lambda /directions proxy) for the ETA + steps list
  const [routes, setRoutes] = useState([]);
  const [fetching, setFetching] = useState(false);
  const sheetRef = useRef(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const miniWidth = Math.round(Math.min(windowWidth, 480) * 0.72);
  const sheetMax = Math.round(windowHeight * 0.65);

  const label = map.label;
  const address = map.address;
  const lat = Number(map.lat);
  const lng = Number(map.lng);
  const validCoords = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!expanded || origin || !navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // denied/unavailable -> stay in place mode
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [expanded, origin]);

  // Place details (summary, hours, phone) for the sheet — the Places
  // API (New) supports browser CORS, so the shared module works here.
  useEffect(() => {
    if (!expanded || !validCoords) {
      setPlaceInfo(null);
      return undefined;
    }
    let stale = false;
    getPlaceDetails(label, { lat, lng }).then((details) => {
      if (!stale) setPlaceInfo(details);
    });
    return () => {
      stale = true;
    };
  }, [expanded, label, lat, lng, validCoords]);

  // Route fetch — mirrors the native flow (origin, destination, mode).
  useEffect(() => {
    if (!expanded || !origin || !validCoords) {
      setRoutes([]);
      return undefined;
    }
    let stale = false;
    setFetching(true);
    getRoutes(origin, { lat, lng }, mode).then((result) => {
      if (stale) return;
      setFetching(false);
      setRoutes(result);
    });
    return () => {
      stale = true;
    };
  }, [expanded, origin, mode, lat, lng, validCoords]);

  if (!validCoords) return null;

  const route = routes[0] || null;

  const placeSrc = `${EMBED_BASE}/place?key=${KEY}&q=${lat},${lng}&zoom=17`;
  const directionsSrc = origin
    ? `${EMBED_BASE}/directions?key=${KEY}&origin=${origin.lat},${origin.lng}` +
      `&destination=${lat},${lng}&mode=${mode}`
    : placeSrc;

  return (
    <View style={styles.wrapper}>
      {/* ── Mini map card ── */}
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Expand map: ${label}`}
      >
        <View style={{ width: miniWidth, height: MINI_H }}>
          <MapFrame src={placeSrc} />
          {/* Catch the click so the card expands instead of the map panning */}
          <View style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.expandBadge}>
          <Text style={styles.expandBadgeText}>Directions</Text>
        </View>

        <View style={styles.miniFooter}>
          <View style={styles.miniFooterText}>
            <Text style={styles.miniLabel} numberOfLines={1}>{label}</Text>
            {!!address && (
              <Text style={styles.miniAddress} numberOfLines={1}>{address}</Text>
            )}
          </View>
          <Text style={styles.miniChevron}>›</Text>
        </View>
      </TouchableOpacity>

      {/* ── Full-screen map + bottom sheet (native layout) ── */}
      <Modal
        visible={expanded}
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
        transparent={false}
      >
        {/* RN Modal portals outside the app root, so the sheet needs its
            own gesture root here too */}
        <GestureHandlerRootView style={styles.full}>
          <View style={StyleSheet.absoluteFill}>
            <MapFrame src={directionsSrc} />
          </View>

          <BottomSheet
            ref={sheetRef}
            snapPoints={[300, sheetMax]}
            index={0}
            enableDynamicSizing={false}
            enablePanDownToClose={false}
            handleIndicatorStyle={styles.grabber}
            backgroundStyle={styles.sheetBg}
          >
            <BottomSheetScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Destination */}
              <Text style={styles.sheetTitle} numberOfLines={1}>{label}</Text>
              {!!address && (
                <Text style={styles.sheetAddress} numberOfLines={1}>{address}</Text>
              )}

              {/* Mode segmented control */}
              <View style={styles.segment}>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[
                      styles.segmentBtn,
                      mode === m.key && styles.segmentBtnActive,
                    ]}
                    onPress={() => setMode(m.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Route by ${m.label.toLowerCase()}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        mode === m.key && styles.segmentTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ETA */}
              <View style={styles.etaRow}>
                {!origin ? (
                  <Text style={styles.etaHint}>
                    Allow location access to see the route from where you are.
                  </Text>
                ) : fetching && !route ? (
                  <>
                    <ActivityIndicator size="small" color="#C8102E" />
                    <Text style={styles.etaHint}>Finding route…</Text>
                  </>
                ) : route ? (
                  <>
                    <Text style={styles.etaTime}>{formatDuration(route.minutes)}</Text>
                    <Text style={styles.etaDistance}>{route.miles} mi</Text>
                  </>
                ) : (
                  <Text style={styles.etaHint}>Route unavailable</Text>
                )}
              </View>

              {/* Back to chat */}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setExpanded(false)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Back to chat"
                >
                  <Text style={styles.backBtnText}>Back to Chat</Text>
                </TouchableOpacity>
              </View>

              {/* Place details — below the fold until the sheet is dragged up */}
              <PlaceInfo info={placeInfo} label={label} />

              {/* Directions: capped height with its own inner scroll,
                  same as the native sheet */}
              {route?.steps?.length > 0 && (
                <ScrollView
                  style={styles.stepsScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  <StepsList steps={route.steps} />
                </ScrollView>
              )}
            </BottomSheetScrollView>
          </BottomSheet>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },

  /* ── Mini card (matches the native card) ── */
  miniCard: {
    borderRadius: 18,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  expandBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#C8102E',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  expandBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  miniFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  miniFooterText: {
    flex: 1,
  },
  miniLabel: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '700',
  },
  miniAddress: {
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: 1,
  },
  miniChevron: {
    fontSize: 22,
    color: '#C8C8CC',
    fontWeight: '300',
    marginLeft: 8,
  },

  /* ── Full-screen view + bottom sheet (matches the native sheet) ── */
  full: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  sheetBg: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
  },
  sheetBody: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  sheetAddress: {
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: '#C8102E',
    borderColor: '#C8102E',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3A3A3C',
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: '#fff',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
    minHeight: 30,
  },
  etaTime: {
    fontSize: 26,
    fontWeight: '800',
    color: '#C8102E',
    letterSpacing: -0.5,
  },
  etaDistance: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8A8A8E',
  },
  etaHint: {
    fontSize: 14,
    color: '#8A8A8E',
    alignSelf: 'center',
  },
  stepsScroll: {
    maxHeight: 300,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  backBtn: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: {
    color: '#C8102E',
    fontSize: 15,
    fontWeight: '700',
  },
});
