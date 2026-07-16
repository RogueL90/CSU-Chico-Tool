import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { watchLocation, watchHeading, distanceMeters } from '../../../../maps-api/location';

// Re-fetch the route once the user has moved this far from its origin.
const REROUTE_THRESHOLD_METERS = 30;

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MINI_W = Math.round(SCREEN_WIDTH * 0.72);
const MINI_H = 130;

const MINI_DELTA = 0.004;
const FULL_DELTA = 0.003;

const MODES = [
  { key: 'WALKING', icon: '🚶', label: 'Walk' },
  { key: 'DRIVING', icon: '🚗', label: 'Drive' },
];

/**
 * Format a duration in minutes as a clean human-readable string:
 * 45 -> "45 min", 328 -> "5 hr 28 min", 1500 -> "1 d 1 hr"
 */
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

/**
 * Mini non-interactive map card in the chat. Tapping expands to a
 * full-screen map with walking/driving directions from the user's
 * current location and an ETA, presented in a bottom sheet.
 *
 * Props:
 *   map - { label: string, lat: number, lng: number, address?: string }
 */
export default function MapOutput({ map }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('WALKING');
  const [eta, setEta] = useState(null);
  const [routeError, setRouteError] = useState(false);
  // Route origin: updated only after real movement so we don't re-fetch
  // the route on every GPS fix.
  const [userLoc, setUserLoc] = useState(null);
  // Live position + compass heading: updated on every fix, drives the
  // user marker (blue dot with direction cone).
  const [liveLoc, setLiveLoc] = useState(null);
  const [heading, setHeading] = useState(0);
  const userLocRef = useRef(null);
  const hasFitRef = useRef(false);
  const mapRef = useRef(null);

  // Track position + compass at navigation accuracy while the map is open
  useEffect(() => {
    if (!expanded) {
      setEta(null);
      setRouteError(false);
      return;
    }

    let stopPos = null;
    let stopHeading = null;
    let cancelled = false;

    watchLocation((pos) => {
      setLiveLoc({ lat: pos.lat, lng: pos.lng });
      const prev = userLocRef.current;
      // First fix, or moved far enough to justify a re-route
      if (!prev || distanceMeters(prev, pos) >= REROUTE_THRESHOLD_METERS) {
        userLocRef.current = { lat: pos.lat, lng: pos.lng };
        setUserLoc(userLocRef.current);
      }
    }).then((stopFn) => {
      if (cancelled) stopFn?.();
      else stopPos = stopFn;
    });

    watchHeading(setHeading).then((stopFn) => {
      if (cancelled) stopFn?.();
      else stopHeading = stopFn;
    });

    return () => {
      cancelled = true;
      stopPos?.();
      stopHeading?.();
      userLocRef.current = null;
      hasFitRef.current = false;
      setUserLoc(null);
      setLiveLoc(null);
    };
  }, [expanded]);

  const label = map.label;
  const address = map.address;
  // Coordinates may arrive as strings from the backend LLM; the map silently
  // shows a default region unless they are real numbers.
  const lat = Number(map.lat);
  const lng = Number(map.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const miniRegion = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: MINI_DELTA,
    longitudeDelta: MINI_DELTA,
  };

  const fullRegion = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: FULL_DELTA,
    longitudeDelta: FULL_DELTA,
  };

  const routing = userLoc && !eta;

  return (
    <View style={styles.wrapper}>
      {/* ── Mini map card (non-interactive, tappable) ── */}
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Expand map: ${label}`}
      >
        <MapView
          provider={PROVIDER_GOOGLE}
          style={{ width: MINI_W, height: MINI_H }}
          region={miniRegion}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents="none"
          liteMode={true}
          showsUserLocation
        >
          <Marker coordinate={{ latitude: lat, longitude: lng }} title={label} />
        </MapView>

        {/* Expand hint */}
        <View style={styles.expandBadge}>
          <Text style={styles.expandBadgeText}>Directions</Text>
        </View>

        {/* Footer: name + address */}
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

      {/* ── Full-screen modal ── */}
      <Modal
        visible={expanded}
        animationType="slide"
        onRequestClose={() => setExpanded(false)}
        statusBarTranslucent
      >
        <StatusBar barStyle="dark-content" />

        {/* Map fills the entire screen */}
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={fullRegion}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled
          showsCompass
          showsBuildings
          showsTraffic={mode === 'DRIVING'}
          mapPadding={{ top: 0, right: 0, bottom: 240, left: 0 }}
        >
          <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            title={label}
            pinColor="#C8102E"
          />
          {/* Live user marker: blue dot + compass direction cone */}
          {liveLoc && (
            <Marker
              coordinate={{ latitude: liveLoc.lat, longitude: liveLoc.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={heading}
              zIndex={10}
            >
              <View style={styles.userMarker}>
                <View style={styles.userCone} />
                <View style={styles.userDot} />
              </View>
            </Marker>
          )}
          {userLoc && (
            <MapViewDirections
              origin={{ latitude: userLoc.lat, longitude: userLoc.lng }}
              destination={{ latitude: lat, longitude: lng }}
              apikey={GOOGLE_MAPS_API_KEY}
              mode={mode}
              strokeWidth={5}
              strokeColor="#C8102E"
              precision="high"
              resetOnChange={false}
              onReady={(result) => {
                setEta({
                  minutes: result.duration,
                  miles: (result.distance * 0.621371).toFixed(1),
                });
                // Auto-zoom to the route once per open; after that the user
                // controls the camera (re-routes shouldn't yank it away).
                if (!hasFitRef.current) {
                  hasFitRef.current = true;
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
                    animated: true,
                  });
                }
              }}
              onError={(error) => {
                console.error('Directions error:', error);
                setEta(null);
                setRouteError(true);
              }}
            />
          )}
        </MapView>

        {/* Close button */}
        <SafeAreaView style={styles.closeWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setExpanded(false)}
            accessibilityRole="button"
            accessibilityLabel="Close map"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          {/* Re-center on my position */}
          {liveLoc && (
            <TouchableOpacity
              style={[styles.closeBtn, styles.recenterBtn]}
              onPress={() =>
                mapRef.current?.animateToRegion(
                  {
                    latitude: liveLoc.lat,
                    longitude: liveLoc.lng,
                    latitudeDelta: FULL_DELTA,
                    longitudeDelta: FULL_DELTA,
                  },
                  350
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Center map on my location"
            >
              <Text style={styles.closeBtnText}>◉</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>

        {/* ── Bottom sheet ── */}
        <View style={styles.sheet}>
          <View style={styles.grabber} />

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
                style={[styles.segmentBtn, mode === m.key && styles.segmentBtnActive]}
                onPress={() => {
                  if (mode !== m.key) {
                    setMode(m.key);
                    setEta(null);
                    setRouteError(false);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Route by ${m.label.toLowerCase()}`}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === m.key && styles.segmentTextActive,
                  ]}
                >
                  {m.icon}  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ETA */}
          <View style={styles.etaRow}>
            {!userLoc ? (
              <Text style={styles.etaHint}>Enable location to see directions</Text>
            ) : routeError ? (
              <Text style={styles.etaHint}>Route unavailable</Text>
            ) : routing ? (
              <>
                <ActivityIndicator size="small" color="#C8102E" />
                <Text style={styles.etaHint}>Finding route…</Text>
              </>
            ) : (
              <>
                <Text style={styles.etaTime}>{formatDuration(eta.minutes)}</Text>
                <Text style={styles.etaDistance}>{eta.miles} mi</Text>
              </>
            )}
          </View>

          {/* Back to chat */}
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },

  /* ── Mini card ── */
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

  /* ── Close button ── */
  closeWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingTop: 8,
    paddingRight: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  recenterBtn: {
    marginTop: 10,
  },

  /* ── Live user marker (dot + heading cone) ── */
  userMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  userCone: {
    position: 'absolute',
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(0,122,255,0.35)',
  },
  userDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  /* ── Bottom sheet ── */
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34, // clears home indicator
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5EA',
    marginBottom: 12,
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
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 3,
    marginTop: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8A8E',
  },
  segmentTextActive: {
    color: '#1a1a1a',
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

  backBtn: {
    backgroundColor: '#C8102E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
