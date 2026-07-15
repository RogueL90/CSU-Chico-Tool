"""
Strands tool: Classify what output types to render in the app.
"""

from strands.tools.decorator import tool


@tool
def classify_outputs(
    has_text_answer: bool,
    has_location: bool,
    has_phone: bool,
) -> str:
    """
    Determine which output types the app should render based on available data.

    Args:
        has_text_answer: Whether there is a text answer to display
        has_location: Whether a map location was found
        has_phone: Whether a phone number was found

    Returns:
        Comma-separated list of output types to render (e.g. "text,map,phone")
    """
    types = []
    if has_text_answer:
        types.append("text")
    if has_location:
        types.append("map")
    if has_phone:
        types.append("phone")

    if not types:
        types = ["text"]

    return ",".join(types)
