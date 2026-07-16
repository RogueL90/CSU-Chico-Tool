// Device GPS location via expo-location.

import * as Location from 'expo-location';

/**
 * Get the device's current location.
 *
 * Returns { lat, lng } or null if permission is denied or the position
 * can't be determined. Never throws — location is a nice-to-have and
 * must not break the chat flow.
 */
export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Last known fix is instant; fall back to a fresh reading.
    const position =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));

    if (!position?.coords) return null;

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (error) {
    console.error('Could not get current location:', error);
    return null;
  }
}
