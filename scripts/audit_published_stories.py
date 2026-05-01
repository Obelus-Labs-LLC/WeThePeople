#!/usr/bin/env python3
"""
Audit published stories against the editorial standards in
research/EDITORIAL_STANDARDS.md (Part 3 - Regression Audit).

Reads:
    .planning/published_stories.json    # dumped from Hetzner

Writes:
    .planning/STORY_AUDIT_REPORT.md     # human-readable triage report
    .planning/STORY_AUDIT_REPORT.json   # structured per-story findings

Exits 0 always; the report is the output. Story status changes are NOT
made automatically. The user reviews the report and approves any
status transition (archive / retract / republish) explicitly.

Failure-mode catalog (per Part 3 of the standards):
  HIGH      = factual error, defamation risk, numerical inaccuracy
  MEDIUM    = framing issue, methodology weakness, missing required section
  LOW       = style or padding issue

Triage decision matrix:
  any HIGH severity                                         -> UNPUBLISH PERMANENTLY
    (exception: partially_verified alone -> REVISE AND REPUBLISH if no other HIGH)
  any MEDIUM, no HIGH                                       -> REVISE AND REPUBLISH
  only LOW                                                  -> HALT AND REVIEW
                                                              (we don't auto-pass anything;
                                                               human signs off after fixes)
  no findings                                               -> HALT AND REVIEW
                                                              (still requires human read
                                                               under new editorial standard)

Note: "REPUBLISH AS-IS" is intentionally NOT a possible automated decision.
The master prompt requires a human-reviewer signoff (Part 4 step 5) before
any story comes back online.
"""

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = ROOT / ".planning" / "published_stories.json"
REPORT_MD = ROOT / ".planning" / "STORY_AUDIT_REPORT.md"
REPORT_JSON = ROOT / ".planning" / "STORY_AUDIT_REPORT.json"

# ── Failure mode definitions ────────────────────────────────────────────────


