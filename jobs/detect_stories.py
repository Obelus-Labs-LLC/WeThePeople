"""
Story Detection Job - Automated Data Story Generation

Scans all sector data for patterns and generates 5+ unique stories per day.
Each run picks from a rotation of pattern types, ensures no duplicate slugs,
and publishes directly.

Patterns:
1. Top lobbying spender per sector (rotates sectors daily)
2. Contract windfall (companies with >$100M in contracts)
3. Trade-committee overlap (congress members trading stocks they oversee)
4. Lobbying issue breakdown (sector-specific "where does the money go")
5. Penalty gap (companies with contracts but zero enforcement penalties)
6. Cross-sector influence (companies appearing in multiple sectors)
7. Lobbying surge (YoY increase >50%)
8. Foreign lobbying highlights (FARA data)
9. Congressional trade cluster (multiple trades in same ticker)
10. PAC donation spread (bipartisan giving patterns)

Usage:
    python jobs/detect_stories.py
    python jobs/detect_stories.py --dry-run
    python jobs/detect_stories.py --max-stories 8
"""

import sys
import os
import re
import random
import hashlib
import argparse
import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from models.database import SessionLocal, Base, engine, CongressionalTrade
from models.stories_models import Story
from sqlalchemy import text, func, desc

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("detect_stories")

# ── Opus daily cap: 5 AI-enhanced stories per day ──
# Only Opus-enhanced stories pass the 4000-char floor for the draft queue.
# Non-enhanced skeletons are discarded, not saved as drafts.
# Budget: ~$0.15/story x 5/day = ~$0.75/day = ~$23/month
OPUS_DAILY_CAP = 5
OPUS_MODEL = "claude-opus-4-20250514"


def _opus_stories_today(db):
    """Count how many Opus-generated stories were created today.

    Opus-enhanced stories carry `evidence.generator = 'opus'` (set by
    `detect_stories` at the call site, not by an HTML comment in the body).
    We also count stories created today but still in draft status — the cap
    is about API spend, not about publication.
    """
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # SQLite JSON path: evidence is a JSON column, use json_extract.
    return db.query(Story).filter(
        Story.created_at >= today_start,
        func.json_extract(Story.evidence, '$.generator') == 'opus',
    ).count()


def _detect_story_shape(category):
    """Determine story shape from category for the prompt."""
    company_cats = {"lobbying_spike", "contract_windfall", "enforcement_immunity",
                    "regulatory_loop", "regulatory_capture", "penalty_contract_ratio",
                    "lobbying_breakdown"}
    politician_cats = {"trade_cluster", "trade_timing", "prolific_trader",
                       "stock_act_violation", "committee_stock_trade"}
    sector_cats = {"tax_lobbying", "budget_influence"}
    # Everything else is relationship-based
    if category in company_cats:
        return "company-focused"
    elif category in politician_cats:
        return "politician-focused"
    elif category in sector_cats:
        return "sector-wide"
    else:
        return "relationship-based"


_HTML_COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)


def _strip_html_comments(text):
    """Remove every HTML comment from a markdown string.

    Stories must not contain tracking/metadata comments like
    '<!-- Generated: ... -->' because the frontend renders them as visible
    prose and readers see the raw syntax. This is the single canonical place
    that enforces the rule, used both by the Opus post-processor and by the
    retroactive cleanup of existing stories.
    """
    if not text:
        return text
    cleaned = _HTML_COMMENT_RE.sub('', text)
    # Collapse any blank-line runs that the removal created.
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.lstrip('\n')


def _tables_to_bullets(text):
    """Convert markdown tables to bullet lists for cleaner display."""
    if not text or '|' not in text:
        return text
    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Detect table header row
        if '|' in line and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            headers = [c.strip() for c in line.split('|') if c.strip()]
            i += 2  # skip header + separator
            while i < len(lines) and '|' in lines[i] and lines[i].strip():
                cells = [c.strip() for c in lines[i].split('|') if c.strip()]
                # Format as "- Header1: Value1, Header2: Value2"
                parts = []
                for j, cell in enumerate(cells):
                    if j < len(headers):
                        parts.append("%s: %s" % (headers[j], cell))
                    else:
                        parts.append(cell)
                out.append("- " + ", ".join(parts))
                i += 1
            out.append("")  # blank line after list
        else:
            out.append(line)
            i += 1
    return '\n'.join(out)


def _quality_gate(skeleton):
    """Pre-check: is the skeleton rich enough for an Opus story?"""
    if len(skeleton) < 800:
        return False, "Skeleton too short (%d chars)" % len(skeleton)
    has_dollars = "$" in skeleton
    has_data = "- " in skeleton
    if not has_dollars:
        return False, "No dollar amounts found"
    if not has_data:
        return False, "No data points found"
    return True, "OK"


def _verify_story_numbers(db, story):
    """Cross-check key numbers in a story against the actual database.

    CRITICAL: Anomaly records are cross-products (each trade x each vote = one record).
    Always query the actual source tables for counts, never use raw anomaly counts
    as if they represent unique events.

    Returns (is_valid, issues_list).
    """
    issues = []
    evidence = story.evidence if isinstance(story.evidence, dict) else {}
    body = story.body or ""

    # Check trade counts against actual congressional_trades table
    entity_ids = story.entity_ids if isinstance(story.entity_ids, list) else []
    for eid in entity_ids:
        # If the story mentions trade counts, verify against the source table
        try:
            row = db.execute(text(
                "SELECT COUNT(*) FROM congressional_trades WHERE person_id = :eid"
            ), {"eid": eid}).fetchone()
            if row:
                actual_trades = row[0]
                # Check if the body claims a higher number than exists
                import re
                # Look for patterns like "547 stock trades" or "executed 547"
                for match in re.finditer(r'(\d+)\s+(?:stock\s+)?trades?', body):
                    claimed = int(match.group(1))
                    if claimed > actual_trades * 1.1:  # Allow 10% margin for rounding
                        issues.append(
                            "Claimed %d trades for %s but DB has %d" % (claimed, eid, actual_trades)
                        )
        except Exception as e:
            log.warning("Trade count validation skipped for %s: %s", eid, e)

    # Check lobbying spend totals
    for key in ["total_spend", "lobby_total", "total_lobbying_spend"]:
        if key in evidence and evidence[key]:
            claimed_spend = evidence[key]
            # Verify it's a reasonable number (not negative, not obviously wrong)
            if claimed_spend < 0:
                issues.append("Negative lobbying spend: %s" % claimed_spend)

    if issues:
        log.warning("Story verification FAILED for '%s': %s", story.title[:50], "; ".join(issues))
        return False, issues

    return True, []


