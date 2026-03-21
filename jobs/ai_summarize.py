"""
WeThePeople AI Summarization Pipeline
======================================
Uses Claude Sonnet to generate plain-English summaries for:
  1. Vote descriptions (what the vote was actually about)
  2. Enforcement action summaries (what happened and why it matters)
  3. Contract descriptions (plain-English contract purpose)
  4. Lobbying issue decoder (what they lobbied for, simplified)
  5. Politician profile summaries (political fingerprint)
  6. Company/institution risk narratives (political influence profile)
  7. Influence loop narratives (story connecting the dots)

Uses shared budget ledger (~/.claude_api_budget.json) compatible with
HedgeBrain and Guardian projects.

Usage:
  python jobs/ai_summarize.py                    # Run all summarizers
  python jobs/ai_summarize.py --votes            # Votes only
  python jobs/ai_summarize.py --enforcement      # Enforcement only
  python jobs/ai_summarize.py --contracts        # Contracts only
  python jobs/ai_summarize.py --lobbying         # Lobbying only
  python jobs/ai_summarize.py --profiles         # Politician + company profiles
  python jobs/ai_summarize.py --dry-run          # Show what would be summarized
  python jobs/ai_summarize.py --limit 50         # Limit records per category
"""
import argparse
import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "wethepeople.db")
RESEARCH_MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 1024  # Summaries are short

# ── Sonnet Pricing ───────────────────────────────────────────
SONNET_INPUT_COST_PER_M = 3.0    # $3 per 1M input tokens
SONNET_OUTPUT_COST_PER_M = 15.0  # $15 per 1M output tokens

# ── Budget ───────────────────────────────────────────────────
BUDGET_LEDGER_PATH = Path(os.path.expanduser("~/.claude_api_budget.json"))
WETHEPEOPLE_MONTHLY_CAP = 20.00  # $20/month for WeThePeople
TOTAL_MONTHLY_CAP = 55.00        # $55 shared: HB $25 + Guardian $15 + WTP $20 - $5 buffer

# ── Batch Config ─────────────────────────────────────────────
BATCH_SIZE = 10          # Records per Claude call (batched for efficiency)
SLEEP_BETWEEN_CALLS = 0.5  # Seconds between API calls (rate limit safety)


# ═══════════════════════════════════════════════════════════
# Budget Tracking (shared with HedgeBrain/Guardian)
# ═══════════════════════════════════════════════════════════

def _load_budget_ledger() -> Dict[str, Any]:
    """Load the shared budget ledger."""
    if BUDGET_LEDGER_PATH.exists():
        try:
            return json.loads(BUDGET_LEDGER_PATH.read_text())
        except (json.JSONDecodeError, Exception):
            pass
    now = datetime.now()
    return {
        "month": now.strftime("%Y-%m"),
        "hedgebrain": {"total_cost": 0.0, "call_count": 0, "last_call": None},
        "guardian": {"total_cost": 0.0, "call_count": 0, "last_call": None},
        "wethepeople": {"total_cost": 0.0, "call_count": 0, "last_call": None},
    }


def _save_budget_ledger(ledger: Dict[str, Any]) -> None:
    """Save budget ledger to shared location."""
    BUDGET_LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    BUDGET_LEDGER_PATH.write_text(json.dumps(ledger, indent=2, default=str))


def check_budget() -> Dict[str, Any]:
    """Check if WeThePeople has budget remaining."""
    ledger = _load_budget_ledger()
    current_month = datetime.now().strftime("%Y-%m")
    if ledger.get("month") != current_month:
        # New month — reset all projects
        for key in ["hedgebrain", "guardian", "wethepeople"]:
            ledger[key] = {"total_cost": 0.0, "call_count": 0, "last_call": None}
        ledger["month"] = current_month
        _save_budget_ledger(ledger)

    wtp = ledger.get("wethepeople", {"total_cost": 0.0})
    wtp_spend = wtp.get("total_cost", 0.0)
    remaining = WETHEPEOPLE_MONTHLY_CAP - wtp_spend

    total_spend = sum(
        ledger.get(p, {}).get("total_cost", 0.0)
        for p in ["hedgebrain", "guardian", "wethepeople"]
    )

    allowed = remaining > 0.10 and total_spend < TOTAL_MONTHLY_CAP
    return {
        "allowed": allowed,
        "remaining": round(remaining, 4),
        "monthly_spend": round(wtp_spend, 4),
        "cap": WETHEPEOPLE_MONTHLY_CAP,
        "total_across_projects": round(total_spend, 4),
    }


