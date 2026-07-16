import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { maneuverGlyph } from './StepsList';

/**
 * Top banner during live navigation: next maneuver + live distance to it.
 * Also keeps the screen awake while mounted (i.e., while navigating).
 *
 * Props:
 *   step         - { instruction, maneuver } (the upcoming step)
 *   distanceText - live distance to the maneuver, e.g. "250 ft"
 */
export default function NavBanner({ step, distanceText }) {
  useKeepAwake();
  if (!step) return null;

  return (
    <View style={styles.banner} pointerEvents="none">
      <Text style={styles.glyph}>{maneuverGlyph(step.maneuver)}</Text>
      <View style={styles.textWrap}>
        <Text style={styles.distance}>{distanceText}</Text>
        <Text style={styles.instruction} numberOfLines={2}>
          {step.instruction}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 60,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C8102E',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  glyph: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '700',
    width: 40,
    textAlign: 'center',
  },
  textWrap: {
    flex: 1,
  },
  distance: {
    color: '#FFD9DD',
    fontSize: 14,
    fontWeight: '800',
  },
  instruction: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
});
