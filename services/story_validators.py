"""
Gate 3 — Post-Generation Story Validators

Runs a battery of deterministic checks on a generated story BEFORE it reaches
the fact-checker (Gate 4) or the human review queue (Gate 5).

Every rule here was derived from a real failure mode observed in the
April 2026 retraction audit (100 of 127 stories pulled). Each check is cheap
(pure Python, no DB) and returns a list of issues. A story with any CRITICAL
issue is auto-rejected; WARN issues go into the review-queue notes.

Usage:
    from services.story_validators import validate_draft
    ok, issues = validate_draft(story)
    if not ok:
        log.warning("rejected: %s", issues)
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

# ──────────────────────────────────────────────────────────────────────────
# Severity
# ──────────────────────────────────────────────────────────────────────────

CRITICAL = "critical"  # Auto-reject — never publishable
WARN = "warn"          # Review-queue only — human judgment required


@dataclass
class Issue:
    severity: str
    check: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] {self.check}: {self.detail}"


# ──────────────────────────────────────────────────────────────────────────
# Forbidden language — editorialising, loaded phrasing, dashes
# ──────────────────────────────────────────────────────────────────────────

# Phrases that sneak editorial framing into a "data journalism" piece.
# Derived from audited Opus output.
FORBIDDEN_PHRASES = [
    "raises eyebrows",
    "raises questions",
    "raise questions",
    "begs the question",
    "it remains to be seen",
    "shocking",
    "staggering",
    "eye-popping",
    "scandal",
    "corrupt",
    "kickback",
    "bribery",
    "pay-to-play",
    "bought off",
    "in the pocket",
    "greased palms",
    "smoking gun",
    "influence-peddling",
    "influence peddling",
    "efficiency strategy",          # Opus spun "contract-to-lobby ratio" this way
    "lobbying efficiency",
    "return on lobbying",           # "ROI on lobbying" is editorial framing
    "return on investment",          # editorial framing for govt data
    "return-on-lobbying",
    "suggests either",              # speculation hedge
    "one dollar for every",         # ratio spin
    "dollar-for-dollar return",
]

# Em dashes, en dashes, and ASCII double-dashes. User-enforced style rule.
DASH_CHARS = ["—", "–", "--"]

# Template/placeholder leaks — Opus occasionally leaves these.
TEMPLATE_MARKERS = [
    "{NARRATIVE_",
    "{{",
    "}}",
    "<placeholder",
    "TODO:",
    "TKTK",
    "[INSERT",
    "XXXX",
]


# ──────────────────────────────────────────────────────────────────────────
# Length bounds — derived from audit medians after rejecting short stubs
# ──────────────────────────────────────────────────────────────────────────

MIN_BODY_LEN = 800        # shorter than this and there's no real reporting
MAX_BODY_LEN = 12000      # longer than this and Opus has rambled
MIN_TITLE_LEN = 20
MAX_TITLE_LEN = 140
MIN_SUMMARY_LEN = 40
MAX_SUMMARY_LEN = 500


# ──────────────────────────────────────────────────────────────────────────
# Numeric sanity patterns
# ──────────────────────────────────────────────────────────────────────────

# "317,115,888.2 lobbying filings" — a dollar amount labelled as a count.
# Real filing counts are always small integers (< ~100k even for the biggest
# sectors across 6 years). If we see > 1M "filings" or a decimal, flag it.
FILING_COUNT_RE = re.compile(
    r"([\d,]+(?:\.\d+)?)\s+(?:lobbying\s+)?(?:filings?|disclosures?)",
    re.IGNORECASE,
)

# "1,151 registered foreign principals" vs "foreign agents" — different concepts.
# FARA tracks both separately; the detectors confused them in the audit.
FARA_AGENT_RE = re.compile(r"\bforeign\s+agents?\s+on\s+payroll\b", re.IGNORECASE)

# Contract-to-lobbying ratios of 1000+ to 1 are the spin phrase we retracted.
RATIO_RE = re.compile(r"\b(\d{3,}[\d,]*)[- ]to[- ]?1\b|\b1-to-(\d{3,}[\d,]*)\b", re.IGNORECASE)


# ──────────────────────────────────────────────────────────────────────────
# Time-window checks
# ──────────────────────────────────────────────────────────────────────────

# Anything labelled with a year beyond current year + 1 month is a fabrication.
# (The April 2026 audit caught stories about Boeing "2028" contracts.)
YEAR_RE = re.compile(r"\b(20\d{2})\b")

# Disclosure clause that every story must carry — this is the editorial policy.
# Each category type has its own disclaimer; we check for key fragments from any.
REQUIRED_DISCLAIMER_FRAGMENTS = [
    # Lobbying/contracts disclaimer
    "Lobbying is legal activity",
    # Trade disclaimer
    "Congressional stock trading is legal",
    # FARA disclaimer
    "Foreign agent registration under FARA",
    # PAC disclaimer
    "PAC donations are legal political contributions",
]


# ──────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────

def validate_draft(
    story,
    seen_dedupe_hashes: Optional[set] = None,
    now: Optional[datetime] = None,
) -> tuple[bool, List[Issue]]:
    """Run every deterministic check against a draft story.

    Args:
        story: a `models.stories_models.Story` instance (not yet committed).
        seen_dedupe_hashes: set of dedupe hashes already accepted in THIS run.
            Mutated in place when a story passes. Callers manage the set so
            one batch can't publish two near-identical stories.
        now: override for testing. Defaults to datetime.now(UTC).

    Returns:
        (ok, issues). `ok` is False iff any CRITICAL issue was raised.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    issues: List[Issue] = []
    body = (story.body or "")
    title = (story.title or "")
    summary = (story.summary or "")
    category = story.category or ""

    # 1. Template / placeholder leak (CRITICAL)
    for marker in TEMPLATE_MARKERS:
        if marker in body or marker in title or marker in summary:
            issues.append(Issue(CRITICAL, "template_leak",
                                f"found unreplaced marker '{marker}'"))

    # 1b. HTML comments (CRITICAL — the frontend renders them as visible text,
    # so metadata blocks like '<!-- Generated: ... -->' leak into stories.)
    if "<!--" in body or "<!--" in title or "<!--" in summary:
        issues.append(Issue(CRITICAL, "html_comment",
                            "HTML comments are not allowed in stories"))

    # 2. Dashes (CRITICAL — enforced style rule)
    # Exempt from the dash check: markdown table separators like
    # "|------|------|". HTML comments are already rejected above, so we no
    # longer need to special-case them here.
    body_lines_for_dash = [
        ln for ln in body.split("\n")
        if not _is_table_separator_line(ln)
    ]
    body_no_tables = "\n".join(body_lines_for_dash)
    for dash in DASH_CHARS:
        if dash in body_no_tables:
            issues.append(Issue(CRITICAL, "dash_char",
                                f"found '{dash}' in body prose, use commas/periods"))
            break  # one is enough to reject
    for dash in DASH_CHARS:
        if dash in title:
            issues.append(Issue(CRITICAL, "dash_char",
                                f"found '{dash}' in title"))
            break

    # 3. Forbidden phrases (CRITICAL — editorialising)
    body_lower = body.lower()
    title_lower = title.lower()
    for phrase in FORBIDDEN_PHRASES:
        if phrase in body_lower or phrase in title_lower:
            issues.append(Issue(CRITICAL, "forbidden_phrase",
                                f"'{phrase}' is editorial language"))

    # 4. Length bounds
    if len(body) < MIN_BODY_LEN:
        issues.append(Issue(CRITICAL, "body_too_short",
                            f"{len(body)} chars < {MIN_BODY_LEN} min"))
    if len(body) > MAX_BODY_LEN:
        issues.append(Issue(WARN, "body_too_long",
                            f"{len(body)} chars > {MAX_BODY_LEN} suggested max"))
    if len(title) < MIN_TITLE_LEN or len(title) > MAX_TITLE_LEN:
        issues.append(Issue(CRITICAL, "title_length",
                            f"{len(title)} chars not in [{MIN_TITLE_LEN},{MAX_TITLE_LEN}]"))
    if summary and (len(summary) < MIN_SUMMARY_LEN or len(summary) > MAX_SUMMARY_LEN):
        issues.append(Issue(WARN, "summary_length",
                            f"{len(summary)} chars not in [{MIN_SUMMARY_LEN},{MAX_SUMMARY_LEN}]"))

    # 5. Entity existence — detector MUST have attached at least one entity
    entity_ids = story.entity_ids if isinstance(story.entity_ids, list) else []
    if not entity_ids and category not in {"tax_lobbying", "budget_influence"}:
        issues.append(Issue(CRITICAL, "no_entity_ids",
                            "story has no entity_ids and is not a sector-wide piece"))

    # 6. Data sources must be cited
    sources = story.data_sources if isinstance(story.data_sources, list) else []
    if not sources:
        issues.append(Issue(CRITICAL, "no_data_sources",
                            "data_sources list is empty"))
    if "Data Sources" not in body and "Data:" not in body:
        issues.append(Issue(WARN, "no_data_sources_section",
                            "body lacks a 'Data Sources' or 'Data:' section"))

    # 7. Filing count sanity — "317 million filings" is a hallucination
    for match in FILING_COUNT_RE.finditer(body):
        raw = match.group(1)
        try:
            n = float(raw.replace(",", ""))
        except ValueError:
            continue
        if n >= 1_000_000 or ("." in raw and n >= 1000):
            issues.append(Issue(CRITICAL, "impossible_filing_count",
                                f"claimed {raw} filings is implausible"))

    # 8. FARA language confusion — the retraction hot spot
    if FARA_AGENT_RE.search(body) or FARA_AGENT_RE.search(title):
        issues.append(Issue(CRITICAL, "fara_language",
                            "use 'registered foreign principals', not 'foreign agents on payroll'"))

    # 9. Contract-to-lobbying ratio spin
    for match in RATIO_RE.finditer(body):
        ratio = match.group(1) or match.group(2) or ""
        issues.append(Issue(WARN, "ratio_spin",
                            f"large ratio '{ratio}-to-1' is framed as efficiency; verify"))

    # 10. Future dates — nothing beyond (now + 30 days) should be asserted
    current_year = now.year
    for match in YEAR_RE.finditer(body):
        year = int(match.group(1))
        if year > current_year + 1:  # loose: allow "next year" references
            issues.append(Issue(CRITICAL, "future_date",
                                f"body references year {year} > {current_year}"))
            break

    # 11. Required disclaimer — every story must carry a category-appropriate disclaimer
    have_any = any(frag in body for frag in REQUIRED_DISCLAIMER_FRAGMENTS)
    if not have_any:
        issues.append(Issue(CRITICAL, "missing_disclaimer",
                            "story must carry a category-appropriate disclaimer"))

    # 12. Dedupe hash — refuse to publish two near-identical stories in one run
    dedupe_hash = story_dedupe_hash(story)
    if seen_dedupe_hashes is not None:
        if dedupe_hash in seen_dedupe_hashes:
            issues.append(Issue(CRITICAL, "intra_batch_dupe",
                                f"dedupe hash {dedupe_hash} already accepted this run"))
        else:
            # caller sets this only if validate passes — see wire-up in detect_stories.py
            pass

    # 13. Internal consistency — title and body must agree on the lead number
    title_money = _first_money(title)
    body_money = _first_money(body)
    if title_money and body_money and title_money != body_money:
        # OK if the title's amount appears ANYWHERE in body
        if title_money not in body:
            issues.append(Issue(WARN, "title_body_money_mismatch",
                                f"title says '{title_money}' but body leads with '{body_money}'"))

    # 14. Placeholder-y phrasing that survived earlier cleanups
    for p in ["Read the full investigation:", "Data: ,", "|  |"]:
        if p in body:
            issues.append(Issue(WARN, "suspicious_text",
                                f"body contains '{p}' — likely a template artifact"))

    # 15. The body must actually name the entity
    if entity_ids and not _body_mentions_any(body, story):
        issues.append(Issue(WARN, "entity_not_named",
                            "body does not mention any entity's display name"))

    # 16. Date range fabrication — "between YEAR and YEAR" must be plausible
    evidence = story.evidence if isinstance(story.evidence, dict) else {}
    date_range_matches = _DATE_RANGE_RE.findall(body)
    for start_yr, end_yr in date_range_matches:
        s_yr, e_yr = int(start_yr), int(end_yr)
        if e_yr < s_yr:
            issues.append(Issue(CRITICAL, "date_range_inverted",
                                f"date range {s_yr}-{e_yr} is inverted"))
        elif e_yr - s_yr > 10:
            issues.append(Issue(WARN, "date_range_wide",
                                f"date range {s_yr}-{e_yr} spans > 10 years"))

    # 17. Frequency claim sanity — "N per day/month" should be mathematically sound
    for match in _FREQUENCY_RE.finditer(body):
        freq_num = float(match.group(1))
        freq_unit = match.group(2).lower()
        # If evidence has a trade_count, check the math
        trade_count = evidence.get("trade_count")
        if trade_count and isinstance(trade_count, (int, float)):
            if "day" in freq_unit and freq_num > trade_count:
                issues.append(Issue(CRITICAL, "impossible_frequency",
                                    f"claims {freq_num}/day but only {trade_count} total trades"))
            elif "month" in freq_unit and freq_num * 2 > trade_count:
                issues.append(Issue(WARN, "suspicious_frequency",
                                    f"claims {freq_num}/month but only {trade_count} total trades"))

    # 18. Enforcement agency attribution — flag specific agency names not in evidence
    evidence_text = str(evidence)
    for agency, pattern in _ENFORCEMENT_AGENCIES:
        if pattern.search(body) and agency.lower() not in evidence_text.lower():
            issues.append(Issue(WARN, "unverified_agency",
                                f"body names '{agency}' but evidence does not mention it"))

    # ──────────────────────────────────────────────────────────────────
    # Verdict
    # ──────────────────────────────────────────────────────────────────
    ok = not any(i.severity == CRITICAL for i in issues)
    if ok and seen_dedupe_hashes is not None:
        seen_dedupe_hashes.add(dedupe_hash)
    return ok, issues


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────