def record_spend(cost: float) -> None:
    """Record API spend for WeThePeople."""
    ledger = _load_budget_ledger()
    current_month = datetime.now().strftime("%Y-%m")
    if ledger.get("month") != current_month:
        for key in ["hedgebrain", "guardian", "wethepeople"]:
            ledger[key] = {"total_cost": 0.0, "call_count": 0, "last_call": None}
        ledger["month"] = current_month

    if "wethepeople" not in ledger:
        ledger["wethepeople"] = {"total_cost": 0.0, "call_count": 0, "last_call": None}

    ledger["wethepeople"]["total_cost"] = round(
        ledger["wethepeople"].get("total_cost", 0.0) + cost, 4
    )
    ledger["wethepeople"]["call_count"] = ledger["wethepeople"].get("call_count", 0) + 1
    ledger["wethepeople"]["last_call"] = datetime.now().isoformat()
    _save_budget_ledger(ledger)
    logger.info(
        f"Budget: wethepeople spent ${cost:.4f} this call, "
        f"${ledger['wethepeople']['total_cost']:.4f} this month"
    )


# ═══════════════════════════════════════════════════════════
# Claude API Client
# ═══════════════════════════════════════════════════════════

_client = None


def _get_client():
    """Lazy-load Anthropic client."""
    global _client
    if _client is None:
        import anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set in environment")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def call_claude(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Make a single Claude API call with budget checking."""
    budget = check_budget()
    if not budget["allowed"]:
        logger.warning(
            f"BUDGET EXCEEDED — spent ${budget['monthly_spend']:.2f} "
            f"of ${budget['cap']:.2f}. Stopping."
        )
        return None

    client = _get_client()
    start = time.time()

    response = client.messages.create(
        model=RESEARCH_MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    elapsed = time.time() - start
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (input_tokens * SONNET_INPUT_COST_PER_M / 1_000_000) + \
           (output_tokens * SONNET_OUTPUT_COST_PER_M / 1_000_000)

    record_spend(cost)
    logger.info(
        f"Claude: {elapsed:.1f}s, {input_tokens} in / {output_tokens} out, ${cost:.4f}"
    )

    return response.content[0].text


# ═══════════════════════════════════════════════════════════
# Database Helpers
# ═══════════════════════════════════════════════════════════

def get_db():
    """Get a SQLite connection with WAL mode."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    conn.row_factory = sqlite3.Row
    return conn


def get_unsummarized(conn, table: str, id_col: str, fields: List[str],
                     summary_col: str = "ai_summary", limit: int = 0) -> List[dict]:
    """Get records that don't have a summary yet."""
    field_list = ", ".join([id_col] + fields)
    sql = f"SELECT {field_list} FROM {table} WHERE {summary_col} IS NULL"
    if limit > 0:
        sql += f" LIMIT {limit}"
    rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def save_summary(conn, table: str, id_col: str, record_id: Any,
                 summary: str, summary_col: str = "ai_summary") -> None:
    """Save a summary to the database."""
    conn.execute(
        f"UPDATE {table} SET {summary_col} = ? WHERE {id_col} = ?",
        (summary, record_id)
    )
    conn.commit()


def save_batch_summaries(conn, table: str, id_col: str,
                         summaries: List[Tuple[Any, str]],
                         summary_col: str = "ai_summary") -> None:
    """Save a batch of summaries."""
    for record_id, summary in summaries:
        conn.execute(
            f"UPDATE {table} SET {summary_col} = ? WHERE {id_col} = ?",
            (summary, record_id)
        )
    conn.commit()


# ═══════════════════════════════════════════════════════════
# Summarizers
# ═══════════════════════════════════════════════════════════

VOTE_SYSTEM = """You are a civic transparency assistant. Summarize congressional votes
in plain English for everyday citizens. Be concise (1-2 sentences max).
Explain what the vote was actually about and why it matters.
Do not use jargon. Do not be partisan.

When given a batch of votes as JSON, return a JSON array of objects with
"id" and "summary" fields. Match the order of the input."""

ENFORCEMENT_SYSTEM = """You are a regulatory transparency assistant. Summarize enforcement
actions in plain English. Explain what happened, who was involved, and the consequence.
Be concise (2-3 sentences max). Include the penalty amount if available.

When given a batch of enforcement actions as JSON, return a JSON array of objects with
"id" and "summary" fields. Match the order of the input."""

CONTRACT_SYSTEM = """You are a government spending transparency assistant. Describe
government contracts in plain English. Explain what was purchased, by which agency,
and the value. Be concise (1-2 sentences max).

When given a batch of contracts as JSON, return a JSON array of objects with
"id" and "summary" fields. Match the order of the input."""

LOBBYING_SYSTEM = """You are a lobbying transparency assistant. Decode lobbying disclosures
into plain English. Explain what issues the company lobbied on and which government
entities they targeted. Be concise (1-2 sentences max). Translate issue codes and
legalese into everyday language.

When given a batch of lobbying records as JSON, return a JSON array of objects with
"id" and "summary" fields. Match the order of the input."""

POLITICIAN_PROFILE_SYSTEM = """You are a civic transparency assistant. Write a 2-3 sentence
political fingerprint for a member of Congress. Include their party, state, committee
assignments, and notable patterns (voting alignment, top donor industries, legislative focus).
Be factual and non-partisan. Use the data provided — do not infer or speculate beyond it."""

COMPANY_PROFILE_SYSTEM = """You are a corporate political influence analyst. Write a 2-3
sentence political risk narrative for a company. Summarize their lobbying posture,
government contract volume, enforcement history, and donation patterns.
Be factual and analytical. Use the data provided — do not speculate."""


def summarize_votes(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Summarize vote descriptions."""
    records = get_unsummarized(
        conn, "votes", "id",
        ["question", "chamber", "vote_date", "result",
         "yea_count", "nay_count", "related_bill_type", "related_bill_number"],
        limit=limit
    )
    if not records:
        logger.info("Votes: all summarized")
        return 0

    logger.info(f"Votes: {len(records)} to summarize")
    if dry_run:
        return len(records)

    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        prompt = json.dumps([{
            "id": r["id"],
            "question": r["question"],
            "chamber": r["chamber"],
            "date": str(r["vote_date"]),
            "result": r["result"],
            "yea": r["yea_count"],
            "nay": r["nay_count"],
            "bill": f"{r['related_bill_type'] or ''} {r['related_bill_number'] or ''}".strip() or None,
        } for r in batch], indent=None)

        result = call_claude(VOTE_SYSTEM, prompt)
        if result is None:
            break  # Budget exceeded

        try:
            summaries = json.loads(result)
            pairs = [(s["id"], s["summary"]) for s in summaries]
            save_batch_summaries(conn, "votes", "id", pairs)
            total += len(pairs)
            logger.info(f"  Saved {len(pairs)} vote summaries (batch {i // BATCH_SIZE + 1})")
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"  Failed to parse vote batch: {e}")

        time.sleep(SLEEP_BETWEEN_CALLS)

    return total


def summarize_enforcement(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Summarize enforcement actions across all 4 sector tables."""
    tables = [
        ("ftc_enforcement_actions", "id"),
        ("finance_enforcement_actions", "id"),
        ("health_enforcement_actions", "id"),
        ("energy_enforcement_actions", "id"),
    ]
    fields = ["case_title", "case_date", "enforcement_type",
              "penalty_amount", "description", "source"]

    total = 0
    for table, id_col in tables:
        records = get_unsummarized(conn, table, id_col, fields, limit=limit)
        if not records:
            logger.info(f"  {table}: all summarized")
            continue

        logger.info(f"  {table}: {len(records)} to summarize")
        if dry_run:
            total += len(records)
            continue

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            prompt = json.dumps([{
                "id": r[id_col],
                "title": r["case_title"],
                "date": str(r["case_date"]),
                "type": r["enforcement_type"],
                "penalty": r["penalty_amount"],
                "description": r["description"],
                "source": r["source"],
            } for r in batch], indent=None)

            result = call_claude(ENFORCEMENT_SYSTEM, prompt)
            if result is None:
                return total

            try:
                summaries = json.loads(result)
                pairs = [(s["id"], s["summary"]) for s in summaries]
                save_batch_summaries(conn, table, id_col, pairs)
                total += len(pairs)
                logger.info(f"    Saved {len(pairs)} enforcement summaries")
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"    Failed to parse enforcement batch: {e}")

            time.sleep(SLEEP_BETWEEN_CALLS)

    return total


def summarize_contracts(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Summarize government contracts across all 4 sector tables."""
    tables = [
        ("government_contracts", "id"),
        ("finance_government_contracts", "id"),
        ("health_government_contracts", "id"),
        ("energy_government_contracts", "id"),
    ]
    fields = ["award_amount", "awarding_agency", "description",
              "start_date", "end_date", "contract_type"]

    total = 0
    for table, id_col in tables:
        records = get_unsummarized(conn, table, id_col, fields, limit=limit)
        if not records:
            logger.info(f"  {table}: all summarized")
            continue

        logger.info(f"  {table}: {len(records)} to summarize")
        if dry_run:
            total += len(records)
            continue

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            prompt = json.dumps([{
                "id": r[id_col],
                "amount": r["award_amount"],
                "agency": r["awarding_agency"],
                "description": r["description"],
                "type": r["contract_type"],
                "start": str(r["start_date"]),
                "end": str(r["end_date"]),
            } for r in batch], indent=None)

            result = call_claude(CONTRACT_SYSTEM, prompt)
            if result is None:
                return total

            try:
                summaries = json.loads(result)
                pairs = [(s["id"], s["summary"]) for s in summaries]
                save_batch_summaries(conn, table, id_col, pairs)
                total += len(pairs)
                logger.info(f"    Saved {len(pairs)} contract summaries")
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"    Failed to parse contract batch: {e}")

            time.sleep(SLEEP_BETWEEN_CALLS)

    return total


def summarize_lobbying(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Summarize lobbying records across all 4 sector tables."""
    tables = [
        ("lobbying_records", "id"),
        ("finance_lobbying_records", "id"),
        ("health_lobbying_records", "id"),
        ("energy_lobbying_records", "id"),
    ]
    fields = ["filing_year", "filing_period", "income", "registrant_name",
              "lobbying_issues", "government_entities", "specific_issues"]

    total = 0
    for table, id_col in tables:
        records = get_unsummarized(conn, table, id_col, fields, limit=limit)
        if not records:
            logger.info(f"  {table}: all summarized")
            continue

        logger.info(f"  {table}: {len(records)} to summarize")
        if dry_run:
            total += len(records)
            continue

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            prompt = json.dumps([{
                "id": r[id_col],
                "year": r["filing_year"],
                "period": r["filing_period"],
                "income": r["income"],
                "firm": r["registrant_name"],
                "issues": r["lobbying_issues"],
                "entities": r["government_entities"],
                "details": r["specific_issues"],
            } for r in batch], indent=None)

            result = call_claude(LOBBYING_SYSTEM, prompt)
            if result is None:
                return total

            try:
                summaries = json.loads(result)
                pairs = [(s["id"], s["summary"]) for s in summaries]
                save_batch_summaries(conn, table, id_col, pairs)
                total += len(pairs)
                logger.info(f"    Saved {len(pairs)} lobbying summaries")
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"    Failed to parse lobbying batch: {e}")

            time.sleep(SLEEP_BETWEEN_CALLS)

    return total


def summarize_politician_profiles(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Generate political fingerprint summaries for tracked members."""
    records = get_unsummarized(
        conn, "tracked_members", "person_id",
        ["display_name", "chamber", "state", "party"],
        summary_col="ai_profile_summary",
        limit=limit,
    )
    if not records:
        logger.info("Politician profiles: all summarized")
        return 0

    logger.info(f"Politician profiles: {len(records)} to summarize")
    if dry_run:
        return len(records)

    total = 0
    for r in records:
        pid = r["person_id"]

        # Gather context data for this member
        stats = {}

        # Vote alignment
        vote_row = conn.execute(
            "SELECT COUNT(*) as total FROM member_votes WHERE person_id = ?", (pid,)
        ).fetchone()
        stats["total_votes"] = vote_row["total"] if vote_row else 0

        # Sponsored bills
        bill_row = conn.execute(
            "SELECT COUNT(*) as total FROM person_bills WHERE person_id = ? AND role = 'sponsor'",
            (pid,)
        ).fetchone()
        stats["bills_sponsored"] = bill_row["total"] if bill_row else 0

        # Top donor industries (from donations)
        donor_rows = conn.execute("""
            SELECT committee_name, SUM(amount) as total
            FROM company_donations WHERE person_id = ?
            GROUP BY committee_name ORDER BY total DESC LIMIT 5
        """, (pid,)).fetchall()
        stats["top_donors"] = [{"name": d["committee_name"], "amount": d["total"]} for d in donor_rows]

        # Committee memberships
        committee_rows = conn.execute("""
            SELECT c.name, cm.role FROM committee_memberships cm
            JOIN committees c ON cm.committee_id = c.committee_id
            WHERE cm.person_id = ?
        """, (pid,)).fetchall()
        stats["committees"] = [{"name": c["name"], "role": c["role"]} for c in committee_rows]

        # Trades
        trade_row = conn.execute(
            "SELECT COUNT(*) as total FROM congressional_trades WHERE person_id = ?", (pid,)
        ).fetchone()
        stats["trades"] = trade_row["total"] if trade_row else 0

        prompt = json.dumps({
            "name": r["display_name"],
            "party": r["party"],
            "state": r["state"],
            "chamber": r["chamber"],
            "votes_cast": stats["total_votes"],
            "bills_sponsored": stats["bills_sponsored"],
            "committees": stats["committees"],
            "top_donors": stats["top_donors"],
            "stock_trades": stats["trades"],
        })

        result = call_claude(POLITICIAN_PROFILE_SYSTEM, prompt)
        if result is None:
            break

        # Profile summaries come back as plain text, not JSON
        summary = result.strip().strip('"')
        save_summary(conn, "tracked_members", "person_id", pid,
                     summary, summary_col="ai_profile_summary")
        total += 1
        logger.info(f"  {r['display_name']}: profile saved")
        time.sleep(SLEEP_BETWEEN_CALLS)

    return total


def summarize_company_profiles(conn, limit: int = 0, dry_run: bool = False) -> int:
    """Generate political risk narratives for tracked companies."""
    entity_tables = [
        ("tracked_institutions", "institution_id", "finance"),
        ("tracked_companies", "company_id", "health"),
        ("tracked_tech_companies", "company_id", "tech"),
        ("tracked_energy_companies", "company_id", "energy"),
    ]

    # Map sector to its data tables
    sector_tables = {
        "finance": {
            "lobbying": "finance_lobbying_records",
            "contracts": "finance_government_contracts",
            "enforcement": "finance_enforcement_actions",
        },
        "health": {
            "lobbying": "health_lobbying_records",
            "contracts": "health_government_contracts",
            "enforcement": "health_enforcement_actions",
        },
        "tech": {
            "lobbying": "lobbying_records",
            "contracts": "government_contracts",
            "enforcement": "ftc_enforcement_actions",
        },
        "energy": {
            "lobbying": "energy_lobbying_records",
            "contracts": "energy_government_contracts",
            "enforcement": "energy_enforcement_actions",
        },
    }

    total = 0
    for entity_table, id_col, sector in entity_tables:
        records = get_unsummarized(
            conn, entity_table, id_col,
            ["display_name"],
            summary_col="ai_profile_summary",
            limit=limit,
        )
        if not records:
            logger.info(f"  {entity_table}: all profiled")
            continue

        logger.info(f"  {entity_table}: {len(records)} to profile")
        if dry_run:
            total += len(records)
            continue

        tables = sector_tables[sector]
        for r in records:
            eid = r[id_col]
            name = r["display_name"]

            # Aggregate stats
            lob = conn.execute(
                f"SELECT COUNT(*) as cnt, COALESCE(SUM(income), 0) as total "
                f"FROM {tables['lobbying']} WHERE entity_id = ?", (eid,)
            ).fetchone()
            con = conn.execute(
                f"SELECT COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
                f"FROM {tables['contracts']} WHERE entity_id = ?", (eid,)
            ).fetchone()
            enf = conn.execute(
                f"SELECT COUNT(*) as cnt, COALESCE(SUM(COALESCE(penalty_amount, 0)), 0) as total "
                f"FROM {tables['enforcement']} WHERE entity_id = ?", (eid,)
            ).fetchone()

            # Donations
            don = conn.execute(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total "
                "FROM company_donations WHERE entity_id = ?", (eid,)
            ).fetchone()

            prompt = json.dumps({
                "name": name,
                "sector": sector,
                "lobbying": {"filings": lob["cnt"], "total_spend": lob["total"]},
                "contracts": {"count": con["cnt"], "total_value": con["total"]},
                "enforcement": {"actions": enf["cnt"], "total_penalties": enf["total"]},
                "donations": {"count": don["cnt"] if don else 0, "total": don["total"] if don else 0},
            })

            result = call_claude(COMPANY_PROFILE_SYSTEM, prompt)
            if result is None:
                return total

            summary = result.strip().strip('"')
            save_summary(conn, entity_table, id_col, eid,
                         summary, summary_col="ai_profile_summary")
            total += 1
            logger.info(f"  {name}: profile saved")
            time.sleep(SLEEP_BETWEEN_CALLS)

    return total


# ═══════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="WeThePeople AI Summarization Pipeline")
    parser.add_argument("--votes", action="store_true", help="Summarize votes only")
    parser.add_argument("--enforcement", action="store_true", help="Summarize enforcement only")
    parser.add_argument("--contracts", action="store_true", help="Summarize contracts only")
    parser.add_argument("--lobbying", action="store_true", help="Summarize lobbying only")
    parser.add_argument("--profiles", action="store_true", help="Generate profile summaries only")
    parser.add_argument("--dry-run", action="store_true", help="Show counts without calling API")
    parser.add_argument("--limit", type=int, default=0, help="Max records per category (0=all)")
    args = parser.parse_args()

    # If no specific flag, run all
    run_all = not any([args.votes, args.enforcement, args.contracts,
                       args.lobbying, args.profiles])

    # Budget check
    budget = check_budget()
    logger.info(
        f"Budget: ${budget['remaining']:.2f} remaining "
        f"(${budget['monthly_spend']:.2f} spent of ${budget['cap']:.2f} cap, "
        f"${budget['total_across_projects']:.2f} total across projects)"
    )
    if not budget["allowed"]:
        logger.error("Budget exceeded. Exiting.")
        sys.exit(1)

    conn = get_db()
    totals = {}

    try:
        if run_all or args.votes:
            logger.info("=== VOTES ===")
            totals["votes"] = summarize_votes(conn, args.limit, args.dry_run)

        if run_all or args.enforcement:
            logger.info("=== ENFORCEMENT ===")
            totals["enforcement"] = summarize_enforcement(conn, args.limit, args.dry_run)

        if run_all or args.contracts:
            logger.info("=== CONTRACTS ===")
            totals["contracts"] = summarize_contracts(conn, args.limit, args.dry_run)

        if run_all or args.lobbying:
            logger.info("=== LOBBYING ===")
            totals["lobbying"] = summarize_lobbying(conn, args.limit, args.dry_run)

        if run_all or args.profiles:
            logger.info("=== POLITICIAN PROFILES ===")
            totals["politician_profiles"] = summarize_politician_profiles(conn, args.limit, args.dry_run)
            logger.info("=== COMPANY PROFILES ===")
            totals["company_profiles"] = summarize_company_profiles(conn, args.limit, args.dry_run)

    finally:
        conn.close()

    # Final report
    budget_final = check_budget()
    logger.info("=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)
    for category, count in totals.items():
        logger.info(f"  {category}: {count} {'would be' if args.dry_run else ''} summarized")
    logger.info(f"  Budget remaining: ${budget_final['remaining']:.2f}")
    logger.info("Done!")


if __name__ == "__main__":
    main()