# Categories that require specific evidence in the body. If the category is
# assigned but the evidence pattern is missing, that's category-first framing.
#
# The master prompt explicitly names category-first framing as systemic across
# the story pipeline (the "etc." after the two named examples). Every category
# below requires verifiable evidence; missing evidence is a HIGH-severity
# finding because the category label itself becomes a factual claim that
# the body fails to support.
CATEGORY_EVIDENCE_REQUIREMENTS = {
    "revolving_door": [
        # Must name personnel movement from agency to firm/lobby
        re.compile(r"\b(former|formerly|previously)\b.*\b(at|with|of|for|director|secretary|commissioner|administrator|staff|aide|chief)\b", re.IGNORECASE),
        re.compile(r"\b(joined|hired|recruited|moved\s+to|now\s+(works|lobbying|with|at))\b", re.IGNORECASE),
    ],
    "stock_act_violation": [
        # Must mention the actual disclosure timing rule
        re.compile(r"\bSTOCK\s*Act\b", re.IGNORECASE),
        re.compile(r"\b(45[-\s]day|30[-\s]day|disclosure\s+(window|deadline)|periodic\s+transaction\s+report|PTR|late\s+(filing|disclosure))\b", re.IGNORECASE),
    ],
    "trade_timing": [
        # Must connect a trade date to a specific policy event
        re.compile(r"\b(days?|weeks?|months?)\s+(before|after|prior\s+to|following|ahead\s+of)\b", re.IGNORECASE),
        re.compile(r"\b(vote|hearing|markup|meeting|announcement|introduction|passage|signing|earnings|filing|deal)\b", re.IGNORECASE),
    ],
    "trade_cluster": [
        # Must show multiple trades in one entity / ticker / window
        re.compile(r"\b(\d+|several|multiple|cluster\s+of)\s+(trades|transactions|disclosures|sales|purchases|buys)\b", re.IGNORECASE),
        re.compile(r"\b(same|single|one)\s+(ticker|stock|company|security)\b|\b\$[A-Z]{1,5}\b", re.IGNORECASE),
    ],
    "prolific_trader": [
        # Must compare trade count/volume to a baseline
        re.compile(r"\b(more\s+than|over|above|exceeds?|compared\s+to|versus|vs\.?|baseline|average|median|typical|peer)\b", re.IGNORECASE),
        re.compile(r"\b(\d+|hundreds?\s+of|dozens?\s+of)\s+(trades|transactions)\b", re.IGNORECASE),
    ],
    "committee_stock_trade": [
        # Must name a committee AND a stock the committee oversees
        re.compile(r"\b(committee\s+on|house\s+committee|senate\s+committee|appropriations|armed\s+services|energy|finance|judiciary|intelligence|banking|agriculture|foreign\s+(relations|affairs)|ways\s+and\s+means|oversight|rules|budget|veterans)\b", re.IGNORECASE),
        re.compile(r"\b(stock|shares|equity|holdings|position)\b", re.IGNORECASE),
        re.compile(r"\b(jurisdiction|oversees|regulates|oversight\s+of)\b", re.IGNORECASE),
    ],
    "lobbying_spike": [
        # Must show a year-over-year comparison or baseline
        re.compile(r"\b(up|increased?|rose|grew|jumped|surge|spike|doubled|tripled|\d+x|\d+%\s+(more|higher|increase))\b", re.IGNORECASE),
        re.compile(r"\b(compared\s+to|versus|vs\.?|prior\s+year|previous\s+year|year[-\s]over[-\s]year|in\s+(19|20)\d{2}\s+vs|(19|20)\d{2}.{0,40}(19|20)\d{2})\b", re.IGNORECASE),
    ],
    "contract_windfall": [
        # Must connect a specific contract award to lobbying activity
        re.compile(r"\b(contract|award|agreement|task\s+order|IDIQ|BPA)\b", re.IGNORECASE),
        re.compile(r"\b(after|following|while|during|coincid|same\s+(year|quarter|month))\b", re.IGNORECASE),
        re.compile(r"\b(lobbying|lobbied|registered\s+lobbyist|LDA|Senate\s+filing)\b", re.IGNORECASE),
    ],
    "penalty_contract_ratio": [
        # Must show both a penalty figure AND contract figure
        re.compile(r"\b(penalt(y|ies)|fine|settlement|enforcement|consent\s+decree)\b", re.IGNORECASE),
        re.compile(r"\b(contract|award|federal\s+(spending|payments?))\b", re.IGNORECASE),
        re.compile(r"\b(ratio|per\s+\$|for\s+every|cents\s+on\s+the\s+dollar)\b", re.IGNORECASE),
    ],
    "enforcement_immunity": [
        re.compile(r"\b(zero|no|none|never)\s+(penalt(y|ies)|enforcement|fines|actions)\b", re.IGNORECASE),
        re.compile(r"\b(despite|even\s+(after|though|while)|while\s+receiving)\b", re.IGNORECASE),
    ],
    "enforcement_disappearance": [
        re.compile(r"\b(dropped|dismissed|withdrew|withdrawn|abandoned|closed)\b", re.IGNORECASE),
        re.compile(r"\b(case|investigation|enforcement|complaint|suit|action)\b", re.IGNORECASE),
    ],
    "tax_lobbying": [
        # Must reference a specific tax provision
        re.compile(r"\btax\b", re.IGNORECASE),
        re.compile(r"\b(IRS|Internal\s+Revenue\s+Code|section\s+\d+|deduction|credit|loophole|exemption|TCJA|SALT|carried\s+interest|R&D\s+credit)\b", re.IGNORECASE),
    ],
    "budget_influence": [
        re.compile(r"\b(budget|appropriations?|spending\s+bill|continuing\s+resolution|CR\b|line\s+item|earmark)\b", re.IGNORECASE),
        re.compile(r"\b(committee|jurisdiction|fiscal\s+year|FY\s*\d{4})\b", re.IGNORECASE),
    ],
    "bipartisan_buying": [
        # Must name donations to BOTH parties at meaningful scale
        re.compile(r"\b(both|bipartisan|across\s+the\s+aisle|democratic\s+and\s+republican|republican\s+and\s+democratic)\b", re.IGNORECASE),
        re.compile(r"\b(donat|contribut|PAC|gave|received)", re.IGNORECASE),
    ],
    "cross_sector": [
        # Must name multiple sectors with linked entities
        re.compile(r"\b(across|spans?|multiple|both|several)\s+(sectors?|industries|categories)\b", re.IGNORECASE),
    ],
    "foreign_lobbying": [
        re.compile(r"\bFARA\b|\bforeign\s+(principal|agent|government|state|entity)\b", re.IGNORECASE),
        re.compile(r"\b(registered|filed|disclosed|representation)\b", re.IGNORECASE),
    ],
    "fara_concentration": [
        re.compile(r"\bFARA\b|\bforeign\s+principal", re.IGNORECASE),
        re.compile(r"\b(\d+|several|multiple)\s+(principals|clients|countries|governments)\b", re.IGNORECASE),
    ],
    "lobbying_breakdown": [
        # Must show issue-level breakdown
        re.compile(r"\b(issue|topic|subject|policy\s+area)\b", re.IGNORECASE),
        re.compile(r"\b(\d+%|breakdown|split|distribution|allocation)\b", re.IGNORECASE),
    ],
    "pac_donation_pattern": [
        re.compile(r"\bPAC\b", re.IGNORECASE),
        re.compile(r"\b(pattern|cluster|concentrated|disproportionate|skew|preference)\b", re.IGNORECASE),
    ],
}

