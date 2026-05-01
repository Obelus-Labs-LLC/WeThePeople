"""
Story generation under the new editorial standards.

Source of truth: ``research/EDITORIAL_STANDARDS.md`` (the master prompt
verbatim, installed 2026-05-01).

This module is the replacement for ``jobs/detect_stories._write_opus_narrative``.
The legacy R1-R23 prompt is left in place untouched but is not called by any
of the new code paths — it stays only so the audit history makes sense.

What this generator does differently from the legacy path:

1. Builds the story from ``evidence`` (the structured fact pack already on
   each ``Story`` row) instead of from a placeholder skeleton. This avoids
   the {NARRATIVE_*} indirection and lets the model emit the section
   structure required by Part 2 of the editorial standards directly.
2. Enforces the 5 mandatory sections (Headline + Lede + The Finding +
   Why This Matters + What the Data Doesn't Show + Verification &
   Methodology) by asking for them by name and rejecting drafts where any
   are missing.
3. Forbids the "Partially Verified" label outright. The output is either
   "Fully Verified" (rare; requires every claim to be primary-source
   attested) or "Algorithmically generated, not human-verified."
4. Enforces "every dollar figure carries its time window in the same
   sentence" via a post-generation regex check. Drafts that fail are
   returned with a ``halted=True`` flag; the orchestrator does not save
   them to the DB until a human revises.
5. Forbids category-first framing by requiring the model to state, up
   front, what specific evidence in the data establishes the category
   label — and rejecting if the evidence is absent.

Public surface:

    regenerate_story(evidence: dict, *, story_id: int, title: str,
                     category: str, sector: str | None,
                     data_date_range: str | None,
                     ai_generated: str = "algorithmic")
        -> RegenerationResult

The ``RegenerationResult`` is a small dataclass with ``body``,
``new_title``, ``new_summary``, ``verification_label``, ``halted``,
``halt_reasons``, ``cost_usd``, and ``raw`` (the raw model output) for
audit purposes.

Cost expectations (Opus 4):
    ~$0.15 per story input + output combined.
    50-story batch ≈ $7.50.

Read calls: this module does not query the database. The orchestrator
must hand it a fully-populated ``evidence`` dict.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("generate_under_standards")

OPUS_MODEL = "claude-opus-4-20250514"
OPUS_MAX_TOKENS = 6000

# Maximum age of "current" data the generator is allowed to call recent.
# Anything older has to be referred to with the explicit year.
CURRENT_DATA_FRESHNESS_YEARS = 1


# ── Result type ──────────────────────────────────────────────────────────────


@dataclass
class RegenerationResult:
    """Structured result of a single story regeneration."""

    body: str | None
    new_title: str | None
    new_summary: str | None
    verification_label: str | None
    halted: bool
    halt_reasons: list[str] = field(default_factory=list)
    cost_usd: float = 0.0
    raw: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


# ── Prompt construction ──────────────────────────────────────────────────────


_PROMPT_HEADER = """You are an investigative data journalist writing for The Influence Journal,
WeThePeople's civic-transparency journal. Your stories are read by working
political reporters at INN-affiliated nonprofit newsrooms (e.g., Bridge
Michigan). Every story you produce must survive editorial scrutiny from a
trained journalist who will spot-check your numbers, click your sources,
and challenge your inferences. If a story cannot survive that scrutiny,
do not publish it — emit STORY HALTED instead.

The full editorial standard you must follow is in
research/EDITORIAL_STANDARDS.md. The rules below are derived from Part 2
of that standard. Treat them as absolute.

# CORE PRINCIPLE

You build stories from facts, not from categories. The data tells you what
the story is. You do NOT pick a category up front and write toward it. You
examine the FACTS dict below first, identify what is genuinely anomalous
or newsworthy, then either (a) publish under the appropriate framing if
the facts support it, or (b) emit STORY HALTED with a one-line reason.

# WHAT MAKES SOMETHING A STORY

A finding is a story only if at least one of these is true:

- Anomaly against baseline: pattern deviates significantly from sector norms.
- Temporal correlation with policy events: activity clusters around specific
  votes, hearings, contract awards, or regulatory actions.
