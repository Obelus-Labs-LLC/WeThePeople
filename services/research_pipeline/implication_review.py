"""Pre-publication implication review.

Veritas's post-write gate verifies individual claims. This module
covers a different failure mode: a story whose individual claims are
each true but whose narrative implies a relationship the data does not
support.

Example:
    Claim 1: "Senator X received $50K from PAC Y over 2 cycles." (true)
    Claim 2: "Senator X voted against bill Z." (true)
    Narrative: "Senator X received money from PAC Y AND voted against
    bill Z" — true on its face, but written in a way that implies
    causation the data cannot support.

The implication-review pass reads the assembled story body and flags
sentences that imply causation between donations / lobbying spend and
votes / policy outcomes without explicit evidence. Flags are advisory:
they get attached to the story_draft and rendered on the editor review
page (/ops/story-queue/{id}). The human editor decides whether to
revise the wording, find evidence, or kill the story.

The pass is best-effort. If the LLM call fails (no API key, rate
limit, network error) we return an empty flag list and a non-fatal
note. The orchestrator does not block on this stage.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Keep the prompt short and the output narrow. Cheap call, fast turnaround.
SYSTEM_PROMPT = """You are an editorial reviewer for a civic transparency
publication. Your job is to flag sentences that imply causation or
intent without explicit evidence.

Specifically, flag sentences that:
1. Imply a donation or lobbying expenditure caused a vote or policy
   outcome, when the story does not present explicit evidence of the
   causal link (such as a public statement, a recorded admission, or
   a documented quid pro quo).
2. Use language that suggests improper motive, corruption, or quid
   pro quo without naming a specific evidentiary basis.
3. Use sequence-as-causation rhetoric ("after X donated, Y voted") in
   ways a reasonable reader would interpret as implying causation.
4. Use loaded verbs of intent (bought, paid for, secured, rewarded,
   captured, owns) when describing relationships between donors and
   officials.

DO NOT flag:
- Sentences that describe correlation without implying causation.
- Sentences with explicit evidentiary support cited inline.
- Direct quotes from named sources making such claims.
- Statements of fact about money flows or vote outcomes.

Output ONLY a JSON array (no prose, no preamble) of objects with this
shape:

[
  {
    "sentence": "<the exact problem sentence verbatim>",
    "reason": "<short reason: which rule above it violates>",
    "suggested_fix": "<a same-fact rewording that drops the implication>"
  }
]

If you find no problems, output an empty array: []
"""

USER_PROMPT_TEMPLATE = """Review the following story body for sentences that
imply causation between donations / lobbying and votes / policy
outcomes without explicit evidence. Output the JSON array only.

STORY TITLE: {title}
STORY CATEGORY: {category}

STORY BODY:
\"\"\"
{body}
\"\"\"
"""


def review_story_implications(
    *,
    title: str,
    body: str,
    category: str = "unknown",
    model: str = "claude-sonnet-4-20250514",
    max_body_chars: int = 30_000,
) -> list[dict[str, str]]:
    """Run the implication-review pass over a story body.

    Returns a list of flagged sentences. An empty list means either
    the body looked clean OR the call failed gracefully (caller can
    distinguish via the logger output).

    Failure modes (all return []):
      - ANTHROPIC_API_KEY not set
      - The anthropic SDK isn't importable
      - The model call raises
      - The response is unparseable

    Best-effort: this never raises.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.info("implication_review: ANTHROPIC_API_KEY unset; skipping")
        return []

    try:
        from anthropic import Anthropic
    except ImportError:
        logger.info("implication_review: anthropic SDK not installed; skipping")
        return []

    if not body or not body.strip():
        return []

    body_for_review = body[:max_body_chars]
    if len(body) > max_body_chars:
        body_for_review = body_for_review + "\n\n[Body truncated for review]"

    prompt = USER_PROMPT_TEMPLATE.format(
        title=title or "(no title)",
        category=category or "unknown",
        body=body_for_review,
    )

    try:
        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        logger.warning("implication_review: model call failed: %s", e)
        return []

    try:
        response_text = message.content[0].text
    except (AttributeError, IndexError):
        logger.warning("implication_review: unexpected response shape")
        return []

    return _parse_flag_list(response_text)


def _parse_flag_list(response_text: str) -> list[dict[str, str]]:
    """Pull a JSON array of flag dicts out of a model response.

    Tolerates ```json fenced output and stray prose around the array.
    Returns [] on any parse failure. Matches the same defensive parse
    pattern as services.llm.client._parse_claims_response.
    """
    text = (response_text or "").strip()

    if "```json" in text:
        try:
            start = text.index("```json") + 7
            end = text.index("```", start)
            text = text[start:end].strip()
        except ValueError:
            pass
    elif "```" in text:
        try:
            start = text.index("```") + 3
            end = text.index("```", start)
            text = text[start:end].strip()
        except ValueError:
            pass

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if not match:
            logger.info("implication_review: no JSON array in response; treating as no flags")
            return []
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError:
            logger.warning("implication_review: embedded array failed to parse")
            return []

    if isinstance(data, dict) and "flags" in data:
        data = data["flags"]
    if not isinstance(data, list):
        return []

    out: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        sentence = str(item.get("sentence") or "").strip()
        if not sentence:
            continue
        out.append({
            "sentence": sentence,
            "reason": str(item.get("reason") or "").strip()[:280],
            "suggested_fix": str(item.get("suggested_fix") or "").strip()[:560],
        })
    return out


def attach_flags_to_draft(
    story_draft: dict[str, Any],
    flags: Optional[list[dict[str, str]]] = None,
) -> dict[str, Any]:
    """Attach implication-review flags onto a story_draft dict so the
    editor review page can render them.

    Stored under evidence.implication_flags so the data round-trips
    through the existing JSON-serialized evidence field on the Story
    model without a schema change.
    """
    if flags is None:
        return story_draft
    evidence = story_draft.get("evidence") or {}
    if not isinstance(evidence, dict):
        evidence = {}
    evidence = {**evidence, "implication_flags": flags}
    return {**story_draft, "evidence": evidence}
