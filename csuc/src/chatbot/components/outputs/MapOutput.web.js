import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';

// Web fork of MapOutput. Metro resolves this file instead of
// MapOutput.js when bundling for web — react-native-maps is
// native-only. Mirrors the mobile flow with the Google Maps Embed API:
// mini card in chat -> full-screen directions view with a Walk/Drive
// toggle and Back to Chat. Live turn-by-turn stays mobile-only.

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MINI_W = Math.min(Math.round(SCREEN_WIDTH * 0.72), 420);
const MINI_H = 150;

const EMBED_BASE = 'https://www.google.com/maps/embed/v1';
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const MODES = [
  { key: 'walking', label: 'Walk' },
  { key: 'driving', label: 'Drive' },
];

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

  if (!validCoords) return null;

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
        <View style={{ width: MINI_W, height: MINI_H }}>
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

      {/* ── Full-screen directions ── */}
      <Modal
        visible={expanded}
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
        transparent={false}
      >
        <View style={styles.full}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>{label}</Text>
            {!!address && (
              <Text style={styles.headerAddress} numberOfLines={1}>{address}</Text>
            )}
            <View style={styles.controls}>
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
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setExpanded(false)}
                accessibilityRole="button"
                accessibilityLabel="Back to chat"
              >
                <Text style={styles.backBtnText}>Back to Chat</Text>
              </TouchableOpacity>
            </View>
            {!origin && (
              <Text style={styles.hint}>
                Allow location access to see the route from where you are.
              </Text>
            )}
          </View>
          <View style={styles.mapArea}>
            <MapFrame src={directionsSrc} />
          </View>
        </View>
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

  /* ── Full-screen view ── */
  full: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEE',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  headerAddress: {
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  segmentBtn: {
    flex: 1,
    maxWidth: 140,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  segmentBtnActive: {
    backgroundColor: '#C8102E',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3A3A3C',
  },
  segmentTextActive: {
    color: '#fff',
  },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#C8102E',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: 8,
  },
  mapArea: {
    flex: 1,
  },
});