# Causal-language phrases that the standard says require explicit verified-fact
# scaffolding. Flag if used.
SUSPECT_CAUSAL_PHRASES = [
    r"\boften\s+signals?\b",
    r"\btypically\s+suggests?\b",
    r"\blikely\s+indicates?\b",
    r"\bmay\s+indicate\b",
    r"\bcould\s+suggest\b",
    r"\bappears?\s+to\s+suggest\b",
    r"\bhints?\s+at\b",
    r"\bpoints?\s+to\b",
    r"\bsuggests?\s+either\b",
]
SUSPECT_CAUSAL_RE = re.compile("|".join(SUSPECT_CAUSAL_PHRASES), re.IGNORECASE)

# Phrases that imply causation in headlines. Flag if found in title.
HEADLINE_CAUSAL_PHRASES = [
    r"\bafter\b",            # "X happened after Y" implies Y caused X
    r"\bin response to\b",
    r"\bas a result of\b",
    r"\bbecause of\b",
    r"\bin exchange for\b",
    r"\bfollowing\b.*\b(donation|contribution|lobbying|trade)\b",
]
HEADLINE_CAUSAL_RE = re.compile("|".join(HEADLINE_CAUSAL_PHRASES), re.IGNORECASE)

# Vague intensifiers banned in headlines per the standard.
HEADLINE_INTENSIFIERS_RE = re.compile(
    r"\b(massive|stunning|shocking|staggering|huge|explosive|bombshell|scandal|corrupt|kickback)\b",
    re.IGNORECASE,
)

# Dollar-figure detector. We then check if a year/period qualifier is nearby.
DOLLAR_RE = re.compile(
    r"\$[\d,]+(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b",
    re.IGNORECASE,
)
# Time window qualifiers: any of these within 80 chars of a dollar figure satisfies
# the "explicit time window" requirement.
TIME_WINDOW_RE = re.compile(
    r"\b("
    r"in\s+(19|20)\d{2}|"
    r"between\s+(19|20)\d{2}\s+and\s+(19|20)\d{2}|"
    r"from\s+(19|20)\d{2}\s+(to|through)\s+(19|20)\d{2}|"
    r"in\s+fiscal\s+year\s+(19|20)\d{2}|"
    r"during\s+(19|20)\d{2}|"
    r"(19|20)\d{2}[-–—](19|20)?\d{2}|"
    r"as\s+of\s+(19|20)\d{2}|"
    r"over\s+the\s+past\s+\d+\s+(year|month|quarter|fiscal\s+year)|"
    r"the\s+(19|20)\d{2}[-–—](19|20)?\d{2}"
    r")\b",
    re.IGNORECASE,
)

# Section detection: "What the Data Doesn't Show" or close variants.
DATA_LIMITS_SECTION_RE = re.compile(
    r"(what\s+the\s+data\s+(does\s*n['’]?t|doesn['’]?t)\s+show"
    r"|data\s+limitations"
    r"|limits?\s+of\s+(this|the)\s+(data|dataset|analysis)"
    r"|caveat"
    r"|what\s+this\s+(does\s*n['’]?t|doesn['’]?t)\s+(show|prove|tell\s+us))",
    re.IGNORECASE,
)

