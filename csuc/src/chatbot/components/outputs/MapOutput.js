import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  PanResponder,
  Modal,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { watchLocation, watchHeading, distanceMeters } from '../../../../maps-api/location';
import { getRoutes } from '../../../../maps-api/directions';
import StepsList from './map/StepsList';
import NavBanner from './map/NavBanner';

// Navigation-mode tuning
const STEP_ADVANCE_METERS = 15; // reached the maneuver point
const OFF_ROUTE_METERS = 50; // this far from the route line...
const OFF_ROUTE_FIXES = 2; // ...for this many consecutive fixes -> re-route
const CAMERA_THROTTLE_MS = 900;

function metersToDisplay(m) {
  const feet = m * 3.28084;
  if (feet < 1000) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  return `${(m / 1609.344).toFixed(1)} mi`;
}

// Re-fetch the route once the user has moved this far from its origin.
const REROUTE_THRESHOLD_METERS = 30;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINI_W = Math.round(SCREEN_WIDTH * 0.72);
const MINI_H = 130;

// Bottom sheet snap geometry: the sheet is always SHEET_H tall; translateY
// slides it between expanded (0), collapsed (summary only), and dismissed.
const SHEET_H = Math.round(SCREEN_HEIGHT * 0.65);
const COLLAPSED_VISIBLE = 300;
const COLLAPSED_OFFSET = Math.max(0, SHEET_H - COLLAPSED_VISIBLE);

const MINI_DELTA = 0.004;
const FULL_DELTA = 0.003;

