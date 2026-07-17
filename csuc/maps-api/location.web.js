// Web fork of the location module — Metro resolves this on web instead
// of location.js. Calls navigator.geolocation directly: expo-location's
// web layer throws when navigator.permissions.query is unavailable
// (iOS Safari), which swallowed the permission request so the browser
// never showed its prompt. With the direct API, the first call — the
// ChatScreen mount warm-up — IS the prompt, so the site asks for
// location at page open like any other website.

/**
 * Get the current position once. Returns { lat, lng } or null (denied,
 * unavailable, or timed out). Never throws.
 */
export function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

/**
 * Continuously track the position. Calls `onUpdate({ lat, lng, heading,
 * accuracy })` per fix. Returns a stop function (async to match the
 * native module's contract), or null if geolocation is unavailable.
 */
export async function watchLocation(onUpdate) {
  if (!navigator?.geolocation) return null;
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        accuracy: pos.coords.accuracy,
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

/**
 * Browsers have no compass API — heading comes from successive fixes
 * instead (see MapOutput.web.js). No-op stop function keeps the
 * native contract.
 */
export async function watchHeading() {
  return () => {};
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
