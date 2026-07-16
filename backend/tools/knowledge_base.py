"""
Strands tool: Retrieve information from the Chico State Bedrock Knowledge Base.
"""

from contextvars import ContextVar, Token
import os
import re

import boto3
from strands.tools.decorator import tool

_HTTP_URL_PATTERN = re.compile(r"https?://[^\s<>\[\]\"']+", re.IGNORECASE)
_retrieved_urls: ContextVar[set[str] | None] = ContextVar(
    "retrieved_kb_urls", default=None
)


def begin_url_capture() -> Token:
    """Start request-local collection of URLs found in KB retrieval results."""
    return _retrieved_urls.set(set())


def get_captured_urls() -> set[str]:
    """Return URLs captured for the current request."""
    return set(_retrieved_urls.get() or ())


def end_url_capture(token: Token) -> None:
    """Restore the previous request-local URL collection context."""
    _retrieved_urls.reset(token)


def _clean_url_candidate(candidate: str) -> str:
    """Remove surrounding Markdown and unmatched closing punctuation."""
    candidate = candidate.rstrip(".,;:!?`*")
    for opening, closing in (("(", ")"), ("{", "}")):
        while candidate.endswith(closing) and candidate.count(closing) > candidate.count(opening):
            candidate = candidate[:-1]
    return candidate


def _extract_http_urls(value) -> set[str]:
    """Recursively extract HTTP URLs from passage text, metadata, and locations."""
    if isinstance(value, dict):
        urls = set()
        for nested_value in value.values():
            urls.update(_extract_http_urls(nested_value))
        return urls
    if isinstance(value, (list, tuple, set)):
        urls = set()
        for nested_value in value:
            urls.update(_extract_http_urls(nested_value))
        return urls
    if not isinstance(value, str):
        return set()

    return {
        _clean_url_candidate(match.group(0))
        for match in _HTTP_URL_PATTERN.finditer(value)
    }


@tool
def retrieve_from_kb(query: str) -> str:
    """
    Query the Chico State knowledge base for factual campus information.
    Use this for any question about campus services, offices, hours, policies, etc.

    Args:
        query: The user's question or search query

    Returns:
        Retrieved passages and their verified source URLs, or an error message
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
        verified_urls = set()
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

            # Bedrock may expose a web source in location/metadata, while some
            # indexed documents include official links directly in their text.
            verified_urls.update(_extract_http_urls(result.get("content", {})))
            verified_urls.update(_extract_http_urls(result.get("location", {})))
            verified_urls.update(_extract_http_urls(result.get("metadata", {})))

        captured_urls = _retrieved_urls.get()
        if captured_urls is not None:
            captured_urls.update(verified_urls)

        if not passages:
            return "No relevant information found in the knowledge base."

        response_text = "\n\n".join(passages)
        if verified_urls:
            source_list = "\n".join(f"- {url}" for url in sorted(verified_urls))
            response_text += (
                "\n\nVERIFIED SOURCE URLS (use only these exact URLs in links):\n"
                f"{source_list}"
            )
        else:
            response_text += (
                "\n\nVERIFIED SOURCE URLS: none. Do not create a URL for this answer."
            )

        return response_text

    except Exception as e:
        return f"Error querying knowledge base: {str(e)}"
