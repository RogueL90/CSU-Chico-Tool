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

ORCHESTRATOR_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

SYSTEM_PROMPT = """You are Willie, the Chico State campus assistant. Your job is to help students find information about campus services, buildings, offices, and resources.

You have access to these tools:
1. retrieve_from_kb - Query the Chico State knowledge base for factual answers
2. lookup_place - Look up coordinates for a campus building or location
3. extract_phone - Extract and validate phone numbers from text
4. classify_outputs - Determine what output types (text, map, phone) to show

WORKFLOW:
1. First, check if the user's message is a follow-up to the previous conversation. If conversation history is provided and the user's message references something discussed earlier (using words like "it", "there", "that", "this place", "the office", "when", "is it open", etc.), treat it as a follow-up — NOT a new query. Resolve pronouns and references using the conversation history before querying tools.
2. Call retrieve_from_kb with a complete, resolved version of the query.
3. Based on the KB answer, call extract_phone to find any phone numbers.
4. If the answer mentions a specific building/location, call lookup_place.
5. Call classify_outputs to determine which UI elements to show.

DECISION: ANSWER OR CLARIFY
After retrieving information, decide:
- CAN I ANSWER? → The user's intent is clear and the knowledge base gave relevant information. Return a full answer with text, and optionally map/phone.
- CAN'T ANSWER? → The user's message is too vague or ambiguous to give a useful answer, even after checking the knowledge base and conversation history. Return 2 narrowing choices.

ONLY ask for clarification when the user's intent is genuinely unclear. If you have enough information to give a useful answer, ALWAYS answer — do not ask for clarification unnecessarily.

FOLLOW-UP DETECTION:
- If conversation history exists, ALWAYS check if the current message is a follow-up.
- A follow-up is any message that would be ambiguous without the prior conversation context.
- For follow-ups, resolve what "it"/"that"/"there" refers to from the conversation, then answer directly.
- NEVER ask for clarification on something already established in the conversation.

WHEN YOU NEED TO CLARIFY:
- Provide exactly 2 choices that are narrowed-down restatements of what the user likely means.
- These are phrased as statements from the user's perspective (not questions).
- Example: User says "I'm hurt" → choices: "I'm hurt physically" and "I'm hurt mentally/emotionally"
- Example: User says "forms" → choices: "I need to submit financial aid forms" and "I need to submit admissions forms"
- When the user taps a choice, it gets sent as their next message.

RESPONSE FORMAT:
Always return ONLY a valid JSON object with this structure:
{
  "text": "<clear student-facing answer or null if clarifying>",
  "phone": "<10-digit number or null>",
  "map": {"label": "...", "lat": ..., "lng": ..., "address": "..."} or null,
  "output_types": ["text", "map", "phone"],
  "needs_clarification": true or false,
  "follow_up_choices": [{"id": "a", "label": "..."}, {"id": "b", "label": "..."}] or null,
  "follow_up_question": "<short prompt like 'Which best describes your situation?'>" or null
}

RULES:
- If answering: set needs_clarification to false, include text (always), map (if location found via lookup_place), phone (if number found). Set follow_up_choices and follow_up_question to null.
- If clarifying: set needs_clarification to true, set follow_up_choices to 2 options, set follow_up_question to a short prompt. Set map and phone to null. Text can be null or a brief partial answer.
- Do not include map coordinates unless they came from lookup_place.
- Do not include a phone number unless it came from extract_phone or the knowledge base.
- The text field must ONLY contain the student-facing answer. NEVER mention tools, tool names, internal decisions, JSON, workflows, KB retrieval, or anything about how you work internally. The student should have no idea tools exist.
- Keep answers concise and student-friendly.
- ALWAYS use lookup_place if your answer mentions ANY campus building, office, or location — even if the user didn't explicitly ask "where."
- ALWAYS use extract_phone if the KB answer contains ANY phone number — even if the user didn't explicitly ask for a number.
- Be PROACTIVE: if the topic is even slightly related to safety, health, or emergencies, include the relevant phone number (campus police, wellness center, etc.) as a helpful recommendation even if the user didn't ask for it. For example, if someone mentions stress, mental health, feeling overwhelmed, or being hurt, include the Wellness Center or Counseling number. If someone mentions feeling unsafe, include University Police.
"""