# Source URL detector + authoritative domain check
URL_RE = re.compile(r"https?://[^\s\)\]\"'<>]+", re.IGNORECASE)
AUTHORITATIVE_HOSTS = {
    ".gov", "sec.gov", "congress.gov", "fec.gov", "epa.gov", "fda.gov",
    "ftc.gov", "doj.gov", "irs.gov", "cms.gov", "treasury.gov",
    "federalregister.gov", "usaspending.gov", "lda.senate.gov",
    "soprweb.senate.gov", "disclosurespreview.house.gov",
    "house.gov", "senate.gov", "fiscal.treasury.gov", "data.gov",
    "opensecrets.org",  # secondary — OpenSecrets is widely accepted
    "efts.sec.gov", "efile.fara.gov",
}

# Text length floors per editorial standard (Part 2).
HEADLINE_MAX_CHARS = 140


# ── Helper: per-story checks ────────────────────────────────────────────────


def _is_authoritative(url: str) -> bool:
    url_lower = url.lower()
    for host in AUTHORITATIVE_HOSTS:
        if host in url_lower:
            return True
    return False


def _check_verification_tier(story, findings):
    tier = (story.get("verification_tier") or "").lower()
    if tier in ("partially_verified", "partially-verified", "partial"):
        findings.append({
            "code": "PARTIALLY_VERIFIED_LABEL",
            "severity": "HIGH",
            "detail": f"verification_tier='{tier}' — Part 2 of the standard "
                      "rejects this label outright. Must be either Fully Verified or unpublished.",
        })
    elif tier in ("unverified", "none", ""):
        findings.append({
            "code": "UNVERIFIED_LABEL",
            "severity": "HIGH",
            "detail": f"verification_tier='{tier or '(empty)'}' but story is published. "
                      "An unverified story must not be public.",
        })


def _check_category_first_framing(story, findings):
    """Two checks:

    1. Universal: every story carries a CATEGORY_FIRST_RISK MEDIUM finding,
       because the pipeline that produced all of them is known to pick a
       frame and write toward it. A human must verify the data establishes
       the category before any story republishes.

    2. Specific: if the category has known evidence requirements and the
       body fails to match them, that's a HIGH finding (the body itself
       does not even superficially support the framing).
    """
    category = (story.get("category") or "").lower()
    body = (story.get("body") or "")

    # Universal flag — applies to ALL stories regardless of category.
    findings.append({
        "code": "CATEGORY_FIRST_RISK",
        "severity": "MEDIUM",
        "detail": (
            f"category='{category}'. The story-generation pipeline is known to "
            "pick a category up front and write toward it. Per Part 2 of the "
            "standard, a human must verify the underlying data actually "
            "establishes this category (anomaly vs baseline, closed-loop "
            "evidence, or named/dated event) before this story republishes. "
            "Pattern-presence in the body is necessary but not sufficient."
        ),
    })

    requirements = CATEGORY_EVIDENCE_REQUIREMENTS.get(category)
    if not requirements:
        # Unknown category — also a HIGH risk because we have no evidence
        # check at all for it.
        findings.append({
            "code": "CATEGORY_FIRST_FRAMING",
            "severity": "HIGH",
            "detail": (
                f"category='{category}' is not in the evidence-requirement "
                "catalog. We cannot even pattern-match for category-supporting "
                "evidence, so the framing is unverifiable from the body alone."
            ),
        })
        return

    matches = sum(1 for r in requirements if r.search(body))
    if matches < len(requirements):
        findings.append({
            "code": "CATEGORY_FIRST_FRAMING",
            "severity": "HIGH",
            "detail": (
                f"category='{category}' but body is missing required evidence "
                f"patterns ({matches}/{len(requirements)} matched). The standard "
                f"forbids assigning a category before the data establishes it. "
                f"Either the framing is wrong or the body fails to surface the "
                f"evidence supporting it."
            ),
        })