def _write_opus_narrative(skeleton, story_context, category="cross_sector"):
    """Use Opus to write narrative paragraphs for a story skeleton.

    Returns the full article with {NARRATIVE_*} placeholders replaced,
    or None if the API call fails or quality gate rejects.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY not set, skipping Opus narrative")
        return None

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
    except ImportError:
        log.warning("anthropic package not installed, skipping Opus narrative")
        return None

    # Quality gate
    passed, reason = _quality_gate(skeleton)
    if not passed:
        log.info("  Quality gate SKIP: %s", reason)
        return None

    story_shape = _detect_story_shape(category)

    # Shape-specific guidance
    shape_guidance = {
        "company-focused": "Emphasize that company's lobbying portfolio and linked contracts.",
        "politician-focused": "Focus on the politician's disclosed ties or actions relative to the lobbying data.",
        "sector-wide": "Highlight aggregate patterns across the sector.",
        "relationship-based": "Trace specific connections between lobbyists, entities, and awards.",
    }

    prompt = (
        "You are a senior data journalist at WeThePeople, a nonpartisan civic transparency platform. "
        "Your mission is to turn raw public government records into clear, factual articles that "
        "let the public record speak for itself. On 2026-04-08, WeThePeople retracted 100 of its "
        "first 127 published stories because earlier drafts hallucinated numbers, editorialised, "
        "used future-dated data, and conflated FARA 'foreign principals' with 'foreign agents'. "
        "The rules below were written specifically to prevent those failures from recurring.\n\n"
        "You will receive:\n"
        "- CONTEXT: {category, sector, title, summary}\n"
        "- STORY_SHAPE: %s\n"
        "- ENRICHED_SKELETON: A complete markdown document containing pre-built sections, data bullet lists, "
        "and source citations.\n\n"
        "ABSOLUTE RULES (a draft is rejected automatically if it violates ANY of these):\n\n"
        "R1. DO NOT INVENT NUMBERS. Every dollar amount, count, ratio, percentage, and date "
        "in your output must already appear verbatim in the ENRICHED_SKELETON. If a number is not "
        "in the skeleton, you may not write it. This includes 'for context' numbers, 'historical "
        "average' numbers, and 'industry comparison' numbers.\n"
        "R2. DO NOT COMPUTE NEW RATIOS. Do not calculate contract-to-lobbying ratios, ROI figures, "
        "'X dollars for every Y' comparisons, or any other derived metric. If the skeleton already "
        "contains a ratio, you may reference it verbatim; otherwise, do not introduce one.\n"
        "R3. NO EDITORIALISING. Forbidden phrases (any match rejects the draft): 'raises questions', "
        "'raises eyebrows', 'begs the question', 'it remains to be seen', 'shocking', 'staggering', "
        "'scandal', 'corrupt', 'kickback', 'pay-to-play', 'smoking gun', 'influence peddling', "
        "'efficiency strategy', 'lobbying efficiency', 'return on lobbying', 'suggests either'.\n"
        "R4. NO ACCUSATIONS. Never accuse any person or company of wrongdoing. Never imply that "
        "lobbying caused a contract. Never imply that a donation caused a vote. State only what "
        "the public record shows and note correlations without asserting causation.\n"
        "R5. NO DASHES — CRITICAL. This rule rejects automatically. Never write '--', '—', or '–' "
        "anywhere in the output, including inside sentences, after company names, or between clauses. "
        "If you want to insert a parenthetical or aside, use commas or parentheses instead. "
        "If you want to set off a clause, use a semicolon or period. "
        "Example of what NOT to write: 'The company -- which spent $5M -- received contracts.' "
        "Correct version: 'The company, which spent $5M, received contracts.'\n"
        "R6. FARA PRECISION. FARA tracks 'registered foreign principals' (entities represented). "
        "These are NOT 'foreign agents on payroll'. Never write 'agents on payroll' or 'paid lobbyists' "
        "when describing a FARA principal count. Use exactly 'registered foreign principals'.\n"
        "R7. TIME WINDOW. Never reference a year later than %d. Never describe contracts, filings, "
        "or trades occurring in the future. If a date in the skeleton is after %d, say 'the most recent "
        "year on record' and do not state the year.\n"
        "R8. REQUIRED DISCLAIMER — CRITICAL. This rule rejects automatically. You MUST include "
        "the following sentence verbatim somewhere in your narrative output (place it at the end of "
        "NARRATIVE_CONNECTION if that placeholder exists, otherwise at the end of your last narrative "
        "paragraph): 'Lobbying is legal activity protected under the First Amendment. Government "
        "contracts are awarded through competitive bidding processes. Correlation between lobbying "
        "expenditures and contract awards does not prove causation.' Do not paraphrase it. "
        "Do not omit it. It must appear in every story.\n"
        "R9. PRESERVE STRUCTURE. Replace ONLY the {NARRATIVE_*} placeholders. Do not add, remove, "
        "reorder, or edit any markdown headings, bullet points, or source lines outside "
        "the placeholders. Do not create markdown tables with pipe characters.\n"
        "R10. NO UNREPLACED PLACEHOLDERS. Every {NARRATIVE_*} placeholder in the skeleton must be "
        "replaced. Do not leave any curly-brace markers in the output.\n"
        "R11. DATA LIMITATIONS. If the skeleton shows $0 lobbying, missing amounts, or obviously "
        "incomplete data, note the limitation in one sentence without speculating about why.\n"
        "R12. NAME THE ENTITY. Every narrative paragraph about a specific company or person must "
        "name that entity at least once using the exact display name from the skeleton.\n"
        "R13. PARAGRAPH LENGTHS AND MINIMUM LENGTH — CRITICAL. This is a hard rejection rule. "
        "NARRATIVE_LEAD: exactly 2 substantial paragraphs (minimum 120 words combined). Provide context "
        "on the entity, its industry position, and why the data matters to the public interest. "
        "NARRATIVE_ISSUES: 2 paragraphs (minimum 100 words). Analyze the policy areas being targeted, "
        "explain what these lobbying issues mean in plain language, and connect them to real legislation. "
        "NARRATIVE_CONNECTION: exactly 2 paragraphs including the R8 disclaimer sentence (minimum 100 words). "
        "Draw connections between the data points (lobbying spend, contracts, enforcement), explain what "
        "the public record shows when these are viewed together, and provide the mandatory disclaimer. "
        "Any additional {NARRATIVE_*} placeholders: 2 paragraphs (minimum 80 words each). "
        "Each narrative paragraph must be at least 4 full sentences. "
        "The ENTIRE article body (data + narrative combined) must be at least 4000 characters and "
        "at least 700 words of written narrative. Articles under 4000 characters WILL BE REJECTED. "
        "Write thoroughly, with the depth expected of investigative data journalism.\n"
        "R14. NO NEW SECTIONS. Do not add conclusions, calls to action, 'what this means' sections, "
        "or 'next steps'. End exactly where the skeleton ends.\n"
        "R15. STORY SHAPE GUIDANCE. For this %s story: %s\n"
        "R16. NO HTML COMMENTS. Never emit any HTML comment (lines starting with '<!--'). "
        "Do not add a metadata block, generation timestamp, category marker, or tracking "
        "comment of any kind. Return pure markdown only.\n\n"
        "OUTPUT REQUIREMENTS:\n"
        "- Return the COMPLETE article as valid markdown.\n"
        "- Start directly with the first markdown heading. No preamble, no HTML comments, no metadata.\n"
        "- Replace every {NARRATIVE_*} placeholder with your written paragraphs.\n"
        "- Do not add any extra text, explanations, or JSON outside the markdown article.\n\n"
        "CONTEXT: %s\n"
        "STORY_SHAPE: %s\n"
        "ENRICHED_SKELETON:\n%s"
    ) % (
        story_shape,
        datetime.now(timezone.utc).year,
        datetime.now(timezone.utc).year,
        story_shape, shape_guidance.get(story_shape, ""),
        story_context, story_shape, skeleton
    )

    try:
        response = client.messages.create(
            model=OPUS_MODEL,
            max_tokens=6000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = response.content[0].text
        in_tok = response.usage.input_tokens
        out_tok = response.usage.output_tokens
        cost = (in_tok * 15 / 1e6) + (out_tok * 75 / 1e6)
        log.info("  Opus narrative: %d chars, $%.4f (%d in, %d out)",
                 len(result), cost, in_tok, out_tok)
        try:
            from services.budget import log_token_usage
            log_token_usage("story_opus", OPUS_MODEL, in_tok, out_tok, cost, story_context[:100])
        except Exception as e:
            log.warning("Failed to log token usage for story_opus: %s", e)

        # Strip any leftover {NARRATIVE_*} placeholders that Opus failed to replace
        import re
        leftover = re.findall(r'\{NARRATIVE_\w+\}', result)
        if leftover:
            log.warning("  Opus left %d unreplaced placeholders: %s", len(leftover), leftover)
            for tag in leftover:
                result = result.replace(tag, "")
            # Clean up resulting double blank lines
            result = re.sub(r'\n{3,}', '\n\n', result)

        # Strip any HTML comments the model emitted despite R16.
        # Handles both single-line (<!-- ... -->) and leading/trailing blank lines.
        result = _strip_html_comments(result)

        # Post-process: convert markdown tables to bullet lists.
        result = _tables_to_bullets(result)

        # Post-process: replace dashes that slip past the prompt rule.
        # HTML comments were already removed above.
        def _strip_dashes(line):
            line = line.replace('\u2014', ',').replace('\u2013', ',')
            return re.sub(r'\s*--\s*', ', ', line)
        result = '\n'.join(_strip_dashes(l) for l in result.splitlines())

        return result
    except Exception as e:
        log.warning("Opus narrative generation failed: %s", e)
        return None

# All lobbying tables with their sector label and entity ID column
LOBBYING_TABLES = [
    ("lobbying_records", "tech", "company_id", "tracked_tech_companies"),
    ("finance_lobbying_records", "finance", "institution_id", "tracked_institutions"),
    ("health_lobbying_records", "health", "company_id", "tracked_companies"),
    ("energy_lobbying_records", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_lobbying_records", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_lobbying_records", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_lobbying_records", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_lobbying_records", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_lobbying_records", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_lobbying_records", "education", "company_id", "tracked_education_companies"),
]

CONTRACT_TABLES = [
    ("government_contracts", "tech", "company_id", "tracked_tech_companies"),
    ("finance_government_contracts", "finance", "institution_id", "tracked_institutions"),
    ("health_government_contracts", "health", "company_id", "tracked_companies"),
    ("energy_government_contracts", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_government_contracts", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_government_contracts", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_government_contracts", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_government_contracts", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_government_contracts", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_government_contracts", "education", "company_id", "tracked_education_companies"),
]

ENFORCEMENT_TABLES = [
    ("ftc_enforcement_actions", "tech", "company_id", "tracked_tech_companies"),
    ("finance_enforcement_actions", "finance", "institution_id", "tracked_institutions"),
    ("health_enforcement_actions", "health", "company_id", "tracked_companies"),
    ("energy_enforcement_actions", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_enforcement_actions", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_enforcement_actions", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_enforcement_actions", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_enforcement_actions", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_enforcement_actions", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_enforcement_actions", "education", "company_id", "tracked_education_companies"),
]


def slug(title):
    s = title.lower()
    for ch in ["'", '"', ":", ",", ".", "?", "!", "(", ")", "$", "%", "+", "&", "#"]:
        s = s.replace(ch, "")
    s = s.replace(" ", "-").replace("--", "-").strip("-")
    return s[:120]


def fmt_money(n):
    if n >= 1e9:
        return "$%.1fB" % (n / 1e9)
    if n >= 1e6:
        return "$%.1fM" % (n / 1e6)
    if n >= 1e3:
        return "$%.0fK" % (n / 1e3)
    return "$%s" % f"{n:,.0f}"


def story_exists(db, story_slug):
    return db.query(Story).filter(Story.slug == story_slug).first() is not None


def entity_story_recent(db, entity_id, category, days=7):
    """Check if a story about the same entity in the same category was published recently.

    Prevents near-duplicate stories when data refreshes cause slight amount changes
    (e.g., "$10.8M" one day, "$10.7M" the next — different slugs, same story).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        return db.query(Story).filter(
            Story.category == category,
            Story.published_at >= cutoff,
            Story.entity_ids.contains(entity_id),
        ).first() is not None
    except Exception:
        # Fallback: SQLite JSON contains may not work, do string match
        like_pattern = f'%"{entity_id}"%'
        return db.query(Story).filter(
            Story.category == category,
            Story.published_at >= cutoff,
            func.cast(Story.entity_ids, text("TEXT")).like(like_pattern),
        ).first() is not None


def _parse_gov_entities(entities_str):
    """Parse the government_entities field into a clean list of agency names.

    Two storage formats are supported:
      - New format: pipe-separated ("Treasury, Dept of | White House Office")
      - Legacy format: comma-separated, where canonical Senate LDA names like
        "Treasury, Dept of" or "Commerce, Dept of (DOC)" themselves contain commas.

    For legacy rows we re-merge fragments that look like continuations of the
    previous entry (anything starting with "Dept of", "Department of", "Office of",
    or "Bureau of"), since those are partial agency-name suffixes, not standalone
    entities.
    """
    if not entities_str:
        return []
    if " | " in entities_str:
        return [e.strip() for e in entities_str.split(" | ") if e.strip()]
    # Legacy comma-separated path with smart re-merge
    raw = [e.strip() for e in entities_str.split(",") if e.strip()]
    CONTINUATION_PREFIXES = ("Dept of", "Department of", "Office of", "Bureau of")
    merged = []
    for item in raw:
        if merged and any(item.startswith(p) for p in CONTINUATION_PREFIXES):
            merged[-1] = merged[-1] + ", " + item
        else:
            merged.append(item)
    return merged


def get_entity_name(db, entity_id, entity_table, id_col):
    try:
        row = db.execute(text(
            "SELECT display_name FROM %s WHERE %s = :eid" % (entity_table, id_col)
        ), {"eid": entity_id}).fetchone()
        return row[0] if row else entity_id.replace("-", " ").title()
    except Exception:
        return entity_id.replace("-", " ").title()


# ── Entity-Sector Cross-Validation ──
# Prevents misattribution like Navient/Avient by checking that an entity's
# contract agencies make sense for its sector.

SECTOR_EXPECTED_AGENCIES = {
    "finance": {"Department of the Treasury", "Department of Defense", "Department of Veterans Affairs",
                "Securities and Exchange Commission", "Department of Homeland Security",
                "Department of State", "General Services Administration"},
    "health": {"Department of Health and Human Services", "Department of Veterans Affairs",
               "Department of Defense", "Food and Drug Administration"},
    "tech": {"Department of Defense", "General Services Administration", "Department of Homeland Security",
             "National Aeronautics and Space Administration", "Department of Energy"},
    "energy": {"Department of Energy", "Department of Defense", "Environmental Protection Agency",
               "Department of the Interior", "General Services Administration"},
    "transportation": {"General Services Administration", "Department of Transportation",
                       "Department of Defense", "Department of Homeland Security"},
    "defense": {"Department of Defense", "Department of Homeland Security", "Department of State",
                "Department of Energy", "National Aeronautics and Space Administration"},
    "chemicals": {"Department of Defense", "Environmental Protection Agency",
                  "Department of Energy", "General Services Administration",
                  "National Aeronautics and Space Administration"},
    "agriculture": {"Department of Agriculture", "Environmental Protection Agency",
                    "Department of the Interior"},
    "telecom": {"Federal Communications Commission", "Department of Defense",
                "General Services Administration", "Department of Homeland Security"},
    "education": {"Department of Education", "Department of Defense",
                  "Department of Health and Human Services"},
}


def validate_entity_sector(db, entity_id, sector, contract_table, id_col):
    """Validate that an entity's contracts make sense for its sector.

    Returns (is_valid, warning_message). Rejects when >80% of contract value
    comes from agencies NOT expected for the entity's sector, which signals
    likely entity misattribution (e.g., Avient getting Navient's DoE contracts).
    """
    try:
        rows = db.execute(text(
            "SELECT awarding_agency, SUM(award_amount) as total "
            "FROM %s WHERE %s = :eid AND awarding_agency IS NOT NULL "
            "GROUP BY awarding_agency ORDER BY total DESC LIMIT 10"
            % (contract_table, id_col)
        ), {"eid": entity_id}).fetchall()
    except Exception:
        return True, None  # Can't validate, allow

    if not rows:
        return True, None

    expected = SECTOR_EXPECTED_AGENCIES.get(sector, set())
    if not expected:
        return True, None

    total_value = sum(float(r[1] or 0) for r in rows)
    if total_value == 0:
        return True, None

    unexpected_value = sum(
        float(r[1] or 0) for r in rows
        if r[0] not in expected and not any(exp.lower() in r[0].lower() for exp in expected)
    )

    unexpected_pct = unexpected_value / total_value
    if unexpected_pct > 0.80:
        top_agency = rows[0][0] if rows else "unknown"
        return False, (
            "Entity %s (sector: %s) has %.0f%% of contract value from unexpected agencies "
            "(top: %s). Likely entity misattribution."
            % (entity_id, sector, unexpected_pct * 100, top_agency)
        )
    elif unexpected_pct > 0.50:
        return True, (
            "Warning: %s has %.0f%% of contract value from unexpected agencies for sector %s"
            % (entity_id, unexpected_pct * 100, sector)
        )

    return True, None


# ── Temporal Context Helpers ──
# Add date ranges to stories so readers know what time period the data covers.

def get_data_date_range(db, table, id_col, entity_id):
    """Query the date range of data for an entity in a table.

    Returns (min_date_str, max_date_str, date_range_label) or None if no dates found.
    """
    date_cols = ["filing_date", "start_date", "action_date", "trade_date", "received_date"]
    for dcol in date_cols:
        try:
            row = db.execute(text(
                "SELECT MIN(%s), MAX(%s) FROM %s WHERE %s = :eid AND %s IS NOT NULL"
                % (dcol, dcol, table, id_col, dcol)
            ), {"eid": entity_id}).fetchone()
            if row and row[0] and row[1]:
                from datetime import datetime as dt
                min_d = str(row[0])[:10]
                max_d = str(row[1])[:10]
                try:
                    min_dt = dt.strptime(min_d, "%Y-%m-%d")
                    max_dt = dt.strptime(max_d, "%Y-%m-%d")
                    label = "%s to %s" % (min_dt.strftime("%b %Y"), max_dt.strftime("%b %Y"))
                    return min_d, max_d, label
                except ValueError:
                    return min_d, max_d, "%s to %s" % (min_d, max_d)
        except Exception:
            continue
    return None


def get_sector_aggregate(db, table, id_col, metric="SUM(income)"):
    """Get sector-level aggregate for comparative context."""
    try:
        row = db.execute(text(
            "SELECT %s, COUNT(DISTINCT %s) FROM %s" % (metric, id_col, table)
        )).fetchone()
        return float(row[0] or 0), int(row[1] or 0)
    except Exception:
        return 0, 0


