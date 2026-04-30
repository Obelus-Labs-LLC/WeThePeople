"""On-demand AI-generated bill summaries.

Congress.gov publishes a CRS summary for each bill, but only after the
Congressional Research Service has time to write one. ~38% of our
39,064 bills have no CRS summary yet (esp. newly introduced ones).
Until a CRS summary lands, we generate a short, neutral, factual
2-3 sentence summary using Haiku and cache it on
`bills.metadata_json.ai_summary` so we only pay the model cost once
per bill.

Design rules:
  - Use Haiku for cost. Each summary is ~150 input tokens + ~120
    output tokens, so well under a cent per bill.
  - Tight system prompt: factual, neutral, no editorializing, no
    speculation about purpose or motive, no implication of stance.
  - Cache on metadata_json.ai_summary so subsequent reads are free.
  - Never raise. On any failure (no API key, network, parse), return
    None and let the caller fall back to the constitutional-authority
    block.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("WTP_BILL_SUMMARY_MODEL", "claude-haiku-4-5")
GENERATION_TIMEOUT_SECONDS = 8

SYSTEM_PROMPT = """You generate short, neutral, factual summaries of US
Congressional bills for a public-records platform. Each summary must:

- Be 2 to 3 sentences (no more).
- State what the bill would do, in plain English.
- Use neutral language. No editorial framing. No words that imply
  motive, stance, or political alignment.
- Never assert effects or outcomes the bill text does not state.
- Never use words like "controversial", "important", "significant",
  "good", "bad", "should", "needs to".
- If the title and metadata are insufficient to write a substantive
  summary, output the literal string "INSUFFICIENT" and nothing else.

Output the summary as plain text only. No preamble. No markdown. No
bullet lists. No quotation marks. No labels."""


def _build_user_prompt(
    *,
    title: str,
    bill_id: str,
    bill_type: str,
    bill_number: str,
    congress: int | str,
    policy_area: Optional[str],
    latest_action_text: Optional[str],
    subjects: Optional[list[str]],
) -> str:
    subjects_line = (
        f"Subjects: {', '.join(subjects)}\n" if subjects else ""
    )
    policy_line = f"Policy area: {policy_area}\n" if policy_area else ""
    latest_line = (
        f"Latest action: {latest_action_text}\n" if latest_action_text else ""
    )
    return (
        f"Bill: {bill_type.upper()} {bill_number} ({bill_id})\n"
        f"Title: {title}\n"
        f"Congress: {congress}\n"
        f"{policy_line}{subjects_line}{latest_line}\n"
        "Write the summary now."
    )


def _parse_subjects(subjects_json: Any) -> Optional[list[str]]:
    """The subjects_json column on bills is sometimes a JSON string,
    sometimes a Python list, sometimes None."""
    if subjects_json is None:
        return None
    if isinstance(subjects_json, list):
        out = [str(s) for s in subjects_json if s]
        return out or None
    if isinstance(subjects_json, str) and subjects_json.strip():
        try:
            data = json.loads(subjects_json)
        except (ValueError, TypeError):
            return None
        if isinstance(data, list):
            out = [str(s) for s in data if s]
            return out or None
        if isinstance(data, dict):
            # Some Congress.gov payloads wrap subjects in {"items": [...]}.
            items = data.get("items") or data.get("subjects")
            if isinstance(items, list):
                # Items can be {"name": "..."} dicts or plain strings.
                names = []
                for it in items:
                    if isinstance(it, dict) and it.get("name"):
                        names.append(str(it["name"]))
                    elif isinstance(it, str):
                        names.append(it)
                return names or None
    return None


def _ensure_meta_dict(raw_meta: Any) -> dict[str, Any]:
    if isinstance(raw_meta, dict):
        return dict(raw_meta)
    if isinstance(raw_meta, str) and raw_meta.strip():
        try:
            data = json.loads(raw_meta)
            if isinstance(data, dict):
                return data
        except (ValueError, TypeError):
            pass
    return {}


def cached_ai_summary(bill) -> Optional[str]:
    """Return the cached AI summary from metadata_json.ai_summary, if any."""
    meta = _ensure_meta_dict(getattr(bill, "metadata_json", None))
    val = meta.get("ai_summary")
    if isinstance(val, str) and val.strip() and val.strip().upper() != "INSUFFICIENT":
        return val.strip()
    return None


def generate_and_cache_summary(bill, db_session) -> Optional[str]:
    """Generate a Haiku summary for a bill, cache it, return the text.

    Returns None on any failure or when the model decides the available
    metadata is insufficient (it returns the sentinel "INSUFFICIENT",
    which we cache so we don't keep retrying every page load).

    Caller is responsible for committing the db_session.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.info("bill_ai_summary: ANTHROPIC_API_KEY unset; skipping")
        return None

    try:
        from anthropic import Anthropic
    except ImportError:
        logger.info("bill_ai_summary: anthropic SDK not installed")
        return None

    title = (getattr(bill, "title", "") or "").strip()
    if not title:
        return None

    user_prompt = _build_user_prompt(
        title=title,
        bill_id=getattr(bill, "bill_id", "") or "",
        bill_type=getattr(bill, "bill_type", "") or "",
        bill_number=str(getattr(bill, "bill_number", "") or ""),
        congress=getattr(bill, "congress", "") or "",
        policy_area=getattr(bill, "policy_area", None),
        latest_action_text=getattr(bill, "latest_action_text", None),
        subjects=_parse_subjects(getattr(bill, "subjects_json", None)),
    )

    try:
        client = Anthropic(api_key=api_key, timeout=GENERATION_TIMEOUT_SECONDS)
        message = client.messages.create(
            model=DEFAULT_MODEL,
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as e:
        logger.warning("bill_ai_summary: generation failed for %s: %s",
                       getattr(bill, "bill_id", "?"), e)
        return None

    try:
        text = message.content[0].text.strip()
    except (AttributeError, IndexError):
        return None

    if not text:
        return None

    sentinel = text.upper().startswith("INSUFFICIENT")
    cache_value = "INSUFFICIENT" if sentinel else text

    meta = _ensure_meta_dict(getattr(bill, "metadata_json", None))
    meta["ai_summary"] = cache_value
    try:
        bill.metadata_json = meta
        # Mark as modified explicitly when the column is JSON-typed but
        # SQLAlchemy doesn't always notice nested dict changes.
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(bill, "metadata_json")
        db_session.commit()
    except Exception as e:
        logger.warning("bill_ai_summary: failed to cache summary: %s", e)
        try:
            db_session.rollback()
        except Exception:
            pass

    return None if sentinel else text