def _check_dollar_time_window(story, findings):
    body = story.get("body") or ""
    summary = story.get("summary") or ""
    title = story.get("title") or ""
    text = "\n".join([title, summary, body])

    bare_dollars = []
    for m in DOLLAR_RE.finditer(text):
        start, end = m.span()
        # Look 80 chars left and 80 right for a time-window qualifier.
        window = text[max(0, start - 80):min(len(text), end + 80)]
        if TIME_WINDOW_RE.search(window):
            continue
        # Exclude bare dollar amounts under $1k that are likely incidental.
        digits_only = re.sub(r"[^\d.]", "", m.group())
        if digits_only:
            try:
                val = float(digits_only)
                # Skip tiny amounts (likely a stock price or fee mention)
                if val < 1000 and "M" not in m.group().upper() and "B" not in m.group().upper() and "billion" not in m.group().lower() and "million" not in m.group().lower():
                    continue
            except ValueError:
                pass
        bare_dollars.append(m.group().strip())
        if len(bare_dollars) >= 3:
            break

    if bare_dollars:
        findings.append({
            "code": "DOLLAR_NO_TIME_WINDOW",
            "severity": "HIGH",
            "detail": f"{len(bare_dollars)}+ dollar figures without a time window in the same sentence: "
                      + ", ".join(repr(d) for d in bare_dollars[:3]),
        })


def _check_data_limits_section(story, findings):
    body = story.get("body") or ""
    if not DATA_LIMITS_SECTION_RE.search(body):
        findings.append({
            "code": "MISSING_DATA_LIMITS_SECTION",
            "severity": "MEDIUM",
            "detail": "No 'What the Data Doesn't Show' / data-limits section found. "
                      "Part 2 of the standard makes this section mandatory.",
        })


def _check_causal_language(story, findings):
    body = story.get("body") or ""
    matches = SUSPECT_CAUSAL_RE.findall(body)
    if matches:
        findings.append({
            "code": "UNSUPPORTED_CAUSAL_LANGUAGE",
            "severity": "MEDIUM",
            "detail": f"{len(matches)} suspect causal phrase(s): "
                      + ", ".join(repr(m) for m in matches[:5]),
        })


def _check_headline(story, findings):
    title = story.get("title") or ""
    if len(title) > HEADLINE_MAX_CHARS:
        findings.append({
            "code": "HEADLINE_TOO_LONG",
            "severity": "LOW",
            "detail": f"{len(title)} chars (max {HEADLINE_MAX_CHARS}).",
        })
    if HEADLINE_CAUSAL_RE.search(title):
        m = HEADLINE_CAUSAL_RE.search(title)
        findings.append({
            "code": "HEADLINE_IMPLIES_CAUSATION",
            "severity": "MEDIUM",
            "detail": f"Headline contains causation-implying phrase: '{m.group()}'. "
                      "Part 2 forbids this when data shows only correlation.",
        })
    if HEADLINE_INTENSIFIERS_RE.search(title):
        m = HEADLINE_INTENSIFIERS_RE.search(title)
        findings.append({
            "code": "HEADLINE_INTENSIFIER",
            "severity": "LOW",
            "detail": f"Headline uses banned intensifier: '{m.group()}'.",
        })


def _check_entity_attestation(story, findings):
    body = (story.get("body") or "").lower()
    entity_ids = story.get("entity_ids")
    if isinstance(entity_ids, str):
        try:
            entity_ids = json.loads(entity_ids)
        except Exception:
            entity_ids = None
    if not entity_ids or not isinstance(entity_ids, (list, dict)):
        return
    # entity_ids might be {"politicians": [...], "companies": [...]} or a flat list.
    flat_count = 0
    if isinstance(entity_ids, dict):
        for v in entity_ids.values():
            if isinstance(v, list):
                flat_count += len(v)
    else:
        flat_count = len(entity_ids)

    # We can't resolve IDs to names cheaply offline. Heuristic: if entity_ids
    # contains MANY entities (e.g. >5) it's plausible some were inferred from
    # sector classification. Flag for human review.
    if flat_count > 8:
        findings.append({
            "code": "ENTITY_LIST_LARGE",
            "severity": "MEDIUM",
            "detail": f"{flat_count} entity references attached. Standard requires every entity "
                      "to be primary-source attested in the body. Human must verify each.",
        })


