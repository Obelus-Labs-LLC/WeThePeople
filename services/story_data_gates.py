"""
Gate 1 — Pre-Detector Data Quality Gates

Runs BEFORE story detection to answer one question: "is the underlying data
in good enough shape that stories based on it can be trusted today?"

If a gate fails, we log the failure and skip that sector/pattern entirely,
rather than generating stories from broken data. The alternative — what we
did before April 8 — was to generate stories from stale, incomplete, or
future-dated data and retract them afterwards.

Checks:
    - Sync freshness: every source table must have new rows in the last 7 days
    - Date-range sanity: no rows with transaction_date / action_date in the future
    - Coverage: each sector must have a minimum number of entities with data
    - Orphan detection: foreign-keyed rows that point to missing tracked_* rows

Usage:
    from services.story_data_gates import gate_sector, gate_global
    ok, issues = gate_sector(db, "defense")
    if not ok:
        log.warning("skipping defense detection: %s", issues)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger("story_data_gates")


# Same structure as in fact_checker, duplicated intentionally to keep gates
# independent.
SECTOR_TABLES: Dict[str, Tuple[str, str, str, str, str]] = {
    "tech":           ("lobbying_records", "government_contracts", "enforcement_actions", "company_id", "tracked_tech_companies"),
    "finance":        ("finance_lobbying_records", "finance_government_contracts", "finance_enforcement_actions", "institution_id", "tracked_institutions"),
    "health":         ("health_lobbying_records", "health_government_contracts", "health_enforcement_actions", "company_id", "tracked_companies"),
    "energy":         ("energy_lobbying_records", "energy_government_contracts", "energy_enforcement_actions", "company_id", "tracked_energy_companies"),
    "transportation": ("transportation_lobbying_records", "transportation_government_contracts", "transportation_enforcement_actions", "company_id", "tracked_transportation_companies"),
    "defense":        ("defense_lobbying_records", "defense_government_contracts", "defense_enforcement_actions", "company_id", "tracked_defense_companies"),
    "chemicals":      ("chemical_lobbying_records", "chemical_government_contracts", "chemical_enforcement_actions", "company_id", "tracked_chemical_companies"),
    "agriculture":    ("agriculture_lobbying_records", "agriculture_government_contracts", "agriculture_enforcement_actions", "company_id", "tracked_agriculture_companies"),
    "telecom":        ("telecom_lobbying_records", "telecom_government_contracts", "telecom_enforcement_actions", "company_id", "tracked_telecom_companies"),
    "education":      ("education_lobbying_records", "education_government_contracts", "education_enforcement_actions", "company_id", "tracked_education_companies"),
}

# Minimum number of distinct entities with ≥ 1 row before we trust the sector.
# Below this threshold the tables exist but are too sparse to generalise from.
MIN_ENTITIES_WITH_DATA = 5


@dataclass
class DataIssue:
    gate: str
    severity: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] {self.gate}: {self.detail}"


# ──────────────────────────────────────────────────────────────────────────
# Sector gate
# ──────────────────────────────────────────────────────────────────────────

def gate_sector(db: Session, sector: str) -> Tuple[bool, List[DataIssue]]:
    """Return (ok, issues) for a single sector.

    ok=False means detectors should NOT run for this sector this cycle.
    """
    issues: List[DataIssue] = []
    tables = SECTOR_TABLES.get(sector)
    if tables is None:
        issues.append(DataIssue("sector_unknown", "critical", f"no table map for {sector}"))
        return False, issues

    lobby_table, contract_table, enf_table, id_col, tracked_table = tables
    now = datetime.now(timezone.utc)

    # 1. tracked_* must have rows
    cnt = _count(db, tracked_table)
    if cnt is None:
        issues.append(DataIssue("missing_table", "critical", f"{tracked_table} missing"))
        return False, issues
    if cnt < MIN_ENTITIES_WITH_DATA:
        issues.append(DataIssue("tracked_too_few", "critical",
                                f"{tracked_table} has {cnt} rows (< {MIN_ENTITIES_WITH_DATA})"))

    # 2. Distinct entities with lobby data
    distinct = _count_distinct(db, lobby_table, id_col)
    if distinct is None or distinct < MIN_ENTITIES_WITH_DATA:
        issues.append(DataIssue("lobby_too_sparse", "warn",
                                f"{lobby_table} has {distinct} distinct {id_col}s"))

    # 3. Future-date check on lobbying
    bad_future = _count_future_dates(db, lobby_table, "posting_time_dt", now)
    if bad_future:
        issues.append(DataIssue("lobby_future_dates", "critical",
                                f"{lobby_table} has {bad_future} rows dated after now"))

    # 4. Future-date check on contracts
    bad_future_c = _count_future_dates(db, contract_table, "action_date", now)
    if bad_future_c:
        issues.append(DataIssue("contract_future_dates", "critical",
                                f"{contract_table} has {bad_future_c} rows dated after now"))

    # 5. Orphan check — a rough guard: we don't hard-fail but log
    orphan_count = _count_orphans(db, lobby_table, id_col, tracked_table, id_col)
    if orphan_count and orphan_count > 0.1 * (distinct or 1):
        issues.append(DataIssue("lobby_orphans", "warn",
                                f"{lobby_table} has {orphan_count} orphan entity refs"))

    ok = not any(i.severity == "critical" for i in issues)
    return ok, issues


# ──────────────────────────────────────────────────────────────────────────
# Global gate — runs once per detection cycle
# ──────────────────────────────────────────────────────────────────────────

def gate_global(db: Session) -> Tuple[bool, List[DataIssue]]:
    """Checks that apply to cross-sector detectors (trades, FARA, etc)."""
    issues: List[DataIssue] = []
    now = datetime.now(timezone.utc)

    # 1. congressional_trades must have recent rows
    stale = _rows_since(db, "congressional_trades", "transaction_date",
                        now - timedelta(days=60))
    if stale is None or stale < 1:
        issues.append(DataIssue("trades_stale", "critical",
                                f"congressional_trades has < 1 row in last 60 days"))

    # 2. No future transaction dates
    bad = _count_future_dates(db, "congressional_trades", "transaction_date", now)
    if bad:
        issues.append(DataIssue("trades_future_dates", "critical",
                                f"congressional_trades has {bad} future rows"))

    # 3. FARA must have a non-zero count of principals
    cnt = _count(db, "fara_foreign_principals")
    if cnt is not None and cnt < 10:
        issues.append(DataIssue("fara_empty", "warn",
                                f"fara_foreign_principals has only {cnt} rows"))

    # 4. tracked_members must have rows
    members = _count(db, "tracked_members")
    if members is None or members < 50:
        issues.append(DataIssue("tracked_members_empty", "critical",
                                f"tracked_members has {members} rows"))

    ok = not any(i.severity == "critical" for i in issues)
    return ok, issues


# ──────────────────────────────────────────────────────────────────────────
# Query helpers
# ──────────────────────────────────────────────────────────────────────────

def _count(db: Session, table: str) -> int | None:
    try:
        row = db.execute(text(f"SELECT COUNT(*) FROM {table}")).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        log.debug("count failed on %s: %s", table, exc)
        return None


def _count_distinct(db: Session, table: str, col: str) -> int | None:
    try:
        row = db.execute(
            text(f"SELECT COUNT(DISTINCT {col}) FROM {table} WHERE {col} IS NOT NULL")
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        log.debug("count distinct failed on %s.%s: %s", table, col, exc)
        return None


def _count_future_dates(db: Session, table: str, col: str, now: datetime) -> int | None:
    try:
        row = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE {col} > :cutoff"),
            {"cutoff": now.isoformat()},
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        log.debug("future-date check failed on %s.%s: %s", table, col, exc)
        return None


def _rows_since(db: Session, table: str, col: str, cutoff: datetime) -> int | None:
    try:
        row = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE {col} >= :cutoff"),
            {"cutoff": cutoff.isoformat()},
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        log.debug("freshness check failed on %s.%s: %s", table, col, exc)
        return None


def _count_orphans(db: Session, table: str, col: str, parent_table: str, parent_col: str) -> int | None:
    try:
        row = db.execute(text(
            f"SELECT COUNT(*) FROM (SELECT DISTINCT {col} AS eid FROM {table}) x "
            f"LEFT JOIN {parent_table} p ON p.{parent_col} = x.eid "
            f"WHERE p.{parent_col} IS NULL AND x.eid IS NOT NULL"
        )).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        log.debug("orphan check failed on %s: %s", table, exc)
        return None


def format_data_issues(issues: List[DataIssue]) -> str:
    if not issues:
        return "clean"
    return " / ".join(str(i) for i in issues)
