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
    model_arn = os.environ.get(
        "EXPO_PUBLIC_MODEL_ARN",
        "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
    )

    try:
        response = client.retrieve_and_generate(
            input={"text": query},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": kb_id,
                    "modelArn": model_arn,
                },
            },
        )

        answer = response.get("output", {}).get("text", "")
        citations = response.get("citations", [])

        citation_text = ""
        for i, citation in enumerate(citations[:3]):
            ref = citation.get("retrievedReferences", [{}])[0]
            snippet = ref.get("content", {}).get("text", "")[:100]
            if snippet:
                citation_text += f"\n[Source {i+1}]: {snippet}..."

        return f"{answer}{citation_text}" if answer else "No relevant information found in the knowledge base."

    except Exception as e:
        return f"Error querying knowledge base: {str(e)}"
