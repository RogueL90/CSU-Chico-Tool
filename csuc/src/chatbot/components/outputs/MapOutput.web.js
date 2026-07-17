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
import { distanceMeters } from '../../../../maps-api/location';
import PlaceInfo from './map/PlaceInfo';
import StepsList from './map/StepsList';

// Web fork of MapOutput. Metro resolves this file instead of
// MapOutput.js when bundling for web — react-native-maps is native-only.
// Renders with the Google Maps JavaScript API (same tiles as the mobile
// Google Maps) and draws routes as our own solid polylines — red
// selected / gray alternates, exactly like the native app. Route data
// comes through the Lambda /directions proxy (Google's Directions REST
// API blocks browser CORS).

const MINI_H = 150;
const REROUTE_THRESHOLD_METERS = 30;

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

// ── Maps JavaScript API loader (one script tag, cached promise) ──
let mapsPromise = null;
function loadGoogleMaps() {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async&callback=__onGMapsReady`;
    window.__onGMapsReady = () => resolve(window.google.maps);
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error('Google Maps JS failed to load'));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

/**
 * A real google.maps.Map in a div. Mobile-app look: no desktop controls,
 * no clickable POI popups — just the map.
 *
 * Props:
 *   center      - { lat, lng }
 *   zoom        - initial zoom
 *   interactive - pan/zoom gestures on/off (mini card is inert)
 *   onMap       - callback(map, mapsSdk) once the map exists
 */
function WebMap({ center, zoom, interactive, onMap }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let map = null;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !hostRef.current) return;
      map = new maps.Map(hostRef.current, {
        center,
        zoom,
        disableDefaultUI: true,
        clickableIcons: false,
        keyboardShortcuts: false,
        gestureHandling: interactive ? 'greedy' : 'none',
      });
      onMap?.(map, maps);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
    // Recreating the map on prop changes would flash tiles; the parent
    // moves the camera through the map instance instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

/**
 * Props:
 *   map - { label: string, lat: number, lng: number, address?: string }
 */
export default function MapOutput({ map }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('walking');
  // Route origin: first GPS fix, refreshed after real movement only.
  const [origin, setOrigin] = useState(null);
  const [placeInfo, setPlaceInfo] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fetching, setFetching] = useState(false);

  // Full-screen map instance + overlay handles (imperative Google objects)
  const fullMapRef = useRef(null); // { map, maps }
  const polylinesRef = useRef([]);
  const destMarkerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const hasFitRef = useRef(false);
  const routesRef = useRef({ routes: [], selectedIdx: 0 });

  const { width: windowWidth } = useWindowDimensions();
  const miniWidth = Math.round(Math.min(windowWidth, 480) * 0.72);

  const label = map.label;
  const address = map.address;
  const lat = Number(map.lat);
  const lng = Number(map.lng);
  const validCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // ── Live browser geolocation while the full map is open ──
  useEffect(() => {
    if (!expanded || !navigator?.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Blue dot follows every fix
        const handles = fullMapRef.current;
        if (handles && !userMarkerRef.current) {
          userMarkerRef.current = new handles.maps.Marker({
            map: handles.map,
            position: next,
            zIndex: 10,
            icon: {
              path: handles.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#007AFF',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
            },
            clickable: false,
          });
        } else {
          userMarkerRef.current?.setPosition(next);
        }
        // Route origin only moves after real movement (avoids re-routing
        // on GPS jitter)
        setOrigin((prev) =>
          !prev || distanceMeters(prev, next) >= REROUTE_THRESHOLD_METERS
            ? next
            : prev
        );
      },
      () => {}, // denied/unavailable -> map still shows the destination
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
    };
  }, [expanded]);

  // ── Place details (summary, hours, phone) for the sheet ──
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

  // ── Route fetch (stale-while-revalidate, like native) ──
  useEffect(() => {
    if (!expanded || !origin || !validCoords) return undefined;
    let stale = false;
    setFetching(true);
    getRoutes(origin, { lat, lng }, mode).then((result) => {
      if (stale) return;
      setFetching(false);
      setRoutes(result);
      setSelectedIdx(0);
    });
    return () => {
      stale = true;
    };
  }, [expanded, origin, mode, lat, lng, validCoords]);

  // ── Draw route polylines on the full map ──
  const drawRoutes = () => {
    const handles = fullMapRef.current;
    if (!handles) return;
    const { map: gmap, maps } = handles;
    const { routes: allRoutes, selectedIdx: sel } = routesRef.current;

    polylinesRef.current.forEach((line) => line.setMap(null));
    polylinesRef.current = [];

    allRoutes.forEach((route, i) => {
      if (route.coordinates.length < 2) return;
      const path = route.coordinates.map((c) => ({
        lat: c.latitude,
        lng: c.longitude,
      }));
      const selected = i === sel;
      const line = new maps.Polyline({
        map: gmap,
        path,
        strokeColor: selected ? '#C8102E' : '#9AA0A6',
        strokeWeight: selected ? 5 : 4,
        strokeOpacity: 1,
        zIndex: selected ? 2 : 1,
        clickable: !selected,
      });
      if (!selected) {
        line.addListener('click', () => setSelectedIdx(i));
      }
      polylinesRef.current.push(line);
    });

    // Frame every route option once per open; afterwards the user owns
    // the camera.
    if (!hasFitRef.current && allRoutes.length) {
      hasFitRef.current = true;
      const bounds = new maps.LatLngBounds();
      allRoutes.forEach((route) =>
        route.coordinates.forEach((c) =>
          bounds.extend({ lat: c.latitude, lng: c.longitude })
        )
      );
      gmap.fitBounds(bounds, { top: 80, right: 40, bottom: 320, left: 40 });
    }
  };

  useEffect(() => {
    routesRef.current = { routes, selectedIdx };
    drawRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selectedIdx]);

  // ── Reset per-open state when the modal closes ──
  useEffect(() => {
    if (expanded) return;
    setRoutes([]);
    setSelectedIdx(0);
    setOrigin(null);
    hasFitRef.current = false;
    fullMapRef.current = null;
    polylinesRef.current = [];
    destMarkerRef.current = null;
  }, [expanded]);

  if (!validCoords) return null;

  const route = routes[selectedIdx] || null;

  const handleFullMap = (gmap, maps) => {
    fullMapRef.current = { map: gmap, maps };
    destMarkerRef.current = new maps.Marker({
      map: gmap,
      position: { lat, lng },
      title: label,
    });
    drawRoutes();
  };

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
          <WebMap
            center={{ lat, lng }}
            zoom={16}
            interactive={false}
            onMap={(gmap, maps) => {
              new maps.Marker({ map: gmap, position: { lat, lng }, title: label });
            }}
          />
          {/* Catch the click so the card expands */}
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
            <WebMap
              center={{ lat, lng }}
              zoom={16}
              interactive
              onMap={handleFullMap}
            />
          </View>

          <BottomSheet
            snapPoints={[300, '65%']}
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
  stepsScroll: {
    maxHeight: 300,
  },
});
