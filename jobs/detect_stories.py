"""
Story Detection Job — Automated Data Story Generation

Scans all data sources daily for interesting patterns and generates
data-driven stories using Claude. Stories are saved as drafts for
review before publishing to /stories, Twitter, and the newsletter.

Detection patterns:
1. Lobbying spike — company whose lobbying spend increased 2x+ year-over-year
2. Contract windfall — large contract shortly after lobbying
3. Enforcement gap — sector with high lobbying but zero enforcement
4. Trade cluster — multiple congress members trading same stock same week
5. Cross-sector link — company appearing in multiple sectors
6. Regulatory influence — many regulatory comments on rules affecting their business

Usage:
    python jobs/detect_stories.py
    python jobs/detect_stories.py --dry-run
    python jobs/detect_stories.py --pattern lobbying_spike
    python jobs/detect_stories.py --max-stories 3
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal, CongressionalTrade
from models.stories_models import Story
from sqlalchemy import func, text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Budget ledger (shared with ai_summarize.py)
BUDGET_FILE = os.path.expanduser("~/.claude_api_budget.json")
COST_PER_STORY = 0.10  # ~$0.10 per story (Sonnet, ~1K input + 500 output tokens)
DEFAULT_MAX_STORIES = 5


def _slugify(title: str) -> str:
    """Convert title to URL-safe slug."""
    slug = title.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug)
    return slug[:80].strip("-")


def _check_budget(max_cost: float) -> bool:
    """Check if we have enough Anthropic API budget remaining."""
    from services.budget import check_budget
    allowed, remaining = check_budget(estimated_cost=max_cost)
    return allowed


def _record_cost(cost: float) -> None:
    """Record API cost to the shared budget ledger."""
    from services.budget import record_spend
    record_spend(cost, model="claude-sonnet-4-20250514")


def _generate_story_text(evidence: Dict[str, Any], category: str) -> Optional[Dict[str, str]]:
    """Use Claude to generate a story title, summary, and body from evidence."""
    try:
        from anthropic import Anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY not set")
            return None

        client = Anthropic(api_key=api_key)

        system = (
            "You are a data journalist for WeThePeople, a civic transparency platform. "
            "Write short, punchy, factual data stories based on evidence from government records. "
            "Every claim must be backed by the evidence provided. No speculation. "
            "Use a tone that's informative but engaging — like a smart friend explaining something wild they found in public records."
        )

        user_prompt = (
            f"Category: {category}\n\n"
            f"Evidence:\n{json.dumps(evidence, indent=2, default=str)}\n\n"
            "Write a data story with:\n"
            "1. title: A compelling headline (under 80 chars)\n"
            "2. summary: 1-2 sentence teaser\n"
            "3. body: 2-3 paragraphs in markdown. Include specific numbers, dates, dollar amounts from the evidence. "
            "End with a line linking to the relevant WeThePeople page.\n\n"
            "Return ONLY valid JSON: {\"title\": \"...\", \"summary\": \"...\", \"body\": \"...\"}"
        )

        response = client.messages.create(
            model=os.getenv("LLM_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=1000,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = response.content[0].text.strip()
        # Strip markdown code blocks if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n?", "", text)
            text = re.sub(r"\n?```$", "", text)

        result = json.loads(text)
        _record_cost(COST_PER_STORY)
        return result

    except Exception as e:
        logger.error("Failed to generate story text: %s", e, exc_info=True)
        return None


# ── Detection Patterns ──────────────────────────────────────────────────


def detect_lobbying_spikes(db) -> List[Dict[str, Any]]:
    """Find companies whose lobbying spend increased 2x+ year-over-year."""
    stories = []
    current_year = datetime.now().year
    prev_year = current_year - 1

    # Check across all sector lobbying tables
    tables = [
        "defense_lobbying_records", "energy_lobbying_records",
        "transportation_lobbying_records", "lobbying_records",
        "finance_lobbying_records", "health_lobbying_records",
    ]

    for table in tables:
        try:
            sql = text(f"""
                SELECT company_id,
                    SUM(CASE WHEN filing_year = :prev THEN COALESCE(income, 0) ELSE 0 END) as prev_spend,
                    SUM(CASE WHEN filing_year = :curr THEN COALESCE(income, 0) ELSE 0 END) as curr_spend
                FROM {table}
                WHERE filing_year IN (:prev, :curr)
                GROUP BY company_id
                HAVING prev_spend > 100000 AND curr_spend > prev_spend * 2
                ORDER BY curr_spend DESC
                LIMIT 5
            """)
            rows = db.execute(sql, {"prev": prev_year, "curr": current_year}).fetchall()

            for row in rows:
                stories.append({
                    "category": "lobbying_spike",
                    "evidence": {
                        "company_id": row[0],
                        "previous_year": prev_year,
                        "previous_spend": float(row[1]),
                        "current_year": current_year,
                        "current_spend": float(row[2]),
                        "increase_pct": round((float(row[2]) / float(row[1]) - 1) * 100, 1),
                        "source_table": table,
                    },
                })
        except Exception as e:
            logger.debug("Lobbying spike check failed for %s: %s", table, e)
            continue

    return stories


def detect_trade_clusters(db) -> List[Dict[str, Any]]:
    """Find multiple congress members trading the same stock in the same week."""
    stories = []
    try:
        sql = text("""
            SELECT ticker, transaction_type,
                strftime('%Y-%W', transaction_date) as week,
                COUNT(DISTINCT person_id) as member_count,
                GROUP_CONCAT(DISTINCT person_id) as members
            FROM congressional_trades
            WHERE transaction_date >= date('now', '-30 days')
                AND ticker IS NOT NULL AND ticker != ''
            GROUP BY ticker, transaction_type, week
            HAVING member_count >= 3
            ORDER BY member_count DESC
            LIMIT 5
        """)
        rows = db.execute(sql).fetchall()

        for row in rows:
            stories.append({
                "category": "trade_cluster",
                "evidence": {
                    "ticker": row[0],
                    "transaction_type": row[1],
                    "week": row[2],
                    "member_count": row[3],
                    "member_ids": row[4].split(",") if row[4] else [],
                },
            })
    except Exception as e:
        logger.debug("Trade cluster check failed: %s", e)

    return stories


def detect_contract_windfalls(db) -> List[Dict[str, Any]]:
    """Find companies that received large contracts shortly after lobbying."""
    stories = []
    contract_tables = [
        ("defense_government_contracts", "defense_lobbying_records"),
        ("energy_government_contracts", "energy_lobbying_records"),
        ("health_government_contracts", "health_lobbying_records"),
    ]

    for ct, lt in contract_tables:
        try:
            sql = text(f"""
                SELECT c.company_id,
                    c.award_amount,
                    c.awarding_agency,
                    c.start_date,
                    l.total_lobby
                FROM {ct} c
                JOIN (
                    SELECT company_id, SUM(COALESCE(income, 0)) as total_lobby
                    FROM {lt}
                    WHERE filing_year >= strftime('%Y', 'now') - 1
                    GROUP BY company_id
                    HAVING total_lobby > 500000
                ) l ON c.company_id = l.company_id
                WHERE c.award_amount > 10000000
                    AND c.start_date >= date('now', '-90 days')
                ORDER BY c.award_amount DESC
                LIMIT 3
            """)
            rows = db.execute(sql).fetchall()

            for row in rows:
                stories.append({
                    "category": "contract_windfall",
                    "evidence": {
                        "company_id": row[0],
                        "contract_amount": float(row[1]) if row[1] else 0,
                        "awarding_agency": row[2],
                        "contract_date": str(row[3]) if row[3] else "",
                        "recent_lobbying_spend": float(row[4]) if row[4] else 0,
                        "source_tables": f"{ct}, {lt}",
                    },
                })
        except Exception as e:
            logger.debug("Contract windfall check failed for %s: %s", ct, e)
            continue

    return stories


def detect_enforcement_gaps(db) -> List[Dict[str, Any]]:
    """Find sectors with high lobbying but zero or minimal enforcement."""
    stories = []
    sectors = [
        ("defense", "defense_lobbying_records", "defense_enforcement_actions"),
        ("energy", "energy_lobbying_records", "energy_enforcement_actions"),
        ("transportation", "transportation_lobbying_records", "transportation_enforcement_actions"),
    ]

    for sector, lobby_table, enforce_table in sectors:
        try:
            lobby_sql = text(f"SELECT COUNT(*), COALESCE(SUM(income), 0) FROM {lobby_table}")
            lobby_row = db.execute(lobby_sql).fetchone()
            lobby_count = lobby_row[0] if lobby_row else 0
            lobby_total = float(lobby_row[1]) if lobby_row and lobby_row[1] else 0

            enforce_sql = text(f"SELECT COUNT(*) FROM {enforce_table}")
            enforce_count = db.execute(enforce_sql).fetchone()[0]

            if lobby_count > 100 and enforce_count < 10 and lobby_total > 1000000:
                stories.append({
                    "category": "enforcement_gap",
                    "evidence": {
                        "sector": sector,
                        "lobbying_filings": lobby_count,
                        "lobbying_total": lobby_total,
                        "enforcement_actions": enforce_count,
                        "ratio": round(lobby_count / max(enforce_count, 1), 1),
                    },
                })
        except Exception as e:
            logger.debug("Enforcement gap check failed for %s: %s", sector, e)
            continue

    return stories


# ── Main ────────────────────────────────────────────────────────────────


DETECTORS = {
    "lobbying_spike": detect_lobbying_spikes,
    "trade_cluster": detect_trade_clusters,
    "contract_windfall": detect_contract_windfalls,
    "enforcement_gap": detect_enforcement_gaps,
}


def main():
    parser = argparse.ArgumentParser(description="Detect and generate data stories")
    parser.add_argument("--dry-run", action="store_true", help="Detect patterns but don't generate/store stories")
    parser.add_argument("--pattern", type=str, choices=list(DETECTORS.keys()), help="Run only this pattern")
    parser.add_argument("--max-stories", type=int, default=DEFAULT_MAX_STORIES, help="Max stories to generate")
    args = parser.parse_args()

    if not args.dry_run and not _check_budget(args.max_stories * COST_PER_STORY):
        logger.error("Insufficient Anthropic API budget. Use --dry-run to detect patterns without generating.")
        sys.exit(1)

    db = SessionLocal()
    try:
        all_candidates = []

        # Run detectors
        detectors_to_run = {args.pattern: DETECTORS[args.pattern]} if args.pattern else DETECTORS
        for name, detector in detectors_to_run.items():
            logger.info("Running detector: %s", name)
            candidates = detector(db)
            logger.info("  Found %d candidates", len(candidates))
            all_candidates.extend(candidates)

        logger.info("Total story candidates: %d", len(all_candidates))

        if args.dry_run:
            for c in all_candidates:
                logger.info("[DRY-RUN] %s: %s", c["category"], json.dumps(c["evidence"], default=str)[:200])
            return

        # Generate stories for top candidates
        stories_created = 0
        for candidate in all_candidates[:args.max_stories]:
            category = candidate["category"]
            evidence = candidate["evidence"]

            # Check if similar story already exists
            company_id = evidence.get("company_id", "")
            slug_prefix = f"{category}-{company_id}" if company_id else category
            existing = db.query(Story).filter(
                Story.slug.like(f"{slug_prefix}%"),
                Story.created_at >= text("datetime('now', '-7 days')"),
            ).first()
            if existing:
                logger.info("Skipping %s — similar story exists: %s", category, existing.slug)
                continue

            # Generate story text via Claude
            logger.info("Generating story: %s for %s", category, company_id or "sector")
            result = _generate_story_text(evidence, category)
            if not result:
                continue

            title = result.get("title", f"Untitled {category}")
            slug = _slugify(title)

            # Ensure unique slug
            slug_exists = db.query(Story).filter_by(slug=slug).first()
            if slug_exists:
                slug = f"{slug}-{int(time.time()) % 10000}"

            sector = None
            source_table = evidence.get("source_table", "")
            if "defense" in source_table or evidence.get("sector") == "defense":
                sector = "defense"
            elif "energy" in source_table or evidence.get("sector") == "energy":
                sector = "energy"
            elif "health" in source_table or evidence.get("sector") == "health":
                sector = "health"
            elif "finance" in source_table or evidence.get("sector") == "finance":
                sector = "finance"
            elif "tech" in source_table or evidence.get("sector") == "tech":
                sector = "tech"
            elif "transport" in source_table or evidence.get("sector") == "transportation":
                sector = "transportation"

            entity_ids = [company_id] if company_id else evidence.get("member_ids", [])

            story = Story(
                title=title,
                slug=slug,
                summary=result.get("summary", ""),
                body=result.get("body", ""),
                category=category,
                sector=sector,
                entity_ids=entity_ids,
                data_sources=[],
                evidence=evidence,
                status="draft",
            )
            db.add(story)
            db.flush()
            stories_created += 1
            logger.info("Created story: '%s' (slug: %s)", title, slug)

        if stories_created > 0:
            db.commit()

        logger.info("Story detection complete: %d candidates found, %d stories created", len(all_candidates), stories_created)

    except Exception as e:
        logger.error("Story detection failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
