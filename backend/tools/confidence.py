"""
Strands tool: Score confidence level of the response.
"""

from strands.tools.decorator import tool


@tool
def score_confidence(
    kb_answer_quality: str,
    query_specificity: str,
    answer_completeness: str,
) -> str:
    """
    Score how confident you are in the answer on a scale of 0-100.
    Consider the quality of the knowledge base answer, specificity of the
    user's question, and completeness of your response.

    Args:
        kb_answer_quality: One of "high", "medium", "low", "none" - how relevant was the KB result
        query_specificity: One of "specific", "moderate", "vague" - how clear was the user's question
        answer_completeness: One of "complete", "partial", "minimal" - how fully does the answer address the query

    Returns:
        A confidence score as a string (e.g. "85")
    """
    quality_scores = {"high": 40, "medium": 25, "low": 10, "none": 0}
    specificity_scores = {"specific": 30, "moderate": 20, "vague": 5}
    completeness_scores = {"complete": 30, "partial": 20, "minimal": 5}

    score = (
        quality_scores.get(kb_answer_quality, 15)
        + specificity_scores.get(query_specificity, 10)
        + completeness_scores.get(answer_completeness, 10)
    )

    score = max(0, min(100, score))
    return str(score)
