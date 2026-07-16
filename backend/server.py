"""
FastAPI server that exposes a /ask endpoint.
The Expo app sends user messages here instead of calling Bedrock directly.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agent import process_query

# Load shared .env from the Expo project
env_path = Path(__file__).resolve().parent.parent / "csuc" / ".env"
load_dotenv(env_path)

# Map EXPO_PUBLIC_* vars to standard AWS env vars that boto3 expects
os.environ["AWS_ACCESS_KEY_ID"] = os.environ.get("EXPO_PUBLIC_AWS_ACCESS_KEY_ID", "")
os.environ["AWS_SECRET_ACCESS_KEY"] = os.environ.get("EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY", "")
os.environ["AWS_DEFAULT_REGION"] = os.environ.get("EXPO_PUBLIC_AWS_REGION", "us-west-2")
session_token = os.environ.get("EXPO_PUBLIC_AWS_SESSION_TOKEN", "")
if session_token:
    os.environ["AWS_SESSION_TOKEN"] = session_token

app = FastAPI(title="Call Willie Backend", version="1.0.0")

# Allow the Expo dev server to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    query: str
    conversation_history: Optional[list] = None
    user_location: Optional[dict] = None


class FollowUpChoice(BaseModel):
    id: str
    label: str


class AskResponse(BaseModel):
    confidence: float
    text: Optional[str] = None
    phone: Optional[str] = None
    map: Optional[dict] = None
    output_types: list[str] = []
    follow_up_choices: Optional[list[FollowUpChoice]] = None
    follow_up_question: Optional[str] = None


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    result = await process_query(
        request.query, request.conversation_history, request.user_location
    )
    return AskResponse(**result)


@app.get("/health")
async def health():
    return {"status": "ok"}
