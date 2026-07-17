import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetView,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { watchLocation, watchHeading, distanceMeters } from '../../../../maps-api/location';
import { getRoutes } from '../../../../maps-api/directions';
import { getPlaceDetails } from '../../../../maps-api/places';
import StepsList from './map/StepsList';
import NavBanner from './map/NavBanner';
import PlaceInfo from './map/PlaceInfo';

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

// Bottom sheet snap points: low snap shows the summary (name, modes,
// ETA, buttons); high snap reveals place details + turn-by-turn.
const SHEET_H = Math.round(SCREEN_HEIGHT * 0.65);
const COLLAPSED_VISIBLE = 300;

const MINI_DELTA = 0.004;
const FULL_DELTA = 0.003;

const MODES = [
  { key: 'WALKING', label: 'Walk' },
  { key: 'DRIVING', label: 'Drive' },
];

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

function MapPressable({ style, onPressIn, onPressOut, children, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateScale = (toValue, spring = false) => {
    const config = { toValue, useNativeDriver: true };
    (spring
      ? Animated.spring(scale, { ...config, speed: 28, bounciness: 4 })
      : Animated.timing(scale, { ...config, duration: 90, easing: Easing.out(Easing.quad) })
    ).start();
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(event) => { animateScale(0.97); onPressIn?.(event); }}
      onPressOut={(event) => { animateScale(1, true); onPressOut?.(event); }}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
}

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
  const [selectedRouteWidth, setSelectedRouteWidth] = useState(5);
  const [fetching, setFetching] = useState(false);
  const [routeError, setRouteError] = useState(false);
  // Route origin: updated only after real movement so we don't re-fetch
  // the route on every GPS fix.
  const [userLoc, setUserLoc] = useState(null);
  // Live position + compass heading: updated on every fix, drives the
  // user marker (blue dot with direction cone).
  const [liveLoc, setLiveLoc] = useState(null);
  const [heading, setHeading] = useState(0);
  // Place details (summary, hours, phone) shown in the expanded sheet
  const [placeInfo, setPlaceInfo] = useState(null);
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
  // Bumped to force a full MapView remount — the Google iOS renderer can
  // blank its tiles after the prop churn of leaving navigation, and a
  // fresh native map is the only reliable recovery.
  const [mapEpoch, setMapEpoch] = useState(0);
  const pendingFitRef = useRef(false);
  const mapTransition = useRef(new Animated.Value(0)).current;
  const recenterRotation = useRef(new Animated.Value(0)).current;
  // @gorhom/bottom-sheet drives the card: drag anywhere, fluid springs,
  // pinned between the low and high snap (never dismissible by swipe —
  // only the Back to Chat button leaves the map).
  const sheetRef = useRef(null);

  const closeMap = () => {
    Animated.timing(mapTransition, {
      toValue: 0,
      duration: 190,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setExpanded(false);
    });
  };

  const openMap = () => {
    mapTransition.setValue(0);
    setExpanded(true);
    requestAnimationFrame(() => {
      Animated.spring(mapTransition, {
        toValue: 1,
        speed: 22,
        bounciness: 2,
        useNativeDriver: true,
      }).start();
    });
  };

  const recenterMap = () => {
    recenterRotation.setValue(0);
    Animated.spring(recenterRotation, {
      toValue: 1,
      speed: 22,
      bounciness: 5,
      useNativeDriver: true,
    }).start();
    if (liveLoc) {
      mapRef.current?.animateToRegion(
        {
          latitude: liveLoc.lat,
          longitude: liveLoc.lng,
          latitudeDelta: FULL_DELTA,
          longitudeDelta: FULL_DELTA,
        },
        350
      );
    }
  };

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

  // Fetch place details (summary, hours, phone) once per open.
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
      const allCoords = result.flatMap((r) => r.coordinates);
      if (allCoords.length && !hasFitRef.current) {
        hasFitRef.current = true;
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
          animated: true,
        });
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

  useEffect(() => {
    if (!routes[selectedIdx]) return undefined;
    setSelectedRouteWidth(7);
    const settle = setTimeout(() => setSelectedRouteWidth(5), 220);
    return () => clearTimeout(settle);
  }, [routes, selectedIdx]);

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

  // The sheet is conditionally unmounted during navigation (the nav bar
  // takes over the bottom edge); on exit it remounts at the low snap.
  const startNavigation = () => {
    setNavMode(true);
    setNavStepIdx(0);
    setFollowSuspended(false);
    offRouteCountRef.current = 0;
  };

  const exitNavigation = () => {
    setNavMode(false);
    setNavStepIdx(0);
    setFollowSuspended(false);
    // Remount the map instead of mutating the existing one back to browse
    // state — the fit happens in onMapReady once the new map is live.
    pendingFitRef.current = true;
    setMapEpoch((e) => e + 1);
  };

  const handleMapReady = () => {
    if (!pendingFitRef.current) return;
    pendingFitRef.current = false;
    if (selectedRoute?.coordinates.length) {
      mapRef.current?.fitToCoordinates(selectedRoute.coordinates, {
        edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
        animated: false,
      });
    }
  };



  return (
    <View style={styles.wrapper}>
      {/* ── Mini map card (non-interactive, tappable) ── */}
      <MapPressable
        style={styles.miniCard}
        onPress={openMap}
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
      </MapPressable>

      {/* ── Full-screen modal ── */}
      <Modal
        visible={expanded}
        animationType="none"
        onRequestClose={closeMap}
        statusBarTranslucent
      >
        <StatusBar barStyle="dark-content" />

        {/* RNGH needs its own root inside a RN Modal */}
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.modalScene, {
          opacity: mapTransition,
          transform: [{ scale: mapTransition.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }]}>

        {/* Map fills the entire screen */}
        <MapView
          key={`map-${mapEpoch}`}
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={fullRegion}
          onMapReady={handleMapReady}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled
          showsCompass
          showsBuildings
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
          {/* Alternate routes (gray, tappable) under the selected one.
              Kept mounted during navigation (just made invisible) —
              unmounting overlays mid-session blanks the Google renderer
              on iOS, which used to eat the route line on Start. */}
          {routes.map((route, i) =>
            i === selectedIdx || route.coordinates.length < 2 ? null : (
              <Polyline
                key={`alt-${i}`}
                coordinates={route.coordinates}
                strokeColor={navMode ? 'transparent' : '#9AA0A6'}
                strokeWidth={4}
                tappable={!navMode}
                onPress={() => !navMode && setSelectedIdx(i)}
                zIndex={1}
              />
            )
          )}
          {selectedRoute?.coordinates.length >= 2 && (
            <Polyline
              coordinates={selectedRoute.coordinates}
              strokeColor="#C8102E"
              strokeWidth={selectedRouteWidth}
              zIndex={2}
            />
          )}
          {/* ETA bubbles on alternates: tap to switch. Hidden (not
              unmounted) during navigation — see comment on alternates. */}
          {routes.map((route, i) => {
            if (i === selectedIdx || !route.coordinates.length) return null;
            const mid = route.coordinates[Math.floor(route.coordinates.length / 2)];
            const diff = Math.round(route.minutes - (selectedRoute?.minutes ?? 0));
            return (
              <Marker
                key={`eta-${i}`}
                coordinate={mid}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={5}
                opacity={navMode ? 0 : 1}
                onPress={() => !navMode && setSelectedIdx(i)}
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
          <MapPressable
            style={styles.recenterChip}
            onPress={() => setFollowSuspended(false)}
            accessibilityRole="button"
            accessibilityLabel="Resume following my location"
          >
            <Text style={styles.recenterChipText}>◎ Re-center</Text>
          </MapPressable>
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
            <MapPressable
              style={styles.exitBtn}
              onPress={exitNavigation}
              accessibilityRole="button"
              accessibilityLabel="Exit navigation"
            >
              <Text style={styles.exitBtnText}>Exit</Text>
            </MapPressable>
          </View>
        )}

        {/* ── Bottom sheet — Google Maps physics via @gorhom/bottom-sheet:
            drag anywhere on the card, fluid snaps, swipe past the low
            snap to dismiss, scroll<->drag handoff at the top snap ── */}
        {!navMode && (
        <BottomSheet
          ref={sheetRef}
          snapPoints={[COLLAPSED_VISIBLE, SHEET_H]}
          index={0}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          handleIndicatorStyle={styles.grabber}
          backgroundStyle={styles.sheetBg}
        >
          <BottomSheetView style={styles.sheetBody}>
          {/* Destination */}
          <Text style={styles.sheetTitle} numberOfLines={1}>{label}</Text>
          {!!address && (
            <Text style={styles.sheetAddress} numberOfLines={1}>{address}</Text>
          )}

          {/* Mode segmented control + recenter */}
          <View style={styles.segment}>
            {MODES.map((m) => (
              <MapPressable
                key={m.key}
                style={[styles.segmentBtn, mode === m.key && styles.segmentBtnActive]}
                onPress={() => {
                  // Keep the current route drawn while the new mode's routes
                  // load — clearing overlays mid-switch blanks the Google
                  // tile renderer on iOS.
                  if (mode !== m.key) {
                    setMode(m.key);
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
              </MapPressable>
            ))}
            {liveLoc && (
              <MapPressable
                style={styles.recenterBtn}
                onPress={recenterMap}
                accessibilityRole="button"
                accessibilityLabel="Center map on my location"
              >
                <Animated.Text style={[styles.recenterIcon, {
                  transform: [{ rotate: recenterRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '300deg'] }) }],
                }]}>◎</Animated.Text>
              </MapPressable>
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
            <MapPressable
              style={styles.backBtn}
              onPress={closeMap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Back to chat"
            >
              <Text style={styles.backBtnText}>Back to Chat</Text>
            </MapPressable>
            {selectedRoute && liveLoc && (
              <MapPressable
                style={styles.startBtn}
                onPress={startNavigation}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start navigation"
              >
                <Text style={styles.startBtnText}>Start</Text>
              </MapPressable>
            )}
          </View>

          {/* Place details — below the fold until the sheet is dragged up */}
          <PlaceInfo info={placeInfo} label={label} />

          {/* Directions get their own scroll area; the rest of the card
              stays fixed and drags the sheet */}
          <BottomSheetScrollView
            style={styles.stepsScroll}
            contentContainerStyle={styles.stepsScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <StepsList steps={selectedRoute?.steps} />
          </BottomSheetScrollView>
          </BottomSheetView>
        </BottomSheet>
        )}
        </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalScene: { flex: 1, backgroundColor: '#F4F4F6' },
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
  sheetBody: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepsScroll: {
    flex: 1,
  },
  stepsScrollContent: {
    paddingBottom: 34, // clears home indicator
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
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
    backgroundColor: '#C8102E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: {
    color: '#FFFFFF',
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