_MONEY_RE = re.compile(r"\$[\d,]+(?:\.\d+)?[KMB]?")
_TABLE_SEPARATOR_RE = re.compile(r"^[\s\|\-:]+$")

# Date range pattern: "between 2021 and 2024" or "from 2020 to 2025"
_DATE_RANGE_RE = re.compile(
    r"(?:between|from)\s+(20\d{2})\s+(?:and|to)\s+(20\d{2})",
    re.IGNORECASE,
)

# Frequency claims: "6 per day", "12 transactions per month", "approximately six per trading day"
_FREQUENCY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s+(?:transactions?\s+)?per\s+(trading\s+day|day|month|week|year)",
    re.IGNORECASE,
)

# Enforcement agencies that should only appear if backed by evidence
_ENFORCEMENT_AGENCIES = [
    ("FTC", re.compile(r"\bFTC\b|Federal Trade Commission", re.IGNORECASE)),
    ("SEC", re.compile(r"\bSEC\b|Securities and Exchange Commission", re.IGNORECASE)),
    ("EPA", re.compile(r"\bEPA\b|Environmental Protection Agency", re.IGNORECASE)),
    ("OSHA", re.compile(r"\bOSHA\b|Occupational Safety", re.IGNORECASE)),
    ("CFPB", re.compile(r"\bCFPB\b|Consumer Financial Protection", re.IGNORECASE)),
]


