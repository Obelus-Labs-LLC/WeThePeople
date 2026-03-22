"""
Claude API client for LLM-powered claim extraction.

Uses Anthropic's Python SDK to send source documents (press releases,
speeches, floor statements) to Claude and receive structured claim data.
"""

import json
import logging
import os
import time
from typing import List, Dict, Optional

from anthropic import Anthropic

from .prompts import CLAIM_EXTRACTION_SYSTEM_PROMPT, build_claim_extraction_prompt

# Singleton client
_client: Optional[Anthropic] = None

# Default model — configurable via env var, falls back to Sonnet 4
DEFAULT_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-20250514")

_cost_logger = logging.getLogger(__name__ + ".cost")


def get_llm_client() -> Anthropic:
    """Get or create the Anthropic client singleton."""
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key or not api_key.strip():
            raise ValueError(
                "ANTHROPIC_API_KEY not set or empty. Add it to your .env file."
            )
        _client = Anthropic(api_key=api_key)
    return _client


def extract_claims_from_text(
    text: str,
    person_name: str,
    source_url: str = "",
    source_type: str = "press_release",
    model: str = DEFAULT_MODEL,
    max_retries: int = 2,
) -> List[Dict]:
    """
    Send a document to Claude and extract structured claims.

    Args:
        text: The full text of the document (press release, speech, etc.)
        person_name: Display name of the politician (e.g. "Elizabeth Warren")
        source_url: URL of the source document (for context)
        source_type: Type of document (press_release, speech, floor_statement, etc.)
        model: Claude model to use
        max_retries: Number of retries on transient failures

    Returns:
        List of claim dicts, each with:
        - claim_text: str — clear, standalone claim statement
        - category: str — legislative, oversight, funding, policy_position, etc.
        - intent: str — sponsored, voted_for, voted_against, demanded, announced, etc.
        - bill_references: list[str] — any bill IDs mentioned (e.g. "H.R. 1234")
        - confidence: float — 0.0-1.0 how confident the LLM is this is a real claim
        - source_quote: str — the original text passage this was extracted from
        - context: str — brief context about what the claim relates to
    """
    client = get_llm_client()

    # Build the user prompt with the document
    user_prompt = build_claim_extraction_prompt(
        text=text,
        person_name=person_name,
        source_url=source_url,
        source_type=source_type,
    )

    # Truncate the source text before building the final prompt to stay within token limits.
    # Sonnet has 200k context, but we want to be efficient.
    max_text_chars = 50_000  # ~12k tokens, plenty for a press release
    if len(text) > max_text_chars:
        text_truncated = text[:max_text_chars] + "\n\n[Document truncated for length]"
        user_prompt = build_claim_extraction_prompt(
            text=text_truncated,
            person_name=person_name,
            source_url=source_url,
            source_type=source_type,
        )

    delay = 1.0
    for attempt in range(max_retries + 1):
        try:
            message = client.messages.create(
                model=model,
                max_tokens=4096,
                system=CLAIM_EXTRACTION_SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_prompt}
                ],
            )

            # Log approximate cost for tracking
            if hasattr(message, 'usage') and message.usage:
                input_tokens = getattr(message.usage, 'input_tokens', 0) or 0
                output_tokens = getattr(message.usage, 'output_tokens', 0) or 0
                # Approximate cost: Sonnet input=$3/MTok, output=$15/MTok
                approx_cost = (input_tokens * 3.0 / 1_000_000) + (output_tokens * 15.0 / 1_000_000)
                _cost_logger.info(
                    f"LLM call: model={model} in={input_tokens} out={output_tokens} "
                    f"approx_cost=${approx_cost:.4f}"
                )

            # Extract the text response
            response_text = message.content[0].text

            # Parse JSON from the response
            claims = _parse_claims_response(response_text)

            return claims

        except Exception as e:
            error_str = str(e)
            # Retry on rate limits and server errors
            if attempt < max_retries and (
                "rate_limit" in error_str.lower()
                or "overloaded" in error_str.lower()
                or "529" in error_str
                or "500" in error_str
            ):
                print(f"  [RETRY] Attempt {attempt + 1}/{max_retries}: {error_str[:100]}")
                time.sleep(delay)
                delay *= 2
                continue
            raise

    return []  # pragma: no cover — unreachable; loop always returns or raises


def _parse_claims_response(response_text: str) -> List[Dict]:
    """
    Parse the LLM response into structured claim dicts.

    Handles:
    - Clean JSON array responses
    - JSON wrapped in markdown code blocks
    - Edge cases like empty responses
    """
    text = response_text.strip()

    # Try to extract JSON from markdown code blocks
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        text = text[start:end].strip()

    # Parse JSON
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to find a JSON array anywhere in the text
        import re
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                print(f"  [WARN] Could not parse LLM response as JSON")
                return []
        else:
            print(f"  [WARN] No JSON array found in LLM response")
            return []

    # Handle both {"claims": [...]} and direct [...] formats
    if isinstance(data, dict) and "claims" in data:
        data = data["claims"]

    if not isinstance(data, list):
        print(f"  [WARN] Expected list, got {type(data)}")
        return []

    # Validate and normalize each claim
    validated = []
    for item in data:
        if not isinstance(item, dict):
            continue
        if not item.get("claim_text"):
            continue

        claim = {
            "claim_text": str(item["claim_text"]).strip(),
            "category": str(item.get("category", "general")).strip().lower(),
            "intent": str(item.get("intent", "unknown")).strip().lower(),
            "bill_references": item.get("bill_references", []),
            "confidence": float(item.get("confidence", 0.5)),
            "source_quote": str(item.get("source_quote", "")).strip(),
            "context": str(item.get("context", "")).strip(),
        }

        # Ensure bill_references is a list of strings
        if not isinstance(claim["bill_references"], list):
            claim["bill_references"] = []
        claim["bill_references"] = [str(b).strip() for b in claim["bill_references"] if b]

        # Clamp confidence
        claim["confidence"] = max(0.0, min(1.0, claim["confidence"]))

        validated.append(claim)

    return validated
