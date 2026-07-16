import React, { useState } from 'react';
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
  const { lat, lng, label } = map;

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
          initialRegion={miniRegion}
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
        </MapView>

        {/* Location label pinned to top */}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          <View style={styles.locationPill}>
            <Text style={styles.locationPillPin}>📍</Text>
            <Text style={styles.locationPillText} numberOfLines={1}>
              {label}
            </Text>
          </View>
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
