"""
Strands tool: Retrieve information from the Chico State Bedrock Knowledge Base.
"""

import os
import boto3
from strands.tools.decorator import tool


@tool
def retrieve_from_kb(query: str) -> str:
    """
    Query the Chico State knowledge base for factual campus information.
    Use this for any question about campus services, offices, hours, policies, etc.

    Args:
        query: The user's question or search query

    Returns:
        The knowledge base answer text, or an error message
    """
    # Explicit credentials from .env for local dev; otherwise fall back to
    # boto3's default chain (e.g. the Lambda execution role).
    client_kwargs = {"region_name": os.environ.get("EXPO_PUBLIC_AWS_REGION", "us-west-2")}
    if os.environ.get("EXPO_PUBLIC_AWS_ACCESS_KEY_ID"):
        client_kwargs.update(
            aws_access_key_id=os.environ["EXPO_PUBLIC_AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ.get("EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.environ.get("EXPO_PUBLIC_AWS_SESSION_TOKEN") or None,
        )
    client = boto3.client("bedrock-agent-runtime", **client_kwargs)

    kb_id = os.environ.get("EXPO_PUBLIC_KNOWLEDGE_BASE_ID", "EVLCAIRVMQ")

    try:
        # Pure vector search — no LLM generation here. The orchestrator
        # writes the answer once from these passages (retrieve_and_generate
        # would run a second, redundant generation).
        response = client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {"numberOfResults": 4}
            },
        )

        results = response.get("retrievalResults", [])
        passages = []
        for i, result in enumerate(results):
            text = result.get("content", {}).get("text", "").strip()
            if not text:
                continue
            # Source page of the chunk — gives the model a real URL to cite
            # instead of reconstructing one from memory.
            source = (
                result.get("location", {}).get("webLocation", {}).get("url")
                or result.get("metadata", {}).get("x-amz-bedrock-kb-source-uri")
            )
            passage = f"[{i + 1}] {text}"
            if source:
                passage += f"\n(Source: {source})"
            passages.append(passage)

        if not passages:
            return "No relevant information found in the knowledge base."

        return "\n\n".join(passages)

    except Exception as e:
        return f"Error querying knowledge base: {str(e)}"
