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
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { getCurrentLocation } from '../../../../maps-api/location';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const MODES = [
  { key: 'WALKING', icon: '🚶', label: 'Walk' },
  { key: 'DRIVING', icon: '🚗', label: 'Drive' },
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINI_W = Math.round(SCREEN_WIDTH * 0.72);
const MINI_H = 120;

const MINI_DELTA = 0.004;
const FULL_DELTA = 0.003;

/**
 * Mini non-interactive MapView. Tapping expands it to a true full-screen
 * interactive map. A small pill tab at the bottom lets the user return
 * to the chat without leaving the app.
 *
 * Props:
 *   map - { label: string, lat: number, lng: number }
 */
export default function MapOutput({ map }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('WALKING');
  const [eta, setEta] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const mapRef = useRef(null);

  // Grab the user's position when the full map opens (for routing)
  useEffect(() => {
    if (expanded) {
      getCurrentLocation().then(setUserLoc);
    } else {
      setEta(null);
    }
  }, [expanded]);

  const label = map.label;
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

  return (
    <View style={styles.wrapper}>
      {/* ── Mini map card (non-interactive, tappable) ── */}
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Expand map: ${label}`}
      >
        <MapView
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

        {/* Tap-to-expand badge */}
        <View style={styles.expandBadge}>
          <Text style={styles.expandBadgeText}>⛶  Tap to expand</Text>
        </View>

        {/* Footer label */}
        <View style={styles.miniFooter}>
          <Text style={styles.pinEmoji}>📍</Text>
          <Text style={styles.miniLabel} numberOfLines={1}>{label}</Text>
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
          style={StyleSheet.absoluteFill}
          initialRegion={fullRegion}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled
          showsUserLocation
          showsCompass
        >
          <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            title={label}
            pinColor="#C8102E"
          />
          {userLoc && (
            <MapViewDirections
              origin={{ latitude: userLoc.lat, longitude: userLoc.lng }}
              destination={{ latitude: lat, longitude: lng }}
              apikey={GOOGLE_MAPS_API_KEY}
              mode={mode}
              strokeWidth={4}
              strokeColor="#C8102E"
              onReady={(result) => {
                setEta({
                  minutes: Math.max(1, Math.round(result.duration)),
                  miles: (result.distance * 0.621371).toFixed(1),
                });
                mapRef.current?.fitToCoordinates(result.coordinates, {
                  edgePadding: { top: 140, bottom: 190, left: 60, right: 60 },
                  animated: true,
                });
              }}
              onError={(error) => {
                console.error('Directions error:', error);
                setEta(null);
              }}
            />
          )}
        </MapView>

        {/* Location label + route controls pinned to top */}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          <View style={styles.locationPill}>
            <Text style={styles.locationPillPin}>📍</Text>
            <Text style={styles.locationPillText} numberOfLines={1}>
              {label}
            </Text>
          </View>

          {userLoc ? (
            <View style={styles.routeBar}>
              <View style={styles.modeToggle}>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                    onPress={() => {
                      if (mode !== m.key) {
                        setMode(m.key);
                        setEta(null);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Route by ${m.label.toLowerCase()}`}
                  >
                    <Text
                      style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}
                    >
                      {m.icon} {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {eta && (
                <View style={styles.etaPill}>
                  <Text style={styles.etaText}>
                    {mode === 'WALKING' ? '🚶' : '🚗'} {eta.minutes} min · {eta.miles} mi
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.etaPill}>
              <Text style={styles.etaText}>Enable location for directions</Text>
            </View>
          )}
        </SafeAreaView>

        {/* Back-to-chat tab pinned to bottom */}
        <View style={styles.bottomTab}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setExpanded(false)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to chat"
          >
            <Text style={styles.backBtnChevron}>‹</Text>
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
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0DDDE',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F1',
  },
  expandBadge: {
    position: 'absolute',
    top: MINI_H - 26,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  expandBadgeText: {
    color: '#fff',
    fontSize: 11,
  },
  miniFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  pinEmoji: {
    fontSize: 13,
    marginRight: 5,
  },
  miniLabel: {
    fontSize: 13,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },

  /* ── Full-screen overlay elements ── */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: SCREEN_WIDTH - 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  locationPillPin: {
    fontSize: 14,
    marginRight: 6,
  },
  locationPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    flexShrink: 1,
  },

  /* ── Route controls (mode toggle + ETA) ── */
  routeBar: {
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 20,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  modeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  modeBtnActive: {
    backgroundColor: '#C8102E',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#65575A',
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  etaPill: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  etaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  /* ── Bottom back-to-chat tab ── */
  bottomTab: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 34, // clears home indicator on notched devices
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C8102E',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: 6,
  },
  backBtnChevron: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: -1,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
