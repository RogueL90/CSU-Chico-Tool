"""
Strands tool: Look up campus building coordinates via Google Places API.
"""

import os
import json
import httpx
from strands.tools.decorator import tool

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
CAMPUS_CENTER = {"latitude": 39.73, "longitude": -121.847}
BIAS_RADIUS = 3000


@tool
def lookup_place(query: str, near_lat: float = None, near_lng: float = None) -> str:
    """
    Look up the coordinates of a campus building or location at Chico State.
    Use this when the answer mentions a specific building, hall, or campus location.

    Args:
        query: The building or place name, e.g. "Kendall Hall" or "Meriam Library"
        near_lat: Optional latitude to bias results toward (the user's GPS position)
        near_lng: Optional longitude to bias results toward (the user's GPS position)

    Returns:
        JSON string with label, lat, lng, address — or an error message
    """
    api_key = os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY")
    if not api_key:
        return "Google Maps API key not configured"

    # With GPS coordinates, anchor the text loosely ("Chico CA") so the
    # location bias decides proximity; otherwise anchor hard to campus.
    if near_lat is not None and near_lng is not None:
        search_query = f"{query}, Chico CA"
        bias_center = {"latitude": near_lat, "longitude": near_lng}
    else:
        search_query = f"{query}, Chico State, Chico CA"
        bias_center = CAMPUS_CENTER

    try:
        response = httpx.post(
            PLACES_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress",
            },
            json={
                "textQuery": search_query,
                "locationBias": {
                    "circle": {"center": bias_center, "radius": BIAS_RADIUS}
                },
                "maxResultCount": 1,
                "languageCode": "en",
                "regionCode": "US",
            },
            timeout=10.0,
        )

        if response.status_code != 200:
            return f"Places API error: {response.status_code}"

        data = response.json()
        place = data.get("places", [{}])[0] if data.get("places") else None

        if not place or not place.get("location"):
            return f"No location found for: {query}"

        result = {
            "label": place.get("displayName", {}).get("text", query),
            "lat": place["location"]["latitude"],
            "lng": place["location"]["longitude"],
            "address": place.get("formattedAddress", ""),
        }

        return json.dumps(result)

    except Exception as e:
        return f"Places lookup failed: {str(e)}"
