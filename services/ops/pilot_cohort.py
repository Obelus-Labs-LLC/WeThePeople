from __future__ import annotations

import os
from typing import List, Sequence

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from models.database import TrackedMember


def _parse_person_ids_csv(value: str | None) -> List[str]:
    if not value:
        return []
    parts = [p.strip() for p in value.split(",")]
    parts = [p for p in parts if p]
    # Preserve determinism.
    return sorted(set(parts))


def _tracked_members_has_column(db: Session, column_name: str) -> bool:
    try:
        insp = inspect(db.get_bind())
        cols = insp.get_columns("tracked_members")
        col_names = {c.get("name") for c in cols}
        return column_name in col_names
    except Exception:
        return False


def get_pilot_person_ids(db: Session) -> List[str]:
    """Return canonical pilot cohort person_ids.

    Source of truth (in priority order):

    1) If the DB has `tracked_members.pilot`, use: `is_active=1 AND pilot=1`.
    2) Otherwise fall back to `PILOT_PERSON_IDS` (comma-separated), but only
       returning ids that exist in `tracked_members` and are active.

    This function is deterministic and performs no network calls.
    """

    if _tracked_members_has_column(db, "pilot"):
        rows = db.execute(
            text(
                "SELECT person_id "
                "FROM tracked_members "
                "WHERE is_active = 1 AND pilot = 1 "
                "ORDER BY person_id ASC"
            )
        ).fetchall()
        return [r[0] for r in rows if r and r[0]]

    env_ids = _parse_person_ids_csv(os.getenv("PILOT_PERSON_IDS"))
    if not env_ids:
        return []

    # Filter to active tracked members so `PILOT_PERSON_IDS` can't drift.
    rows: Sequence[tuple[str]] = (
        db.query(TrackedMember.person_id)
        .filter(TrackedMember.is_active == 1)
        .filter(TrackedMember.person_id.in_(env_ids))
        .order_by(TrackedMember.person_id.asc())
        .all()
    )
    return [r[0] for r in rows if r and r[0]]
