"""
Story Detection Job — Automated Data Story Generation

Scans all data sources daily for interesting patterns and generates
data-driven stories using Claude. Stories are saved as drafts for
review before publishing to /stories, Twitter, and the newsletter.

Detection patterns (original 4):
1. Lobbying spike — company whose lobbying spend increased 2x+ year-over-year
2. Contract windfall — large contract shortly after lobbying
3. Enforcement gap — sector with high lobbying but zero enforcement
4. Trade cluster — multiple congress members trading same stock same week

Patterns 5-9:
5. Full influence loop — company lobbied → bill introduced → committee voted →
   politician on committee received donations → same politician traded stock
6. Revolving door — committee members + top lobbying spenders targeting that committee
7. Regulatory arbitrage — company with high lobbying but low/zero enforcement vs sector avg
8. Bipartisan buying — company donates to BOTH parties on same committee
9. Trade timing — congressional trade within N days of related committee vote or bill action

Patterns 10-14:
10. STOCK Act violation — congress members with chronic late trade disclosures (45+ day gaps)
11. Committee stock overlap — members trading stocks in sectors their committee oversees
12. Penalty-contract ratio — companies winning huge contracts with zero/minimal enforcement
13. Prolific trader — congress members with 50+ trades who also receive corporate donations
14. Enforcement immunity — companies with $50M+ in contracts and zero enforcement actions

Usage:
    python jobs/detect_stories.py
    python jobs/detect_stories.py --dry-run
    python jobs/detect_stories.py --pattern full_influence_loop
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
from utils.db_compat import (
    extract_year_week, group_concat, now_minus_days,
    datetime_now_minus_days, current_year_sql, limit_sql,
    is_oracle, is_sqlite, is_postgres,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Budget ledger (shared with ai_summarize.py)
BUDGET_FILE = os.path.expanduser("~/.claude_api_budget.json")
COST_PER_STORY = 0.003  # ~$0.003 per story (Haiku, ~1K input + 500 output tokens)
DEFAULT_MAX_STORIES = 10

# Minimum score (1-10) to turn a detected pattern into a generated story
MIN_SCORE_FOR_STORY = 7

# Haiku model for cheap story generation
HAIKU_MODEL = "claude-haiku-4-5-20251001"


def _map_entity_type(category: str, evidence: Dict) -> str:
    """Map story category/evidence to claims pipeline entity_type."""
    sector = evidence.get("sector", "")
    if sector in ("tech", "finance", "health", "energy", "defense", "transportation", "chemicals", "agriculture"):
        return sector
    # Person-based patterns
    if category in ("stock_act_violation", "committee_stock_trade", "prolific_trader", "trade_timing", "revolving_door"):
        return "politician"
    return "politician"  # default


def _verify_story(db, story_body: str, entity_id: str, entity_type: str) -> Dict:
    """Run story body through the claims verification pipeline.

    Returns dict with verification_score, verification_tier, and full results.
    """
    try:
        from services.claims.pipeline import run_verification
        result = run_verification(
            db, text=story_body, entity_id=entity_id, entity_type=entity_type,
        )
        tier_counts = result.get("tier_counts", {})
        strong = tier_counts.get("strong", 0)
        moderate = tier_counts.get("moderate", 0)
        weak = tier_counts.get("weak", 0)
        unverified = tier_counts.get("unverified", 0)
        total = strong + moderate + weak + unverified

        if total == 0:
            return {"score": 0.0, "tier": "unverified", "data": result}

        verified_pct = (strong + moderate) / total
        if verified_pct >= 0.6:
            tier = "verified"
        elif verified_pct >= 0.3:
            tier = "partially_verified"
        else:
            tier = "unverified"

        score = round(verified_pct, 3)
        return {"score": score, "tier": tier, "data": result}
    except Exception as e:
        logger.warning("Story verification failed: %s", e)
        return {"score": None, "tier": None, "data": None}


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
    record_spend(cost, model=HAIKU_MODEL)


def _generate_story_text(evidence: Dict[str, Any], category: str) -> Optional[Dict[str, str]]:
    """Use Claude Haiku to generate a story title, summary, and body from evidence."""
    try:
        from anthropic import Anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY not set")
            return None

        # Budget check before every call
        if not _check_budget(COST_PER_STORY):
            logger.warning("Insufficient budget for story generation")
            return None

        client = Anthropic(api_key=api_key)

        system = (
            "You are a data journalist at a civic transparency platform. Write factual, "
            "compelling narratives based on government records. No speculation. Every claim "
            "must be traceable to a specific data point. Write in the style of ProPublica or "
            "The Intercept: direct, clear, no filler, no dashes.\n\n"
            "IMPORTANT RULES:\n"
            "- Never claim causation from correlation. If lobbying precedes a contract, say "
            "'the timing raises questions' not 'lobbying led to the contract.'\n"
            "- Always acknowledge that contracts go through competitive bidding processes and "
            "that lobbying is legal advocacy. The story is about the pattern, not a crime.\n"
            "- Include a brief contextual note when possible: what percentage of total sector "
            "spending does this represent? Is this company's lobbying above or below average?\n"
            "- Name the specific government data sources (Senate LDA filings, USASpending.gov, "
            "SEC EDGAR, Federal Register, FEC, House financial disclosures).\n"
            "- Do not use em dashes. Use commas or periods instead."
        )

        user_prompt = (
            f"Category: {category}\n\n"
            f"Evidence:\n{json.dumps(evidence, indent=2, default=str)}\n\n"
            "Write a data story with:\n"
            "1. title: A compelling, specific headline that names names (under 80 chars)\n"
            "2. summary: 2-3 sentence teaser that hooks the reader\n"
            "3. content: 3-5 paragraphs. Include specific numbers, dates, dollar amounts "
            "from the evidence. Cite which government database each data point comes from "
            "(e.g., 'according to Senate lobbying disclosures' or 'per USASpending.gov contract records'). "
            "Include a paragraph acknowledging that correlation between lobbying and contracts "
            "does not prove a quid pro quo, and that federal procurement follows competitive processes. "
            "End with a line on why the pattern matters for public accountability.\n"
            "4. data_sources: JSON array of table/API names from the evidence\n"
            "5. cited_entities: JSON array of entity IDs referenced\n\n"
            "Return ONLY valid JSON:\n"
            '{"title": "...", "summary": "...", "content": "...", '
            '"data_sources": [...], "cited_entities": [...]}'
        )

        response = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=1500,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text_resp = response.content[0].text.strip()
        # Strip markdown code blocks if present
        if text_resp.startswith("```"):
            text_resp = re.sub(r"^```(?:json)?\n?", "", text_resp)
            text_resp = re.sub(r"\n?```$", "", text_resp)

        result = json.loads(text_resp)

        # Compute actual cost from token usage
        actual_cost = COST_PER_STORY
        if hasattr(response, "usage"):
            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            # Haiku pricing: $1/M input, $5/M output
            actual_cost = (input_tokens * 1.0 / 1_000_000) + (output_tokens * 5.0 / 1_000_000)

        _record_cost(actual_cost)
        return result

    except Exception as e:
        logger.error("Failed to generate story text: %s", e, exc_info=True)
        return None


def _resolve_entity_name(db, entity_id: str, entity_type: str = "") -> str:
    """Look up display_name for an entity across all tracked tables."""
    tables = [
        ("tracked_members", "person_id", "display_name"),
        ("tracked_tech_companies", "company_id", "display_name"),
        ("tracked_energy_companies", "company_id", "display_name"),
        ("tracked_companies", "company_id", "display_name"),  # health
        ("tracked_institutions", "institution_id", "display_name"),  # finance
        ("tracked_defense_companies", "company_id", "display_name"),
        ("tracked_transportation_companies", "company_id", "display_name"),
    ]
    for table, id_col, name_col in tables:
        try:
            sql = text(f"SELECT {name_col} FROM {table} WHERE {id_col} = :eid {limit_sql(1)}")
            row = db.execute(sql, {"eid": entity_id}).fetchone()
            if row and row[0]:
                return row[0]
        except Exception:
            continue
    return entity_id


def _resolve_member_name(db, person_id: str) -> str:
    """Look up display_name for a tracked member."""
    try:
        sql = text(f"SELECT display_name FROM tracked_members WHERE person_id = :pid {limit_sql(1)}")
        row = db.execute(sql, {"pid": person_id}).fetchone()
        if row and row[0]:
            return row[0]
    except Exception:
        pass
    return person_id


# ── Detection Patterns ──────────────────────────────────────────────────


def detect_lobbying_spikes(db) -> List[Dict[str, Any]]:
    """Find companies whose lobbying spend increased 2x+ year-over-year."""
    stories = []
    current_year = datetime.now().year
    prev_year = current_year - 1

    # Check across all sector lobbying tables
    # Note: finance uses institution_id, all others use company_id
    tables = [
        ("defense_lobbying_records", "company_id"),
        ("energy_lobbying_records", "company_id"),
        ("transportation_lobbying_records", "company_id"),
        ("lobbying_records", "company_id"),
        ("finance_lobbying_records", "institution_id"),
        ("health_lobbying_records", "company_id"),
        ("chemical_lobbying_records", "company_id"),
        ("agriculture_lobbying_records", "company_id"),
    ]

    for table, id_col in tables:
        try:
            sql = text(f"""
                SELECT {id_col},
                    SUM(CASE WHEN filing_year = :prev THEN COALESCE(income, 0) ELSE 0 END) as prev_spend,
                    SUM(CASE WHEN filing_year = :curr THEN COALESCE(income, 0) ELSE 0 END) as curr_spend
                FROM {table}
                WHERE filing_year IN (:prev, :curr)
                GROUP BY {id_col}
                HAVING prev_spend > 100000 AND curr_spend > prev_spend * 2
                ORDER BY curr_spend DESC
                {limit_sql(5)}
            """)
            rows = db.execute(sql, {"prev": prev_year, "curr": current_year}).fetchall()

            for row in rows:
                increase_pct = round((float(row[2]) / float(row[1]) - 1) * 100, 1)
                # Score: 7 for 2x, +1 for each additional 100% increase, max 10
                score = min(10, 7 + int(increase_pct - 100) // 100)
                entity_name = _resolve_entity_name(db, row[0])
                stories.append({
                    "category": "lobbying_spike",
                    "score": score,
                    "evidence": {
                        "company_id": row[0],
                        "company_name": entity_name,
                        "previous_year": prev_year,
                        "previous_spend": float(row[1]),
                        "current_year": current_year,
                        "current_spend": float(row[2]),
                        "increase_pct": increase_pct,
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
        # Dialect-aware raw SQL fragments
        if is_oracle():
            _yw = "TO_CHAR(transaction_date, 'IYYY-IW')"
            _gc = "LISTAGG(DISTINCT person_id, ',') WITHIN GROUP (ORDER BY person_id)"
        elif is_postgres():
            _yw = "TO_CHAR(transaction_date, 'IYYY-IW')"
            _gc = "STRING_AGG(DISTINCT person_id::TEXT, ',')"
        else:
            _yw = "strftime('%Y-%W', transaction_date)"
            _gc = "GROUP_CONCAT(DISTINCT person_id)"
        sql = text(f"""
            SELECT ticker, transaction_type,
                {_yw} as week,
                COUNT(DISTINCT person_id) as member_count,
                {_gc} as members
            FROM congressional_trades
            WHERE transaction_date >= {now_minus_days(30)}
                AND ticker IS NOT NULL AND ticker != ''
            GROUP BY ticker, transaction_type, week
            HAVING member_count >= 3
            ORDER BY member_count DESC
            {limit_sql(5)}
        """)
        rows = db.execute(sql).fetchall()

        for row in rows:
            member_count = row[3]
            member_ids = row[4].split(",") if row[4] else []
            # Score: 7 for 3 members, +1 per additional member, max 10
            score = min(10, 4 + member_count)
            member_names = [_resolve_member_name(db, mid) for mid in member_ids]
            stories.append({
                "category": "trade_cluster",
                "score": score,
                "evidence": {
                    "ticker": row[0],
                    "transaction_type": row[1],
                    "week": row[2],
                    "member_count": member_count,
                    "member_ids": member_ids,
                    "member_names": member_names,
                },
            })
    except Exception as e:
        logger.debug("Trade cluster check failed: %s", e)

    return stories


def detect_contract_windfalls(db) -> List[Dict[str, Any]]:
    """Find companies that received large contracts shortly after lobbying."""
    stories = []
    contract_tables = [
        ("defense_government_contracts", "defense_lobbying_records", "defense"),
        ("energy_government_contracts", "energy_lobbying_records", "energy"),
        ("health_government_contracts", "health_lobbying_records", "health"),
        ("government_contracts", "lobbying_records", "tech"),
        ("finance_government_contracts", "finance_lobbying_records", "finance"),
        ("transportation_government_contracts", "transportation_lobbying_records", "transportation"),
        ("chemical_government_contracts", "chemical_lobbying_records", "chemicals"),
        ("agriculture_government_contracts", "agriculture_lobbying_records", "agriculture"),
    ]

    for ct, lt, sector in contract_tables:
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
                    WHERE filing_year >= {current_year_sql()} - 1
                    GROUP BY company_id
                    HAVING total_lobby > 500000
                ) l ON c.company_id = l.company_id
                WHERE c.award_amount > 10000000
                    AND c.start_date >= {now_minus_days(90)}
                ORDER BY c.award_amount DESC
                {limit_sql(3)}
            """)
            rows = db.execute(sql).fetchall()

            for row in rows:
                award = float(row[1]) if row[1] else 0
                lobby = float(row[4]) if row[4] else 0
                # Score: based on ratio of contract to lobbying spend
                ratio = award / max(lobby, 1)
                score = min(10, 6 + int(min(ratio, 400) // 100))
                entity_name = _resolve_entity_name(db, row[0])
                stories.append({
                    "category": "contract_windfall",
                    "score": score,
                    "evidence": {
                        "company_id": row[0],
                        "company_name": entity_name,
                        "contract_amount": award,
                        "awarding_agency": row[2],
                        "contract_date": str(row[3]) if row[3] else "",
                        "recent_lobbying_spend": lobby,
                        "contract_to_lobby_ratio": round(ratio, 1),
                        "sector": sector,
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
        ("tech", "lobbying_records", "ftc_enforcement_actions"),
        ("finance", "finance_lobbying_records", "finance_enforcement_actions"),
        ("health", "health_lobbying_records", "health_enforcement_actions"),
        ("chemicals", "chemical_lobbying_records", "chemical_enforcement_actions"),
        ("agriculture", "agriculture_lobbying_records", "agriculture_enforcement_actions"),
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
                ratio = round(lobby_count / max(enforce_count, 1), 1)
                # Score: based on ratio of lobbying filings to enforcement actions
                score = min(10, 6 + int(min(ratio, 400) // 100))
                stories.append({
                    "category": "enforcement_gap",
                    "score": score,
                    "evidence": {
                        "sector": sector,
                        "lobbying_filings": lobby_count,
                        "lobbying_total": lobby_total,
                        "enforcement_actions": enforce_count,
                        "ratio": ratio,
                        "source_tables": f"{lobby_table}, {enforce_table}",
                    },
                })
        except Exception as e:
            logger.debug("Enforcement gap check failed for %s: %s", sector, e)
            continue

    return stories


# ── New Detection Patterns ─────────────────────────────────────────────


def detect_full_influence_loop(db) -> List[Dict[str, Any]]:
    """Detect full influence chains: company lobbied -> bill introduced ->
    committee voted -> politician on committee received donations from company
    -> same politician traded company's stock.

    This is the most compelling pattern — a complete money loop from
    corporate lobbying through legislation to personal enrichment.
    """
    stories = []

    # All lobbying tables with their entity ID columns and sector labels
    lobby_configs = [
        ("lobbying_records", "company_id", "tech"),
        ("health_lobbying_records", "company_id", "health"),
        ("energy_lobbying_records", "company_id", "energy"),
        ("defense_lobbying_records", "company_id", "defense"),
        ("transportation_lobbying_records", "company_id", "transportation"),
        ("finance_lobbying_records", "institution_id", "finance"),
    ]

    # Tracked entity tables (to get ticker symbols)
    ticker_tables = [
        ("tracked_tech_companies", "company_id"),
        ("tracked_companies", "company_id"),  # health
        ("tracked_energy_companies", "company_id"),
        ("tracked_defense_companies", "company_id"),
        ("tracked_transportation_companies", "company_id"),
        ("tracked_institutions", "institution_id"),  # finance
    ]

    for lobby_table, lobby_id_col, sector in lobby_configs:
        try:
            # Step 1: Find companies that lobbied AND donated to politicians
            # who sit on committees AND traded the company's stock.
            #
            # We join:
            #   lobbying_records (company lobbied) ->
            #   company_donations (company donated to politician) ->
            #   committee_memberships (politician sits on committee) ->
            #   congressional_trades (politician traded company stock)
            #
            # We match trades to companies via ticker symbol.

            # First get tickers for companies in this sector
            ticker_table = None
            ticker_id_col = None
            for tt, tid in ticker_tables:
                if sector == "tech" and tt == "tracked_tech_companies":
                    ticker_table, ticker_id_col = tt, tid
                    break
                elif sector == "health" and tt == "tracked_companies":
                    ticker_table, ticker_id_col = tt, tid
                    break
                elif sector == "energy" and tt == "tracked_energy_companies":
                    ticker_table, ticker_id_col = tt, tid
                    break
                elif sector == "defense" and tt == "tracked_defense_companies":
                    ticker_table, ticker_id_col = tt, tid
                    break
                elif sector == "transportation" and tt == "tracked_transportation_companies":
                    ticker_table, ticker_id_col = tt, tid
                    break
                elif sector == "finance" and tt == "tracked_institutions":
                    ticker_table, ticker_id_col = tt, tid
                    break

            if not ticker_table:
                continue

            # Find the full loop:
            # 1. Company lobbied (lobbying table)
            # 2. Company donated to a politician (company_donations)
            # 3. That politician sits on a committee (committee_memberships)
            # 4. That politician traded the company's stock (congressional_trades)
            sql = text(f"""
                SELECT
                    e.{ticker_id_col} as entity_id,
                    e.display_name as company_name,
                    e.ticker,
                    lobby_agg.total_lobbying,
                    lobby_agg.filing_count,
                    d.person_id,
                    d.amount as donation_amount,
                    d.cycle as donation_cycle,
                    cm.committee_thomas_id,
                    c.name as committee_name,
                    cm.role as committee_role,
                    t.transaction_type,
                    t.transaction_date,
                    t.amount_range as trade_amount
                FROM {ticker_table} e
                JOIN (
                    SELECT {lobby_id_col}, SUM(COALESCE(income, 0)) as total_lobbying,
                           COUNT(*) as filing_count
                    FROM {lobby_table}
                    WHERE filing_year >= {current_year_sql()} - 2
                    GROUP BY {lobby_id_col}
                    HAVING total_lobbying > 100000
                ) lobby_agg ON e.{ticker_id_col} = lobby_agg.{lobby_id_col}
                JOIN company_donations d
                    ON d.entity_id = e.{ticker_id_col}
                    AND d.amount > 0
                JOIN committee_memberships cm
                    ON cm.person_id = d.person_id
                    AND cm.person_id IS NOT NULL
                JOIN committees c
                    ON c.thomas_id = cm.committee_thomas_id
                    AND c.parent_thomas_id IS NULL
                JOIN congressional_trades t
                    ON t.person_id = d.person_id
                    AND t.ticker = e.ticker
                    AND e.ticker IS NOT NULL
                    AND t.transaction_date >= {now_minus_days(365)}
                ORDER BY lobby_agg.total_lobbying DESC
                {limit_sql(10)}
            """)
            rows = db.execute(sql).fetchall()

            # Group by company to build a single story per company
            company_loops = {}
            for row in rows:
                eid = row[0]
                if eid not in company_loops:
                    company_loops[eid] = {
                        "entity_id": eid,
                        "company_name": row[1],
                        "ticker": row[2],
                        "total_lobbying": float(row[3]) if row[3] else 0,
                        "filing_count": row[4],
                        "sector": sector,
                        "politicians": {},
                    }
                pid = row[5]
                if pid not in company_loops[eid]["politicians"]:
                    politician_name = _resolve_member_name(db, pid)
                    company_loops[eid]["politicians"][pid] = {
                        "person_id": pid,
                        "person_name": politician_name,
                        "donation_amount": float(row[6]) if row[6] else 0,
                        "donation_cycle": row[7],
                        "committee": row[9],
                        "committee_id": row[8],
                        "committee_role": row[10],
                        "trades": [],
                    }
                company_loops[eid]["politicians"][pid]["trades"].append({
                    "transaction_type": row[11],
                    "transaction_date": str(row[12]) if row[12] else "",
                    "amount_range": row[13],
                })

            for eid, loop_data in company_loops.items():
                politician_count = len(loop_data["politicians"])
                trade_count = sum(
                    len(p["trades"]) for p in loop_data["politicians"].values()
                )
                # Score: 8 base for having a complete loop, +1 per additional politician
                score = min(10, 7 + politician_count)

                # Flatten politicians dict to list for JSON
                politicians_list = list(loop_data["politicians"].values())
                entity_ids = [eid] + [p["person_id"] for p in politicians_list]

                stories.append({
                    "category": "lobbying_influence",
                    "score": score,
                    "evidence": {
                        "company_id": eid,
                        "company_name": loop_data["company_name"],
                        "ticker": loop_data["ticker"],
                        "sector": sector,
                        "total_lobbying": loop_data["total_lobbying"],
                        "filing_count": loop_data["filing_count"],
                        "politician_count": politician_count,
                        "trade_count": trade_count,
                        "politicians": politicians_list,
                        "entity_ids": entity_ids,
                        "data_sources": [
                            lobby_table, "company_donations",
                            "committee_memberships", "committees",
                            "congressional_trades", ticker_table,
                        ],
                    },
                })

        except Exception as e:
            logger.debug("Full influence loop check failed for %s: %s", sector, e)
            continue

    return stories


def detect_revolving_door(db) -> List[Dict[str, Any]]:
    """Detect revolving-door patterns: committee members receiving heavy
    lobbying from the industry their committee oversees.

    E.g., 'Sen. X sits on the Banking Committee. The 5 biggest banks
    each spent $Xm lobbying that committee.'
    """
    stories = []

    # Map committee jurisdiction keywords to lobbying sectors/tables
    committee_sector_map = {
        "banking": ("finance_lobbying_records", "institution_id", "finance", "tracked_institutions", "institution_id"),
        "finance": ("finance_lobbying_records", "institution_id", "finance", "tracked_institutions", "institution_id"),
        "financial": ("finance_lobbying_records", "institution_id", "finance", "tracked_institutions", "institution_id"),
        "energy": ("energy_lobbying_records", "company_id", "energy", "tracked_energy_companies", "company_id"),
        "natural resources": ("energy_lobbying_records", "company_id", "energy", "tracked_energy_companies", "company_id"),
        "commerce": ("lobbying_records", "company_id", "tech", "tracked_tech_companies", "company_id"),
        "technology": ("lobbying_records", "company_id", "tech", "tracked_tech_companies", "company_id"),
        "health": ("health_lobbying_records", "company_id", "health", "tracked_companies", "company_id"),
        "armed services": ("defense_lobbying_records", "company_id", "defense", "tracked_defense_companies", "company_id"),
        "defense": ("defense_lobbying_records", "company_id", "defense", "tracked_defense_companies", "company_id"),
        "transportation": ("transportation_lobbying_records", "company_id", "transportation", "tracked_transportation_companies", "company_id"),
    }

    try:
        # Get all top-level committees with their members
        sql = text(f"""
            SELECT c.thomas_id, c.name, c.chamber,
                   cm.person_id, cm.role, cm.member_name, cm.bioguide_id
            FROM committees c
            JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id
            WHERE c.parent_thomas_id IS NULL
                AND cm.person_id IS NOT NULL
            ORDER BY c.thomas_id, cm.role
        """)
        rows = db.execute(sql).fetchall()

        # Group by committee
        committees = {}
        for row in rows:
            cid = row[0]
            if cid not in committees:
                committees[cid] = {
                    "thomas_id": cid,
                    "name": row[1],
                    "chamber": row[2],
                    "members": [],
                }
            committees[cid]["members"].append({
                "person_id": row[3],
                "role": row[4],
                "member_name": row[5],
                "bioguide_id": row[6],
            })

        for cid, committee in committees.items():
            committee_name_lower = committee["name"].lower()

            # Find matching sector
            matched_config = None
            for keyword, config in committee_sector_map.items():
                if keyword in committee_name_lower:
                    matched_config = config
                    break

            if not matched_config:
                continue

            lobby_table, lobby_id_col, sector, entity_table, entity_id_col = matched_config

            # Get top lobbying spenders from that sector
            try:
                sql = text(f"""
                    SELECT e.{entity_id_col}, e.display_name,
                           SUM(COALESCE(l.income, 0)) as total_lobby,
                           COUNT(*) as filing_count
                    FROM {entity_table} e
                    JOIN {lobby_table} l ON l.{lobby_id_col} = e.{entity_id_col}
                    WHERE l.filing_year >= {current_year_sql()} - 2
                    GROUP BY e.{entity_id_col}, e.display_name
                    ORDER BY total_lobby DESC
                    {limit_sql(5)}
                """)
                lobby_rows = db.execute(sql).fetchall()
            except Exception:
                continue

            if not lobby_rows:
                continue

            total_sector_lobbying = sum(float(r[2]) for r in lobby_rows if r[2])
            if total_sector_lobbying < 500000:
                continue

            top_spenders = []
            for lr in lobby_rows:
                top_spenders.append({
                    "entity_id": lr[0],
                    "entity_name": lr[1],
                    "total_lobbying": float(lr[2]) if lr[2] else 0,
                    "filing_count": lr[3],
                })

            member_count = len(committee["members"])
            chair = next((m for m in committee["members"] if m["role"] == "chair"), None)

            # Score: based on lobbying amount and number of members
            score = 7
            if total_sector_lobbying > 5000000:
                score += 1
            if total_sector_lobbying > 20000000:
                score += 1
            if member_count > 15:
                score += 1
            score = min(10, score)

            entity_ids = [s["entity_id"] for s in top_spenders]
            if chair:
                entity_ids.append(chair["person_id"])

            stories.append({
                "category": "revolving_door",
                "score": score,
                "evidence": {
                    "committee_id": cid,
                    "committee_name": committee["name"],
                    "chamber": committee["chamber"],
                    "member_count": member_count,
                    "chair": chair,
                    "sector": sector,
                    "top_lobbying_spenders": top_spenders,
                    "total_sector_lobbying": total_sector_lobbying,
                    "entity_ids": entity_ids,
                    "data_sources": [
                        "committees", "committee_memberships",
                        lobby_table, entity_table,
                    ],
                },
            })

    except Exception as e:
        logger.debug("Revolving door check failed: %s", e)

    return stories


def detect_regulatory_arbitrage(db) -> List[Dict[str, Any]]:
    """Find companies with high lobbying but low/zero enforcement compared
    to sector average.

    E.g., 'Company X spends 10x the sector average on lobbying and has
    zero enforcement actions.'
    """
    stories = []

    sectors = [
        ("tech", "lobbying_records", "ftc_enforcement_actions", "tracked_tech_companies", "company_id"),
        ("health", "health_lobbying_records", "health_enforcement_actions", "tracked_companies", "company_id"),
        ("energy", "energy_lobbying_records", "energy_enforcement_actions", "tracked_energy_companies", "company_id"),
        ("defense", "defense_lobbying_records", "defense_enforcement_actions", "tracked_defense_companies", "company_id"),
        ("transportation", "transportation_lobbying_records", "transportation_enforcement_actions", "tracked_transportation_companies", "company_id"),
        ("finance", "finance_lobbying_records", "finance_enforcement_actions", "tracked_institutions", "institution_id"),
        ("chemicals", "chemical_lobbying_records", "chemical_enforcement_actions", "tracked_chemical_companies", "company_id"),
        ("agriculture", "agriculture_lobbying_records", "agriculture_enforcement_actions", "tracked_agriculture_companies", "company_id"),
    ]

    for sector, lobby_table, enforce_table, entity_table, id_col in sectors:
        try:
            # Get sector-wide averages
            avg_sql = text(f"""
                SELECT AVG(sub.total_lobby) as avg_lobby
                FROM (
                    SELECT {id_col}, SUM(COALESCE(income, 0)) as total_lobby
                    FROM {lobby_table}
                    WHERE filing_year >= {current_year_sql()} - 2
                    GROUP BY {id_col}
                ) sub
            """)
            avg_row = db.execute(avg_sql).fetchone()
            sector_avg_lobby = float(avg_row[0]) if avg_row and avg_row[0] else 0

            if sector_avg_lobby <= 0:
                continue

            # Find companies with high lobbying relative to sector avg
            # and zero or very few enforcement actions
            sql = text(f"""
                SELECT e.{id_col}, e.display_name,
                       l.total_lobby, l.filing_count,
                       COALESCE(enf.action_count, 0) as enforcement_count
                FROM {entity_table} e
                JOIN (
                    SELECT {id_col}, SUM(COALESCE(income, 0)) as total_lobby,
                           COUNT(*) as filing_count
                    FROM {lobby_table}
                    WHERE filing_year >= {current_year_sql()} - 2
                    GROUP BY {id_col}
                    HAVING total_lobby > :threshold
                ) l ON e.{id_col} = l.{id_col}
                LEFT JOIN (
                    SELECT company_id, COUNT(*) as action_count
                    FROM {enforce_table}
                    GROUP BY company_id
                ) enf ON enf.company_id = e.{id_col}
                WHERE COALESCE(enf.action_count, 0) <= 2
                ORDER BY l.total_lobby DESC
                {limit_sql(5)}
            """)
            rows = db.execute(sql, {"threshold": sector_avg_lobby * 3}).fetchall()

            for row in rows:
                entity_id = row[0]
                entity_name = row[1]
                total_lobby = float(row[2]) if row[2] else 0
                filing_count = row[3]
                enforcement_count = row[4]
                lobby_multiple = round(total_lobby / sector_avg_lobby, 1)

                # Score: 7 for 3x avg with 0 enforcement, +1 per additional 3x, max 10
                score = min(10, 6 + int(min(lobby_multiple, 12) // 3))
                if enforcement_count == 0:
                    score = min(10, score + 1)

                stories.append({
                    "category": "regulatory_capture",
                    "score": score,
                    "evidence": {
                        "company_id": entity_id,
                        "company_name": entity_name,
                        "sector": sector,
                        "total_lobbying": total_lobby,
                        "filing_count": filing_count,
                        "enforcement_actions": enforcement_count,
                        "sector_avg_lobbying": round(sector_avg_lobby, 2),
                        "lobby_multiple_of_avg": lobby_multiple,
                        "entity_ids": [entity_id],
                        "data_sources": [lobby_table, enforce_table, entity_table],
                    },
                })

        except Exception as e:
            logger.debug("Regulatory arbitrage check failed for %s: %s", sector, e)
            continue

    return stories


def detect_bipartisan_buying(db) -> List[Dict[str, Any]]:
    """Find companies that donate to BOTH parties' members on the same
    committee.

    E.g., 'Company X donated to 8 members of the Finance Committee --
    4 Democrats and 4 Republicans.'
    """
    stories = []

    try:
        # Find companies donating to committee members of both parties
        # We need: company_donations -> committee_memberships -> party info
        #
        # tracked_members has party (D, R, I)
        # committee_memberships has person_id
        # company_donations has entity_id (company) and person_id (politician)
        sql = text(f"""
            SELECT
                d.entity_id,
                d.entity_type,
                cm.committee_thomas_id,
                c.name as committee_name,
                tm.party,
                COUNT(DISTINCT d.person_id) as recipient_count,
                SUM(d.amount) as total_donated
            FROM company_donations d
            JOIN committee_memberships cm ON cm.person_id = d.person_id
            JOIN committees c ON c.thomas_id = cm.committee_thomas_id
                AND c.parent_thomas_id IS NULL
            JOIN tracked_members tm ON tm.person_id = d.person_id
            WHERE d.amount > 0
                AND d.person_id IS NOT NULL
                AND tm.party IN ('D', 'R')
            GROUP BY d.entity_id, d.entity_type, cm.committee_thomas_id, c.name, tm.party
            ORDER BY d.entity_id, cm.committee_thomas_id
        """)
        rows = db.execute(sql).fetchall()

        # Group by (company, committee) and check for both parties
        company_committee = {}
        for row in rows:
            key = (row[0], row[2])  # (entity_id, committee_id)
            if key not in company_committee:
                company_committee[key] = {
                    "entity_id": row[0],
                    "entity_type": row[1],
                    "committee_id": row[2],
                    "committee_name": row[3],
                    "parties": {},
                }
            party = row[4]
            company_committee[key]["parties"][party] = {
                "recipient_count": row[5],
                "total_donated": float(row[6]) if row[6] else 0,
            }

        for key, data in company_committee.items():
            if "D" not in data["parties"] or "R" not in data["parties"]:
                continue

            dem_count = data["parties"]["D"]["recipient_count"]
            rep_count = data["parties"]["R"]["recipient_count"]
            dem_total = data["parties"]["D"]["total_donated"]
            rep_total = data["parties"]["R"]["total_donated"]
            total_recipients = dem_count + rep_count
            total_donated = dem_total + rep_total

            if total_recipients < 4:
                continue

            entity_name = _resolve_entity_name(db, data["entity_id"])

            # Score: 7 base for bipartisan donations, +1 per 4 recipients, max 10
            score = min(10, 6 + int(total_recipients / 4))
            if total_donated > 100000:
                score = min(10, score + 1)

            stories.append({
                "category": "bipartisan_buying",
                "score": score,
                "evidence": {
                    "company_id": data["entity_id"],
                    "company_name": entity_name,
                    "sector": data["entity_type"],
                    "committee_id": data["committee_id"],
                    "committee_name": data["committee_name"],
                    "democrat_recipients": dem_count,
                    "democrat_total": dem_total,
                    "republican_recipients": rep_count,
                    "republican_total": rep_total,
                    "total_recipients": total_recipients,
                    "total_donated": total_donated,
                    "entity_ids": [data["entity_id"]],
                    "data_sources": [
                        "company_donations", "committee_memberships",
                        "committees", "tracked_members",
                    ],
                },
            })

    except Exception as e:
        logger.debug("Bipartisan buying check failed: %s", e)

    return stories


def detect_trade_timing(db) -> List[Dict[str, Any]]:
    """Detect congressional trades that happen within N days of a committee
    vote or bill action that affects the traded company's sector.

    E.g., 'Rep. X bought $AAPL stock 3 days before a committee vote on
    tech regulation.'
    """
    stories = []

    WINDOW_DAYS = 14  # Look for trades within 14 days of a vote/action

    try:
        # Find trades where the member sits on a committee that had
        # a related vote or bill action within WINDOW_DAYS
        #
        # Join path:
        #   congressional_trades (person_id, ticker, transaction_date)
        #   -> committee_memberships (person_id -> committee_thomas_id)
        #   -> bill_actions (committee name match, action_date within window)
        #   -> bills (bill_id -> policy area for context)
        #
        # We use a date window check: |trade_date - action_date| <= WINDOW_DAYS

        if is_oracle():
            date_diff = "ABS(CAST(t.transaction_date AS DATE) - CAST(ba.action_date AS DATE))"
        elif is_postgres():
            date_diff = "ABS(EXTRACT(EPOCH FROM (t.transaction_date::timestamp - ba.action_date)) / 86400)"
        else:
            date_diff = "ABS(JULIANDAY(t.transaction_date) - JULIANDAY(ba.action_date))"

        sql = text(f"""
            SELECT
                t.person_id,
                t.ticker,
                t.transaction_type,
                t.transaction_date,
                t.amount_range,
                ba.bill_id,
                ba.action_text,
                ba.action_date,
                ba.committee as action_committee,
                b.title as bill_title,
                b.policy_area,
                c.name as member_committee,
                {date_diff} as days_apart
            FROM congressional_trades t
            JOIN committee_memberships cm ON cm.person_id = t.person_id
                AND cm.person_id IS NOT NULL
            JOIN committees c ON c.thomas_id = cm.committee_thomas_id
                AND c.parent_thomas_id IS NULL
            JOIN bill_actions ba ON ba.action_date >= {now_minus_days(90)}
                AND {date_diff} <= :window
                AND ba.committee IS NOT NULL
            JOIN bills b ON b.bill_id = ba.bill_id
            WHERE t.transaction_date >= {now_minus_days(90)}
                AND t.ticker IS NOT NULL AND t.ticker != ''
            ORDER BY days_apart ASC
            {limit_sql(20)}
        """)
        rows = db.execute(sql, {"window": WINDOW_DAYS}).fetchall()

        # Deduplicate by (person_id, ticker, bill_id)
        seen = set()
        for row in rows:
            dedup_key = (row[0], row[1], row[5])
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            person_id = row[0]
            ticker = row[1]
            tx_type = row[2]
            tx_date = str(row[3]) if row[3] else ""
            amount_range = row[4]
            bill_id = row[5]
            action_text = row[6]
            action_date = str(row[7]) if row[7] else ""
            bill_title = row[9]
            policy_area = row[10]
            committee_name = row[11]
            days_apart = int(row[12]) if row[12] else 0

            person_name = _resolve_member_name(db, person_id)

            # Score: based on proximity (closer = higher score)
            if days_apart <= 3:
                score = 10
            elif days_apart <= 7:
                score = 9
            elif days_apart <= 10:
                score = 8
            else:
                score = 7

            # Boost if the trade was a purchase before a positive action
            # or a sale before negative action
            if tx_type and "purchase" in tx_type.lower() and days_apart <= 5:
                score = min(10, score + 1)

            stories.append({
                "category": "trade_timing",
                "score": score,
                "evidence": {
                    "person_id": person_id,
                    "person_name": person_name,
                    "ticker": ticker,
                    "transaction_type": tx_type,
                    "transaction_date": tx_date,
                    "amount_range": amount_range,
                    "bill_id": bill_id,
                    "bill_title": bill_title,
                    "action_text": action_text,
                    "action_date": action_date,
                    "policy_area": policy_area,
                    "committee_name": committee_name,
                    "days_apart": days_apart,
                    "entity_ids": [person_id],
                    "data_sources": [
                        "congressional_trades", "committee_memberships",
                        "bill_actions", "bills", "committees",
                    ],
                },
            })

    except Exception as e:
        logger.debug("Trade timing check failed: %s", e)

    return stories


# ── Patterns 10-14 ─────────────────────────────────────────────────────


def detect_stock_act_violations(db) -> List[Dict[str, Any]]:
    """Find congress members with chronic late trade disclosures (reporting_gap > 45 days).

    The STOCK Act requires disclosure within 45 days. Members with 3+ late
    trades since 2024 are flagged, scored by worst gap.
    """
    stories = []
    try:
        sql = text(f"""
            SELECT person_id, ticker, transaction_type, transaction_date,
                   disclosure_date, reporting_gap
            FROM congressional_trades
            WHERE transaction_date >= '2024-01-01'
                AND reporting_gap IS NOT NULL
        """)
        rows = db.execute(sql).fetchall()

        # Group by person_id, filter to late trades
        person_trades: Dict[str, list] = {}
        for row in rows:
            person_id = str(row[0]) if row[0] else None
            if not person_id:
                continue
            gap_str = str(row[5]) if row[5] else ""
            try:
                gap_days = int(gap_str.split()[0])
            except (ValueError, IndexError):
                continue
            if gap_days <= 45:
                continue
            if person_id not in person_trades:
                person_trades[person_id] = []
            person_trades[person_id].append({
                "ticker": row[1],
                "transaction_type": row[2],
                "transaction_date": str(row[3]) if row[3] else "",
                "disclosure_date": str(row[4]) if row[4] else "",
                "gap_days": gap_days,
            })

        for person_id, late_trades in person_trades.items():
            if len(late_trades) < 3:
                continue

            worst_gap = max(t["gap_days"] for t in late_trades)

            # Score by worst gap
            if worst_gap >= 271:
                score = 10
            elif worst_gap >= 181:
                score = 9
            elif worst_gap >= 91:
                score = 8
            else:
                score = 7

            # Get total trade count for this person
            total_sql = text(f"""
                SELECT COUNT(*) FROM congressional_trades
                WHERE person_id = :pid AND transaction_date >= '2024-01-01'
            """)
            total_row = db.execute(total_sql, {"pid": person_id}).fetchone()
            total_trades = total_row[0] if total_row else len(late_trades)

            tickers = list(set(t["ticker"] for t in late_trades if t["ticker"]))
            sample_trades = sorted(late_trades, key=lambda t: t["gap_days"], reverse=True)[:5]
            person_name = _resolve_member_name(db, person_id)

            stories.append({
                "category": "stock_act_violation",
                "score": score,
                "evidence": {
                    "person_id": person_id,
                    "person_name": person_name,
                    "late_trade_count": len(late_trades),
                    "total_trades": total_trades,
                    "worst_gap_days": worst_gap,
                    "tickers": ", ".join(tickers),
                    "sample_trades": [
                        {"ticker": t["ticker"], "date": t["transaction_date"], "gap": t["gap_days"]}
                        for t in sample_trades
                    ],
                    "entity_ids": [person_id],
                    "data_sources": ["congressional_trades"],
                },
            })

    except Exception as e:
        logger.debug("STOCK Act violation check failed: %s", e)

    return stories


def detect_committee_stock_overlap(db) -> List[Dict[str, Any]]:
    """Detect members trading stocks in sectors their committee oversees.

    Matches specific tickers to committee jurisdictions — e.g., a member on
    the Armed Services Committee buying Lockheed Martin stock.
    """
    stories = []

    # Committee keyword -> list of sector tickers
    committee_tickers = {
        "Health": ["UNH", "LLY", "MRK", "PFE", "JNJ", "ABBV", "AMGN", "CVS", "CI", "HUM"],
        "Armed": ["LMT", "BA", "RTX", "GD", "NOC", "HII", "LHX"],
        "Science": ["META", "GOOG", "GOOGL", "MSFT", "AAPL", "AMZN", "NVDA", "INTC", "CRM", "ORCL"],
        "Commerce": ["META", "GOOG", "GOOGL", "MSFT", "AAPL", "AMZN", "NVDA", "INTC", "CRM", "ORCL"],
        "Intelligence": ["META", "GOOG", "GOOGL", "MSFT", "AAPL", "AMZN", "NVDA", "INTC", "CRM", "ORCL"],
        "Financial": ["JPM", "GS", "MS", "BAC", "C", "WFC", "BLK", "V", "MA", "AXP"],
        "Banking": ["JPM", "GS", "MS", "BAC", "C", "WFC", "BLK", "V", "MA", "AXP"],
        "Energy": ["XOM", "CVX", "COP", "SLB", "EOG", "OXY"],
        "Natural Resources": ["XOM", "CVX", "COP", "SLB", "EOG", "OXY"],
    }

    try:
        # Get all committee memberships with committee names
        sql = text("""
            SELECT cm.person_id, cm.member_name, c.name as committee_name
            FROM committee_memberships cm
            JOIN committees c ON c.thomas_id = cm.committee_thomas_id
            WHERE cm.person_id IS NOT NULL
                AND c.parent_thomas_id IS NULL
        """)
        membership_rows = db.execute(sql).fetchall()

        # Build person -> [(committee_name, keyword, tickers)] map
        person_committees: Dict[str, list] = {}
        person_names: Dict[str, str] = {}
        for row in membership_rows:
            pid = str(row[0])
            person_names[pid] = row[1] or pid
            committee_name = row[2] or ""
            for keyword, tickers in committee_tickers.items():
                if keyword.lower() in committee_name.lower():
                    if pid not in person_committees:
                        person_committees[pid] = []
                    person_committees[pid].append({
                        "committee_name": committee_name,
                        "keyword": keyword,
                        "tickers": tickers,
                    })

        if not person_committees:
            return stories

        # Get all purchases since 2024
        trade_sql = text(f"""
            SELECT person_id, ticker, transaction_date, transaction_type
            FROM congressional_trades
            WHERE transaction_date >= '2024-01-01'
                AND ticker IS NOT NULL AND ticker != ''
                AND transaction_type IS NOT NULL
                AND LOWER(transaction_type) LIKE '%purchase%'
        """)
        trade_rows = db.execute(trade_sql).fetchall()

        # Match trades to committee jurisdictions
        person_overlaps: Dict[str, list] = {}
        for row in trade_rows:
            pid = str(row[0]) if row[0] else None
            if not pid or pid not in person_committees:
                continue
            ticker = str(row[1]).upper() if row[1] else ""
            for cm_info in person_committees[pid]:
                if ticker in cm_info["tickers"]:
                    if pid not in person_overlaps:
                        person_overlaps[pid] = []
                    person_overlaps[pid].append({
                        "ticker": ticker,
                        "date": str(row[2]) if row[2] else "",
                        "committee": cm_info["committee_name"],
                    })

        for pid, overlaps in person_overlaps.items():
            count = len(overlaps)
            if count == 0:
                continue

            if count >= 11:
                score = 10
            elif count >= 6:
                score = 9
            elif count >= 3:
                score = 8
            else:
                score = 7

            committees_list = list(set(o["committee"] for o in overlaps))
            tickers_list = list(set(o["ticker"] for o in overlaps))
            person_name = _resolve_member_name(db, pid) or person_names.get(pid, pid)

            stories.append({
                "category": "committee_stock_trade",
                "score": score,
                "evidence": {
                    "person_id": pid,
                    "person_name": person_name,
                    "overlap_count": count,
                    "committees": committees_list,
                    "tickers_traded": tickers_list,
                    "sample_trades": overlaps[:10],
                    "entity_ids": [pid],
                    "data_sources": [
                        "congressional_trades", "committee_memberships", "committees",
                    ],
                },
            })

    except Exception as e:
        logger.debug("Committee stock overlap check failed: %s", e)

    return stories


def detect_penalty_contract_ratio(db) -> List[Dict[str, Any]]:
    """Find companies winning huge government contracts with zero or minimal
    enforcement penalties.

    Flags companies with $10M+ in contracts but under $1000 in penalties.
    """
    stories = []

    sectors = [
        ("health", "health_government_contracts", "health_enforcement_actions", "tracked_companies", "company_id"),
        ("tech", "government_contracts", "ftc_enforcement_actions", "tracked_tech_companies", "company_id"),
        ("energy", "energy_government_contracts", "energy_enforcement_actions", "tracked_energy_companies", "company_id"),
        ("defense", "defense_government_contracts", "defense_enforcement_actions", "tracked_defense_companies", "company_id"),
        ("finance", "finance_government_contracts", "finance_enforcement_actions", "tracked_institutions", "institution_id"),
        ("transportation", "transportation_government_contracts", "transportation_enforcement_actions", "tracked_transportation_companies", "company_id"),
        ("chemicals", "chemical_government_contracts", "chemical_enforcement_actions", "tracked_chemical_companies", "company_id"),
        ("agriculture", "agriculture_government_contracts", "agriculture_enforcement_actions", "tracked_agriculture_companies", "company_id"),
    ]

    all_candidates = []

    for sector, contract_table, enforce_table, entity_table, id_col in sectors:
        try:
            sql = text(f"""
                SELECT e.{id_col}, e.display_name,
                       COALESCE(con.total_contracts, 0) as total_contracts,
                       COALESCE(con.contract_count, 0) as contract_count,
                       COALESCE(enf.total_penalties, 0) as total_penalties,
                       COALESCE(enf.penalty_count, 0) as penalty_count
                FROM {entity_table} e
                LEFT JOIN (
                    SELECT company_id, SUM(COALESCE(award_amount, 0)) as total_contracts,
                           COUNT(*) as contract_count
                    FROM {contract_table}
                    GROUP BY company_id
                ) con ON con.company_id = e.{id_col}
                LEFT JOIN (
                    SELECT company_id, SUM(COALESCE(penalty_amount, 0)) as total_penalties,
                           COUNT(*) as penalty_count
                    FROM {enforce_table}
                    GROUP BY company_id
                ) enf ON enf.company_id = e.{id_col}
                WHERE COALESCE(con.total_contracts, 0) > 10000000
                    AND COALESCE(enf.total_penalties, 0) < 1000
                ORDER BY total_contracts DESC
                {limit_sql(20)}
            """)
            rows = db.execute(sql).fetchall()

            for row in rows:
                total_contracts = float(row[2]) if row[2] else 0
                total_penalties = float(row[4]) if row[4] else 0

                if total_contracts >= 10_000_000_000:
                    score = 10
                elif total_contracts >= 1_000_000_000:
                    score = 9
                elif total_contracts >= 100_000_000:
                    score = 8
                else:
                    score = 7

                if total_penalties == 0:
                    ratio_desc = f"${total_contracts:,.0f} in contracts, ZERO penalties"
                else:
                    ratio_desc = f"${total_contracts:,.0f} in contracts vs ${total_penalties:,.0f} in penalties"

                all_candidates.append({
                    "category": "penalty_contract_ratio",
                    "score": score,
                    "total_contracts": total_contracts,
                    "evidence": {
                        "company_id": row[0],
                        "display_name": row[1],
                        "sector": sector,
                        "total_contracts": total_contracts,
                        "contract_count": row[3],
                        "total_penalties": total_penalties,
                        "penalty_count": row[5],
                        "ratio_description": ratio_desc,
                        "entity_ids": [row[0]],
                        "data_sources": [contract_table, enforce_table, entity_table],
                    },
                })

        except Exception as e:
            logger.debug("Penalty-contract ratio check failed for %s: %s", sector, e)
            continue

    # Sort by contract value descending, keep top 10
    all_candidates.sort(key=lambda c: c["total_contracts"], reverse=True)
    for c in all_candidates[:10]:
        stories.append({
            "category": c["category"],
            "score": c["score"],
            "evidence": c["evidence"],
        })

    return stories


def detect_prolific_traders(db) -> List[Dict[str, Any]]:
    """Find congress members with 50+ trades since 2024 who also receive
    corporate donations — the intersection of heavy trading and donor ties.
    """
    stories = []
    try:
        # Get trade counts per person
        trade_sql = text(f"""
            SELECT person_id, COUNT(*) as trade_count,
                   COUNT(DISTINCT ticker) as unique_tickers
            FROM congressional_trades
            WHERE transaction_date >= '2024-01-01'
                AND person_id IS NOT NULL
            GROUP BY person_id
            HAVING trade_count >= 50
            ORDER BY trade_count DESC
        """)
        trade_rows = db.execute(trade_sql).fetchall()

        for trow in trade_rows:
            person_id = str(trow[0])
            trade_count = trow[1]
            unique_tickers = trow[2]

            # Check for corporate donations to this person
            try:
                donation_sql = text(f"""
                    SELECT SUM(COALESCE(amount, 0)) as donation_total,
                           COUNT(DISTINCT entity_id) as donor_count
                    FROM company_donations
                    WHERE person_id = :pid
                        AND amount > 0
                """)
                don_row = db.execute(donation_sql, {"pid": person_id}).fetchone()
                if not don_row or not don_row[0] or float(don_row[0]) == 0:
                    continue
                donation_total = float(don_row[0])
                donor_count = don_row[1]
            except Exception:
                continue

            # Get top donors
            try:
                top_donor_sql = text(f"""
                    SELECT entity_id, committee_name, SUM(COALESCE(amount, 0)) as total
                    FROM company_donations
                    WHERE person_id = :pid AND amount > 0
                    GROUP BY entity_id, committee_name
                    ORDER BY total DESC
                    {limit_sql(5)}
                """)
                donor_rows = db.execute(top_donor_sql, {"pid": person_id}).fetchall()
                top_donors = [
                    {"entity_id": r[0], "committee": r[1], "amount": float(r[2]) if r[2] else 0}
                    for r in donor_rows
                ]
                # Resolve donor names
                for d in top_donors:
                    d["name"] = _resolve_entity_name(db, d["entity_id"])
            except Exception:
                top_donors = []

            # Get top traded tickers
            try:
                top_ticker_sql = text(f"""
                    SELECT ticker, COUNT(*) as cnt
                    FROM congressional_trades
                    WHERE person_id = :pid
                        AND transaction_date >= '2024-01-01'
                        AND ticker IS NOT NULL AND ticker != ''
                    GROUP BY ticker
                    ORDER BY cnt DESC
                    {limit_sql(5)}
                """)
                ticker_rows = db.execute(top_ticker_sql, {"pid": person_id}).fetchall()
                top_tickers = [r[0] for r in ticker_rows if r[0]]
            except Exception:
                top_tickers = []

            # Score by trade count
            if trade_count >= 200:
                score = 10
            elif trade_count >= 150:
                score = 9
            elif trade_count >= 100:
                score = 8
            else:
                score = 7

            person_name = _resolve_member_name(db, person_id)

            stories.append({
                "category": "prolific_trader",
                "score": score,
                "evidence": {
                    "person_id": person_id,
                    "person_name": person_name,
                    "trade_count": trade_count,
                    "unique_tickers": unique_tickers,
                    "donation_total": donation_total,
                    "donor_count": donor_count,
                    "top_donors": top_donors,
                    "top_tickers": top_tickers,
                    "entity_ids": [person_id],
                    "data_sources": ["congressional_trades", "company_donations"],
                },
            })

    except Exception as e:
        logger.debug("Prolific trader check failed: %s", e)

    return stories


def detect_enforcement_immunity(db) -> List[Dict[str, Any]]:
    """Find companies with $50M+ in government contracts and zero enforcement
    actions across all sectors — companies that appear immune to regulatory action.
    """
    stories = []

    sectors = [
        ("health", "health_government_contracts", "health_enforcement_actions", "health_lobbying_records", "tracked_companies", "company_id"),
        ("tech", "government_contracts", "ftc_enforcement_actions", "lobbying_records", "tracked_tech_companies", "company_id"),
        ("energy", "energy_government_contracts", "energy_enforcement_actions", "energy_lobbying_records", "tracked_energy_companies", "company_id"),
        ("defense", "defense_government_contracts", "defense_enforcement_actions", "defense_lobbying_records", "tracked_defense_companies", "company_id"),
        ("finance", "finance_government_contracts", "finance_enforcement_actions", "finance_lobbying_records", "tracked_institutions", "institution_id"),
        ("transportation", "transportation_government_contracts", "transportation_enforcement_actions", "transportation_lobbying_records", "tracked_transportation_companies", "company_id"),
        ("chemicals", "chemical_government_contracts", "chemical_enforcement_actions", "chemical_lobbying_records", "tracked_chemical_companies", "company_id"),
        ("agriculture", "agriculture_government_contracts", "agriculture_enforcement_actions", "agriculture_lobbying_records", "tracked_agriculture_companies", "company_id"),
    ]

    all_candidates = []

    for sector, contract_table, enforce_table, lobby_table, entity_table, id_col in sectors:
        try:
            sql = text(f"""
                SELECT e.{id_col}, e.display_name,
                       COALESCE(con.total_contracts, 0) as total_contracts,
                       COALESCE(con.contract_count, 0) as contract_count,
                       COALESCE(lob.total_lobbying, 0) as total_lobbying,
                       COALESCE(lob.lobby_count, 0) as lobby_count,
                       COALESCE(enf.action_count, 0) as enforcement_count
                FROM {entity_table} e
                LEFT JOIN (
                    SELECT company_id, SUM(COALESCE(award_amount, 0)) as total_contracts,
                           COUNT(*) as contract_count
                    FROM {contract_table}
                    GROUP BY company_id
                ) con ON con.company_id = e.{id_col}
                LEFT JOIN (
                    SELECT {id_col}, SUM(COALESCE(income, 0)) as total_lobbying,
                           COUNT(*) as lobby_count
                    FROM {lobby_table}
                    GROUP BY {id_col}
                ) lob ON lob.{id_col} = e.{id_col}
                LEFT JOIN (
                    SELECT company_id, COUNT(*) as action_count
                    FROM {enforce_table}
                    GROUP BY company_id
                ) enf ON enf.company_id = e.{id_col}
                WHERE COALESCE(con.total_contracts, 0) > 50000000
                    AND COALESCE(enf.action_count, 0) = 0
                ORDER BY total_contracts DESC
                {limit_sql(20)}
            """)
            rows = db.execute(sql).fetchall()

            for row in rows:
                total_contracts = float(row[2]) if row[2] else 0
                total_lobbying = float(row[4]) if row[4] else 0

                if total_contracts >= 1_000_000_000:
                    score = 10
                elif total_contracts >= 500_000_000:
                    score = 9
                elif total_contracts >= 200_000_000:
                    score = 8
                else:
                    score = 7

                all_candidates.append({
                    "category": "enforcement_immunity",
                    "score": score,
                    "total_contracts": total_contracts,
                    "evidence": {
                        "company_id": row[0],
                        "display_name": row[1],
                        "sector": sector,
                        "total_contracts": total_contracts,
                        "contract_count": row[3],
                        "lobbying_total": total_lobbying,
                        "lobbying_count": row[5],
                        "entity_ids": [row[0]],
                        "data_sources": [contract_table, enforce_table, lobby_table, entity_table],
                    },
                })

        except Exception as e:
            logger.debug("Enforcement immunity check failed for %s: %s", sector, e)
            continue

    # Sort by contract value descending, keep top 15
    all_candidates.sort(key=lambda c: c["total_contracts"], reverse=True)
    for c in all_candidates[:15]:
        stories.append({
            "category": c["category"],
            "score": c["score"],
            "evidence": c["evidence"],
        })

    return stories


def detect_foreign_lobbying(db) -> List[Dict[str, Any]]:
    """Find countries with the most active foreign lobbying operations in the US.

    Uses FARA data to surface: which countries have the most registered agents,
    which firms represent multiple foreign governments, and countries with
    active registrants lobbying on sensitive topics.
    """
    stories = []

    try:
        # Top countries by foreign principal count (country is on principals, not registrants)
        sql = text("""
            SELECT country, COUNT(*) as cnt
            FROM fara_foreign_principals
            WHERE country IS NOT NULL AND country != '' AND country != 'INTERNATIONAL'
            GROUP BY country
            HAVING COUNT(*) >= 5
            ORDER BY cnt DESC
            LIMIT 10
        """)
        rows = db.execute(sql).fetchall()

        for row in rows:
            country = row[0]
            count = row[1]
            if count >= 20:
                score = 10
            elif count >= 10:
                score = 9
            else:
                score = 8

            stories.append({
                "category": "foreign_lobbying",
                "score": score,
                "evidence": {
                    "country": country,
                    "foreign_principals_count": count,
                    "sector": "politics",
                    "source_tables": "fara_foreign_principals",
                    "data_sources": ["fara_foreign_principals"],
                    "entity_ids": [],
                },
            })

        # Firms representing multiple foreign governments
        sql2 = text("""
            SELECT registrant_name, COUNT(DISTINCT country) as country_count,
                   COUNT(*) as total_registrations
            FROM fara_foreign_principals
            WHERE registrant_name IS NOT NULL
                AND country IS NOT NULL AND country != '' AND country != 'INTERNATIONAL'
            GROUP BY registrant_name
            HAVING COUNT(DISTINCT country) >= 3
            ORDER BY country_count DESC
            LIMIT 5
        """)
        rows2 = db.execute(sql2).fetchall()

        for row in rows2:
            firm = row[0]
            country_count = row[1]
            score = min(10, 7 + country_count // 2)

            stories.append({
                "category": "foreign_lobbying",
                "score": score,
                "evidence": {
                    "firm_name": firm,
                    "countries_represented": country_count,
                    "total_registrations": row[2],
                    "sector": "politics",
                    "source_tables": "fara_registrants",
                    "data_sources": ["fara_registrants"],
                    "entity_ids": [],
                },
            })

    except Exception as e:
        logger.debug("Foreign lobbying detection failed: %s", e)

    return stories


# ── Main ────────────────────────────────────────────────────────────────


DETECTORS = {
    "lobbying_spike": detect_lobbying_spikes,
    "trade_cluster": detect_trade_clusters,
    "contract_windfall": detect_contract_windfalls,
    "enforcement_gap": detect_enforcement_gaps,
    "full_influence_loop": detect_full_influence_loop,
    "revolving_door": detect_revolving_door,
    "regulatory_arbitrage": detect_regulatory_arbitrage,
    "bipartisan_buying": detect_bipartisan_buying,
    "trade_timing": detect_trade_timing,
    "stock_act_violation": detect_stock_act_violations,
    "committee_stock_trade": detect_committee_stock_overlap,
    "penalty_contract_ratio": detect_penalty_contract_ratio,
    "prolific_trader": detect_prolific_traders,
    "enforcement_immunity": detect_enforcement_immunity,
    "foreign_lobbying": detect_foreign_lobbying,
}


def _infer_sector(evidence: Dict) -> Optional[str]:
    """Infer sector from evidence dict."""
    sector = evidence.get("sector")
    if sector:
        return sector

    source_table = evidence.get("source_table", "") or ""
    source_tables = evidence.get("source_tables", "") or ""
    all_tables = f"{source_table} {source_tables}".lower()

    for keyword, sector_name in [
        ("defense", "defense"),
        ("energy", "energy"),
        ("health", "health"),
        ("finance", "finance"),
        ("tech", "tech"),
        ("transport", "transportation"),
        ("chemical", "chemicals"),
        ("agriculture", "agriculture"),
    ]:
        if keyword in all_tables:
            return sector_name

    return None


def main():
    parser = argparse.ArgumentParser(description="Detect and generate data stories")
    parser.add_argument("--dry-run", action="store_true", help="Detect patterns but don't generate/store stories")
    parser.add_argument("--pattern", type=str, choices=list(DETECTORS.keys()), help="Run only this pattern")
    parser.add_argument("--max-stories", type=int, default=DEFAULT_MAX_STORIES, help="Max stories to generate")
    parser.add_argument("--min-score", type=int, default=MIN_SCORE_FOR_STORY, help="Minimum score (1-10) for generation")
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

        # Sort by score descending — best stories first
        all_candidates.sort(key=lambda c: c.get("score", 0), reverse=True)

        # Filter by minimum score
        qualified = [c for c in all_candidates if c.get("score", 0) >= args.min_score]
        logger.info(
            "Total candidates: %d, qualified (score >= %d): %d",
            len(all_candidates), args.min_score, len(qualified),
        )

        if args.dry_run:
            for c in all_candidates:
                score = c.get("score", 0)
                qualified_marker = " [QUALIFIED]" if score >= args.min_score else ""
                logger.info(
                    "[DRY-RUN] %s (score=%d%s): %s",
                    c["category"], score, qualified_marker,
                    json.dumps(c["evidence"], default=str)[:300],
                )
            return

        # Diversify: cap per-pattern to prevent one pattern from dominating.
        # Prioritize rare patterns (revolving_door, enforcement_gap, lobbying_spike)
        # over common ones (bipartisan_buying which produces 900+ candidates).
        PER_PATTERN_CAP = 3
        diversified = []
        pattern_counts: dict[str, int] = {}
        for c in qualified:
            cat = c["category"]
            pattern_counts.setdefault(cat, 0)
            if pattern_counts[cat] < PER_PATTERN_CAP:
                diversified.append(c)
                pattern_counts[cat] += 1
        logger.info(
            "Diversified: %d stories across %d patterns (cap=%d/pattern)",
            len(diversified), len(pattern_counts), PER_PATTERN_CAP,
        )

        # Generate stories for diversified candidates
        stories_created = 0
        for candidate in diversified[:args.max_stories]:
            category = candidate["category"]
            evidence = candidate["evidence"]
            score = candidate.get("score", 0)

            # Check if similar story already exists (within 7 days)
            company_id = evidence.get("company_id", "")
            person_id = evidence.get("person_id", "")
            entity_key = company_id or person_id or category
            slug_prefix = f"{category}-{entity_key}"
            existing = db.query(Story).filter(
                Story.slug.like(f"{slug_prefix}%"),
                Story.created_at >= text(datetime_now_minus_days(7)),
            ).first()
            if existing:
                logger.info("Skipping %s — similar story exists: %s", category, existing.slug)
                continue

            # Generate story text via Claude Haiku
            logger.info(
                "Generating story: %s (score=%d) for %s",
                category, score, entity_key,
            )
            result = _generate_story_text(evidence, category)
            if not result:
                continue

            title = result.get("title", f"Untitled {category}")
            slug = _slugify(title)

            # Ensure unique slug
            slug_exists = db.query(Story).filter_by(slug=slug).first()
            if slug_exists:
                slug = f"{slug}-{int(time.time()) % 10000}"

            sector = _infer_sector(evidence)

            # Collect entity IDs from evidence
            entity_ids = evidence.get("entity_ids", [])
            if not entity_ids:
                if company_id:
                    entity_ids.append(company_id)
                if person_id:
                    entity_ids.append(person_id)
                member_ids = evidence.get("member_ids", [])
                if member_ids:
                    entity_ids.extend(member_ids)
            # Also include cited_entities from Claude response
            cited = result.get("cited_entities", [])
            if cited:
                entity_ids = list(set(entity_ids + cited))

            # Data sources from evidence + Claude response
            data_sources = evidence.get("data_sources", [])
            result_sources = result.get("data_sources", [])
            if result_sources:
                data_sources = list(set(data_sources + result_sources))

            # Use 'content' field from Claude if available, else fall back to 'body'
            body = result.get("content") or result.get("body", "")

            # Verify story claims against data sources
            primary_entity = company_id or person_id or (entity_ids[0] if entity_ids else "")
            v_entity_type = _map_entity_type(category, evidence)
            verification = _verify_story(db, body, primary_entity, v_entity_type)
            v_score = verification.get("score")
            v_tier = verification.get("tier")
            v_data = verification.get("data")

            # Auto-publish if verified or partially verified; draft if unverified
            auto_status = "draft"
            if v_tier in ("verified", "partially_verified"):
                auto_status = "published"
                from datetime import datetime, timezone as tz
                pub_at = datetime.now(tz.utc)
            else:
                pub_at = None

            logger.info(
                "Verification: %s (score=%.2f, tier=%s) — %s",
                title[:50], v_score or 0, v_tier or "none",
                "auto-publishing" if auto_status == "published" else "saving as draft for review",
            )

            story = Story(
                title=title,
                slug=slug,
                summary=result.get("summary", ""),
                body=body,
                category=category,
                sector=sector,
                entity_ids=entity_ids,
                data_sources=data_sources,
                evidence=evidence,
                status=auto_status,
                published_at=pub_at,
                verification_score=v_score,
                verification_tier=v_tier,
                verification_data=json.dumps(v_data, default=str) if v_data else None,
            )
            db.add(story)
            db.flush()
            stories_created += 1
            logger.info("Created story: '%s' (slug: %s, score: %d, verification: %s)", title, slug, score, v_tier or "none")

        if stories_created > 0:
            db.commit()

        logger.info(
            "Story detection complete: %d candidates found, %d qualified, %d stories created",
            len(all_candidates), len(qualified), stories_created,
        )

    except Exception as e:
        logger.error("Story detection failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