def create_agent():
    session_kwargs = {"region_name": os.environ.get("EXPO_PUBLIC_AWS_REGION", "us-west-2")}
    if os.environ.get("EXPO_PUBLIC_AWS_ACCESS_KEY_ID"):
        session_kwargs.update(
            aws_access_key_id=os.environ["EXPO_PUBLIC_AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ.get("EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.environ.get("EXPO_PUBLIC_AWS_SESSION_TOKEN") or None,
        )
    session = boto3.Session(**session_kwargs)

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
        ],
    )

    return agent


def try_parse_json(text: str) -> dict | None:
    """
    Robustly extract a JSON object from the agent's response.
    The agent may wrap JSON in markdown code fences or extra text.
    """
    import re

    # Strip markdown code fences if present
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find a JSON object by matching balanced braces
    brace_depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if brace_depth == 0:
                start = i
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
            if brace_depth == 0 and start is not None:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    # Keep looking for next valid JSON block
                    start = None
                    continue

    return None


async def process_query(
    query: str, conversation_history: list = None, user_location: dict = None
) -> dict:
    agent = create_agent()

    prompt = query
    if conversation_history:
        context = "\n".join(
            [f"{msg['role']}: {msg['text']}" for msg in conversation_history[-6:]]
        )
        prompt = f"Conversation so far:\n{context}\n\nLatest question: {query}"

    if user_location and user_location.get("lat") and user_location.get("lng"):
        prompt += (
            f"\n\nThe user's current GPS location: latitude {user_location['lat']}, "
            f"longitude {user_location['lng']}. If the question involves proximity "
            f"('nearest', 'closest', 'near me'), pass these coordinates to "
            f"lookup_place as near_lat and near_lng."
        )

    result = agent(prompt)
    response_text = str(result)

    # Try to extract JSON from the agent's response
    parsed = try_parse_json(response_text)
    if parsed:
        return sanitize_response(parsed)

    # Fallback if JSON parsing fails — just show the text as an answer
    # Strip any accidental JSON or tool references from the output
    clean_text = response_text.strip()
    if clean_text.startswith("{"):
        clean_text = "I found some information but had trouble formatting it. Please try asking again."

    return {
        "confidence": 90,
        "text": clean_text,
        "phone": None,
        "map": None,
        "output_types": ["text"],
        "follow_up_choices": None,
        "follow_up_question": None,
    }


def sanitize_map(map_data) -> dict | None:
    if not isinstance(map_data, dict):
        return None
    try:
        lat = float(map_data["lat"])
        lng = float(map_data["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    return {
        "label": str(map_data.get("label") or "Location"),
        "lat": lat,
        "lng": lng,
        "address": map_data.get("address"),
    }


def sanitize_response(parsed: dict) -> dict:
    needs_clarification = parsed.get("needs_clarification", False)

    text = parsed.get("text")
    phone = parsed.get("phone")

    # Auto-extract phone from text if the agent didn't set one explicitly
    if not phone and text:
        import re
        patterns = [
            r'\((\d{3})\)\s*(\d{3})[-.\s]?(\d{4})',
            r'(\d{3})[-.\s](\d{3})[-.\s](\d{4})',
            r'(\d{3})(\d{3})(\d{4})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                digits = ''.join(match.groups())
                if len(digits) == 10 and digits[0] not in ('0', '1'):
                    phone = digits
                    break

    output_types = parsed.get("output_types", ["text"])
    # Ensure phone is in output_types if we have one
    if phone and "phone" not in output_types:
        output_types.append("phone")

    response = {
        "confidence": 30 if needs_clarification else 90,
        "text": text,
        "phone": phone,
        "map": sanitize_map(parsed.get("map")),
        "output_types": output_types,
        "follow_up_choices": None,
        "follow_up_question": None,
    }

    if needs_clarification:
        response["follow_up_choices"] = parsed.get("follow_up_choices") or [
            {"id": "a", "label": "Tell me more about this"},
            {"id": "b", "label": "I need something else"},
        ]
        response["follow_up_question"] = parsed.get(
            "follow_up_question", "Which best describes your situation?"
        )
        response["map"] = None
        response["phone"] = None
        response["output_types"] = ["text"] if response["text"] else []

    return response
