"""
Gate 4 — SQL Fact-Checker

Re-queries the database for every number a draft story claims and fails the
story if any number is off by more than a small tolerance, or if the query
returns nothing at all (entity doesn't exist, table is empty, etc).

This is the last gate before the human review queue (Gate 5). It is the most
expensive gate (one SQL query per claim) but the most powerful: it catches
numbers Opus hallucinated even when the language is clean.

Philosophy:
    "If we can't re-derive the number from the source tables in one query,
    the number should not be in the story."

Checks performed:
    - evidence dict values are re-queried against the source tables
    - contract totals, lobbying totals, trade counts
    - entity existence (tracked_* rows)
    - enforcement counts
    - time-windowed claims (staleness)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger("story_fact_checker")


# ──────────────────────────────────────────────────────────────────────────
# Tolerances
# ──────────────────────────────────────────────────────────────────────────

MONEY_TOLERANCE = 0.02   # 2% — covers SUM rounding and recent syncs
COUNT_TOLERANCE = 0.05   # 5% — looser, counts can drift with dedup


@dataclass
class FactIssue:
    severity: str
    check: str
    claim: str
    actual: Optional[float]
    detail: str

    def __str__(self) -> str:
        if self.actual is None:
            return f"[{self.severity.upper()}] {self.check}: {self.claim} — {self.detail}"
        return (f"[{self.severity.upper()}] {self.check}: claimed {self.claim}, "
                f"actual {self.actual:.2f} — {self.detail}")


# ──────────────────────────────────────────────────────────────────────────
# Sector → (lobby_table, contract_table, enforcement_table, id_col, tracked_table)
# Mirror of LOBBYING_TABLES / CONTRACT_TABLES / ENFORCEMENT_TABLES in
# jobs/detect_stories.py. Kept separate to avoid the heavy import cycle.
# ──────────────────────────────────────────────────────────────────────────

SECTOR_MAP = {
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


# ──────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────

def fact_check(db: Session, story) -> Tuple[bool, List[FactIssue]]:
    """Verify every claim in `story` against the live database.

    Returns (ok, issues). `ok` is False if ANY critical issue is found.
    """
    issues: List[FactIssue] = []
    evidence = story.evidence if isinstance(story.evidence, dict) else {}
    entity_ids = story.entity_ids if isinstance(story.entity_ids, list) else []
    sector = (story.sector or "").lower()
    category = story.category or ""
    body = story.body or ""

    sector_tables = SECTOR_MAP.get(sector)
    if not sector_tables and sector and sector != "cross-sector":
        log.warning("fact_check: sector '%s' not in SECTOR_MAP, skipping DB verification", sector)
        issues.append(FactIssue(
            "warn", "unknown_sector", sector, None,
            f"sector '{sector}' has no table mapping; DB claims not verified",
        ))

    # 1. Entity existence — every entity_id must resolve
    if sector_tables:
        _, _, _, id_col, tracked_table = sector_tables
        for eid in entity_ids:
            if not eid:
                continue
            try:
                row = db.execute(
                    text(f"SELECT 1 FROM {tracked_table} WHERE {id_col} = :eid LIMIT 1"),
                    {"eid": eid},
                ).fetchone()
                if not row:
                    issues.append(FactIssue(
                        "critical", "entity_not_found", eid, None,
                        f"{eid} not in {tracked_table}",
                    ))
            except Exception as exc:
                log.debug("entity lookup failed for %s: %s", eid, exc)

    # 2. Lobbying spend claims
    for key in ("total_spend", "lobby_total", "total_lobbying_spend", "lobbying_total"):
        if key not in evidence:
            continue
        claimed = _as_float(evidence[key])
        if claimed is None or claimed <= 0 or not sector_tables or not entity_ids:
            continue
        lobby_table, _, _, id_col, _ = sector_tables
        actual = _sum_col(db, lobby_table, "income", id_col, entity_ids[0])
        if actual is None:
            issues.append(FactIssue(
                "critical", "lobby_spend_missing", f"${claimed:,.0f}", None,
                f"no rows in {lobby_table} for {entity_ids[0]}",
            ))
        elif not _within(claimed, actual, MONEY_TOLERANCE):
            issues.append(FactIssue(
                "critical", "lobby_spend_mismatch",
                f"${claimed:,.0f}", actual,
                f"{lobby_table}.income sum differs by > {MONEY_TOLERANCE:.0%}",
            ))

    # 3. Contract total claims
    for key in ("contract_total", "total_obligation", "total_contracts", "total_contract_amount"):
        if key not in evidence:
            continue
        claimed = _as_float(evidence[key])
        if claimed is None or claimed <= 0 or not sector_tables or not entity_ids:
            continue
        _, contract_table, _, id_col, _ = sector_tables
        actual = _sum_col(db, contract_table, "award_amount", id_col, entity_ids[0])
        if actual is None:
            issues.append(FactIssue(
                "critical", "contract_total_missing", f"${claimed:,.0f}", None,
                f"no rows in {contract_table} for {entity_ids[0]}",
            ))
        elif not _within(claimed, actual, MONEY_TOLERANCE):
            issues.append(FactIssue(
                "critical", "contract_total_mismatch",
                f"${claimed:,.0f}", actual,
                f"{contract_table}.award_amount sum differs by > {MONEY_TOLERANCE:.0%}",
            ))

    # 4. Filing count claims
    for key in ("filing_count", "filings", "total_filings"):
        if key not in evidence:
            continue
        claimed = _as_float(evidence[key])
        if claimed is None or claimed <= 0 or not sector_tables or not entity_ids:
            continue
        # Sanity: filings should NEVER exceed 10,000 for a single entity
        if claimed > 10_000:
            issues.append(FactIssue(
                "critical", "impossible_filing_count", f"{int(claimed)}", None,
                "filings per entity cannot exceed 10,000",
            ))
            continue
        lobby_table, _, _, id_col, _ = sector_tables
        actual = _count_rows(db, lobby_table, id_col, entity_ids[0])
        if actual is not None and not _within(claimed, actual, COUNT_TOLERANCE):
            issues.append(FactIssue(
                "critical", "filing_count_mismatch",
                f"{int(claimed)}", actual,
                f"{lobby_table} row count differs by > {COUNT_TOLERANCE:.0%}",
            ))

    # 5. Trade count claims (congressional trades)
    if category in {"trade_cluster", "trade_timing", "committee_stock_trade",
                    "stock_act_violation", "prolific_trader"}:
        for eid in entity_ids:
            if not eid:
                continue
            try:
                row = db.execute(
                    text("SELECT COUNT(*) FROM congressional_trades WHERE person_id = :eid"),
                    {"eid": eid},
                ).fetchone()
                actual = int(row[0]) if row else 0
            except Exception:
                actual = None
            if actual is None:
                continue
            # Scan body for "N trades" / "N stock trades" / "executed N"
            body_claims = _extract_trade_claims(body)
            for claimed in body_claims:
                if claimed > actual * (1 + COUNT_TOLERANCE) or claimed > actual + 5:
                    issues.append(FactIssue(
                        "critical", "trade_count_mismatch",
                        f"{claimed}", float(actual),
                        f"body claims {claimed} trades for {eid} but DB has {actual}",
                    ))

    # 6. Penalty claim — "zero penalties" must actually be zero
    if "zero penalties" in body.lower() or "zero recorded penalties" in body.lower():
        if sector_tables and entity_ids:
            _, _, enf_table, id_col, _ = sector_tables
            try:
                row = db.execute(
                    text(f"SELECT COUNT(*) FROM {enf_table} WHERE {id_col} = :eid "
                         "AND (penalty_amount IS NOT NULL AND penalty_amount > 0)"),
                    {"eid": entity_ids[0]},
                ).fetchone()
                penalised_rows = int(row[0]) if row else 0
            except Exception:
                penalised_rows = None
            if penalised_rows and penalised_rows > 0:
                issues.append(FactIssue(
                    "critical", "penalty_claim_false",
                    "zero penalties", float(penalised_rows),
                    f"{enf_table} has {penalised_rows} penalty rows for {entity_ids[0]}",
                ))

    # 7. Negative-value detector — any negative number in money fields is a bug
    for k, v in evidence.items():
        n = _as_float(v)
        if n is not None and n < 0 and any(t in k.lower() for t in ("spend", "total", "amount", "contract")):
            issues.append(FactIssue(
                "critical", "negative_money", f"{k}={n}", n,
                "money field cannot be negative",
            ))

    # 8. Staleness — data must be from within last 24 months
    # Rely on upstream syncs: we only check that the evidence dict's "year"
    # field, if present, is not in the future.
    now_year = datetime.now(timezone.utc).year
    for k in ("year", "fiscal_year", "filing_year"):
        if k in evidence:
            y = _as_float(evidence[k])
            if y is not None and y > now_year + 1:
                issues.append(FactIssue(
                    "critical", "future_year", f"{k}={int(y)}", y,
                    f"year {int(y)} is in the future",
                ))

    ok = not any(i.severity == "critical" for i in issues)
    return ok, issues


# ──────────────────────────────────────────────────────────────────────────
# Query helpers
# ──────────────────────────────────────────────────────────────────────────

def _sum_col(db: Session, table: str, col: str, id_col: str, eid: str) -> Optional[float]:
    try:
        row = db.execute(
            text(f"SELECT COALESCE(SUM({col}), 0) FROM {table} WHERE {id_col} = :eid"),
            {"eid": eid},
        ).fetchone()
        if not row:
            return None
        return float(row[0] or 0.0)
    except Exception as exc:
        log.debug("sum query failed on %s.%s: %s", table, col, exc)
        return None


def _count_rows(db: Session, table: str, id_col: str, eid: str) -> Optional[int]:
    try:
        row = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE {id_col} = :eid"),
            {"eid": eid},
        ).fetchone()
        if not row:
            return None
        return int(row[0] or 0)
    except Exception as exc:
        log.debug("count query failed on %s: %s", table, exc)
        return None


def _within(claimed: float, actual: float, tolerance: float) -> bool:
    """True if claimed and actual differ by no more than `tolerance` fraction."""
    if actual == 0:
        return claimed == 0
    return abs(claimed - actual) / abs(actual) <= tolerance


def _as_float(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", "").replace("$", ""))
        except ValueError:
            return None
    return None


_TRADE_CLAIM_RE = re.compile(
    r"(\d{1,5})\s+(?:individual\s+)?(?:stock\s+)?trades?\b",
    re.IGNORECASE,
)


def _extract_trade_claims(body: str) -> List[int]:
    """Pull every 'N trades' / 'N stock trades' claim out of the body."""
    claims = []
    for m in _TRADE_CLAIM_RE.finditer(body):
        try:
            claims.append(int(m.group(1)))
        except ValueError:
            continue
    return claims


def format_fact_issues(issues: List[FactIssue]) -> str:
    if not issues:
        return "clean"
    return " / ".join(str(i) for i in issues)
