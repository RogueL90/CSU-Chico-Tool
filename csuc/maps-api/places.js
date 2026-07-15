// Google Places API (New) — text search via REST.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

// Approximate center of the Chico State campus, used to bias results.
const CAMPUS_CENTER = { latitude: 39.73, longitude: -121.847 };
const BIAS_RADIUS_METERS = 3000;

/**
 * Look up a place by free-text query, biased to the Chico State campus.
 *
 * Returns { label, lat, lng, address } for the best match, or null if
 * nothing was found or the request failed. Never throws — a map is a
 * nice-to-have and must not break the chat flow.
 */
export async function findPlace(query) {
  try {
    const response = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: { center: CAMPUS_CENTER, radius: BIAS_RADIUS_METERS },
        },
        maxResultCount: 1,
        languageCode: 'en',
        regionCode: 'US',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Places API error ${response.status}:`, body);
      return null;
    }

    const result = await response.json();

    // Grab the coordinates of the first match
    const firstPlace = result.places?.[0];
    if (!firstPlace?.location) return null;

    return {
      label: firstPlace.displayName?.text ?? query,
      lat: firstPlace.location.latitude,
      lng: firstPlace.location.longitude,
      address: firstPlace.formattedAddress ?? null,
    };
  } catch (error) {
    console.error('Places API request failed:', error);
    return null;
  }
}