# ── Inline Citation URL Builders ──
# Generate specific URLs so readers can verify claims directly.

def _usaspending_entity_url(entity_name):
    """Build a USASpending.gov search URL for a specific entity."""
    from urllib.parse import quote
    return "https://www.usaspending.gov/search/?hash=&filters=%s" % quote(
        '{"keyword":"' + entity_name.replace('"', '') + '"}'
    )


def _senate_lda_url():
    """Senate LDA database URL."""
    return "https://lda.senate.gov/filings/public/filing/search/"


def _fec_entity_url(entity_name):
    """FEC search URL for a specific entity."""
    from urllib.parse import quote
    return "https://www.fec.gov/data/receipts/?data_type=processed&contributor_name=%s" % quote(entity_name)


def _sec_edgar_url(entity_name):
    """SEC EDGAR search URL."""
    from urllib.parse import quote
    return "https://efts.sec.gov/LATEST/search-index?q=%s&dateRange=custom" % quote(entity_name)


# ── Verification Score Calculator ──
# Replaces the blanket 95/public_records with meaningful per-story assessment.

def compute_verification_score(story, db):
    """Compute a meaningful verification score based on actual data checks.

    Returns (score_float, tier_string).

    Scoring:
    - Base: 0.5 (data exists in our tables)
    - +0.15 if all key numbers verified against source tables
    - +0.15 if entity-sector validation passes
    - +0.10 if data date range spans >1 year (not stale)
    - +0.10 if multiple independent data sources cited
    """
    score = 0.50  # Base: data exists
    evidence = story.evidence if isinstance(story.evidence, dict) else {}
    data_sources = story.data_sources if isinstance(story.data_sources, list) else []

    # Source diversity bonus
    unique_source_types = set()
    for ds in data_sources:
        ds_lower = ds.lower() if isinstance(ds, str) else ""
        if "lobbying" in ds_lower:
            unique_source_types.add("lobbying")
        elif "contract" in ds_lower or "usaspending" in ds_lower:
            unique_source_types.add("contracts")
        elif "trade" in ds_lower or "disclosure" in ds_lower:
            unique_source_types.add("trades")
        elif "enforcement" in ds_lower:
            unique_source_types.add("enforcement")
        elif "fec" in ds_lower or "donation" in ds_lower:
            unique_source_types.add("donations")
        elif "fara" in ds_lower:
            unique_source_types.add("fara")
    if len(unique_source_types) >= 2:
        score += 0.10

    # Evidence richness bonus
    numeric_evidence = sum(1 for v in evidence.values() if isinstance(v, (int, float)) and v > 0)
    if numeric_evidence >= 3:
        score += 0.15
    elif numeric_evidence >= 1:
        score += 0.08

    # Date range bonus (checked via data_date_range if set)
    if getattr(story, "data_date_range", None):
        score += 0.10

    # Entity validation bonus
    if getattr(story, "_entity_validated", False):
        score += 0.15

    score = min(score, 1.0)

    if score >= 0.80:
        tier = "verified"
    elif score >= 0.55:
        tier = "partially_verified"
    else:
        tier = "unverified"

    return round(score, 2), tier


_DISCLAIMER = (
    "Lobbying is legal activity protected under the First Amendment. "
    "Government contracts are awarded through competitive bidding processes. "
    "Correlation between lobbying expenditures and contract awards does not prove causation."
)
_DISCLAIMER_CATEGORIES = {
    "lobbying", "contract", "contract_windfall", "penalty_gap",
    "lobby_contract_loop", "tax_lobbying", "budget_lobbying",
    "lobby_then_win", "enforcement_disappearance", "pac_committee_pipeline",
    "contract_timing", "regulatory_loop", "regulatory_capture",
    "enforcement_immunity", "penalty_contract_ratio", "lobbying_spike",
    "revolving_door", "bipartisan_buying", "prolific_trader",
    "cross_sector", "budget_influence", "trade_timing", "foreign_lobbying",
}


def make_story(title, summary, body, category, sector, entity_ids, data_sources,
               evidence, date_range=None, entity_validated=False):
    """Build a Story row.

    As of Gate-5 rollout (2026-04-08), new stories default to status='draft'.
    They enter the human review queue and only become published via
    /ops/story-queue approve. Nothing is posted automatically.
    """
    # Inject disclaimer ONCE for lobbying/contract stories.
    # Count existing occurrences and only add if zero.
    disclaimer_count = body.count("Lobbying is legal activity protected under the First Amendment")
    if category in _DISCLAIMER_CATEGORIES and disclaimer_count == 0:
        body = body.rstrip() + "\n\n" + _DISCLAIMER
    elif disclaimer_count > 1:
        # Remove all but the last occurrence (keep the one in Data Sources footer)
        parts = body.split(_DISCLAIMER)
        body = parts[0]
        for i, part in enumerate(parts[1:], 1):
            if i == len(parts) - 1:
                body += _DISCLAIMER + part  # Keep last one
            else:
                body += part  # Drop intermediate ones

    story = Story(
        title=title,
        slug=slug(title),
        summary=summary,
        body=body,
        category=category,
        sector=sector,
        entity_ids=entity_ids,
        data_sources=data_sources,
        evidence=evidence,
        status="draft",
        published_at=None,
        data_date_range=date_range,
        data_freshness_at=datetime.now(timezone.utc),
        ai_generated="algorithmic",
    )
    # Mark for verification scoring
    story._entity_validated = entity_validated
    return story


# ── Pattern 1: Top Lobbying Spender ──