def _is_table_separator_line(line: str) -> bool:
    """A markdown table separator like '|------|------|' or '|---|:---:|---|'."""
    if not line.strip():
        return False
    if "-" not in line:
        return False
    return bool(_TABLE_SEPARATOR_RE.match(line))


def _first_money(text: str) -> Optional[str]:
    m = _MONEY_RE.search(text or "")
    return m.group(0) if m else None


def _body_mentions_any(body: str, story) -> bool:
    """Heuristic: does the body mention at least one entity name?

    Entity IDs are slugs like "boeing-company" — we can't cheaply resolve to
    display_name from here, so we fall back to slug words.
    """
    entity_ids = story.entity_ids if isinstance(story.entity_ids, list) else []
    for eid in entity_ids:
        if not eid or not isinstance(eid, str):
            continue
        # turn "boeing-company" into "boeing"
        token = eid.split("-", 1)[0]
        if len(token) >= 4 and token.lower() in body.lower():
            return True
    # Fall back: title has the entity, body should share >= 2 title words
    title_words = [w for w in (story.title or "").lower().split() if len(w) >= 5]
    hits = sum(1 for w in title_words if w in body.lower())
    return hits >= 2


def story_dedupe_hash(story) -> str:
    """Compute a stable hash for near-duplicate detection.

    Uses (category, sorted entity_ids, rounded primary-number bucket) so that
    two stories about the same company/category within a data-refresh window
    hash to the same value even if cents jiggle.
    """
    category = story.category or ""
    entity_ids = sorted(eid for eid in (story.entity_ids or []) if isinstance(eid, str))
    # Round evidence numbers to nearest 10% bucket so "$10.8M" and "$10.7M"
    # produce identical hashes.
    evidence = story.evidence if isinstance(story.evidence, dict) else {}
    buckets = []
    for k in sorted(evidence.keys()):
        v = evidence[k]
        if isinstance(v, (int, float)) and v:
            av = abs(v)
            if av > 0:
                exp = int(math.floor(math.log10(av)))
                sig = round(av / (10 ** exp), 1)
                sign = "-" if v < 0 else ""
                buckets.append(f"{k}={sign}{sig}e{exp}")
        elif isinstance(v, str):
            buckets.append(f"{k}={v[:40]}")
    payload = f"{category}|{','.join(entity_ids)}|{'|'.join(buckets)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def format_issues(issues: List[Issue]) -> str:
    """Render an issues list as a single-line string for logs."""
    if not issues:
        return "clean"
    return " / ".join(str(i) for i in issues)
