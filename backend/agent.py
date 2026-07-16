"""
Strands Agent orchestrator.

Only operations that require external data are exposed as tools. Phone
extraction, output classification, JSON validation, and the answer/clarify
decision are normalized in Python after the model responds.
"""

import json
import os
import re

import boto3
from strands import Agent
from strands.models.bedrock import BedrockModel

from tools.knowledge_base import retrieve_from_kb
from tools.places import lookup_place

ORCHESTRATOR_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

SYSTEM_PROMPT = """You are Willie, the Chico State campus assistant. Your job is to help students find information about campus services, buildings, offices, and resources.

You have access to these tools:
1. retrieve_from_kb - Query the Chico State knowledge base for factual answers
2. lookup_place - Look up coordinates for a campus building or location

WORKFLOW:
1. First, check if the user's message is a follow-up to the previous conversation. If conversation history is provided and the user's message references something discussed earlier (using words like "it", "there", "that", "this place", "the office", "when", "is it open", etc.), treat it as a follow-up — NOT a new query. Resolve pronouns and references using the conversation history before querying tools.
2. Call retrieve_from_kb with a complete, resolved version of the query.
3. Based on the KB answer, if there is any type of phone number involved, make it an output type and include the phone number in the JSON.
4. If the answer mentions a specific building/location, call lookup_place.
5. Decide which UI elements should be shown and include the applicable values in output_types: text, map, and/or phone. Do not call a separate classification tool.

DECISION: ANSWER OR CLARIFY
After retrieving information, decide:
- CAN I ANSWER? → The user's intent is clear and the knowledge base gave relevant information. Return a full answer with text, and optionally map/phone.
- CAN'T ANSWER? → The user's message is too vague or ambiguous to give a useful answer, even after checking the knowledge base and conversation history. Return 2 narrowing choices for what the user may mean.

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

Phone and map output types will give an intuitive display for the frontend. Make sure to include these as often as possible.

High frequency support question:
Question: There is a medical emergency
Answer: Immediately make phone an output type with 911 as the phone number.

Question: I need to report a safety concern or suspicious activity.
Answer: If there is an immediate threat, direct to 911. If not immediate use CARE team form:
https://cm.maxient.com/reportingform.php?CSUChico&layout_id=6

Question: My student is experiencing a mental health crisis.
Answer: If there is an immediate need refer to Counseling & Wellness Services with phone number. After hours or if there is an immediate risk of harm, use:
https://cm.maxient.com/reportingform.php?CSUChico&layout_id=6

Question: I lost my student or can't find them during an event.
Answer: Direct to University Police phone number.

Question: I need to report discrimination, harassment, or sexual misconduct.
Answer: Escalate to the Title IX Office. If there is an immediate safety concern, direct to 911.

RULES:
- If answering: set needs_clarification to false, include text (always), map (if location found via lookup_place), phone (if number found). Set follow_up_choices and follow_up_question to null.
- If clarifying: set needs_clarification to true, set follow_up_choices to 2 options, set follow_up_question to a short prompt. Set map and phone to null. Text can be null or a brief partial answer.
- The text field must ONLY contain the student-facing answer. NEVER mention tools, tool names, internal decisions, JSON, workflows, KB retrieval, or anything about how you work internally. The student should have no idea tools exist.
- Keep answers concise and student-friendly.
- Format "text" with simple markdown when it improves readability: **bold** for key facts (names, deadlines, room numbers, phone numbers), "-" bullet lists when listing multiple items, and [title](url) for links. No headings or tables. The text lives inside a JSON string, so escape newlines as \\n.
- ALWAYS use lookup_place if your answer mentions ANY campus building, office, or location — even if the user didn't explicitly ask "where."
- ALWAYS try to include the number if the KB answer contains ANY phone number — even if the user didn't explicitly ask for a number.
- Be PROACTIVE: if the topic is even slightly related to safety, health, or emergencies, include the relevant phone number (campus police, wellness center, etc.) as an output type phone, even if the user didn't ask for it. For example, if someone mentions stress, mental health, feeling overwhelmed, or being hurt, include the Wellness Center or Counseling number. If someone mentions feeling unsafe, include University Police.
"""