const MODES = [
  { key: 'WALKING', label: 'Walk' },
  { key: 'DRIVING', label: 'Drive' },
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
  // All routes from the Directions API (index 0 = Google's best) and
  // which one the user has selected.
  const [routes, setRoutes] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [routeError, setRouteError] = useState(false);
  // Route origin: updated only after real movement so we don't re-fetch
  // the route on every GPS fix.
  const [userLoc, setUserLoc] = useState(null);
  // Live position + compass heading: updated on every fix, drives the
  // user marker (blue dot with direction cone).
  const [liveLoc, setLiveLoc] = useState(null);
  const [heading, setHeading] = useState(0);
  // Live navigation mode
  const [navMode, setNavMode] = useState(false);
  const [navStepIdx, setNavStepIdx] = useState(0);
  const [followSuspended, setFollowSuspended] = useState(false);
  const lastCameraRef = useRef(0);
  const offRouteCountRef = useRef(0);
  const reroutingRef = useRef(false);

  const userLocRef = useRef(null);
  const hasFitRef = useRef(false);
  const mapRef = useRef(null);
  const sheetTranslateY = useRef(new Animated.Value(SHEET_H)).current;
  // Which snap point the sheet is resting at: 'collapsed' | 'expanded'
  const snapRef = useRef('collapsed');

  const snapTo = (value, onDone) => {
    Animated.timing(sheetTranslateY, {
      toValue: value,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone?.();
    });
  };

  const finishClosingMap = () => {
    setExpanded(false);
    snapRef.current = 'collapsed';
    sheetTranslateY.setValue(SHEET_H);
  };

  const closeMap = () => snapTo(SHEET_H, finishClosingMap);

  // Drag between snap points: collapsed <-> expanded, or down to dismiss.
  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        const base = snapRef.current === 'expanded' ? 0 : COLLAPSED_OFFSET;
        const next = Math.min(SHEET_H, Math.max(0, base + gesture.dy));
        sheetTranslateY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const fast = Math.abs(gesture.vy) > 0.5;
        if (snapRef.current === 'collapsed') {
          if (gesture.dy < -40 || (fast && gesture.vy < 0)) {
            snapRef.current = 'expanded';
            snapTo(0);
          } else if (gesture.dy > 70 || (fast && gesture.vy > 0)) {
            closeMap();
          } else {
            snapTo(COLLAPSED_OFFSET);
          }
        } else {
          if (gesture.dy > COLLAPSED_OFFSET + 80) {
            closeMap();
          } else if (gesture.dy > 50 || (fast && gesture.vy > 0)) {
            snapRef.current = 'collapsed';
            snapTo(COLLAPSED_OFFSET);
          } else {
            snapTo(0);
          }
        }
      },
      onPanResponderTerminate: () => {
        snapTo(snapRef.current === 'expanded' ? 0 : COLLAPSED_OFFSET);
      },
    })
  ).current;

  // Track position + compass at navigation accuracy while the map is open
  useEffect(() => {
    if (!expanded) {
      setRoutes([]);
      setSelectedIdx(0);
      setRouteError(false);
      setNavMode(false);
      setNavStepIdx(0);
      setFollowSuspended(false);
      return;
    }

    snapRef.current = 'collapsed';
    sheetTranslateY.setValue(SHEET_H);
    snapTo(COLLAPSED_OFFSET);

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
  const validCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // Fetch routes (with alternates) whenever the origin or mode changes.
  // Suspended during navigation — the off-route logic below owns re-routing.
  useEffect(() => {
    if (!expanded || !userLoc || !validCoords || navMode) return;
    let stale = false;
    setFetching(true);

    getRoutes(userLoc, { lat, lng }, mode).then((result) => {
      if (stale) return;
      setFetching(false);
      setRoutes(result);
      setSelectedIdx(0);
      setRouteError(result.length === 0);

      // Auto-zoom to show every route option once per open; after that
      // the user controls the camera.
      if (result.length && !hasFitRef.current) {
        hasFitRef.current = true;
        mapRef.current?.fitToCoordinates(
          result.flatMap((r) => r.coordinates),
          {
            edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
            animated: true,
          }
        );
      }
    });

    return () => {
      stale = true;
    };
  }, [expanded, userLoc, mode, lat, lng, validCoords, navMode]);

  // Navigation mode: camera follow, step progression, off-route re-routing
  useEffect(() => {
    if (!navMode || !liveLoc) return;
    const route = routes[selectedIdx];
    if (!route) return;

    // Heading-up camera follow, throttled so animations don't pile up
    const now = Date.now();
    if (!followSuspended && now - lastCameraRef.current > CAMERA_THROTTLE_MS) {
      lastCameraRef.current = now;
      mapRef.current?.animateCamera(
        {
          center: { latitude: liveLoc.lat, longitude: liveLoc.lng },
          heading,
          pitch: 45,
          zoom: 17.5,
        },
        { duration: 800 }
      );
    }

    // Advance to the next step once we reach the current maneuver point
    let idx = navStepIdx;
    while (
      idx < route.steps.length - 1 &&
      distanceMeters(liveLoc, route.steps[idx].endLocation) < STEP_ADVANCE_METERS
    ) {
      idx += 1;
    }
    if (idx !== navStepIdx) setNavStepIdx(idx);

    // Off-route: far from every point of the route line for several fixes
    let minDist = Infinity;
    for (const c of route.coordinates) {
      const d = distanceMeters(liveLoc, { lat: c.latitude, lng: c.longitude });
      if (d < minDist) minDist = d;
      if (minDist < OFF_ROUTE_METERS) break;
    }
    if (minDist > OFF_ROUTE_METERS) {
      offRouteCountRef.current += 1;
      if (offRouteCountRef.current >= OFF_ROUTE_FIXES && !reroutingRef.current) {
        reroutingRef.current = true;
        getRoutes(liveLoc, { lat, lng }, mode).then((result) => {
          reroutingRef.current = false;
          offRouteCountRef.current = 0;
          if (result.length) {
            setRoutes(result);
            setSelectedIdx(0);
            setNavStepIdx(0);
          }
        });
      }
    } else {
      offRouteCountRef.current = 0;
    }
  }, [navMode, liveLoc, heading, followSuspended, routes, selectedIdx, navStepIdx, lat, lng, mode]);

  if (!validCoords) return null;

  const selectedRoute = routes[selectedIdx] || null;
  const eta = selectedRoute
    ? { minutes: selectedRoute.minutes, miles: selectedRoute.miles }
    : null;

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

  const routing = userLoc && !routeError && (fetching || !eta);

  // Navigation-mode derived values
  const currentStep = navMode ? selectedRoute?.steps[navStepIdx] : null;
  const distToManeuver =
    navMode && liveLoc && currentStep
      ? metersToDisplay(distanceMeters(liveLoc, currentStep.endLocation))
      : '';
  const remaining =
    navMode && selectedRoute
      ? selectedRoute.steps.slice(navStepIdx).reduce(
          (acc, s) => ({
            sec: acc.sec + s.durationSeconds,
            meters: acc.meters + s.distanceMeters,
          }),
          { sec: 0, meters: 0 }
        )
      : null;

  const startNavigation = () => {
    setNavMode(true);
    setNavStepIdx(0);
    setFollowSuspended(false);
    offRouteCountRef.current = 0;
    snapTo(SHEET_H); // hide the sheet; nav bar takes over
  };

  const exitNavigation = () => {
    setNavMode(false);
    setNavStepIdx(0);
    setFollowSuspended(false);
    snapRef.current = 'collapsed';
    snapTo(COLLAPSED_OFFSET);
    if (selectedRoute) {
      mapRef.current?.fitToCoordinates(selectedRoute.coordinates, {
        edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
        animated: true,
      });
    }
  };



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
        animationType="fade"
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
          mapPadding={{ top: 0, right: 0, bottom: navMode ? 100 : 240, left: 0 }}
          onPanDrag={navMode ? () => setFollowSuspended(true) : undefined}
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
          {/* Alternate routes (gray, tappable) under the selected one */}
          {!navMode &&
            routes.map((route, i) =>
            i === selectedIdx ? null : (
              <Polyline
                key={`alt-${i}`}
                coordinates={route.coordinates}
                strokeColor="#9AA0A6"
                strokeWidth={4}
                tappable
                onPress={() => setSelectedIdx(i)}
                zIndex={1}
              />
            )
          )}
          {selectedRoute && (
            <Polyline
              coordinates={selectedRoute.coordinates}
              strokeColor="#C8102E"
              strokeWidth={5}
              zIndex={2}
            />
          )}
          {/* ETA bubbles on alternates: tap to switch */}
          {!navMode &&
            routes.map((route, i) => {
            if (i === selectedIdx || !route.coordinates.length) return null;
            const mid = route.coordinates[Math.floor(route.coordinates.length / 2)];
            const diff = Math.round(route.minutes - (selectedRoute?.minutes ?? 0));
            return (
              <Marker
                key={`eta-${i}`}
                coordinate={mid}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={5}
                onPress={() => setSelectedIdx(i)}
              >
                <View style={styles.etaBubble}>
                  <Text style={styles.etaBubbleText}>
                    {diff > 0 ? `+${diff} min` : formatDuration(route.minutes)}
                  </Text>
                </View>
              </Marker>
            );
          })}
        </MapView>

        {/* ── Navigation overlays ── */}
        {navMode && <NavBanner step={currentStep} distanceText={distToManeuver} />}
        {navMode && followSuspended && (
          <TouchableOpacity
            style={styles.recenterChip}
            onPress={() => setFollowSuspended(false)}
            accessibilityRole="button"
            accessibilityLabel="Resume following my location"
          >
            <Text style={styles.recenterChipText}>◎ Re-center</Text>
          </TouchableOpacity>
        )}
        {navMode && (
          <View style={styles.navBar}>
            <View style={styles.navBarInfo}>
              <Text style={styles.navBarTime}>
                {remaining ? formatDuration(remaining.sec / 60) : '—'}
              </Text>
              <Text style={styles.navBarDistance}>
                {remaining ? metersToDisplay(remaining.meters) : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.exitBtn}
              onPress={exitNavigation}
              accessibilityRole="button"
              accessibilityLabel="Exit navigation"
            >
              <Text style={styles.exitBtnText}>Exit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Bottom sheet ── */}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View
            style={styles.grabberTouchArea}
            {...sheetPanResponder.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Directions sheet handle"
            accessibilityHint="Drag up for turn-by-turn directions, down to close the map"
          >
            <View style={styles.grabber} />
          </View>

          {/* Destination */}
          <Text style={styles.sheetTitle} numberOfLines={1}>{label}</Text>
          {!!address && (
            <Text style={styles.sheetAddress} numberOfLines={1}>{address}</Text>
          )}

          {/* Mode segmented control + recenter */}
          <View style={styles.segment}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.segmentBtn, mode === m.key && styles.segmentBtnActive]}
                onPress={() => {
                  if (mode !== m.key) {
                    setMode(m.key);
                    setRoutes([]);
                    setSelectedIdx(0);
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
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
            {liveLoc && (
              <TouchableOpacity
                style={styles.recenterBtn}
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
                <Text style={styles.recenterIcon}>◎</Text>
              </TouchableOpacity>
            )}
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

          {/* Actions: back to chat + start navigation */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={closeMap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Back to chat"
            >
              <Text style={styles.backBtnText}>Back to Chat</Text>
            </TouchableOpacity>
            {selectedRoute && liveLoc && (
              <TouchableOpacity
                style={styles.startBtn}
                onPress={startNavigation}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start navigation"
              >
                <Text style={styles.startBtnText}>Start</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Turn-by-turn list — below the fold until the sheet is dragged up */}
          <StepsList steps={selectedRoute?.steps} />
        </Animated.View>
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

  /* ── Alternate-route ETA bubbles ── */
  etaBubble: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0E0E4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  etaBubbleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3A3A3C',
  },

  /* ── Recenter (inline with mode row) ── */
  recenterBtn: {
    width: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  recenterIcon: {
    fontSize: 18,
    color: '#3A3A3C',
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
    height: SHEET_H,
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
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
  },
  grabberTouchArea: {
    minHeight: 36,
    marginTop: -6,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
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
  startBtn: {
    flex: 1,
    backgroundColor: '#C8102E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  /* ── Navigation mode ── */
  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  navBarInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  navBarTime: {
    fontSize: 22,
    fontWeight: '800',
    color: '#C8102E',
  },
  navBarDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8A8E',
  },
  exitBtn: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  exitBtnText: {
    color: '#C8102E',
    fontSize: 14,
    fontWeight: '700',
  },
  recenterChip: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  recenterChipText: {
    color: '#C8102E',
    fontSize: 13,
    fontWeight: '700',
  },
});
