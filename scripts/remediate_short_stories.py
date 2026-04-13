"""
One-time remediation: Expand all published stories under 4000 characters
using Opus to add investigative depth and narrative quality.

Usage:
    python scripts/remediate_short_stories.py              # dry-run (shows what would change)
    python scripts/remediate_short_stories.py --execute     # actually update stories
    python scripts/remediate_short_stories.py --execute --ids 93,104,113  # specific stories only

Safe to re-run: only updates stories that are still under 4000 characters.
"""

import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timezone
from sqlalchemy import text
from models.database import SessionLocal, engine

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# Target: every published story must be at least this many characters
MIN_CHARS = 4000

# Opus model — same as detect_stories.py
OPUS_MODEL = os.environ.get("OPUS_MODEL", "claude-opus-4-20250514")

# Delay between API calls to avoid rate limits (seconds)
API_DELAY = 5


def _strip_html_comments(txt):
    """Remove HTML comments from markdown."""
    if not txt:
        return txt
    cleaned = re.compile(r'<!--.*?-->', re.DOTALL).sub('', txt)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.lstrip('\n')


def _strip_dashes(line):
    """Replace em-dashes and double-dashes with commas."""
    line = line.replace('\u2014', ',').replace('\u2013', ',')
    return re.sub(r'\s*--\s*', ', ', line)


def _detect_story_shape(category):
    """Same logic as detect_stories.py."""
    company_cats = {"lobbying_spike", "contract_windfall", "enforcement_immunity",
                    "regulatory_loop", "regulatory_capture", "penalty_contract_ratio",
                    "lobbying_breakdown"}
    politician_cats = {"trade_cluster", "trade_timing", "prolific_trader",
                       "stock_act_violation", "committee_stock_trade"}
    sector_cats = {"tax_lobbying", "budget_influence"}
    if category in company_cats:
        return "company-focused"
    elif category in politician_cats:
        return "politician-focused"
    elif category in sector_cats:
        return "sector-wide"
    else:
        return "relationship-based"


def build_expansion_prompt(title, body, category, sector):
    """Build the Opus prompt for expanding a short story."""
    story_shape = _detect_story_shape(category)
    current_year = datetime.now(timezone.utc).year

    return (
        "You are a senior data journalist at WeThePeople, a nonpartisan civic transparency platform. "
        "Your mission is to expand an existing short article into a thorough, publication-quality piece "
        "that meets our minimum length standard of 4000 characters.\n\n"
        "CONTEXT:\n"
        "- Title: %s\n"
        "- Category: %s\n"
        "- Sector: %s\n"
        "- Story shape: %s\n"
        "- Current length: %d characters (BELOW our 4000-character minimum)\n\n"
        "EXISTING ARTICLE:\n```\n%s\n```\n\n"
        "YOUR TASK: Rewrite and expand this article to at least 4000 characters while following "
        "every rule below. The expanded version must contain ALL the same data points, dollar amounts, "
        "names, and source citations as the original. You are ADDING depth, not changing facts.\n\n"
        "ABSOLUTE RULES (violation = automatic rejection):\n\n"
        "R1. DO NOT INVENT NUMBERS. Every dollar amount, count, ratio, percentage, and date "
        "must already appear in the EXISTING ARTICLE above. You may NOT add new statistics, "
        "comparisons, industry averages, or derived metrics.\n"
        "R2. DO NOT COMPUTE NEW RATIOS. No contract-to-lobbying ratios, ROI figures, "
        "'X dollars for every Y' comparisons, or derived metrics unless already present.\n"
        "R3. NO EDITORIALISING. Forbidden: 'raises questions', 'raises eyebrows', "
        "'begs the question', 'shocking', 'staggering', 'scandal', 'corrupt', 'kickback', "
        "'pay-to-play', 'smoking gun', 'influence peddling', 'suggests either'.\n"
        "R4. NO ACCUSATIONS. Never accuse any person or company of wrongdoing. Never imply "
        "lobbying caused a contract or a donation caused a vote. State what the public record shows.\n"
        "R5. NO DASHES. Never write '--', '\u2014', or '\u2013'. Use commas, parentheses, or semicolons.\n"
        "R6. FARA PRECISION. Use 'registered foreign principals', never 'foreign agents on payroll'.\n"
        "R7. TIME WINDOW. Never reference a year later than %d.\n"
        "R8. REQUIRED DISCLAIMER. Include this sentence verbatim in the article: "
        "'Lobbying is legal activity protected under the First Amendment. Government contracts are "
        "awarded through competitive bidding processes. Correlation between lobbying expenditures "
        "and contract awards does not prove causation.' Include it exactly ONCE (not duplicated).\n"
        "R9. PRESERVE ALL DATA. Every bullet point, data table, dollar figure, and source citation "
        "from the original must appear in your expanded version. Do not remove any data.\n"
        "R10. NO HTML COMMENTS. No <!-- --> tags of any kind.\n"
        "R11. NO NEW SECTIONS. Do not add 'Conclusion', 'What This Means', or 'Next Steps' sections.\n\n"
        "EXPANSION GUIDANCE:\n"
        "- Add 2-3 paragraph LEAD section after the title heading that introduces the entity, "
        "explains why this data matters to the public interest, and provides context about "
        "the entity's role in its industry or government.\n"
        "- After each data section (bullet points or tables), add 1-2 paragraphs of ANALYSIS "
        "that explains what the data shows in plain language. What patterns emerge? What do "
        "these numbers mean for public accountability?\n"
        "- Before the Data Sources section, add a CONNECTION paragraph that ties together "
        "the different data dimensions (lobbying + contracts + enforcement + trades). "
        "What does the FULL picture show when viewed together?\n"
        "- Each narrative paragraph must be at least 4 full sentences.\n"
        "- Write with the depth and rigor of investigative data journalism.\n"
        "- The final article must be at least 4000 characters. Aim for 4500-5500.\n\n"
        "OUTPUT: Return the COMPLETE expanded article as valid markdown. Start with the "
        "first heading. No preamble, no JSON wrapper, no metadata.\n"
    ) % (title, category, sector or "cross-sector", story_shape,
         len(body), body, current_year)


