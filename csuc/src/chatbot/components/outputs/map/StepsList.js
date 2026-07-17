import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Directions API maneuver strings -> compact glyphs
const MANEUVER_GLYPHS = {
  'turn-left': '←',
  'turn-right': '→',
  'turn-slight-left': '↖',
  'turn-slight-right': '↗',
  'turn-sharp-left': '←',
  'turn-sharp-right': '→',
  straight: '↑',
  merge: '↗',
  'ramp-left': '↖',
  'ramp-right': '↗',
  'fork-left': '↖',
  'fork-right': '↗',
  'uturn-left': '↩',
  'uturn-right': '↪',
  'roundabout-left': '↻',
  'roundabout-right': '↻',
};

export function maneuverGlyph(maneuver) {
  return MANEUVER_GLYPHS[maneuver] || '•';
}

/**
 * Turn-by-turn directions for the selected route. Renders plain rows —
 * the bottom sheet's own scroll view does the scrolling, which is what
 * lets the sheet hand off between dragging and scrolling seamlessly.
 *
 * Props:
 *   steps       - [{ instruction, distanceText, maneuver }]
 *   currentStep - optional index to highlight (navigation mode)
 */
export default function StepsList({ steps, currentStep = -1 }) {
  if (!steps?.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Directions</Text>
      {steps.map((item, index) => (
        <View key={index}>
          {index > 0 && <View style={styles.separator} />}
          <View style={[styles.row, index === currentStep && styles.rowActive]}>
            <Text style={styles.glyph}>{maneuverGlyph(item.maneuver)}</Text>
            <View style={styles.rowText}>
              <Text style={styles.instruction}>{item.instruction}</Text>
              {!!item.distanceText && (
                <Text style={styles.distance}>{item.distanceText}</Text>
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 14,
  },
  heading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8A8A8E',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowActive: {
    backgroundColor: '#FFF0F1',
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  glyph: {
    fontSize: 18,
    color: '#C8102E',
    fontWeight: '700',
    width: 26,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
  },
  instruction: {
    fontSize: 14,
    color: '#2C2022',
    lineHeight: 20,
  },
  distance: {
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#F2F2F4',
  },
});
