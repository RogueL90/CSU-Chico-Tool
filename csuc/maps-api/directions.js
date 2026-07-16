// Google Directions API — route fetching with alternates and turn-by-turn
// steps. Replaces react-native-maps-directions so we get the raw data
// (alternate routes, per-step polylines, maneuvers) the wrapper hides.

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Decode a Google encoded polyline into [{ latitude, longitude }].
 * Standard algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const which of ['lat', 'lng']) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

function stripHtml(html) {
  return (html || '')
    .replace(/<div[^>]*>/g, ' — ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch routes (with alternates) between two points.
 *
 * Returns an array (possibly empty — never throws) of:
 * {
 *   coordinates: [{latitude, longitude}],   // road-accurate, from step polylines
 *   minutes, miles, summary,
 *   steps: [{ instruction, distanceText, distanceMeters,
 *             durationSeconds, maneuver, endLocation: {lat, lng} }]
 * }
 */
export async function getRoutes(origin, destination, mode) {
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: mode.toLowerCase(),
    alternatives: 'true',
    units: 'imperial',
    key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  });

  try {
    const response = await fetch(`${DIRECTIONS_URL}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      if (data.status !== 'ZERO_RESULTS') {
        console.error('Directions API:', data.status, data.error_message || '');
      }
      return [];
    }

    return data.routes.map((route) => {
      const leg = route.legs[0];

      // Concatenate step polylines for a road-accurate line (the overview
      // polyline is simplified and cuts corners).
      const coordinates = [];
      for (const step of leg.steps) {
        const pts = decodePolyline(step.polyline?.points || '');
        // Skip the first point of each subsequent step (same as previous end)
        coordinates.push(...(coordinates.length ? pts.slice(1) : pts));
      }

      return {
        coordinates,
        minutes: leg.duration.value / 60,
        miles: (leg.distance.value / 1609.344).toFixed(1),
        summary: route.summary || '',
        steps: leg.steps.map((step) => ({
          instruction: stripHtml(step.html_instructions),
          distanceText: step.distance?.text || '',
          distanceMeters: step.distance?.value || 0,
          durationSeconds: step.duration?.value || 0,
          maneuver: step.maneuver || '',
          endLocation: {
            lat: step.end_location.lat,
            lng: step.end_location.lng,
          },
        })),
      };
    });
  } catch (error) {
    console.error('Directions request failed:', error);
    return [];
  }
}