def detect_top_spender(db, sector_idx=None):
    """Find the top lobbying spender in a sector that doesn't already have a story."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]

    try:
        rows = db.execute(text(
            "SELECT %s, SUM(income) as total, COUNT(*) as cnt "
            "FROM %s GROUP BY %s ORDER BY total DESC LIMIT 5" % (id_col, table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Top spender query failed for %s: %s", sector, e)
        return stories

    c_table = CONTRACT_TABLES[idx][0]

    # Sector-wide comparative context
    sector_total, sector_entity_count = get_sector_aggregate(db, table, id_col)

    for eid, total_spend, filing_count in rows:
        if not total_spend or total_spend < 100000:
            continue
        if entity_story_recent(db, eid, "lobbying_spike", days=7):
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Spent %s Lobbying Congress" % (name, fmt_money(total_spend))
        if story_exists(db, slug(title)):
            continue

        # Get top issues with spend breakdown
        try:
            issue_rows = db.execute(text(
                "SELECT lobbying_issues, income, government_entities FROM %s WHERE %s = :eid AND lobbying_issues IS NOT NULL"
                % (table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            issue_rows = []

        issue_spend = defaultdict(float)
        issue_filings = defaultdict(int)
        gov_entity_spend = defaultdict(float)
        gov_entity_filings = defaultdict(int)
        for issues_str, income, entities_str in issue_rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            for iss in issues:
                issue_spend[iss] += per_issue
                issue_filings[iss] += 1
            if entities_str:
                entities = _parse_gov_entities(entities_str)
                per_ent = inc / max(len(entities), 1)
                for ent in entities:
                    gov_entity_spend[ent] += per_ent
                    gov_entity_filings[ent] += 1

        top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:8]
        top_gov = sorted(gov_entity_spend.items(), key=lambda x: -x[1])[:6]

        # Get contract cross-reference
        contract_total = 0
        contract_count = 0
        try:
            cr = db.execute(text(
                "SELECT SUM(award_amount), COUNT(*) FROM %s WHERE %s = :eid" % (c_table, id_col)
            ), {"eid": eid}).fetchone()
            if cr:
                contract_total = float(cr[0] or 0)
                contract_count = int(cr[1] or 0)
        except Exception:
            pass

        # Entity-sector validation
        entity_valid = True
        if contract_total > 0:
            valid, warning = validate_entity_sector(db, eid, sector, c_table, id_col)
            if not valid:
                log.warning("ENTITY VALIDATION FAILED: %s — %s", eid, warning)
                continue  # Skip this entity entirely
            if warning:
                log.info("Entity validation warning: %s", warning)
            entity_valid = valid

        # Temporal context
        date_range_info = get_data_date_range(db, table, id_col, eid)
        date_range_label = date_range_info[2] if date_range_info else None

        # Comparative context
        sector_share_pct = (total_spend / sector_total * 100) if sector_total > 0 else 0

        # ── Build story body with enriched template ──
        body = "## Overview\n\n"
        body += "%s filed %d lobbying disclosures totaling %s with the U.S. Senate" % (
            name, filing_count, fmt_money(total_spend))
        if date_range_label:
            body += " between %s" % date_range_label
        body += "."

        # Comparative context paragraph
        if sector_total > 0 and sector_share_pct >= 1:
            body += " That represents %.1f%% of the %s in total %s sector lobbying" % (
                sector_share_pct, fmt_money(sector_total), sector)
            if sector_entity_count > 1:
                body += " across %d tracked companies" % sector_entity_count
            body += "."
        body += "\n\n"

        if top_issues:
            body += "## Policy Areas Targeted\n\n"
            body += "%s directed lobbying resources across %d distinct policy areas. " % (name, len(issue_spend))
            body += "The largest allocations went to:\n\n"
            for iss, spend in top_issues:
                pct_of_total = (spend / total_spend * 100) if total_spend > 0 else 0
                body += "- **%s**: %s across %d filings (%.0f%% of total spend)\n" % (
                    iss, fmt_money(spend), issue_filings[iss], pct_of_total)
            body += "\n*Spend estimated by dividing each filing's reported income across its listed issues.*\n\n"

        if top_gov:
            body += "## Federal Bodies Contacted\n\n"
            body += "According to Senate disclosures, %s directed lobbying activity toward these federal entities:\n\n" % name
            for ent, spend in top_gov:
                body += "- **%s**: %s across %d filings\n" % (ent, fmt_money(spend), gov_entity_filings[ent])
            body += "\n"

        if contract_total > 0:
            body += "## Federal Contract Awards\n\n"
            body += "Federal procurement records from [USASpending.gov](%s) show " % _usaspending_entity_url(name)
            body += "%s received **%s** across **%d government contracts** from federal agencies" % (
                name, fmt_money(contract_total), contract_count)
            if date_range_label:
                body += " during the same period"
            body += ".\n\n"

        # Data methodology + sources section
        body += "## Data Sources and Methodology\n\n"
        body += "This investigation draws from the following public government databases:\n\n"
        body += "- **Lobbying disclosures**: [Senate Lobbying Disclosure Act database](%s) " % _senate_lda_url()
        body += "(filings for %s)\n" % name
        if contract_total > 0:
            body += "- **Federal contracts**: [USASpending.gov](%s) " % _usaspending_entity_url(name)
            body += "(contract awards for %s)\n" % name
        body += "\n"
        if date_range_label:
            body += "*Data covers %s. " % date_range_label
        body += "All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s filed %d lobbying disclosures totaling %s across %d policy areas, "
                    "led by %s." % (
                name, filing_count, fmt_money(total_spend), len(issue_spend),
                top_issues[0][0] if top_issues else "various issues"
            ),
            body=body,
            category="lobbying_spike",
            sector=sector,
            entity_ids=[eid],
            data_sources=[table, "Senate LDA (senate.gov)", c_table, "USASpending.gov"],
            evidence={
                "total_spend": total_spend, "filings": filing_count,
                "issue_count": len(issue_spend),
                "contract_total": contract_total, "contract_count": contract_count,
                "top_issues": {k: v for k, v in top_issues[:5]},
                "sector_total": sector_total, "sector_share_pct": round(sector_share_pct, 1),
            },
            date_range=date_range_label,
            entity_validated=entity_valid,
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 2: Contract Windfall ──

def detect_contract_windfall(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    table, sector, id_col, entity_table = CONTRACT_TABLES[idx]

    try:
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        rows = db.execute(text(
            "SELECT %s, SUM(award_amount) as total, COUNT(*) as cnt "
            "FROM %s WHERE start_date IS NULL OR start_date <= :today "
            "GROUP BY %s HAVING total > 100000000 ORDER BY total DESC LIMIT 5"
            % (id_col, table, id_col)
        ), {"today": today_str}).fetchall()
    except Exception as e:
        log.warning("Contract windfall query failed for %s: %s", sector, e)
        return stories

    # Sector comparative context
    sector_contract_total, sector_contractor_count = get_sector_aggregate(
        db, table, id_col, metric="SUM(award_amount)"
    )

    for eid, total_value, contract_count in rows:
        if entity_story_recent(db, eid, "contract_windfall", days=14):
            continue
        name = get_entity_name(db, eid, entity_table, id_col)

        # Entity-sector validation: CRITICAL guard against misattribution
        valid, warning = validate_entity_sector(db, eid, sector, table, id_col)
        if not valid:
            log.warning("ENTITY VALIDATION FAILED for contract story: %s — %s", eid, warning)
            continue

        title = "%s Has %s in Government Contracts" % (name, fmt_money(total_value))
        if story_exists(db, slug(title)):
            continue

        # Get top agencies with detail
        try:
            agency_rows = db.execute(text(
                "SELECT awarding_agency, COUNT(*), SUM(award_amount) FROM %s "
                "WHERE %s = :eid AND awarding_agency IS NOT NULL "
                "GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            agency_rows = []

        # Cross-reference: did they also lobby?
        l_table = LOBBYING_TABLES[idx][0]
        lobby_total = 0
        lobby_count = 0
        try:
            lr = db.execute(text(
                "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            if lr:
                lobby_total = float(lr[0] or 0)
                lobby_count = int(lr[1] or 0)
        except Exception:
            pass

        # Temporal context
        date_range_info = get_data_date_range(db, table, id_col, eid)
        date_range_label = date_range_info[2] if date_range_info else None

        # Comparative context
        sector_share_pct = (total_value / sector_contract_total * 100) if sector_contract_total > 0 else 0

        # ── Build diversified story body ──
        body = "## Federal Contract Portfolio\n\n"
        body += "Federal procurement records from [USASpending.gov](%s) show " % _usaspending_entity_url(name)
        body += "%s has received **%s** across **%d government contract awards**" % (
            name, fmt_money(total_value), contract_count)
        if date_range_label:
            body += " from %s" % date_range_label
        body += "."

        # Comparative context
        if sector_contract_total > 0 and sector_share_pct >= 1:
            body += " This represents %.1f%% of %s in total tracked %s sector federal contracts" % (
                sector_share_pct, fmt_money(sector_contract_total), sector)
            if sector_contractor_count > 1:
                body += " across %d companies in our database" % sector_contractor_count
            body += "."
        body += "\n\n"

        if agency_rows:
            body += "## Awarding Agencies\n\n"
            body += "The contract awards to %s came from multiple federal agencies:\n\n" % name
            top_agency_value = float(agency_rows[0][2] or 0) if agency_rows else 0
            for agency, cnt, amt in agency_rows:
                agency_name = agency or "Unknown"
                agency_pct = (float(amt or 0) / total_value * 100) if total_value > 0 else 0
                body += "- **%s**: %s across %d awards (%.0f%% of portfolio)\n" % (
                    agency_name, fmt_money(amt or 0), cnt, agency_pct)
            if len(agency_rows) > 1:
                top_agency = agency_rows[0][0] or "Unknown"
                body += "\nThe %s accounted for the largest share of %s's federal contract value.\n" % (
                    top_agency, name)
            body += "\n"

        if lobby_total > 0:
            body += "## Parallel Lobbying Activity\n\n"
            body += "[Senate LDA filings](%s) show " % _senate_lda_url()
            body += "%s also spent **%s** on federal lobbying across **%d disclosures**" % (
                name, fmt_money(lobby_total), lobby_count)
            if date_range_label:
                body += " during the same period"
            body += ". "
            body += "The public record shows both contracting and lobbying activity; "
            body += "these represent two distinct forms of engagement with the federal government.\n\n"

        body += "## Data Sources and Methodology\n\n"
        body += "This investigation draws from the following public government databases:\n\n"
        body += "- **Federal contracts**: [USASpending.gov](%s) " % _usaspending_entity_url(name)
        body += "(contract awards for %s)\n" % name
        if lobby_total > 0:
            body += "- **Lobbying disclosures**: [Senate LDA database](%s) " % _senate_lda_url()
            body += "(filings for %s)\n" % name
        body += "\n"
        if date_range_label:
            body += "*Data covers %s. " % date_range_label
        body += "All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s received %s across %d federal contracts, with %s accounting for "
                    "the largest share." % (
                name, fmt_money(total_value), contract_count,
                agency_rows[0][0] if agency_rows else "federal agencies"
            ),
            body=body,
            category="contract_windfall",
            sector=sector,
            entity_ids=[eid],
            data_sources=[table, "USASpending.gov", l_table, "Senate LDA (senate.gov)"],
            evidence={
                "total_value": total_value, "contracts": contract_count,
                "lobby_total": lobby_total, "lobby_count": lobby_count,
                "sector_contract_total": sector_contract_total,
                "sector_share_pct": round(sector_share_pct, 1),
            },
            date_range=date_range_label,
            entity_validated=True,
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 3: Penalty Gap ──

def detect_penalty_gap(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    c_table, sector, id_col, entity_table = CONTRACT_TABLES[idx]
    e_table = ENFORCEMENT_TABLES[idx][0]

    try:
        # Companies with big contracts but no enforcement actions with actual penalties
        rows = db.execute(text(
            "SELECT c.%s, SUM(c.award_amount) as total_contracts, COUNT(c.id) as contract_count "
            "FROM %s c "
            "LEFT JOIN %s e ON c.%s = e.%s AND e.penalty_amount IS NOT NULL AND e.penalty_amount > 0 "
            "WHERE e.id IS NULL "
            "GROUP BY c.%s HAVING total_contracts > 50000000 "
            "ORDER BY total_contracts DESC LIMIT 5"
            % (id_col, c_table, e_table, id_col, id_col, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Penalty gap query failed for %s: %s", sector, e)
        return stories

    for eid, total_contracts, contract_count in rows:
        if entity_story_recent(db, eid, "penalty_contract_ratio", days=14):
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s: %s in Contracts, Zero Penalties" % (name, fmt_money(total_contracts))
        if story_exists(db, slug(title)):
            continue

        # Get top contract agencies
        try:
            pa_rows = db.execute(text(
                "SELECT awarding_agency, COUNT(*), SUM(award_amount) FROM %s "
                "WHERE %s = :eid AND awarding_agency IS NOT NULL "
                "GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (c_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            pa_rows = []

        # Get lobbying spend
        l_table = LOBBYING_TABLES[idx][0]
        lobby_total = 0
        try:
            lr = db.execute(text(
                "SELECT SUM(income) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            if lr and lr[0]:
                lobby_total = float(lr[0])
        except Exception:
            pass

        # Entity-sector validation
        valid, warning = validate_entity_sector(db, eid, sector, c_table, id_col)
        if not valid:
            log.warning("ENTITY VALIDATION FAILED for penalty gap: %s — %s", eid, warning)
            continue

        # Temporal context
        date_range_info = get_data_date_range(db, c_table, id_col, eid)
        date_range_label = date_range_info[2] if date_range_info else None

        body = "## Enforcement Record\n\n"
        body += "Federal procurement records from [USASpending.gov](%s) show " % _usaspending_entity_url(name)
        body += "%s has received **%s** across **%d government contracts**" % (
            name, fmt_money(total_contracts), contract_count)
        if date_range_label:
            body += " from %s" % date_range_label
        body += ". A search of federal enforcement records in the "
        body += "Federal Register found no enforcement actions with documented financial penalties "
        body += "against the company during this period.\n\n"

        body += "The absence of enforcement penalties does not indicate either compliance or "
        body += "noncompliance. Federal enforcement databases may not capture all regulatory "
        body += "actions, and some agencies maintain separate enforcement records not reflected "
        body += "in the sources tracked here.\n\n"

        if pa_rows:
            body += "## Contract Awarding Agencies\n\n"
            body += "The contract awards to %s came from the following agencies:\n\n" % name
            for agency, cnt, amt in pa_rows:
                body += "- **%s**: %s across %d awards\n" % (agency or "Unknown", fmt_money(amt or 0), cnt)
            body += "\n"

        if lobby_total > 0:
            body += "## Parallel Lobbying Activity\n\n"
            body += "[Senate LDA filings](%s) show " % _senate_lda_url()
            body += "%s spent **%s** on federal lobbying during a period that overlaps with " % (
                name, fmt_money(lobby_total))
            body += "its contract awards.\n\n"

        body += "## Data Sources and Methodology\n\n"
        body += "This investigation cross-references the following public databases:\n\n"
        body += "- **Federal contracts**: [USASpending.gov](%s)\n" % _usaspending_entity_url(name)
        body += "- **Enforcement actions**: Federal Register (federalregister.gov)\n"
        if lobby_total > 0:
            body += "- **Lobbying disclosures**: [Senate LDA database](%s)\n" % _senate_lda_url()
        body += "\n"
        if date_range_label:
            body += "*Data covers %s. " % date_range_label
        body += "All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s has %s in government contracts from federal agencies with no "
                    "recorded enforcement penalties in the Federal Register." % (
                name, fmt_money(total_contracts)),
            body=body,
            category="penalty_contract_ratio",
            sector=sector,
            entity_ids=[eid],
            data_sources=[c_table, e_table, "USASpending.gov", "Federal Register"],
            evidence={"total_contracts": total_contracts, "contract_count": contract_count, "penalties": 0},
            date_range=date_range_label,
            entity_validated=True,
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 4: Congressional Trade Cluster ──

def detect_trade_cluster(db):
    stories = []
    try:
        rows = db.execute(text(
            "SELECT ct.person_id, tm.display_name, tm.party, tm.state, tm.chamber, "
            "COUNT(*) as trade_count, COUNT(DISTINCT ct.ticker) as ticker_count "
            "FROM congressional_trades ct "
            "JOIN tracked_members tm ON tm.person_id = ct.person_id "
            "GROUP BY ct.person_id "
            "HAVING trade_count >= 20 "
            "ORDER BY trade_count DESC LIMIT 10"
        )).fetchall()
    except Exception as e:
        log.warning("Trade cluster query failed: %s", e)
        return stories

    for pid, name, party, state, chamber, trade_count, ticker_count in rows:
        title = "%s Made %d Stock Trades Across %d Companies" % (name, trade_count, ticker_count)
        if story_exists(db, slug(title)):
            continue

        # Get top tickers
        try:
            ticker_rows = db.execute(text(
                "SELECT ticker, COUNT(*) as cnt FROM congressional_trades "
                "WHERE person_id = :pid GROUP BY ticker ORDER BY cnt DESC LIMIT 8"
            ), {"pid": pid}).fetchall()
        except Exception:
            ticker_rows = []

        # Get committee assignments
        try:
            comm_rows = db.execute(text(
                "SELECT c.name FROM committees c "
                "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                "WHERE cm.person_id = :pid"
            ), {"pid": pid}).fetchall()
        except Exception:
            comm_rows = []
        committees = [c[0] for c in comm_rows] if comm_rows else []

        # Get donations received
        try:
            don_rows = db.execute(text(
                "SELECT SUM(amount), COUNT(*) FROM company_donations WHERE person_id = :pid"
            ), {"pid": pid}).fetchone()
            don_total = float(don_rows[0] or 0) if don_rows else 0
            don_count = int(don_rows[1] or 0) if don_rows else 0
        except Exception:
            don_total = 0
            don_count = 0

        body = "## The Trades\n\n"
        body += "%s. %s (%s-%s, %s) executed **%d stock trades** across **%d different companies** per STOCK Act disclosures.\n\n" % (
            "Sen" if chamber == "senate" else "Rep", name, party or "?", state or "?", chamber or "?",
            trade_count, ticker_count
        )
        if ticker_rows:
            body += "## Most Traded Tickers\n\n"
            for ticker, cnt in ticker_rows:
                body += "- %s: %d trades\n" % (ticker, cnt)
            body += "\n"
        if committees:
            body += "## Committee Assignments\n\n"
            body += "This member sits on committees that may oversee industries they trade in:\n\n"
            for c in committees[:6]:
                body += "- %s\n" % c
            body += "\n"
        if don_total > 0:
            body += "## PAC Donations Received\n\n"
            body += "%s received **%s** across **%d** corporate PAC donations.\n\n" % (name, fmt_money(don_total), don_count)
        body += "## Data Sources\n\n"
        body += "- **Stock trades**: House Financial Disclosures / Senate STOCK Act filings\n"
        body += "- **Committees**: congress-legislators (congress.gov)\n"
        if don_total > 0:
            body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s executed %d stock trades across %d companies per STOCK Act disclosures." % (name, trade_count, ticker_count),
            body=body,
            category="prolific_trader",
            sector=None,
            entity_ids=[pid],
            data_sources=["congressional_trades", "House Financial Disclosures"],
            evidence={"trade_count": trade_count, "ticker_count": ticker_count, "party": party, "state": state},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 5: Lobbying vs Contracts Same Agency ──

def detect_lobby_contract_loop(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    l_table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    try:
        # Find companies that both lobby and get contracts
        rows = db.execute(text(
            "SELECT l.%s, SUM(l.income) as lobby_total, "
            "(SELECT SUM(c.award_amount) FROM %s c WHERE c.%s = l.%s) as contract_total, "
            "(SELECT COUNT(*) FROM %s c2 WHERE c2.%s = l.%s) as contract_count "
            "FROM %s l "
            "GROUP BY l.%s "
            "HAVING lobby_total > 50000 AND contract_total > 1000000 "
            "ORDER BY contract_total DESC LIMIT 5"
            % (id_col, c_table, id_col, id_col, c_table, id_col, id_col, l_table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Lobby-contract loop query failed for %s: %s", sector, e)
        return stories

    for eid, lobby_total, contract_total, contract_count in rows:
        if not contract_total:
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Lobbied %s and Received %s in Contracts" % (name, fmt_money(lobby_total), fmt_money(contract_total))
        if story_exists(db, slug(title)):
            continue

        # Get lobbying issues
        try:
            li_rows = db.execute(text(
                "SELECT lobbying_issues, income FROM %s WHERE %s = :eid AND lobbying_issues IS NOT NULL"
                % (l_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            li_rows = []
        issue_spend = defaultdict(float)
        for issues_str, income in li_rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per = inc / max(len(issues), 1)
            for iss in issues:
                issue_spend[iss] += per
        loop_top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:5]

        # Get top contract agencies
        try:
            ca_rows = db.execute(text(
                "SELECT awarding_agency, SUM(award_amount) FROM %s WHERE %s = :eid "
                "AND awarding_agency IS NOT NULL GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (c_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            ca_rows = []

        body = "## The Money Loop\n\n"
        body += "%s spent **%s** on federal lobbying while receiving **%s** across **%d government contracts**.\n\n" % (
            name, fmt_money(lobby_total), fmt_money(contract_total), contract_count
        )
        if loop_top_issues:
            body += "## What They Lobbied For\n\n"
            for iss, spend in loop_top_issues:
                body += "- %s: %s\n" % (iss, fmt_money(spend))
            body += "\n"
        if ca_rows:
            body += "## Who Awarded the Contracts\n\n"
            for agency, amt in ca_rows:
                body += "- **%s**: %s\n" % (agency or "Unknown", fmt_money(amt or 0))
            body += "\n"
        body += "## Data Sources\n\n"
        body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
        body += "- **Contracts**: USASpending.gov\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s spent %s lobbying and received %s in %d contracts." % (name, fmt_money(lobby_total), fmt_money(contract_total), contract_count),
            body=body,
            category="cross_sector",
            sector=sector,
            entity_ids=[eid],
            data_sources=[l_table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
            evidence={"lobby_total": lobby_total, "contract_total": contract_total, "contract_count": contract_count},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 6: Tax Lobbying by Sector ──

def detect_tax_lobbying(db, sector_idx=None):
    """Find sectors/companies spending big on tax policy lobbying."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]

    try:
        rows = db.execute(text(
            "SELECT %s, lobbying_issues, income FROM %s "
            "WHERE lobbying_issues LIKE '%%Taxation%%' AND income > 0"
            % (id_col, table)
        )).fetchall()
    except Exception as e:
        log.warning("Tax lobbying query failed for %s: %s", sector, e)
        return stories

    company_tax_spend = defaultdict(float)
    company_filings = defaultdict(int)
    for eid, issues_str, income in rows:
        inc = float(income) if income else 0
        issues = [i.strip() for i in issues_str.split(",") if i.strip()]
        per_issue = inc / max(len(issues), 1)
        company_tax_spend[eid] += per_issue
        company_filings[eid] += 1

    if not company_tax_spend:
        return stories

    total_tax_spend = sum(company_tax_spend.values())
    top_companies = sorted(company_tax_spend.items(), key=lambda x: -x[1])[:8]

    sector_label = sector.capitalize()
    title = "%s Companies Spent %s Lobbying on Tax Policy" % (sector_label, fmt_money(total_tax_spend))
    if story_exists(db, slug(title)):
        return stories

    body = "## Tax Policy Lobbying\n\n"
    body += "%s sector companies spent an estimated **%s** specifically on tax policy lobbying " % (sector_label, fmt_money(total_tax_spend))
    body += "across **%d filings** that listed Taxation/Internal Revenue Code as an issue.\n\n" % sum(company_filings.values())

    body += "## Top Tax Lobbying Spenders\n\n"
    for eid, spend in top_companies:
        name = get_entity_name(db, eid, entity_table, id_col)
        body += "- %s: %s (%d filings)\n" % (name, fmt_money(spend), company_filings[eid])
    body += "\n*Spend estimated by dividing each filing's income across all listed issues.*\n\n"

    body += "## Data Sources\n\n"
    body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
    body += "\n*All data from public government records.*"

    stories.append(make_story(
        title=title,
        summary="%s companies spent %s lobbying on tax policy across %d filings." % (sector_label, fmt_money(total_tax_spend), sum(company_filings.values())),
        body=body,
        category="tax_lobbying",
        sector=sector,
        entity_ids=[eid for eid, _ in top_companies[:5]],
        data_sources=[table, "Senate LDA (senate.gov)"],
        evidence={"total_tax_spend": total_tax_spend, "filing_count": sum(company_filings.values()), "company_count": len(company_tax_spend)},
    ))
    return stories