def expand_story(client, title, body, category, sector):
    """Call Opus to expand a short story. Returns expanded body or None."""
    prompt = build_expansion_prompt(title, body, category, sector)

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

        try:
            from services.budget import log_token_usage
            log_token_usage("story_remediation", OPUS_MODEL, in_tok, out_tok, cost,
                            "Remediate: %s" % title[:80])
        except Exception:
            pass

        # Post-process: strip HTML comments
        result = _strip_html_comments(result)

        # Post-process: strip dashes
        result = '\n'.join(_strip_dashes(l) for l in result.splitlines())

        # Remove duplicate disclaimer (Opus sometimes adds it twice)
        disclaimer = ("Lobbying is legal activity protected under the First Amendment. "
                       "Government contracts are awarded through competitive bidding processes. "
                       "Correlation between lobbying expenditures and contract awards does not prove causation.")
        count = result.count(disclaimer)
        if count > 1:
            # Keep only the last occurrence
            idx = result.rfind(disclaimer)
            result = result[:idx] + result[idx:].replace(disclaimer, "", count - 1)
            # Actually: keep the one that's in context, remove extras
            parts = result.split(disclaimer)
            result = parts[0] + disclaimer + disclaimer.join(parts[1:]).replace(disclaimer, "")

        log.info("  Opus: %d chars, $%.4f (%d in / %d out)", len(result), cost, in_tok, out_tok)
        return result

    except Exception as e:
        log.error("  Opus API failed: %s", e)
        return None


def validate_expansion(original_body, expanded_body, title):
    """Basic validation that the expansion didn't lose data."""
    issues = []

    # Check length improvement
    if len(expanded_body) < len(original_body):
        issues.append("Expansion is SHORTER than original (%d < %d)" % (
            len(expanded_body), len(original_body)))

    if len(expanded_body) < MIN_CHARS:
        issues.append("Still under %d chars (%d)" % (MIN_CHARS, len(expanded_body)))

    # Check that key dollar amounts are preserved
    original_dollars = set(re.findall(r'\$[\d,.]+[BMK]?', original_body))
    expanded_dollars = set(re.findall(r'\$[\d,.]+[BMK]?', expanded_body))
    missing = original_dollars - expanded_dollars
    if missing:
        issues.append("Missing dollar amounts: %s" % ", ".join(sorted(missing)))

    # Check Data Sources section preserved
    if "## Data Sources" in original_body and "## Data Sources" not in expanded_body:
        issues.append("Missing '## Data Sources' section")

    # Check disclaimer present
    if "Lobbying is legal activity" not in expanded_body:
        issues.append("Missing required disclaimer")

    # Check for forbidden patterns
    forbidden = [
        r'raises questions', r'raises eyebrows', r'begs the question',
        r'shocking', r'staggering', r'scandal(?!s)', r'corrupt',
        r'pay-to-play', r'smoking gun',
    ]
    for pattern in forbidden:
        if re.search(pattern, expanded_body, re.IGNORECASE):
            issues.append("Contains forbidden phrase: %s" % pattern)

    # Check for dashes
    if '\u2014' in expanded_body or '\u2013' in expanded_body or ' -- ' in expanded_body:
        issues.append("Contains forbidden dashes")

    return issues


