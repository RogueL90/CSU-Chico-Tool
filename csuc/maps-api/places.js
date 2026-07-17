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

/**
 * Fetch display details for a specific place already shown on the map:
 * short summary, opening hours, and phone number.
 *
 * `near` is the destination's { lat, lng } from the map payload — the
 * bias circle is kept tight so we describe the exact place, not a
 * similarly-named one elsewhere in town.
 *
 * Returns { summary, phone, openNow, todayHours, weekdayHours } or null.
 * Any individual field may be null (e.g. campus buildings usually have
 * no editorial summary). Never throws.
 */
export async function getPlaceDetails(query, near) {
  try {
    const response = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.editorialSummary,' +
          'places.nationalPhoneNumber,places.currentOpeningHours,places.regularOpeningHours',
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            center: near
              ? { latitude: near.lat, longitude: near.lng }
              : CAMPUS_CENTER,
            radius: near ? 300 : BIAS_RADIUS_METERS,
          },
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

    const place = (await response.json()).places?.[0];
    if (!place) return null;

    const hours = place.currentOpeningHours ?? place.regularOpeningHours ?? {};
    const weekdayHours = hours.weekdayDescriptions ?? null;
    // Google's weekday list starts Monday; JS getDay() starts Sunday.
    const todayIdx = (new Date().getDay() + 6) % 7;

    const phoneDigits = (place.nationalPhoneNumber ?? '').replace(/\D/g, '');

    return {
      summary: place.editorialSummary?.text ?? null,
      phone: phoneDigits.length === 10 ? phoneDigits : null,
      openNow: place.currentOpeningHours?.openNow ?? null,
      todayHours: weekdayHours?.[todayIdx] ?? null,
      weekdayHours,
    };
  } catch (error) {
    console.error('Place details request failed:', error);
    return null;
  }
}
