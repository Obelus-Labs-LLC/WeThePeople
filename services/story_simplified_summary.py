"""60-second simplified story summary.

The platform's stated audience is politically disengaged adults who
don't already follow civic data. The full investigative body of a
story (4500-5500 chars) presupposes vocabulary they don't have:
"appropriations", "PAC", "oversight committee", "filing cycle".

The simplified summary is a 200-300 word, 5th-grade reading level,
no-jargon retelling of the same story anchored in personal cost
where possible (a $35 fee, a named local entity, a clear next-step
question). It runs once per story via Haiku and caches on
`stories.summary_simplified`. The story page renders a toggle when
the simplified version exists; readers default to whichever they
prefer.

Best-effort: if the API key is missing, the SDK isn't installed, the
model fails, or the response is empty, we return None and the page
falls back to the full summary. Never raises.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("WTP_SIMPLIFIED_SUMMARY_MODEL", "claude-haiku-4-5")
GENERATION_TIMEOUT_SECONDS = 12

SYSTEM_PROMPT = """You translate investigative journalism about money in
US politics into plain English for people who don't follow politics.

Your audience is a politically disengaged adult: someone who is eligible
to vote but rarely does, and who finds traditional civic content
unreadable. Your translation must:

- Be 200 to 300 words. No more.
- Use 5th-grade reading level vocabulary. Short sentences. Short words.
- Replace every term that requires background knowledge:
    "lobbying" -> "paying for access to lawmakers"
    "PAC" -> "the company's political fund"
    "appropriations committee" -> "the committee that decides federal
                                   spending"
    "oversight committee" -> "the committee that writes the rules for
                              this industry"
- Anchor the story in something concrete. A named company, a named
  politician, a specific dollar amount, a specific date. Avoid abstract
  framing.
- When the original story includes a personal-cost anchor (an overdraft
  fee, a prescription price, a fuel cost, a tax bracket) lead with it.
- Stay neutral. No "this is outrageous", no "the public deserves", no
  "everyone should care". Tell the reader what happened. Let them
  decide.
- Never imply causation between donations and votes. If the original
  says "Senator X voted on Y after receiving Z", say "Senator X
  received Z. Senator X voted on Y." Two facts. Don't connect them
  rhetorically.
- End with one short sentence pointing the reader to the receipts:
  "Read the full breakdown for the source documents."

Output only the translated summary as plain text. No preamble. No
markdown. No quotation marks. No labels."""


def _build_user_prompt(*, title: str, summary: str, body: str, category: Optional[str]) -> str:
    parts = [
        f"Title: {title}",
        f"Category: {category or 'general'}",
        "",
        "One-sentence summary:",
        summary or "(none)",
        "",
        "Full story:",
        body,
        "",
        "Translate this into a 200-300 word plain-English version following the rules.",
    ]
    return "\n".join(parts)


def generate_simplified_summary(
    *,
    title: str,
    summary: Optional[str],
    body: str,
    category: Optional[str] = None,
    model: str = DEFAULT_MODEL,
    max_body_chars: int = 24_000,
) -> Optional[str]:
    """Generate a 200-300 word simplified version. Returns None on any
    failure or when the inputs are too thin to produce something
    meaningful. Never raises."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.info("simplified_summary: ANTHROPIC_API_KEY unset; skipping")
        return None

    try:
        from anthropic import Anthropic
    except ImportError:
        logger.info("simplified_summary: anthropic SDK not installed")
        return None

    title = (title or "").strip()
    body = (body or "").strip()
    if not title or len(body) < 200:
        return None

    body_for_call = body[:max_body_chars]
    if len(body) > max_body_chars:
        body_for_call += "\n\n[Body truncated for length]"

    prompt = _build_user_prompt(
        title=title,
        summary=summary or "",
        body=body_for_call,
        category=category,
    )

    try:
        client = Anthropic(api_key=api_key, timeout=GENERATION_TIMEOUT_SECONDS)
        message = client.messages.create(
            model=model,
            max_tokens=900,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        logger.warning("simplified_summary: model call failed: %s", e)
        return None

    try:
        text = message.content[0].text.strip()
    except (AttributeError, IndexError):
        return None

    if not text or len(text) < 100:
        return None
    return text


def generate_and_cache(story, db_session, model: str = DEFAULT_MODEL) -> Optional[str]:
    """Generate a simplified summary for a Story row, cache it, return
    the text. Caller commits the session."""
    text = generate_simplified_summary(
        title=story.title or "",
        summary=story.summary,
        body=story.body or "",
        category=story.category,
        model=model,
    )
    if not text:
        return None
    try:
        story.summary_simplified = text
        story.summary_simplified_model = model
        db_session.commit()
    except Exception as e:
        logger.warning("simplified_summary: cache write failed: %s", e)
        try:
            db_session.rollback()
        except Exception:
            pass
    return text
