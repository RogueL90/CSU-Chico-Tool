// Device GPS location via expo-location.

import * as Location from 'expo-location';

/**
 * Get the device's current location (quick, chat-query grade).
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

/**
 * Continuously track the device position at navigation-grade accuracy
 * (same GPS mode turn-by-turn apps use). Calls `onUpdate({ lat, lng,
 * heading, accuracy })` on every fix. Returns a stop function; returns
 * null if permission is denied.
 */
export async function watchLocation(onUpdate) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000, // at most every 2s
        distanceInterval: 5, // or every 5 meters moved
      },
      (position) => {
        if (!position?.coords) return;
        onUpdate({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          accuracy: position.coords.accuracy,
        });
      }
    );

    return () => subscription.remove();
  } catch (error) {
    console.error('Could not watch location:', error);
    return null;
  }
}

/**
 * Continuously track the compass direction the device is facing.
 * Calls `onUpdate(degrees)` (0 = north). Returns a stop function,
 * or null if permission is denied.
 */
export async function watchHeading(onUpdate) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const subscription = await Location.watchHeadingAsync((heading) => {
      const deg = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
      if (deg >= 0) onUpdate(deg);
    });

    return () => subscription.remove();
  } catch (error) {
    console.error('Could not watch heading:', error);
    return null;
  }
}

/**
 * Straight-line distance between two { lat, lng } points, in meters.
 */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
