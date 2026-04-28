"""Orphan-entity check.

This is the WTP-side half of the pre-write gate. Before we hand a
candidate to Veritas's pre-write gate (which validates source-data
internal consistency), we make sure the entity_ids the candidate is
about actually exist in our tracked_* tables.

Veritas can't see WTP's tracked_* tables and we don't want to mount
them into Veritas's process — that would couple Veritas to WTP's
schema. So this check stays here. It's cheap (one query per
entity_id) and runs synchronously.

Why it matters:
The detect_stories.py detectors operate over the lobbying / contracts
/ trades / etc. tables. Those tables hold a `company_id` or `person_id`
foreign key that is supposed to point at a tracked_* row. Earlier this
session we caught cases where the lobbying tables had company_ids that
weren't in any tracked_* table (the audit showed 0 orphans across all
9 sectors after the fix). But the gate is still useful as a defensive
check: if an upstream ingest writes a record with a typo'd company_id,
we want to fail the story candidate at this gate, not write a story
about an entity we don't track.

Returns a structured result so the orchestrator can include the
orphan-check verdict in the failure log if applicable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# Map sector names to the (table, id_column) tuple where their tracked
# entities live. health uses an unprefixed legacy name; everyone else
# follows the tracked_<sector>_companies pattern. Politicians use
# tracked_members.
_SECTOR_TO_TRACKED = {
    "tech":           ("tracked_tech_companies",          "company_id"),
    "technology":     ("tracked_tech_companies",          "company_id"),
    "health":         ("tracked_companies",               "company_id"),
    "healthcare":     ("tracked_companies",               "company_id"),
    "energy":         ("tracked_energy_companies",        "company_id"),
    "transportation": ("tracked_transportation_companies", "company_id"),
    "defense":        ("tracked_defense_companies",       "company_id"),
    "chemicals":      ("tracked_chemical_companies",      "company_id"),
    "agriculture":    ("tracked_agriculture_companies",   "company_id"),
    "telecom":        ("tracked_telecom_companies",       "company_id"),
    "education":      ("tracked_education_companies",     "company_id"),
}

# Politicians don't have a sector-specific table; they live in
# tracked_members keyed by person_id.
_POLITICS_TABLE = ("tracked_members", "person_id")


@dataclass
class OrphanCheckResult:
    """Outcome of orphan validation for a candidate."""

    passed: bool
    issues: list[dict[str, str]]

    def to_dict(self) -> dict:
        return {"passed": self.passed, "issues": self.issues}


def _entity_exists_in(
    db: Session, table: str, id_col: str, entity_id: str,
) -> bool:
    try:
        # Identifier interpolation is intentional — table + column come
        # from the static map above, never from user input.
        row = db.execute(
            text(f"SELECT 1 FROM {table} WHERE {id_col} = :eid LIMIT 1"),
            {"eid": entity_id},
        ).fetchone()
        return row is not None
    except Exception as e:
        # Table may not exist (legacy DBs, fresh installs). Treat as
        # "can't confirm" rather than a hard failure; the caller will
        # see a different issue (no candidate sector / no entities) if
        # this is a real problem.
        logger.debug("orphan check skipped %s.%s: %s", table, id_col, e)
        return False


def validate_entities(
    db: Session,
    *,
    sector: Optional[str],
    entity_ids: Iterable[str],
) -> OrphanCheckResult:
    """Check that every entity_id resolves to a tracked_* row.

    Sector drives which table we look in. For politicians, sector
    'politics' (or any value indicating a person) routes to
    tracked_members instead of a sector-companies table.

    For corporate entities where the sector is missing or unknown, we
    fall back to a multi-sector probe: try every tracked_*_companies
    table until one matches, and treat that as a soft success with a
    diagnostic note.
    """
    issues: list[dict[str, str]] = []
    sector_lower = (sector or "").lower()

    # Politics path: check tracked_members.
    if sector_lower in {"politics", "politician", "person", "member"}:
        for eid in entity_ids:
            if not eid:
                issues.append({"entity_id": "", "reason": "empty_entity_id"})
                continue
            if not _entity_exists_in(db, _POLITICS_TABLE[0], _POLITICS_TABLE[1], str(eid)):
                issues.append({
                    "entity_id": str(eid),
                    "sector": "politics",
                    "reason": "not_in_tracked_members",
                    "expected_table": _POLITICS_TABLE[0],
                })
        return OrphanCheckResult(passed=not issues, issues=issues)

    # Corporate path: route by sector when known.
    routed = _SECTOR_TO_TRACKED.get(sector_lower)
    if routed is not None:
        for eid in entity_ids:
            if not eid:
                issues.append({"entity_id": "", "reason": "empty_entity_id"})
                continue
            if not _entity_exists_in(db, routed[0], routed[1], str(eid)):
                issues.append({
                    "entity_id": str(eid),
                    "sector": sector_lower,
                    "reason": f"not_in_{routed[0]}",
                    "expected_table": routed[0],
                })
        return OrphanCheckResult(passed=not issues, issues=issues)

    # Unknown / missing sector: probe all corporate tables, then politicians.
    # When NOTHING matches and the sector isn't one we have a
    # tracked-table for (e.g. 'finance' for PAC-driven candidates,
    # 'cross-sector' for global detectors), we DO NOT fail — orphan
    # check exists to catch typo'd corporate IDs in lobbying tables,
    # not to reject every candidate that doesn't fit the corporate
    # mold. We log it as a soft warning instead so downstream gates
    # (Veritas pre-write, the existing detect_stories validators)
    # can still pass the candidate through.
    soft_warnings: list[dict[str, str]] = []
    for eid in entity_ids:
        if not eid:
            issues.append({"entity_id": "", "reason": "empty_entity_id"})
            continue
        found_in = None
        for sec_name, (table, id_col) in _SECTOR_TO_TRACKED.items():
            if _entity_exists_in(db, table, id_col, str(eid)):
                found_in = table
                break
        if found_in is None and _entity_exists_in(
            db, _POLITICS_TABLE[0], _POLITICS_TABLE[1], str(eid),
        ):
            found_in = _POLITICS_TABLE[0]
        if found_in is None:
            soft_warnings.append({
                "entity_id": str(eid),
                "sector": sector_lower or "unknown",
                "reason": "not_in_any_tracked_table_soft",
                "note": "soft warning: candidate from non-corporate detector "
                        "(PAC, congressional trade, etc.) — downstream gates "
                        "still validate.",
            })

    if soft_warnings and not issues:
        logger.info(
            "orphan_check: %d soft warning(s) on unknown-sector candidate; passing",
            len(soft_warnings),
        )
    # soft_warnings live in `issues` for diagnostic visibility but
    # don't flip `passed`.
    return OrphanCheckResult(passed=not issues, issues=issues + soft_warnings)