def _check_source_link_quality(story, findings):
    body = story.get("body") or ""
    urls = URL_RE.findall(body)
    if not urls:
        findings.append({
            "code": "NO_SOURCE_URLS",
            "severity": "MEDIUM",
            "detail": "No source URLs found in body. Standard requires every claim to link "
                      "to a primary source.",
        })
        return
    non_authoritative = [u for u in urls if not _is_authoritative(u)]
    if non_authoritative:
        findings.append({
            "code": "NON_AUTHORITATIVE_SOURCE_LINKS",
            "severity": "MEDIUM",
            "detail": f"{len(non_authoritative)} of {len(urls)} URLs are not on authoritative "
                      f"government / open-data domains. First few: "
                      + ", ".join(non_authoritative[:3]),
        })


def _check_padding(story, findings):
    body = story.get("body") or ""
    # Crude padding heuristic: same 6+ word phrase repeats in the body.
    # Tokenize lightly and slide a 6-gram window.
    words = re.findall(r"[a-z]+", body.lower())
    if len(words) < 50:
        return
    six_grams = set()
    repeats = []
    for i in range(len(words) - 5):
        gram = tuple(words[i:i+6])
        if gram in six_grams:
            repeats.append(" ".join(gram))
            if len(repeats) > 4:
                break
        else:
            six_grams.add(gram)
    if repeats:
        findings.append({
            "code": "REPETITION",
            "severity": "LOW",
            "detail": f"Repeated phrase(s) detected: " + " | ".join(repr(r) for r in repeats[:3]),
        })


def _check_data_date_range_currency(story, findings):
    rng = story.get("data_date_range") or ""
    if not rng:
        findings.append({
            "code": "NO_DATA_DATE_RANGE",
            "severity": "MEDIUM",
            "detail": "Story has no data_date_range field. Standard requires explicit "
                      "date range disclosure.",
        })
        return
    # Pull the latest year mentioned in data_date_range
    years = [int(y) for y in re.findall(r"(19|20)\d{2}", rng)]
    if years:
        latest = max(years)
        # If body uses present-tense framing while data is >=2 years old, flag.
        body = story.get("body") or ""
        if latest <= 2024 and re.search(r"\b(currently|today|recent|recently|the past year)\b", body, re.IGNORECASE):
            findings.append({
                "code": "STALE_DATA_PRESENTED_AS_CURRENT",
                "severity": "MEDIUM",
                "detail": f"data_date_range='{rng}' ends in {latest} but body uses 'currently/recent/today' framing.",
            })


# ── Triage ──────────────────────────────────────────────────────────────────


def _triage(findings):
    severities = [f["severity"] for f in findings]
    has_high = "HIGH" in severities
    has_medium = "MEDIUM" in severities
    only_partial_verified_high = (
        has_high
        and all(
            f["severity"] != "HIGH" or f["code"] == "PARTIALLY_VERIFIED_LABEL"
            for f in findings
        )
    )

    # Defamation-risk flag: entity attestation issues alongside HIGH category-first
    if any(f["code"] == "CATEGORY_FIRST_FRAMING" and f["severity"] == "HIGH" for f in findings):
        if any(f["code"] == "ENTITY_LIST_LARGE" for f in findings):
            return "UNPUBLISH PERMANENTLY"

    if has_high:
        if only_partial_verified_high:
            return "REVISE AND REPUBLISH"
        return "UNPUBLISH PERMANENTLY"
    if has_medium:
        return "REVISE AND REPUBLISH"
    return "HALT AND REVIEW"


# ── Driver ──────────────────────────────────────────────────────────────────