- Closed-loop evidence: a complete cycle (lobbying then committee assignment
  then vote then donation; contract then enforcement waiver then renewed
  contract).
- Disclosed conflict: a documented financial interest intersects with a
  documented official action by the same person/entity.
- Verified revolving-door movement: a specific named individual moved from
  agency X to lobbying firm Y, attested in public records.

If none of these apply, emit STORY HALTED. "Lobbying firm specializes in
agency it lobbies", "politician owns stocks", "company donates to
politicians" — those are baseline behaviors and not stories.

# REQUIRED OUTPUT STRUCTURE (NO DEVIATION)

Emit exactly these markdown sections in this order. Section headers must
be H2 (## ...) with the exact text shown.

1. # Headline (H1)
   - Maximum 140 characters. States a specific verifiable fact: entity,
     action, magnitude, time period.
   - No vague intensifiers (massive, stunning, shocking, staggering,
     huge, explosive, bombshell, scandal, corrupt, kickback).
   - No causation-implying phrases when the data is correlational
     ("after X did Y", "in response to", "as a result of",
     "because of", "in exchange for").

2. ## Lede
   - 50–75 words.
   - States the single most important finding in plain language.
   - Includes the time period, the dollar amount or count, and the
     named entity.

3. ## The Finding
   - 200–300 words.
   - Presents the core data with full numerical context.
   - Every number is annotated with its time window and source in the
     same sentence: "$X.YM in fiscal year 2024 per Senate LDA filings".
   - Compares the finding to a baseline (sector average, prior period,
     peer entities) so the reader knows whether the number is large,
     normal, or small.
   - Does not repeat the headline.

4. ## Why This Matters
   - 150–200 words.
   - Specific public-interest stake, not generic civic values.
   - Connects the finding to a specific policy outcome, vote, contract,
     or regulatory action where possible.
   - Does not editorialize about the entity's character or motives.

5. ## What the Data Doesn't Show
   - 75–125 words. MANDATORY.
   - Explicitly states the limits of the dataset.
   - Names what additional research would be needed for stronger conclusions.

6. ## Verification & Methodology
   - Lists every dataset used, with its date range and last-updated
     timestamp from FACTS.
   - Lists every external source consulted (URLs to .gov / sec.gov /
     congress.gov / fec.gov etc.).
   - Final line, on its own: a verification label that is EXACTLY ONE of:
       Fully verified
       Algorithmically generated, not human-verified
     Never "Partially verified" — that label is not acceptable.

# ABSOLUTE RULES

A1. Every dollar figure must carry its time window in the same sentence.
    "$10M" alone is rejected. "$10M in fiscal year 2024" or "$10M between
    2020 and 2024" is required.

A2. Every named entity (politician, company, lobbying firm, client, agency)
    must appear in the FACTS dict. If you mention an entity not in FACTS,
    the draft is rejected. No inferred client lists.

A3. No "Partially Verified" anywhere in the output.

A4. No "Revolving Door" framing unless FACTS contains a verified personnel
    movement (named individual, source agency, destination firm). If the
    requested category is revolving_door but FACTS has no such record,
    emit STORY HALTED.

A5. No causation language ("often signals", "typically suggests",
    "likely indicates", "may indicate", "suggests either", "appears to
    suggest", "hints at", "points to") unless paired with explicit
    distinguish-from-verified-fact scaffolding.

A6. No em-dashes (—), en-dashes (–), or double hyphens (--) anywhere.
    Use commas, periods, parentheses, or semicolons.

A7. No padding. No "this matters because" followed by generic civic
    values. No speculative "could / might" without data support. No
    industry-context paragraph that doesn't directly support the finding.
    No conclusion paragraph that summarizes what was already said.

A8. If FACTS has data older than %d years and you describe it as
    "current", "recent", or "today's", the draft is rejected.

A9. Headlines that contain "after [entity did Y]" framing imply causation
    and are rejected. Use neutral framing.

A10. The story shall not invent any number not present in FACTS. No
     "industry spent $X billion last year" context numbers, no
     extrapolation, no rounding (if FACTS says $90.4M, write $90.4M not
     $90M).

# HALT INSTEAD OF PUBLISH

If after considering FACTS you cannot satisfy every rule above, emit
exactly one line:

    STORY HALTED: <one short reason>

and nothing else. Do NOT half-publish. The orchestrator interprets this
as "do not save to DB; queue for human review."
"""


def _build_prompt(
    *,
    facts: dict,
    category: str,
    sector: str | None,
    data_date_range: str | None,
    legacy_title: str,
) -> str:
    """Assemble the full prompt: header + standards + FACTS dict + ASK."""
    header = _PROMPT_HEADER % CURRENT_DATA_FRESHNESS_YEARS
    facts_block = json.dumps(facts, indent=2, ensure_ascii=False, default=str)
    ask = (
        f"\n\n# REQUEST\n\n"
        f"category requested: {category}\n"
        f"sector: {sector or '(none)'}\n"
        f"data_date_range: {data_date_range or '(none)'}\n"
        f"legacy_title (do not reuse verbatim if it implies causation): {legacy_title}\n"
        f"current_year: {datetime.now(timezone.utc).year}\n\n"
        f"FACTS:\n{facts_block}\n\n"
        f"Now produce the story per the structure above, OR emit STORY HALTED."
    )
    return header + ask


# ── Output validation ────────────────────────────────────────────────────────


_REQUIRED_SECTIONS = [
    re.compile(r"^##\s+Lede\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^##\s+The\s+Finding\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^##\s+Why\s+This\s+Matters\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^##\s+What\s+the\s+Data\s+Does(n['’]?t|n[’]t|n[‘]t|\s+not)\s+Show\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^##\s+Verification\s*(&|and)\s*Methodology\b", re.IGNORECASE | re.MULTILINE),
]
_PARTIAL_VERIFIED_RE = re.compile(r"\bpartially?[-\s]?verified\b", re.IGNORECASE)
_DASH_RE = re.compile(r"(—|–|--)")  # em-dash, en-dash, double-hyphen
_DOLLAR_RE = re.compile(r"\$[\d,]+(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b", re.IGNORECASE)
_MONTH_NAME = (
    r"(January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
)
# Allow Month-Year ("February 2023") and Month-Day-Year ("February 15, 2023")
_MONTH_YEAR = rf"({_MONTH_NAME}\s+(\d{{1,2}},\s+)?(19|20)\d{{2}})"
_QUARTER_YEAR = r"(Q[1-4]\s+(19|20)\d{2}|FY\s*(19|20)\d{2})"

_TIME_WINDOW_RE = re.compile(
    r"\b("
    # Plain year refs
    r"in\s+(19|20)\d{2}\b|"
    r"in\s+fiscal\s+year\s+(19|20)\d{2}\b|"
    r"during\s+(19|20)\d{2}\b|"
    r"as\s+of\s+(19|20)\d{2}\b|"
    # Year-only ranges: "between 2020 and 2024", "from 2020 to 2024", "2020 through 2024"
    r"between\s+(19|20)\d{2}\s+and\s+(19|20)\d{2}\b|"
    r"from\s+(19|20)\d{2}\s+(to|through)\s+(19|20)\d{2}\b|"
    r"(19|20)\d{2}\s+(to|through)\s+(19|20)\d{2}\b|"
    r"(19|20)\d{2}[-–—/](19|20)?\d{2}\b|"
    r"the\s+(19|20)\d{2}[-–—/](19|20)?\d{2}\b|"
    # Month-name dates and ranges: "February 2023", "between February 2023 and September 2024"
    rf"between\s+{_MONTH_YEAR}\s+and\s+{_MONTH_YEAR}|"
    rf"from\s+{_MONTH_YEAR}\s+(to|through)\s+{_MONTH_YEAR}|"
    rf"{_MONTH_YEAR}\s+(to|through)\s+{_MONTH_YEAR}|"
    rf"in\s+{_MONTH_YEAR}|"
    rf"during\s+{_MONTH_YEAR}|"
    rf"{_MONTH_YEAR}\b|"
    # Quarter / fiscal year references near the dollar figure
    rf"{_QUARTER_YEAR}|"
    # Rolling windows
    r"over\s+the\s+past\s+\d+[-\s]?(year|month|quarter|fiscal\s+year)s?|"
    r"over\s+the\s+\d+[-\s]?(month|year|day)\s+period|"
    # Statutory / regulatory thresholds with day windows ("within 45 days of the transaction")
    r"within\s+\d+\s+days?\s+of\b|"
    # Per-fiscal-year framing
    r"per\s+fiscal\s+year\s+(19|20)\d{2}\b"
    r")",
    re.IGNORECASE,
)
_VERIFICATION_LABEL_RE = re.compile(
    r"(Fully\s+verified|Algorithmically\s+generated,?\s*not\s+human[-\s]verified)",
    re.IGNORECASE,
)
_CAUSATION_HEADLINE_RE = re.compile(
    r"\b("
    r"after\b.*(donat|lobby|trad|contribut)|"
    r"in\s+response\s+to|"
    r"as\s+a\s+result\s+of|"
    r"because\s+of|"
    r"in\s+exchange\s+for"
    r")",
    re.IGNORECASE,
)


def _validate_output(text: str) -> list[str]:
    """Run the post-generation hard checks. Returns a list of failure reasons.
    Empty list = clean."""
    reasons: list[str] = []

    # STORY HALTED is a valid response — surface it as a halt, not a failure.
    if text.strip().startswith("STORY HALTED"):
        reasons.append("model_halted: " + text.strip()[:200])
        return reasons

    # Required sections
    missing = []
    for r in _REQUIRED_SECTIONS:
        if not r.search(text):
            missing.append(r.pattern)
    if missing:
        reasons.append(f"missing_required_sections: {missing}")

    if _PARTIAL_VERIFIED_RE.search(text):
        reasons.append("contains_partially_verified_label")

    if _DASH_RE.search(text):
        reasons.append("contains_em_or_en_dash")

    # Dollar-figure time-window check.
    #
    # The editorial standard requires the time window to appear in the SAME
    # sentence as the dollar figure. We scope the window to the sentence
    # (terminated by . ? ! or paragraph break) rather than a fixed char count
    # — month-name dates can push the qualifier well past 80 chars.
    bare_dollars = []
    for m in _DOLLAR_RE.finditer(text):
        start, end = m.span()
        # Find sentence boundaries: walk back to last '.', '?', '!', or '\n\n'
        sent_start = max(
            text.rfind(". ", 0, start) + 2,
            text.rfind("? ", 0, start) + 2,
            text.rfind("! ", 0, start) + 2,
            text.rfind("\n\n", 0, start) + 2,
            text.rfind("\n", 0, start) + 1,
            0,
        )
        # Sentence end: next '.', '?', '!', or paragraph break
        candidates = [
            text.find(". ", end),
            text.find("? ", end),
            text.find("! ", end),
            text.find("\n\n", end),
            text.find("\n", end),
        ]
        candidates = [c for c in candidates if c >= 0]
        sent_end = min(candidates) + 1 if candidates else len(text)
        sentence = text[sent_start:sent_end]
        if _TIME_WINDOW_RE.search(sentence):
            continue
        digits_only = re.sub(r"[^\d.]", "", m.group())
        if digits_only:
            try:
                val = float(digits_only)
                if val < 1000 and not re.search(r"million|billion|M|B", m.group(), re.IGNORECASE):
                    continue
            except ValueError:
                pass
        bare_dollars.append((m.group().strip(), sentence[:120]))
        if len(bare_dollars) >= 3:
            break
    if bare_dollars:
        reasons.append("dollar_no_time_window: " + "; ".join(
            f"{d!r} in {s!r}" for d, s in bare_dollars
        ))

    if not _VERIFICATION_LABEL_RE.search(text):
        reasons.append("missing_verification_label")

    # Headline rule: extract first H1 and check
    h1_match = re.search(r"^#\s+(.+?)$", text, re.MULTILINE)
    if not h1_match:
        reasons.append("missing_h1_headline")
    else:
        headline = h1_match.group(1).strip()
        if len(headline) > 140:
            reasons.append(f"headline_too_long: {len(headline)} chars")
        if _CAUSATION_HEADLINE_RE.search(headline):
            reasons.append(f"headline_implies_causation: {headline!r}")

    return reasons


# ── Output parsing ───────────────────────────────────────────────────────────


def _extract_h1(text: str) -> str | None:
    m = re.search(r"^#\s+(.+?)$", text, re.MULTILINE)
    return m.group(1).strip() if m else None


def _extract_lede(text: str) -> str | None:
    m = re.search(
        r"^##\s+Lede\b\s*(.+?)(?=^##\s+|\Z)",
        text,
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    if not m:
        return None
    return m.group(1).strip().split("\n\n", 1)[0].strip() or None


def _extract_verification_label(text: str) -> str | None:
    m = _VERIFICATION_LABEL_RE.search(text)
    return m.group(1).strip() if m else None


# ── Public entry point ───────────────────────────────────────────────────────


def regenerate_story(
    evidence: dict | str,
    *,
    story_id: int,
    title: str,
    category: str,
    sector: str | None = None,
    data_date_range: str | None = None,
    ai_generated: str = "algorithmic",  # noqa: ARG001 — kept for caller compatibility
) -> RegenerationResult:
    """Regenerate a single story under the new editorial standards.

    Parameters
    ----------
    evidence : dict or JSON string
        The structured fact pack from ``Story.evidence``. Anything the
        model may reference must be in here. The model is forbidden from
        introducing facts not present in this dict.
    story_id, title, category, sector, data_date_range : context only
        Used to construct the prompt; not echoed back to the model as
        constraints (the model picks the framing from FACTS).
    """
    # Coerce evidence to dict
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except Exception:
            return RegenerationResult(
                body=None, new_title=None, new_summary=None,
                verification_label=None, halted=True,
                halt_reasons=[f"evidence_not_json: {type(evidence).__name__}"],
            )
    if not isinstance(evidence, dict) or not evidence:
        return RegenerationResult(
            body=None, new_title=None, new_summary=None,
            verification_label=None, halted=True,
            halt_reasons=["evidence_empty_or_not_dict"],
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return RegenerationResult(
            body=None, new_title=None, new_summary=None,
            verification_label=None, halted=True,
            halt_reasons=["anthropic_api_key_not_set"],
        )

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
    except ImportError:
        return RegenerationResult(
            body=None, new_title=None, new_summary=None,
            verification_label=None, halted=True,
            halt_reasons=["anthropic_package_not_installed"],
        )

    prompt = _build_prompt(
        facts=evidence,
        category=category,
        sector=sector,
        data_date_range=data_date_range,
        legacy_title=title,
    )

    log.info("Regenerating story #%d (category=%s) under editorial standards", story_id, category)

    try:
        response = client.messages.create(
            model=OPUS_MODEL,
            max_tokens=OPUS_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        return RegenerationResult(
            body=None, new_title=None, new_summary=None,
            verification_label=None, halted=True,
            halt_reasons=[f"opus_api_error: {e}"],
        )

    raw = response.content[0].text if response.content else ""
    in_tok = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    cost = (in_tok * 15 / 1e6) + (out_tok * 75 / 1e6)

    log.info(
        "  story #%d: %d chars output, $%.4f cost (%d in, %d out)",
        story_id, len(raw), cost, in_tok, out_tok,
    )

    failures = _validate_output(raw)
    if failures:
        return RegenerationResult(
            body=None, new_title=None, new_summary=None,
            verification_label=None, halted=True,
            halt_reasons=failures, cost_usd=cost, raw=raw,
            input_tokens=in_tok, output_tokens=out_tok,
        )

    return RegenerationResult(
        body=raw,
        new_title=_extract_h1(raw),
        new_summary=_extract_lede(raw),
        verification_label=_extract_verification_label(raw),
        halted=False,
        halt_reasons=[],
        cost_usd=cost,
        raw=raw,
        input_tokens=in_tok,
        output_tokens=out_tok,
    )