def main():
    parser = argparse.ArgumentParser(description="Remediate short published stories via Opus expansion")
    parser.add_argument("--execute", action="store_true", help="Actually update stories (default: dry-run)")
    parser.add_argument("--ids", type=str, help="Comma-separated story IDs to remediate (default: all under 4000)")
    parser.add_argument("--min-chars", type=int, default=MIN_CHARS, help="Minimum character target")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.error("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)

    db = SessionLocal()

    # Query short stories
    if args.ids:
        id_list = [int(x.strip()) for x in args.ids.split(",")]
        id_str = ",".join(str(i) for i in id_list)
        rows = db.execute(text(
            "SELECT id, title, body, category, sector, LENGTH(body) as body_len "
            "FROM stories WHERE status = 'published' AND id IN (%s) "
            "ORDER BY body_len ASC" % id_str
        )).fetchall()
    else:
        rows = db.execute(text(
            "SELECT id, title, body, category, sector, LENGTH(body) as body_len "
            "FROM stories WHERE status = 'published' AND LENGTH(body) < :min "
            "ORDER BY body_len ASC"
        ), {"min": args.min_chars}).fetchall()

    if not rows:
        log.info("No stories found under %d characters. Nothing to remediate.", args.min_chars)
        db.close()
        return

    log.info("Found %d stories under %d chars to remediate.", len(rows), args.min_chars)
    for r in rows:
        log.info("  ID %3d | %5d chars | %-20s | %s", r[0], r[5], r[3], r[1][:55])

    if not args.execute:
        log.info("\nDRY RUN — add --execute to actually update stories.")
        db.close()
        return

    # Process each story
    success = 0
    failed = 0
    skipped = 0
    total_cost = 0.0

    for i, r in enumerate(rows):
        story_id, title, body, category, sector, body_len = r
        log.info("\n[%d/%d] ID %d: %s (%d chars)", i + 1, len(rows), story_id, title[:55], body_len)

        expanded = expand_story(client, title, body, category, sector)
        if not expanded:
            log.error("  FAILED: Opus returned nothing")
            failed += 1
            time.sleep(API_DELAY)
            continue

        # Validate
        issues = validate_expansion(body, expanded, title)
        critical_issues = [iss for iss in issues if "SHORTER" in iss or "Missing dollar" in iss]

        if critical_issues:
            log.warning("  SKIPPED (critical validation failures):")
            for iss in critical_issues:
                log.warning("    - %s", iss)
            skipped += 1
            time.sleep(API_DELAY)
            continue

        if issues:
            log.info("  Warnings (non-blocking):")
            for iss in issues:
                log.info("    - %s", iss)

        # Update the story
        try:
            db.execute(text(
                "UPDATE stories SET body = :body, ai_generated = 'opus', "
                "updated_at = :now WHERE id = :id"
            ), {"body": expanded, "now": datetime.now(timezone.utc), "id": story_id})
            db.commit()
            log.info("  UPDATED: %d -> %d chars (+%d)",
                     body_len, len(expanded), len(expanded) - body_len)
            success += 1
        except Exception as e:
            db.rollback()
            log.error("  DB UPDATE FAILED: %s", e)
            failed += 1

        # Rate limit delay
        if i < len(rows) - 1:
            time.sleep(API_DELAY)

    log.info("\n=== REMEDIATION COMPLETE ===")
    log.info("Success: %d | Failed: %d | Skipped: %d | Total: %d", success, failed, skipped, len(rows))

    db.close()


if __name__ == "__main__":
    main()
