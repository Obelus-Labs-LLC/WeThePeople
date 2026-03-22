"""
Extract structured claims from text or URLs using Claude.

Reuses existing services/llm/client.py for LLM calls and
services/extraction/extract_main_text.py for HTML parsing.
"""

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional

import requests
from bs4 import BeautifulSoup

from models.database import Claim

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Claim extraction via LLM
# ---------------------------------------------------------------------------

VERIFICATION_SYSTEM_PROMPT = """You are an expert political analyst who extracts factual, verifiable claims from political documents. Your job is to read press releases, speeches, campaign pages, and articles about U.S. politicians or companies and extract clear claims about their actions and positions.

WHAT COUNTS AS A CLAIM:
- Specific legislative actions: introducing, sponsoring, or voting on a bill
- Funding secured: earmarks, grants, or federal funding directed to specific projects
- Policy positions: clear stances on issues with concrete details
- Oversight actions: investigations, letters to agencies, hearings demanded
- Votes cast: specific yes/no votes on legislation
- Lobbying positions: specific lobbying efforts on particular issues
- Financial disclosures: stock trades, financial interests
- Campaign promises with measurable outcomes

WHAT IS NOT A CLAIM:
- Vague rhetoric without specific actions
- Campaign slogans or general promises without concrete details
- Boilerplate biographical information
- Fundraising appeals

OUTPUT FORMAT: Return a JSON array of claim objects. Each claim must have:
- text: clear standalone claim statement
- category: one of [legislative, oversight, funding, policy_position, trade, lobbying, campaign_promise]
- intent_type: one of [sponsored, voted_for, voted_against, introduced, funded, demanded, announced, traded, lobbied, promised]
- policy_area: brief description of the policy area (e.g., "healthcare", "defense", "environment")
- confidence: float 0.0-1.0 — how confident you are this is a real, verifiable claim

Return ONLY the JSON array, no other text."""


def extract_claims_from_text(text: str, entity_name: str) -> List[Dict]:
    """
    Call Claude to extract structured claims from raw text.

    Args:
        text: The document text to analyze
        entity_name: Name of the entity (politician or company) for context

    Returns:
        List of claim dicts with keys: text, category, intent_type, policy_area, confidence
    """
    from services.llm.client import get_llm_client
    import os
    import json

    client = get_llm_client()
    model = os.getenv("LLM_MODEL", "claude-sonnet-4-20250514")

    # Truncate very long documents
    max_chars = 50_000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Document truncated for length]"

    user_prompt = f"""Analyze the following document about "{entity_name}" and extract all verifiable claims.

DOCUMENT:
{text}

Return a JSON array of claim objects."""

    try:
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            system=VERIFICATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        response_text = message.content[0].text.strip()

        # Parse JSON — handle markdown code blocks
        if "```json" in response_text:
            start = response_text.index("```json") + 7
            end = response_text.index("```", start)
            response_text = response_text[start:end].strip()
        elif "```" in response_text:
            start = response_text.index("```") + 3
            end = response_text.index("```", start)
            response_text = response_text[start:end].strip()

        data = json.loads(response_text)
        if isinstance(data, dict) and "claims" in data:
            data = data["claims"]
        if not isinstance(data, list):
            logger.warning("LLM returned non-list: %s", type(data))
            return []

        # Validate and normalize
        validated = []
        for item in data:
            if not isinstance(item, dict) or not item.get("text"):
                continue
            validated.append({
                "text": str(item["text"]).strip(),
                "category": str(item.get("category", "general")).strip().lower(),
                "intent_type": str(item.get("intent_type", "unknown")).strip().lower(),
                "policy_area": str(item.get("policy_area", "")).strip().lower(),
                "confidence": max(0.0, min(1.0, float(item.get("confidence", 0.5)))),
            })
        return validated

    except Exception as e:
        logger.error("LLM claim extraction failed: %s", e)
        return []


def extract_claims_from_url(url: str, entity_name: str) -> List[Dict]:
    """
    Fetch URL content, extract main text, then extract claims via LLM.

    Args:
        url: URL to fetch
        entity_name: Name of the entity for context

    Returns:
        List of claim dicts
    """
    try:
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "WeThePeople/1.0 (civic transparency platform)"
        })
        resp.raise_for_status()
    except Exception as e:
        logger.error("Failed to fetch URL %s: %s", url, e)
        return []

    from services.extraction.extract_main_text import extract_main_text

    soup = BeautifulSoup(resp.text, "html.parser")
    text = extract_main_text(soup)

    if not text or len(text.strip()) < 100:
        logger.warning("Insufficient text from URL %s (%d chars)", url, len(text or ""))
        return []

    return extract_claims_from_text(text, entity_name)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _compute_claim_hash(person_id: str, text: str, source_url: str = "") -> str:
    """Stable deduplication hash for claims."""
    normalized = re.sub(r'\s+', ' ', text.lower().strip())
    normalized = re.sub(r'[^\w\s]', '', normalized)
    raw = f"{person_id}|{normalized}|{source_url or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def persist_claims(
    db,
    claims: List[Dict],
    person_id: str,
    entity_type: str,
    source_url: str = "",
) -> List[Claim]:
    """
    Create Claim rows with dedupe hashes. Skips duplicates.

    Args:
        db: SQLAlchemy session
        claims: List of claim dicts from extract_claims_from_text
        person_id: Entity identifier
        entity_type: "politician", "company", etc.
        source_url: Source URL if available

    Returns:
        List of persisted (or existing) Claim objects
    """
    persisted = []
    for c in claims:
        claim_hash = _compute_claim_hash(person_id, c["text"], source_url)

        # Check for existing
        existing = db.query(Claim).filter(Claim.claim_hash == claim_hash).first()
        if existing:
            persisted.append(existing)
            continue

        claim = Claim(
            person_id=person_id,
            text=c["text"],
            category=c.get("category", "general"),
            intent=c.get("intent_type", "unknown"),
            claim_date=datetime.now(timezone.utc).date(),
            claim_source_url=source_url or None,
            claim_hash=claim_hash,
        )
        db.add(claim)
        try:
            db.flush()
            persisted.append(claim)
        except Exception:
            db.rollback()
            # Probably a duplicate race condition — fetch existing
            existing = db.query(Claim).filter(Claim.claim_hash == claim_hash).first()
            if existing:
                persisted.append(existing)

    db.commit()
    return persisted
