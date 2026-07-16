"""
AWS Lambda handler for the Call Willie backend (Function URL).

Routes:
  GET  /health -> {"status": "ok"}
  POST /ask    -> same contract as the FastAPI /ask endpoint

server.py remains for local development; this file replaces it in Lambda.
"""

import asyncio
import json

from agent import process_query

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

    if method == "GET" and path.rstrip("/").endswith("health"):
        return _response(200, {"status": "ok"})

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
