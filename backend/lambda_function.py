"""
AWS Lambda handler for the Call Willie backend (Function URL).

Routes:
  GET  /health     -> {"status": "ok"}
  GET  /directions -> proxy to the Google Directions API (which blocks
                      browser CORS, so the web app routes through here)
  POST /ask        -> same contract as the FastAPI /ask endpoint

server.py remains for local development; this file replaces it in Lambda.
"""

import asyncio
import json
import os

import httpx

from agent import process_query

DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"

JSON_HEADERS = {"Content-Type": "application/json"}


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": JSON_HEADERS,
        "body": json.dumps(body),
    }


def handler(event, context):
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = http.get("path", "") or event.get("rawPath", "")

    # Browser CORS preflight: the API's $default route forwards OPTIONS
    # here, so answer 2xx (API Gateway attaches the CORS headers).
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": JSON_HEADERS, "body": ""}

    if method == "GET" and path.rstrip("/").endswith("health"):
        return _response(200, {"status": "ok"})

    # Proxy Google Directions verbatim so the frontend parses the same
    # shape it gets when calling Google directly on native.
    if method == "GET" and path.rstrip("/").endswith("directions"):
        params = event.get("queryStringParameters") or {}
        origin = params.get("origin")
        destination = params.get("destination")
        if not origin or not destination:
            return _response(400, {"error": "origin and destination are required"})
        try:
            google_response = httpx.get(
                DIRECTIONS_URL,
                params={
                    "origin": origin,
                    "destination": destination,
                    "mode": params.get("mode", "walking"),
                    "alternatives": params.get("alternatives", "true"),
                    "units": "imperial",
                    "key": os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", ""),
                },
                timeout=10.0,
            )
        except Exception as error:
            return _response(502, {"status": "ERROR", "error_message": str(error)})
        return {
            "statusCode": google_response.status_code,
            "headers": JSON_HEADERS,
            "body": google_response.text,
        }

    if method != "POST":
        return _response(405, {"error": "Method not allowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    query = body.get("query")
    if not query or not isinstance(query, str):
        return _response(400, {"error": "Missing required field: query"})

    result = asyncio.run(
        process_query(
            query,
            body.get("conversation_history"),
            body.get("user_location"),
        )
    )
    return _response(200, result)
