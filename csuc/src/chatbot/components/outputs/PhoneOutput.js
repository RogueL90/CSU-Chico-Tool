import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Linking,
  Alert,
  View,
} from 'react-native';

/**
 * Renders a tappable call button that dials the given phone number.
 *
 * Props:
 *   phoneNumber - digits only, e.g. "5308986451"
 *   label       - optional override for button label
 */
export default function PhoneOutput({ phoneNumber, label }) {
  const formatted = phoneNumber.replace(
    /(\d{3})(\d{3})(\d{4})/,
    '($1) $2-$3'
  );

  const handlePress = async () => {
    const url = `tel:${phoneNumber}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'Phone not available',
          `Please call manually: ${formatted}`
        );
      }
    } catch {
      Alert.alert('Error', 'Could not open the dialer.');
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Call ${label || formatted}`}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>📞</Text>
      </View>
      <View>
        <Text style={styles.buttonLabel}>{label || 'Call us'}</Text>
        <Text style={styles.number}>{formatted}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7A0019',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  number: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 1,
  },
});