# Reuse the AWS session/model across warm Lambda invocations. A fresh Agent is
# still created per request because Agent instances accumulate message state.
_session_kwargs = {
    "region_name": os.environ.get("EXPO_PUBLIC_AWS_REGION", "us-west-2")
}
if os.environ.get("EXPO_PUBLIC_AWS_ACCESS_KEY_ID"):
    _session_kwargs.update(
        aws_access_key_id=os.environ["EXPO_PUBLIC_AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ.get("EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.environ.get("EXPO_PUBLIC_AWS_SESSION_TOKEN") or None,
    )
_session = boto3.Session(**_session_kwargs)
_model = BedrockModel(model_id=ORCHESTRATOR_MODEL_ID, boto_session=_session)

PHONE_PATTERNS = (
    re.compile(r"\((\d{3})\)\s*(\d{3})[-.\s]?(\d{4})"),
    re.compile(r"(?<!\d)(\d{3})[-.\s](\d{3})[-.\s](\d{4})(?!\d)"),
    re.compile(r"(?<!\d)(\d{3})(\d{3})(\d{4})(?!\d)"),
)
EMERGENCY_PHONE_PATTERN = re.compile(r"(?<!\d)(911|988)(?!\d)")
INTERNAL_LINE_PATTERN = re.compile(
    r"(?i)^.*(?:retrieve_from_kb|lookup_place|tool call|no additional tools|"
    r"classify_outputs|extract_phone|knowledge base retrieval).*$"
)


def create_agent():
    return Agent(
        model=_model,
        system_prompt=SYSTEM_PROMPT,
        tools=[retrieve_from_kb, lookup_place],
    )


def strip_reflection_tags(text: str | None) -> str | None:
    """Remove model reflection and tool markup that occasionally leaks."""
    if not text:
        return text
    cleaned = re.sub(r"<(/?)function_[a-z_]+>", "", str(text))
    cleaned = re.sub(
        r"<(/?)(thinking|reflection|search_quality_reflection)[^>]*>",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    lines = [
        line for line in cleaned.splitlines() if not INTERNAL_LINE_PATTERN.match(line)
    ]
    cleaned = "\n".join(lines)
    cleaned = re.sub(
        r"(?i)\baccording to (?:the )?(?:campus )?knowledge base,?\s*",
        "",
        cleaned,
    )
    return cleaned.strip()


def extract_phone(*values) -> str | None:
    """Return the first valid emergency or US phone number in supplied values."""
    texts = [str(value) for value in values if value]

    # Emergency short codes should take priority over secondary contacts.
    for text in texts:
        match = EMERGENCY_PHONE_PATTERN.search(text)
        if match:
            return match.group(1)

    for text in texts:
        for pattern in PHONE_PATTERNS:
            match = pattern.search(text)
            if not match:
                continue
            digits = "".join(match.groups())
            if len(digits) == 10 and digits[0] not in ("0", "1"):
                return digits
    return None


def try_parse_json(text: str) -> dict | None:
    """Extract the first valid JSON object, including fenced model output."""
    if not text:
        return None

    cleaned = re.sub(r"```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    cleaned = cleaned.replace("```", "").strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for index, character in enumerate(cleaned):
        if character != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(cleaned[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def sanitize_map(map_data) -> dict | None:
    """Coerce map data to valid coordinates, dropping invalid locations."""
    if not isinstance(map_data, dict):
        return None
    try:
        lat = float(map_data["lat"])
        lng = float(map_data["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return {
        "label": str(map_data.get("label") or "Location"),
        "lat": lat,
        "lng": lng,
        "address": map_data.get("address"),
    }


def normalize_choices(raw_choices) -> list[dict] | None:
    """Accept string or object choices and return exactly two useful options."""
    if not isinstance(raw_choices, list):
        return None

    labels = []
    for item in raw_choices:
        label = item.get("label") if isinstance(item, dict) else item
        if not isinstance(label, str):
            continue
        label = label.strip()
        if label and label.lower() not in {
            "can you rephrase that?",
            "tell me more about this",
            "i need something else",
            "connect me to a person",
        }:
            labels.append(label)

    if len(labels) < 2:
        return None
    return [
        {"id": "a", "label": labels[0]},
        {"id": "b", "label": labels[1]},
    ]


def sanitize_response(parsed: dict) -> dict:
    """Normalize model JSON into the existing Expo/FastAPI response contract."""
    text = strip_reflection_tags(parsed.get("text") or parsed.get("answerText"))

    map_data = parsed.get("map")
    phone_candidate = parsed.get("phone")
    outputs = parsed.get("outputs")
    if isinstance(outputs, list):
        for output in outputs:
            if not isinstance(output, dict):
                continue
            if output.get("type") == "map" and map_data is None:
                map_data = output
            elif output.get("type") == "phone" and not phone_candidate:
                phone_candidate = output.get("phone")
            elif output.get("type") == "text" and not text:
                text = strip_reflection_tags(output.get("text"))

    map_data = sanitize_map(map_data)
    phone = extract_phone(text, phone_candidate)
    needs_clarification = bool(
        parsed.get("needs_clarification", parsed.get("needsClarification", False))
    )
    choices = normalize_choices(
        parsed.get("follow_up_choices")
        or (parsed.get("clarification") or {}).get("choices")
    )
    question = strip_reflection_tags(
        parsed.get("follow_up_question")
        or (parsed.get("clarification") or {}).get("prompt")
    )

    # Never manufacture generic chips. If the model requests clarification but
    # fails to provide two meaningful narrow-downs, show a concise text prompt.
    if needs_clarification and not choices:
        text = text or question or "Could you tell me a little more about what you need?"
        needs_clarification = False

    if needs_clarification:
        return {
            "confidence": 30,
            "text": text,
            "phone": None,
            "map": None,
            "output_types": ["text"] if text else [],
            "follow_up_choices": choices,
            "follow_up_question": question or "Which best describes what you need?",
        }

    output_types = []
    if text:
        output_types.append("text")
    if map_data:
        output_types.append("map")
    if phone:
        output_types.append("phone")

    if not text:
        text = "I couldn't find enough information to answer that yet."
        output_types.insert(0, "text")

    return {
        "confidence": 90,
        "text": text,
        "phone": phone,
        "map": map_data,
        "output_types": output_types,
        "follow_up_choices": None,
        "follow_up_question": None,
    }


async def process_query(
    query: str, conversation_history: list = None, user_location: dict = None
) -> dict:
    agent = create_agent()

    history = list(conversation_history or [])[-8:]
    # The frontend currently appends the latest user message before sending it.
    # Avoid repeating the same message in both history and "Latest question".
    if (
        history
        and history[-1].get("role") == "user"
        and history[-1].get("text", "").strip() == query.strip()
    ):
        history = history[:-1]

    prompt = query
    if history:
        context = "\n".join(
            f"{message.get('role', 'user')}: {message.get('text', '')}"
            for message in history
        )
        prompt = f"Conversation so far:\n{context}\n\nLatest question: {query}"

    if user_location and user_location.get("lat") is not None and user_location.get("lng") is not None:
        prompt += (
            f"\n\nThe user's current GPS location is latitude {user_location['lat']}, "
            f"longitude {user_location['lng']}. For proximity requests, pass these "
            "values to lookup_place as near_lat and near_lng."
        )

    result = agent(prompt)
    response_text = str(result)
    parsed = try_parse_json(response_text)
    if parsed:
        return sanitize_response(parsed)

    # Parsing failures should never expose raw JSON or generic follow-up chips.
    clean_text = strip_reflection_tags(response_text)
    if not clean_text or clean_text.lstrip().startswith("{"):
        clean_text = "I found information, but I couldn't format the response. Please try again."
    phone = extract_phone(clean_text)
    output_types = ["text"] + (["phone"] if phone else [])
    return {
        "confidence": 90,
        "text": clean_text,
        "phone": phone,
        "map": None,
        "output_types": output_types,
        "follow_up_choices": None,
        "follow_up_question": None,
    }