def audit_story(story):
    findings = []
    _check_verification_tier(story, findings)
    _check_category_first_framing(story, findings)
    _check_dollar_time_window(story, findings)
    _check_data_limits_section(story, findings)
    _check_causal_language(story, findings)
    _check_headline(story, findings)
    _check_entity_attestation(story, findings)
    _check_source_link_quality(story, findings)
    _check_padding(story, findings)
    _check_data_date_range_currency(story, findings)
    decision = _triage(findings)
    return {
        "id": story.get("id"),
        "slug": story.get("slug"),
        "title": story.get("title"),
        "category": story.get("category"),
        "sector": story.get("sector"),
        "verification_tier": story.get("verification_tier"),
        "ai_generated": story.get("ai_generated"),
        "data_date_range": story.get("data_date_range"),
        "findings": findings,
        "severity_summary": {
            "HIGH": sum(1 for f in findings if f["severity"] == "HIGH"),
            "MEDIUM": sum(1 for f in findings if f["severity"] == "MEDIUM"),
            "LOW": sum(1 for f in findings if f["severity"] == "LOW"),
        },
        "decision": decision,
    }


def render_md(audited):
    lines = []
    lines.append("# Story Regression Audit Report")
    lines.append("")
    lines.append(f"Generated against `research/EDITORIAL_STANDARDS.md`. {len(audited)} published stories audited.")
    lines.append("")
    # Summary
    decisions = defaultdict(int)
    for a in audited:
        decisions[a["decision"]] += 1
    lines.append("## Decision summary")
    lines.append("")
    lines.append("| Decision | Count |")
    lines.append("|---|---|")
    for d in ["UNPUBLISH PERMANENTLY", "REVISE AND REPUBLISH", "HALT AND REVIEW", "REPUBLISH AS-IS"]:
        lines.append(f"| {d} | {decisions.get(d, 0)} |")
    lines.append(f"| **Total** | **{len(audited)}** |")
    lines.append("")

    # Failure-mode counts
    code_counts = defaultdict(int)
    code_severity = {}
    for a in audited:
        for f in a["findings"]:
            code_counts[f["code"]] += 1
            code_severity[f["code"]] = f["severity"]
    lines.append("## Failure-mode incidence")
    lines.append("")
    lines.append("| Failure mode | Severity | Stories |")
    lines.append("|---|---|---|")
    for code, count in sorted(code_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| `{code}` | {code_severity[code]} | {count} |")
    lines.append("")

    # Per-story rows
    lines.append("## Per-story findings")
    lines.append("")
    for a in sorted(audited, key=lambda x: (x["decision"] != "UNPUBLISH PERMANENTLY", x["decision"], x["id"])):
        lines.append(f"### #{a['id']} — {a['title']}")
        lines.append("")
        lines.append(f"- **slug**: `{a['slug']}`")
        lines.append(f"- **category / sector**: {a['category']} / {a['sector']}")
        lines.append(f"- **verification_tier**: `{a['verification_tier']}`")
        lines.append(f"- **ai_generated**: `{a['ai_generated']}`")
        lines.append(f"- **data_date_range**: `{a['data_date_range']}`")
        sev = a["severity_summary"]
        lines.append(f"- **severity counts**: HIGH={sev['HIGH']} MEDIUM={sev['MEDIUM']} LOW={sev['LOW']}")
        lines.append(f"- **DECISION**: **{a['decision']}**")
        lines.append("")
        if a["findings"]:
            lines.append("Findings:")
            lines.append("")
            for f in a["findings"]:
                lines.append(f"- [{f['severity']}] `{f['code']}` — {f['detail']}")
            lines.append("")
        else:
            lines.append("No automated findings (still requires human read under new standard).")
            lines.append("")
    return "\n".join(lines)


def main():
    if not INPUT_PATH.exists():
        print(f"Input not found: {INPUT_PATH}", file=sys.stderr)
        sys.exit(1)
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        stories = json.load(f)

    audited = [audit_story(s) for s in stories]

    REPORT_JSON.write_text(json.dumps(audited, indent=2, ensure_ascii=False), encoding="utf-8")
    REPORT_MD.write_text(render_md(audited), encoding="utf-8")

    decisions = defaultdict(int)
    for a in audited:
        decisions[a["decision"]] += 1
    print(f"Audited {len(audited)} stories.")
    for d, c in sorted(decisions.items(), key=lambda x: -x[1]):
        print(f"  {d}: {c}")
    print(f"\nReport written to:\n  {REPORT_MD}\n  {REPORT_JSON}")


if __name__ == "__main__":
    main()