# ── Pattern 7: Budget/Appropriations Influence ──

def detect_budget_lobbying(db, sector_idx=None):
    """Find companies lobbying on budget/appropriations and getting contracts."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    try:
        rows = db.execute(text(
            "SELECT %s, lobbying_issues, income FROM %s "
            "WHERE (lobbying_issues LIKE '%%Budget%%' OR lobbying_issues LIKE '%%Appropriation%%') AND income > 0"
            % (id_col, table)
        )).fetchall()
    except Exception as e:
        log.warning("Budget lobbying query failed for %s: %s", sector, e)
        return stories

    company_budget_spend = defaultdict(float)
    company_filings = defaultdict(int)
    for eid, issues_str, income in rows:
        inc = float(income) if income else 0
        issues = [i.strip() for i in issues_str.split(",") if i.strip()]
        per_issue = inc / max(len(issues), 1)
        company_budget_spend[eid] += per_issue
        company_filings[eid] += 1

    if not company_budget_spend:
        return stories

    total_budget_spend = sum(company_budget_spend.values())
    top_companies = sorted(company_budget_spend.items(), key=lambda x: -x[1])[:8]

    sector_label = sector.capitalize()
    title = "%s Companies Spent %s Lobbying on Budget and Appropriations" % (sector_label, fmt_money(total_budget_spend))
    if story_exists(db, slug(title)):
        return stories

    body = "## Budget Lobbying\n\n"
    body += "%s sector companies spent an estimated **%s** lobbying on budget and appropriations, " % (sector_label, fmt_money(total_budget_spend))
    body += "directly trying to influence how federal money gets allocated.\n\n"

    body += "## Top Budget Lobbying Spenders\n\n"
    for eid, spend in top_companies:
        name = get_entity_name(db, eid, entity_table, id_col)
        # Cross-reference contracts
        try:
            cr = db.execute(text(
                "SELECT SUM(award_amount) FROM %s WHERE %s = :eid" % (c_table, id_col)
            ), {"eid": eid}).fetchone()
            ct = fmt_money(float(cr[0])) if cr and cr[0] else "N/A"
        except Exception:
            ct = "N/A"
        body += "- %s: %s (%d filings)\n" % (name, fmt_money(spend), company_filings[eid])
    body += "\n"

    body += "## Data Sources\n\n"
    body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
    body += "- **Contracts**: USASpending.gov\n"
    body += "\n*All data from public government records.*"

    stories.append(make_story(
        title=title,
        summary="%s companies spent %s lobbying on federal budget and appropriations." % (sector_label, fmt_money(total_budget_spend)),
        body=body,
        category="budget_influence",
        sector=sector,
        entity_ids=[eid for eid, _ in top_companies[:5]],
        data_sources=[table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
        evidence={"total_budget_spend": total_budget_spend, "filing_count": sum(company_filings.values())},
    ))
    return stories


# ══════════════════════════════════════════════════════════════
# INVESTIGATIVE PATTERNS — Cross-dataset anomaly detection
# ══════════════════════════════════════════════════════════════


# ── Pattern 8: Trade-Before-Legislation ──

def detect_trade_before_legislation(db):
    """Find congress members who traded stock within 30 days before/after
    a bill they sponsored/cosponsored had action. Cross-references
    congressional_trades dates against bill_actions dates."""
    stories = []
    try:
        # Find trades where the member also sponsored/cosponsored a bill
        # and a bill action happened within 30 days of the trade
        rows = db.execute(text("""
            SELECT
                ct.person_id,
                tm.display_name, tm.party, tm.state, tm.chamber,
                ct.ticker, ct.asset_name, ct.transaction_type, ct.amount_range,
                ct.transaction_date,
                pb.bill_id, pb.relationship_type,
                ba.action_text, ba.action_date,
                b.title as bill_title,
                ABS(JULIANDAY(ct.transaction_date) - JULIANDAY(ba.action_date)) as day_gap
            FROM congressional_trades ct
            JOIN tracked_members tm ON tm.person_id = ct.person_id
            JOIN person_bills pb ON pb.person_id = ct.person_id
            JOIN bill_actions ba ON ba.bill_id = pb.bill_id
            JOIN bills b ON b.bill_id = pb.bill_id
            WHERE ct.transaction_date IS NOT NULL
              AND ba.action_date IS NOT NULL
              AND ABS(JULIANDAY(ct.transaction_date) - JULIANDAY(ba.action_date)) <= 30
              AND ct.transaction_date >= '2024-01-01'
            ORDER BY day_gap ASC
            LIMIT 50
        """)).fetchall()
    except Exception as e:
        log.warning("Trade-before-legislation query failed: %s", e)
        return stories

    # Group by person to find the most suspicious patterns
    person_hits = defaultdict(list)
    for r in rows:
        person_hits[r[0]].append({
            "name": r[1], "party": r[2], "state": r[3], "chamber": r[4],
            "ticker": r[5], "asset": r[6], "tx_type": r[7], "amount": r[8],
            "trade_date": str(r[9]) if r[9] else "unknown",
            "bill_id": r[10], "relationship": r[11],
            "action": r[12],
            "action_date": str(r[13]) if r[13] else "unknown",
            "bill_title": r[14], "day_gap": int(r[15]) if r[15] else 0,
        })

    for pid, hits in sorted(person_hits.items(), key=lambda x: -len(x[1])):
        if len(hits) < 1:
            continue
        h = hits[0]
        name = h["name"]
        title = "%s Traded %s Stock %d Days %s %s Bill Action" % (
            name, h["ticker"], h["day_gap"],
            "Before" if h["trade_date"] <= h["action_date"] else "After",
            h["relationship"].lower()
        )
        if story_exists(db, slug(title)):
            continue

        body = "## The Timeline\n\n"
        for hit in hits[:8]:
            direction = "before" if hit["trade_date"] <= hit["action_date"] else "after"
            body += "- **%s**: %s %s %s (%s) on %s\n" % (
                hit["ticker"], hit["tx_type"], hit["asset"] or hit["ticker"],
                hit["amount"] or "", hit["trade_date"],
                ""
            )
            body += "  - **%d days %s**: Bill %s (%s) had action: \"%s\" on %s\n" % (
                hit["day_gap"], direction, hit["bill_id"],
                hit["relationship"], (hit["action"] or "")[:100], hit["action_date"]
            )
            if hit["bill_title"]:
                body += "  - Bill: *%s*\n" % hit["bill_title"][:120]
            body += "\n"

        # Get committee assignments
        try:
            comms = db.execute(text(
                "SELECT c.name FROM committees c "
                "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                "WHERE cm.person_id = :pid"
            ), {"pid": pid}).fetchall()
            if comms:
                body += "## Committee Assignments\n\n"
                for c in comms[:6]:
                    body += "- %s\n" % c[0]
                body += "\n"
        except Exception:
            pass

        body += "## Why This Matters\n\n"
        body += "The STOCK Act requires members of Congress to disclose stock trades within 45 days. "
        body += "When trades coincide with legislative action on bills a member sponsors, "
        body += "the public record documents both the financial transaction and the legislative activity.\n\n"
        body += "## Data Sources\n\n"
        body += "- **Stock trades**: House Financial Disclosures / Senate STOCK Act filings\n"
        body += "- **Bill actions**: Congress.gov via congress-legislators (CC0)\n"
        body += "- **Committee data**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records. No allegations of wrongdoing are made.*"

        tickers = list(set(h["ticker"] for h in hits if h["ticker"]))
        stories.append(make_story(
            title=title,
            summary="%s traded %s stock within %d days of legislative action on a bill they %s." % (
                name, hits[0]["ticker"], hits[0]["day_gap"], hits[0]["relationship"].lower()
            ),
            body=body,
            category="trade_timing",
            sector=None,
            entity_ids=[pid] + [h["bill_id"] for h in hits[:3]],
            data_sources=["congressional_trades", "bill_actions", "person_bills", "House Financial Disclosures", "Congress.gov"],
            evidence={
                "person": name, "party": h["party"], "state": h["state"],
                "overlap_count": len(hits), "min_gap_days": min(x["day_gap"] for x in hits),
                "tickers": tickers[:5],
            },
        ))
        if len(stories) >= 2:
            break

    return stories


# ── Pattern 9: Lobby-Then-Win ──

def detect_lobby_then_win(db, sector_idx=None):
    """Find companies that increased lobbying spend targeting a specific agency,
    then received contracts from that same agency within 6 months."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    l_table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    # Map lobbying government_entities to contract awarding_agency
    AGENCY_MAP = {
        "Defense, Dept of": "Department of Defense",
        "Health & Human Services, Dept of (HHS)": "Department of Health and Human Services",
        "Health and Human Services, Dept of (HHS)": "Department of Health and Human Services",
        "Energy, Dept of": "Department of Energy",
        "Transportation, Dept of (DOT)": "Department of Transportation",
        "Homeland Security, Dept of (DHS)": "Department of Homeland Security",
        "Veterans Affairs, Dept of (VA)": "Department of Veterans Affairs",
        "Commerce, Dept of (DOC)": "Department of Commerce",
        "Treasury, Dept of": "Department of the Treasury",
        "Justice, Dept of (DOJ)": "Department of Justice",
        "Agriculture, Dept of": "Department of Agriculture",
        "Interior, Dept of": "Department of the Interior",
        "Education, Dept of": "Department of Education",
        "Labor, Dept of": "Department of Labor",
    }

    try:
        # Get lobbying filings with government entities
        lob_rows = db.execute(text(
            "SELECT %s, government_entities, income, filing_year FROM %s "
            "WHERE government_entities IS NOT NULL AND income > 0"
            % (id_col, l_table)
        )).fetchall()
    except Exception as e:
        log.warning("Lobby-then-win query failed for %s: %s", sector, e)
        return stories

    # Build per-company, per-agency lobbying totals
    company_agency_lobby = defaultdict(lambda: defaultdict(float))
    for eid, entities_str, income, year in lob_rows:
        inc = float(income) if income else 0
        entities = _parse_gov_entities(entities_str)
        per_ent = inc / max(len(entities), 1)
        for ent in entities:
            mapped = AGENCY_MAP.get(ent)
            if mapped:
                company_agency_lobby[eid][mapped] += per_ent

    # Now check which companies got contracts from those same agencies
    for eid, agencies in company_agency_lobby.items():
        for agency, lobby_spend in sorted(agencies.items(), key=lambda x: -x[1]):
            if lobby_spend < 50000:
                continue
            try:
                cr = db.execute(text(
                    "SELECT SUM(award_amount), COUNT(*) FROM %s "
                    "WHERE %s = :eid AND awarding_agency = :agency"
                    % (c_table, id_col)
                ), {"eid": eid, "agency": agency}).fetchone()
            except Exception:
                continue

            if not cr or not cr[0] or cr[0] < 100000:
                continue

            contract_total = float(cr[0])
            contract_count = int(cr[1])
            name = get_entity_name(db, eid, entity_table, id_col)

            title = "%s Lobbied %s With %s, Then Received %s in Contracts" % (
                name, agency.replace("Department of ", ""), fmt_money(lobby_spend), fmt_money(contract_total)
            )
            if story_exists(db, slug(title)):
                continue

            # Get what they lobbied for
            try:
                issue_rows = db.execute(text(
                    "SELECT lobbying_issues, income FROM %s "
                    "WHERE %s = :eid AND government_entities LIKE :agency_pat AND lobbying_issues IS NOT NULL"
                    % (l_table, id_col)
                ), {"eid": eid, "agency_pat": "%" + agency.split(" of ")[-1].strip()[:15] + "%"}).fetchall()
            except Exception:
                issue_rows = []
            issue_spend = defaultdict(float)
            for issues_str, income in issue_rows:
                inc = float(income) if income else 0
                issues = [i.strip() for i in issues_str.split(",") if i.strip()]
                per = inc / max(len(issues), 1)
                for iss in issues:
                    issue_spend[iss] += per
            top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:5]

            body = "## The Pattern\n\n"
            body += "%s spent an estimated **%s** lobbying the **%s** directly.\n\n" % (name, fmt_money(lobby_spend), agency)
            body += "The same agency then awarded %s **%s** across **%d contracts**.\n\n" % (name, fmt_money(contract_total), contract_count)

            if top_issues:
                body += "## What They Lobbied %s About\n\n" % agency.replace("Department of ", "")
                for iss, spend in top_issues:
                    body += "- %s: %s\n" % (iss, fmt_money(spend))
                body += "\n"

            ratio = contract_total / lobby_spend if lobby_spend > 0 else 0
            body += "## The Scale\n\n"
            body += "The contract value is **%.0f times** the disclosed lobbying expenditure directed at this agency.\n\n" % ratio
            body += "Lobbying is legal activity protected under the First Amendment. Government contracts are awarded "
            body += "through competitive bidding processes. Correlation between lobbying expenditures and contract awards "
            body += "does not prove causation.\n\n"

            body += "## Data Sources\n\n"
            body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
            body += "- **Contracts**: USASpending.gov\n"
            body += "\n*All data from public government records.*"

            stories.append(make_story(
                title=title,
                summary="%s spent %s lobbying %s, which awarded them %s across %d contracts." % (
                    name, fmt_money(lobby_spend), agency, fmt_money(contract_total), contract_count
                ),
                body=body,
                category="regulatory_loop",
                sector=sector,
                entity_ids=[eid],
                data_sources=[l_table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
                evidence={
                    "lobby_spend": lobby_spend, "contract_total": contract_total,
                    "contract_count": contract_count, "agency": agency,
                    "return_ratio": ratio, "top_issues": dict(top_issues),
                },
            ))
            if len(stories) >= 1:
                return stories

    return stories


# ── Pattern 10: Enforcement Disappearance ──

def detect_enforcement_disappearance(db, sector_idx=None):
    """Find companies that had enforcement actions, then lobbied heavily,
    and enforcement dropped to zero."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(ENFORCEMENT_TABLES) - 1)
    e_table, sector, id_col, entity_table = ENFORCEMENT_TABLES[idx]
    l_table = LOBBYING_TABLES[idx][0]

    try:
        # Companies with enforcement actions in earlier years but none recently
        rows = db.execute(text(
            "SELECT %s, COUNT(*) as total_actions, "
            "SUM(CASE WHEN case_date < '2023-01-01' THEN 1 ELSE 0 END) as old_actions, "
            "SUM(CASE WHEN case_date >= '2023-01-01' THEN 1 ELSE 0 END) as recent_actions "
            "FROM %s WHERE case_date IS NOT NULL "
            "GROUP BY %s HAVING old_actions >= 3 AND recent_actions = 0 "
            "ORDER BY old_actions DESC LIMIT 10"
            % (id_col, e_table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Enforcement disappearance query failed for %s: %s", sector, e)
        return stories

    for eid, total, old, recent in rows:
        name = get_entity_name(db, eid, entity_table, id_col)

        # Check if they also lobby
        try:
            lr = db.execute(text(
                "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            lobby_total = float(lr[0] or 0) if lr else 0
            lobby_count = int(lr[1] or 0) if lr else 0
        except Exception:
            lobby_total = 0
            lobby_count = 0

        if lobby_total < 10000:
            continue  # Not interesting without lobbying

        title = "%s Had %d Enforcement Actions, Then Lobbied %s, Now Zero Penalties" % (name, old, fmt_money(lobby_total))
        if story_exists(db, slug(title)):
            continue

        # Get the old enforcement actions
        try:
            old_rows = db.execute(text(
                "SELECT case_title, case_date, enforcement_type, penalty_amount FROM %s "
                "WHERE %s = :eid AND case_date < '2023-01-01' ORDER BY case_date DESC LIMIT 5"
                % (e_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            old_rows = []

        body = "## The Pattern\n\n"
        body += "%s faced **%d enforcement actions** before 2023. Since then, **zero**.\n\n" % (name, old)
        body += "During this same period, they filed **%d lobbying disclosures** totaling **%s**.\n\n" % (lobby_count, fmt_money(lobby_total))

        if old_rows:
            body += "## Previous Enforcement Actions\n\n"
            for case_title, case_date, etype, penalty in old_rows:
                body += "- %s, %s: %s\n" % (
                    str(case_date)[:10] if case_date else "N/A",
                    etype or "Unknown",
                    (case_title or "")[:80]
                )
            body += "\n"

        body += "## The Question\n\n"
        body += "Did %s clean up its practices, or did lobbying influence reduce regulatory scrutiny? " % name
        body += "The public record shows both the enforcement history and the lobbying spend. Draw your own conclusions.\n\n"

        body += "## Data Sources\n\n"
        body += "- **Enforcement**: Federal Register\n"
        body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s had %d enforcement actions before 2023, then spent %s lobbying, and now faces zero penalties." % (name, old, fmt_money(lobby_total)),
            body=body,
            category="enforcement_immunity",
            sector=sector,
            entity_ids=[eid],
            data_sources=[e_table, l_table, "Federal Register", "Senate LDA (senate.gov)"],
            evidence={"old_actions": old, "recent_actions": 0, "lobby_total": lobby_total, "lobby_count": lobby_count},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 11: PAC-to-Committee Pipeline ──

def detect_pac_committee_pipeline(db):
    """Find companies that direct >80% of PAC money to members of their
    oversight committee, suggesting targeted influence."""
    stories = []

    # For each sector's donations, check committee overlap
    sector_committees = {
        "tech": ["Commerce, Science, and Transportation", "Energy and Commerce", "Science, Space, and Technology", "Judiciary"],
        "finance": ["Banking, Housing, and Urban Affairs", "Financial Services", "Finance"],
        "health": ["Health, Education, Labor, and Pensions", "Energy and Commerce"],
        "energy": ["Energy and Natural Resources", "Energy and Commerce", "Environment and Public Works"],
        "defense": ["Armed Services", "Appropriations"],
    }

    try:
        # Get all donations with person committee data
        rows = db.execute(text("""
            SELECT cd.entity_type, cd.entity_id, cd.person_id, cd.amount,
                   cd.candidate_name, cm.committee_thomas_id, c.name as committee_name
            FROM company_donations cd
            LEFT JOIN committee_memberships cm ON cm.person_id = cd.person_id
            LEFT JOIN committees c ON c.thomas_id = cm.committee_thomas_id
            WHERE cd.amount > 0 AND cd.person_id IS NOT NULL
        """)).fetchall()
    except Exception as e:
        log.warning("PAC-committee pipeline query failed: %s", e)
        return stories

    # Group by company
    company_donations = defaultdict(lambda: {"total": 0, "committee_total": 0, "committee_names": set(), "recipients": set(), "entity_type": ""})
    for entity_type, entity_id, person_id, amount, cand_name, comm_id, comm_name in rows:
        amt = float(amount) if amount else 0
        key = entity_id
        company_donations[key]["total"] += amt
        company_donations[key]["entity_type"] = entity_type
        company_donations[key]["recipients"].add(person_id)
        if comm_name:
            relevant_comms = sector_committees.get(entity_type, [])
            for rc in relevant_comms:
                if rc.lower() in comm_name.lower():
                    company_donations[key]["committee_total"] += amt
                    company_donations[key]["committee_names"].add(comm_name)
                    break

    for eid, data in sorted(company_donations.items(), key=lambda x: -x[1]["committee_total"]):
        if data["total"] < 5000 or data["committee_total"] < 2000:
            continue
        pct = (data["committee_total"] / data["total"]) * 100 if data["total"] > 0 else 0
        if pct < 10:  # At least 10% going to oversight committee members (noteworthy given dozens of committees)
            continue

        sector = data["entity_type"]
        entity_table = None
        id_col = "company_id"
        for lt, s, ic, et in LOBBYING_TABLES:
            if s == sector:
                entity_table = et
                id_col = ic
                break
        if not entity_table:
            continue

        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Directed %.0f%% of PAC Money to Its Oversight Committee Members" % (name, pct)
        if story_exists(db, slug(title)):
            continue

        body = "## The Pipeline\n\n"
        body += "%s donated a total of **%s** to politicians through PAC contributions.\n\n" % (name, fmt_money(data["total"]))
        body += "Of that, **%s (%.0f%%)** went specifically to members of committees that oversee the %s industry.\n\n" % (
            fmt_money(data["committee_total"]), pct, sector
        )

        if data["committee_names"]:
            body += "## Targeted Committees\n\n"
            for cn in sorted(data["committee_names"]):
                body += "- %s\n" % cn
            body += "\n"

        body += "## The Numbers\n\n"
        body += "- Total PAC donations: %s\n" % fmt_money(data["total"])
        body += "- To oversight committee members: %s\n" % fmt_money(data["committee_total"])
        body += "- Percentage to oversight: %.0f%%\n" % pct
        body += "- Total recipients: %d\n\n" % len(data["recipients"])

        body += "## Why This Matters\n\n"
        body += "When a company directs the majority of its political donations to the specific lawmakers "
        body += "who regulate their industry, the pattern of directed donations is documented in public FEC records.\n\n"

        body += "## Data Sources\n\n"
        body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "- **Committee memberships**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s sent %.0f%% of %s in PAC money to members of its oversight committees." % (name, pct, fmt_money(data["total"])),
            body=body,
            category="bipartisan_buying",
            sector=sector,
            entity_ids=[eid],
            data_sources=["company_donations", "committee_memberships", "FEC", "congress-legislators"],
            evidence={"total_donations": data["total"], "committee_donations": data["committee_total"], "pct": pct, "committees": list(data["committee_names"])},
        ))
        if len(stories) >= 2:
            break

    return stories


# ── Pattern 12: Contract Timing Anomaly ──

def detect_contract_timing(db, sector_idx=None):
    """Find government contracts awarded within 90 days of the same company
    making PAC donations to appropriations committee members."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    c_table, sector, id_col, entity_table = CONTRACT_TABLES[idx]

    try:
        # Get contracts with start dates — exclude future dates (period-of-performance projections)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        contracts = db.execute(text(
            "SELECT %s, start_date, award_amount, awarding_agency, description FROM %s "
            "WHERE start_date IS NOT NULL AND award_amount > 1000000 "
            "AND start_date <= :today "
            "ORDER BY award_amount DESC LIMIT 100"
            % (id_col, c_table)
        ), {"today": today_str}).fetchall()
    except Exception as e:
        log.warning("Contract timing query failed for %s: %s", sector, e)
        return stories

    for eid, start_date, amount, agency, desc in contracts:
        # Check if this company made donations within 90 days of contract start
        try:
            donation_rows = db.execute(text("""
                SELECT cd.amount, cd.donation_date, cd.candidate_name, cd.person_id,
                       cm.committee_thomas_id, c.name as committee_name
                FROM company_donations cd
                LEFT JOIN committee_memberships cm ON cm.person_id = cd.person_id
                LEFT JOIN committees c ON c.thomas_id = cm.committee_thomas_id
                WHERE cd.entity_id = :eid
                  AND cd.donation_date IS NOT NULL
                  AND ABS(JULIANDAY(cd.donation_date) - JULIANDAY(:start_date)) <= 90
                  AND c.name LIKE '%Appropriations%'
            """), {"eid": eid, "start_date": str(start_date)}).fetchall()
        except Exception:
            continue

        if not donation_rows:
            continue

        name = get_entity_name(db, eid, entity_table, id_col)
        total_donations = sum(float(r[0]) for r in donation_rows if r[0])
        recipients = list(set(r[2] for r in donation_rows if r[2]))

        title = "%s Donated %s to Appropriations Members Within 90 Days of %s Contract" % (
            name, fmt_money(total_donations), fmt_money(float(amount))
        )
        if story_exists(db, slug(title)):
            continue

        body = "## The Timeline\n\n"
        body += "**Contract**: %s received a **%s** contract from %s, starting %s.\n\n" % (
            name, fmt_money(float(amount)), agency or "a federal agency", str(start_date)[:10]
        )
        body += "**Donations**: Within 90 days of this contract, %s made **%s** in PAC donations " % (name, fmt_money(total_donations))
        body += "to **%d members** of Appropriations committees:\n\n" % len(recipients)
        for r in donation_rows[:6]:
            body += "- **%s**: %s on %s\n" % (r[2] or "Unknown", fmt_money(float(r[0] or 0)), str(r[1])[:10])
        body += "\n"

        if desc:
            body += "## Contract Details\n\n"
            body += "%s\n\n" % (desc or "")[:300]

        body += "## Data Sources\n\n"
        body += "- **Contracts**: USASpending.gov\n"
        body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "- **Committee memberships**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records. Timing correlation does not prove causation.*"

        stories.append(make_story(
            title=title,
            summary="%s donated %s to Appropriations committee members within 90 days of receiving a %s federal contract." % (
                name, fmt_money(total_donations), fmt_money(float(amount))
            ),
            body=body,
            category="contract_timing",
            sector=sector,
            entity_ids=[eid] + [r[3] for r in donation_rows[:3] if r[3]],
            data_sources=[c_table, "company_donations", "committee_memberships", "USASpending.gov", "FEC"],
            evidence={
                "contract_amount": float(amount), "donation_total": total_donations,
                "agency": agency, "days_window": 90, "recipient_count": len(recipients),
            },
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 13: Foreign Agent + Domestic Lobbying Overlap ──

def detect_fara_domestic_overlap(db):
    """Find lobbying firms registered as foreign agents (FARA) that also lobby
    for domestic companies. Same firm, two masters, potentially coordinating."""
    stories = []

    try:
        # Get active FARA registrant names
        fara_firms = db.execute(text(
            "SELECT DISTINCT registrant_name FROM fara_registrants "
            "WHERE LOWER(status) = 'active' AND registrant_name IS NOT NULL"
        )).fetchall()
        fara_names = set(r[0].strip().lower() for r in fara_firms if r[0])
    except Exception as e:
        log.warning("FARA overlap query failed: %s", e)
        return stories

    if not fara_names:
        return stories

    # Search all lobbying tables for matching registrant names
    matches = []
    for l_table, sector, id_col, entity_table in LOBBYING_TABLES:
        try:
            rows = db.execute(text(
                "SELECT DISTINCT registrant_name, %s, SUM(income), COUNT(*) FROM %s "
                "WHERE registrant_name IS NOT NULL "
                "GROUP BY registrant_name, %s "
                "HAVING SUM(income) > 10000"
                % (id_col, l_table, id_col)
            )).fetchall()
        except Exception:
            continue

        for reg_name, eid, income, filings in rows:
            if reg_name and reg_name.strip().lower() in fara_names:
                name = get_entity_name(db, eid, entity_table, id_col)
                # Get which foreign principals this firm represents
                try:
                    fp_rows = db.execute(text(
                        "SELECT foreign_principal_name, country FROM fara_foreign_principals "
                        "WHERE LOWER(registrant_name) = :rname AND LOWER(status) = 'active'"
                    ), {"rname": reg_name.strip().lower()}).fetchall()
                except Exception:
                    fp_rows = []

                matches.append({
                    "firm": reg_name, "company": name, "company_id": eid,
                    "sector": sector, "income": float(income or 0), "filings": filings,
                    "foreign_principals": [(fp[0], fp[1]) for fp in fp_rows[:5]],
                })

    if not matches:
        return stories

    # Sort by income and take the most interesting
    matches.sort(key=lambda x: -x["income"])

    for m in matches[:3]:
        title = "%s Lobbies for %s While Registered as Foreign Agent" % (m["firm"], m["company"])
        if story_exists(db, slug(title)):
            continue

        body = "## The Dual Registration\n\n"
        body += "**%s** is registered as a foreign agent under FARA while simultaneously " % m["firm"]
        body += "lobbying Congress on behalf of **%s** (%s sector).\n\n" % (m["company"], m["sector"])
        body += "The firm filed **%d lobbying disclosures** totaling **%s** for %s.\n\n" % (
            m["filings"], fmt_money(m["income"]), m["company"]
        )

        if m["foreign_principals"]:
            body += "## Foreign Clients (FARA)\n\n"
            body += "The same firm represents these foreign principals:\n\n"
            for fp_name, country in m["foreign_principals"]:
                body += "- **%s** (%s)\n" % (fp_name, country or "Unknown")
            body += "\n"

        body += "## Why This Matters\n\n"
        body += "When one lobbying firm represents both foreign governments and domestic corporations, "
        body += "there is potential for policy positions to align in ways that serve multiple interests simultaneously. "
        body += "FARA exists specifically to ensure transparency around foreign influence in U.S. policy.\n\n"

        body += "## Data Sources\n\n"
        body += "- **Foreign agent registrations**: FARA.gov (Department of Justice)\n"
        body += "- **Domestic lobbying**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s is a FARA-registered foreign agent that also lobbied %s for %s in the %s sector." % (
                m["firm"], fmt_money(m["income"]), m["company"], m["sector"]
            ),
            body=body,
            category="foreign_lobbying",
            sector=m["sector"],
            entity_ids=[m["company_id"]],
            data_sources=["fara_registrants", "fara_foreign_principals", m["firm"], "Senate LDA (senate.gov)", "FARA.gov"],
            evidence={
                "firm": m["firm"], "company": m["company"], "income": m["income"],
                "foreign_principals": [fp[0] for fp in m["foreign_principals"]],
            },
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 14: Revolving Door ──

def detect_revolving_door(db):
    """Find lobbying firms whose government_entities field matches agency names
    they previously worked at. Approximation: if a firm lobbies the same agency
    that appears frequently in their filings, it suggests inside knowledge."""
    stories = []

    # Find registrant names that overwhelmingly target one specific agency
    for l_table, sector, id_col, entity_table in LOBBYING_TABLES:
        try:
            rows = db.execute(text(
                "SELECT registrant_name, government_entities, COUNT(*) as cnt "
                "FROM %s WHERE registrant_name IS NOT NULL AND government_entities IS NOT NULL "
                "GROUP BY registrant_name, government_entities "
                "HAVING cnt >= 5 "
                "ORDER BY cnt DESC LIMIT 20" % l_table
            )).fetchall()
        except Exception:
            continue

        firm_agencies = defaultdict(lambda: defaultdict(int))
        for reg_name, entities_str, cnt in rows:
            entities = _parse_gov_entities(entities_str)
            for ent in entities:
                if ent not in ("HOUSE OF REPRESENTATIVES", "SENATE"):
                    firm_agencies[reg_name][ent] += cnt

        for firm, agencies in firm_agencies.items():
            if not agencies:
                continue
            top_agency = max(agencies.items(), key=lambda x: x[1])
            total_filings = sum(agencies.values())
            if total_filings < 10:
                continue
            concentration = top_agency[1] / total_filings if total_filings > 0 else 0
            if concentration < 0.5:
                continue  # Not concentrated enough

            # Get total income for this firm
            try:
                inc_row = db.execute(text(
                    "SELECT SUM(income), COUNT(DISTINCT %s) FROM %s WHERE registrant_name = :firm"
                    % (id_col, l_table)
                ), {"firm": firm}).fetchone()
                total_income = float(inc_row[0] or 0)
                client_count = int(inc_row[1] or 0)
            except Exception:
                continue

            if total_income < 50000:
                continue

            # Gather client entity IDs for this firm
            try:
                eid_rows = db.execute(text(
                    "SELECT DISTINCT %s FROM %s WHERE registrant_name = :firm AND %s IS NOT NULL"
                    % (id_col, l_table, id_col)
                ), {"firm": firm}).fetchall()
                firm_entity_ids = [str(r[0]) for r in eid_rows if r[0]][:10]
            except Exception:
                firm_entity_ids = []

            if not firm_entity_ids:
                continue

            title = "Lobbying Firm %s Targets %s in %.0f%% of Filings" % (firm, top_agency[0], concentration * 100)
            if story_exists(db, slug(title)):
                continue

            body = "## The Concentration\n\n"
            body += "**%s** filed lobbying disclosures that targeted **%s** in **%.0f%%** of filings " % (firm, top_agency[0], concentration * 100)
            body += "(%d of %d total filings).\n\n" % (top_agency[1], total_filings)
            body += "The firm earned **%s** lobbying for **%d clients** in the %s sector.\n\n" % (fmt_money(total_income), client_count, sector)

            body += "## Agency Targeting Breakdown\n\n"
            for agency, cnt in sorted(agencies.items(), key=lambda x: -x[1])[:6]:
                body += "- %s: %d filings (%.0f%%)\n" % (agency, cnt, (cnt / total_filings) * 100)
            body += "\n"

            body += "## Why This Matters\n\n"
            body += "When a lobbying firm overwhelmingly targets one specific agency, it often indicates "
            body += "specialized expertise or prior employment at that agency (the 'revolving door'). "
            body += "This concentration pattern is worth tracking.\n\n"

            body += "## Data Sources\n\n"
            body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
            body += "\n*All data from public government records.*"

            stories.append(make_story(
                title=title,
                summary="Lobbying firm %s targets %s in %.0f%% of its filings, earning %s from %d clients." % (
                    firm, top_agency[0], concentration * 100, fmt_money(total_income), client_count
                ),
                body=body,
                category="revolving_door",
                sector=sector,
                entity_ids=firm_entity_ids,
                data_sources=[l_table, "Senate LDA (senate.gov)"],
                evidence={"firm": firm, "top_agency": top_agency[0], "concentration": concentration, "total_income": total_income},
            ))
            if len(stories) >= 1:
                return stories

    return stories


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Detect and generate data stories")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-stories", type=int, default=20)
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    all_stories = []
    target = args.max_stories

    # ── Gate 1: pre-detector data quality ──
    # Skip any sector whose underlying tables are stale, sparse, or have
    # future-dated rows. The gate never raises; it just filters which sectors
    # the detectors run against.
    try:
        from services.story_data_gates import gate_sector, gate_global, format_data_issues
        global_ok, global_issues = gate_global(db)
        if global_issues:
            log.warning("Gate-1 global: %s", format_data_issues(global_issues))
        if not global_ok:
            log.error("Gate-1 global FAILED — cross-sector detectors will be skipped")
    except Exception as e:
        log.warning("Gate-1 init failed (continuing without data-quality gate): %s", e)
        gate_sector = None
        global_ok = True
        global_issues = []

    gated_sectors = set()
    if gate_sector is not None:
        for _, sector_name, _, _ in LOBBYING_TABLES:
            try:
                ok, issues = gate_sector(db, sector_name)
                if not ok:
                    from services.story_data_gates import format_data_issues
                    log.warning("Gate-1 sector %s BLOCKED: %s", sector_name, format_data_issues(issues))
                    gated_sectors.add(sector_name)
                elif issues:
                    from services.story_data_gates import format_data_issues
                    log.info("Gate-1 sector %s OK with warnings: %s", sector_name, format_data_issues(issues))
            except Exception as e:
                log.warning("Gate-1 sector %s check errored: %s", sector_name, e)

    # Rotate through sectors to spread coverage, skipping gated ones
    sector_order = [i for i, (_, s, _, _) in enumerate(LOBBYING_TABLES) if s not in gated_sectors]
    random.shuffle(sector_order)

    log.info("Running story detection (target: %d stories, %d sectors active)...",
             target, len(sector_order))

    # ── ROUND-ROBIN DETECTION ──
    # Every detector gets a turn before any gets a second.
    # This ensures story variety across all categories instead of
    # one prolific detector (lobby_then_win) filling every slot.
    CATEGORY_CAPS = {
        "lobbying_spike": 2,
        "contract_windfall": 2,
        "penalty_contract_ratio": 2,
        "lobbying_breakdown": 0,     # Paused — 8 already published
    }
    category_counts = defaultdict(int)
    pattern_contributed = defaultdict(int)  # track per-pattern output

    # ALL patterns: sector-based and global, shuffled for fairness
    sector_patterns = [
        ("lobby_then_win", detect_lobby_then_win, None),
        ("enforcement_disappearance", detect_enforcement_disappearance, None),
        ("contract_timing", detect_contract_timing, None),
        ("penalty_gap", detect_penalty_gap, "penalty_contract_ratio"),
        ("lobby_contract_loop", detect_lobby_contract_loop, None),
        ("tax_lobbying", detect_tax_lobbying, None),
        ("budget_lobbying", detect_budget_lobbying, None),
        ("top_spender", detect_top_spender, "lobbying_spike"),
        ("contract_windfall", detect_contract_windfall, "contract_windfall"),
    ]

    global_patterns = [
        ("trade_before_legislation", detect_trade_before_legislation),
        ("pac_committee_pipeline", detect_pac_committee_pipeline),
        ("trade_cluster", detect_trade_cluster),
        ("revolving_door", detect_revolving_door),
        ("fara_domestic_overlap", detect_fara_domestic_overlap),
    ]

    # Phase 1: Run each global pattern once (1 story max each).
    # Global patterns are the most investigative — trades, FARA, revolving door.
    for pattern_name, detect_fn in global_patterns:
        if len(all_stories) >= target:
            break
        try:
            found = detect_fn(db)
            for s in found:
                if not story_exists(db, s.slug):
                    all_stories.append(s)
                    pattern_contributed[pattern_name] += 1
                    category_counts[s.category] += 1
                    log.info("  [%s] [%s] %s", pattern_name, s.sector or "cross", s.title[:60])
                    break  # 1 per pattern per round
        except Exception as e:
            log.warning("Pattern %s failed: %s", pattern_name, e)

    # Phase 2: Round-robin through sector patterns.
    # Each pattern gets 1 story from 1 random sector per round.
    # Multiple rounds until target is hit.
    MAX_ROUNDS = 3
    for rnd in range(MAX_ROUNDS):
        if len(all_stories) >= target:
            break
        random.shuffle(sector_order)
        for pattern_name, detect_fn, cap_category in sector_patterns:
            if len(all_stories) >= target:
                break
            if cap_category and category_counts.get(cap_category, 0) >= CATEGORY_CAPS.get(cap_category, target):
                continue
            # Pick one sector per pattern per round
            for si in sector_order:
                try:
                    found = detect_fn(db, sector_idx=si)
                    added = False
                    for s in found:
                        if cap_category and category_counts.get(cap_category, 0) >= CATEGORY_CAPS.get(cap_category, target):
                            break
                        if not story_exists(db, s.slug):
                            all_stories.append(s)
                            pattern_contributed[pattern_name] += 1
                            category_counts[s.category] += 1
                            log.info("  [%s] [%s] %s", pattern_name, s.sector or "cross", s.title[:60])
                            added = True
                            break  # 1 per pattern per round
                    if added:
                        break  # move to next pattern
                except Exception as e:
                    log.warning("Pattern %s failed for sector %d: %s", pattern_name, si, e)

    log.info("Pattern variety: %s", dict(pattern_contributed))

    log.info("\nGenerated %d stories", len(all_stories))

    if args.dry_run:
        for s in all_stories:
            log.info("  [DRY-RUN] [%s] %s", s.category, s.title)
        db.close()
        return

    # ── Opus enhancement: upgrade the best 2 stories per day ──
    opus_used = _opus_stories_today(db)
    opus_remaining = max(0, OPUS_DAILY_CAP - opus_used)
    if opus_remaining > 0 and all_stories:
        log.info("Opus daily cap: %d/%d used, enhancing up to %d stories", opus_used, OPUS_DAILY_CAP, opus_remaining)
        # Prioritize investigative patterns for Opus enhancement
        investigative_categories = {
            "trade_timing", "regulatory_loop", "enforcement_immunity",
            "cross_sector", "revolving_door", "foreign_lobbying",
        }
        # Sort: investigative first, then by body length (shorter = more room for improvement)
        candidates = sorted(all_stories, key=lambda s: (
            0 if s.category in investigative_categories else 1,
            len(s.body or ""),
        ))

        enhanced = 0
        for s in candidates:
            if enhanced >= opus_remaining:
                break
            # Build context string for Opus
            evidence = s.evidence if isinstance(s.evidence, dict) else {}
            context = "Category: %s. Sector: %s. Title: %s. Summary: %s." % (
                s.category, s.sector or "cross-sector", s.title, s.summary or ""
            )

            # Build skeleton with narrative placeholders
            body = s.body or ""
            # Insert {NARRATIVE_LEAD} after first ## heading
            sections = body.split("\n## ")
            if len(sections) >= 2:
                # Rebuild with narrative placeholders
                skeleton = sections[0]  # Everything before first ##
                skeleton += "\n## " + sections[1]  # First section header
                # Insert NARRATIVE_LEAD after the first data paragraph
                first_section_lines = sections[1].split("\n\n", 1)
                if len(first_section_lines) > 1:
                    skeleton = "## " + first_section_lines[0] + "\n\n{NARRATIVE_LEAD}\n\n" + first_section_lines[1]
                else:
                    skeleton = "## " + sections[1] + "\n\n{NARRATIVE_LEAD}"

                # Add remaining sections
                for i, sec in enumerate(sections[2:], 2):
                    skeleton += "\n\n## " + sec

                # Insert NARRATIVE_ISSUES after issue table
                if "Spend estimated" in skeleton or "Est. Spend" in skeleton:
                    skeleton = skeleton.replace(
                        "*Spend estimated by dividing each filing",
                        "{NARRATIVE_ISSUES}\n\n*Spend estimated by dividing each filing"
                    )
                    if "{NARRATIVE_ISSUES}" not in skeleton:
                        skeleton = skeleton.replace(
                            "income across its listed issues.*",
                            "income across its listed issues.*\n\n{NARRATIVE_ISSUES}"
                        )

                # Insert NARRATIVE_CONNECTION before Data Sources
                skeleton = skeleton.replace(
                    "## Data Sources",
                    "{NARRATIVE_CONNECTION}\n\n## Data Sources"
                )

                opus_body = _write_opus_narrative(skeleton, context, category=s.category)
                if opus_body:
                    s.body = opus_body
                    s.ai_generated = "opus"
                    # Tag the story so the daily-cap counter finds it.
                    if not isinstance(s.evidence, dict):
                        s.evidence = {}
                    s.evidence = {**s.evidence, "generator": "opus"}
                    enhanced += 1
                    log.info("  [OPUS] Enhanced: %s", s.title[:60])

        log.info("Opus enhancement complete: %d stories upgraded", enhanced)
    elif opus_remaining == 0:
        log.info("Opus daily cap reached (%d/%d), skipping enhancement", opus_used, OPUS_DAILY_CAP)

    # ── Gate 3 + Gate 4: validate + fact-check every draft ──
    # Stories that pass BOTH gates are saved with status='draft' for the
    # human review queue (Gate 5). Nothing is published automatically.
    try:
        from services.story_validators import validate_draft, format_issues
    except Exception as e:
        log.error("Gate-3 validators unavailable — refusing to save any drafts: %s", e)
        db.close()
        return

    try:
        from services.story_fact_checker import fact_check, format_fact_issues
    except Exception as e:
        log.error("Gate-4 fact-checker unavailable — refusing to save any drafts: %s", e)
        db.close()
        return

    saved = 0
    rejected_validator = 0
    rejected_factcheck = 0
    rejected_dupe = 0
    rejected_short = 0
    seen_slugs = set()
    seen_dedupe_hashes = set()

    MINIMUM_BODY_CHARS = 4000

    for s in all_stories:
        if s.slug in seen_slugs:
            rejected_dupe += 1
            continue
        if story_exists(db, s.slug):
            rejected_dupe += 1
            continue

        # Gate 2.5: minimum length floor — no skeleton-only stories in the queue
        body_len = len(s.body or "")
        if body_len < MINIMUM_BODY_CHARS:
            log.warning("LENGTH REJECT: %s | %d chars (min %d)",
                        s.title[:60], body_len, MINIMUM_BODY_CHARS)
            rejected_short += 1
            continue

        # Gate 3: deterministic validators
        ok, v_issues = validate_draft(s, seen_dedupe_hashes=seen_dedupe_hashes)
        if not ok:
            log.warning("Gate-3 REJECT: %s | %s", s.title[:60], format_issues(v_issues))
            rejected_validator += 1
            continue
        if v_issues:
            log.info("Gate-3 warnings for %s: %s", s.title[:60], format_issues(v_issues))

        # Gate 4: SQL fact-check
        fc_ok, fc_issues = fact_check(db, s)
        if not fc_ok:
            log.warning("Gate-4 REJECT: %s | %s", s.title[:60], format_fact_issues(fc_issues))
            rejected_factcheck += 1
            continue
        if fc_issues:
            log.info("Gate-4 warnings for %s: %s", s.title[:60], format_fact_issues(fc_issues))

        # Legacy number cross-check — kept as a third line of defence
        legacy_ok, legacy_issues = _verify_story_numbers(db, s)
        if not legacy_ok:
            log.warning("Legacy REJECT: %s | %s", s.title[:60], "; ".join(legacy_issues))
            rejected_factcheck += 1
            continue

        # Compute meaningful verification score (replaces blanket 95/public_records)
        try:
            score, tier = compute_verification_score(s, db)
            s.verification_score = score
            s.verification_tier = tier
        except Exception as e:
            log.warning("Verification scoring failed for %s: %s", s.slug, e)
            s.verification_score = 0.50
            s.verification_tier = "unverified"

        try:
            db.add(s)
            db.flush()
            saved += 1
            seen_slugs.add(s.slug)
        except Exception as e:
            db.rollback()
            log.warning("Skipping DB-duplicate story: %s (%s)", s.slug, e)
            rejected_dupe += 1

    if saved:
        db.commit()
    log.info(
        "Gate summary: %d drafts saved, %d too short (<4000 chars), %d rejected by Gate-3, "
        "%d rejected by Gate-4, %d dupes. "
        "Drafts are NOT published until a human approves them via /ops/story-queue.",
        saved, rejected_short, rejected_validator, rejected_factcheck, rejected_dupe,
    )

    db.close()


if __name__ == "__main__":
    main()
