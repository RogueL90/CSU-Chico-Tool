"""
Strands Agent orchestrator.
"""

import os
import json
import boto3
from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.knowledge_base import retrieve_from_kb
from tools.places import lookup_place
from tools.phone import extract_phone
from tools.classifier import classify_outputs
from tools.confidence import score_confidence

ORCHESTRATOR_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

SYSTEM_PROMPT = """You are Willie, the Chico State campus assistant. Your job is to help students find information about campus services, buildings, offices, and resources.

You have access to these tools:
1. retrieve_from_kb - Query the Chico State knowledge base for factual answers
2. lookup_place - Look up coordinates for a campus building or location
3. extract_phone - Extract and validate phone numbers from text
4. classify_outputs - Determine what output types (text, map, phone) to show
5. score_confidence - Score how confident you are in your answer (0-100)

WORKFLOW:
1. First, call retrieve_from_kb with the user's query to get relevant info
2. Based on the KB answer, call extract_phone to find any phone numbers
3. If the answer mentions a specific building/location, call lookup_place
4. Call classify_outputs to determine which UI elements to show
5. Call score_confidence to rate your confidence

CONFIDENCE RULES:
- If confidence >= 80: return the full answer with all outputs
- If confidence < 80: generate exactly 2 follow-up clarifying questions as choices, plus a brief follow-up question text. Do NOT return map or phone in low-confidence responses.

RESPONSE FORMAT:
Always return a valid JSON object with this structure:
{
  "confidence": <number 0-100>,
  "text": "<answer text or null>",
  "phone": "<10-digit number or null>",
  "map": {"label": "...", "lat": ..., "lng": ..., "address": "..."} or null,
  "output_types": ["text", "map", "phone"],
  "follow_up_choices": [{"id": "a", "label": "..."}, {"id": "b", "label": "..."}] or null,
  "follow_up_question": "<clarifying question>" or null
}
"""


def create_agent():
    # Build a boto3 session with explicit credentials from .env
    session = boto3.Session(
        aws_access_key_id=os.environ.get("EXPO_PUBLIC_AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.environ.get("EXPO_PUBLIC_AWS_SESSION_TOKEN") or None,
        region_name=os.environ.get("EXPO_PUBLIC_AWS_REGION", "us-west-2"),
    )

    model = BedrockModel(
        model_id=ORCHESTRATOR_MODEL_ID,
        boto_session=session,
    )

    agent = Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[
            retrieve_from_kb,
            lookup_place,
            extract_phone,
            classify_outputs,
            score_confidence,
        ],
    )

    return agent


async def process_query(query: str, conversation_history: list = None) -> dict:
    agent = create_agent()

    prompt = query
    if conversation_history:
        context = "\n".join(
            [f"{msg['role']}: {msg['text']}" for msg in conversation_history[-6:]]
        )
        prompt = f"Conversation so far:\n{context}\n\nLatest question: {query}"

    result = agent(prompt)
    response_text = str(result)

    try:
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            parsed = json.loads(response_text[json_start:json_end])
            return sanitize_response(parsed)
    except json.JSONDecodeError:
        pass

    return {
        "confidence": 50,
        "text": response_text,
        "phone": None,
        "map": None,
        "output_types": ["text"],
        "follow_up_choices": [
            {"id": "a", "label": "Can you rephrase that?"},
            {"id": "b", "label": "Connect me to a person"},
        ],
        "follow_up_question": "I'm not sure I understood. Could you clarify?",
    }


def sanitize_response(parsed: dict) -> dict:
    confidence = float(parsed.get("confidence", 50))

    response = {
        "confidence": confidence,
        "text": parsed.get("text"),
        "phone": parsed.get("phone"),
        "map": parsed.get("map"),
        "output_types": parsed.get("output_types", ["text"]),
        "follow_up_choices": None,
        "follow_up_question": None,
    }

    if confidence < 80:
        response["follow_up_choices"] = parsed.get("follow_up_choices") or [
            {"id": "a", "label": "Tell me more about this"},
            {"id": "b", "label": "I need something else"},
        ]
        response["follow_up_question"] = parsed.get(
            "follow_up_question", "Can you tell me more about what you need?"
        )
        response["map"] = None
        response["phone"] = None
        response["output_types"] = ["text"] if response["text"] else []

    return response
