"""
Strands tool: Extract and validate phone numbers from text.
"""

import re
from strands.tools.decorator import tool


@tool
def extract_phone(text: str) -> str:
    """
    Extract and validate US phone numbers from a text string.
    Returns the first valid 10-digit phone number found, or indicates none found.

    Args:
        text: The text to search for phone numbers

    Returns:
        A 10-digit phone number string, or "none" if no valid number found
    """
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
                return digits

    return "none"
