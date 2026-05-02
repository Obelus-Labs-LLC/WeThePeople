"""Generate verifiable Claim rows for politicians who currently have
zero claims, drawn from the data we already have on disk.

Audit on 2026-05-02 found ~250 of the 537 tracked members had zero
rows in `claims`. The Veritas vault therefore has nothing to score
for those members; the dashboards' "Actions Scored 0/0" badge was
accurate but useless.

This job materializes a Claim per (member, action) pair drawn from
the Action table, which now stays current via the daily
sync_member_actions cron. Each claim is a single declarative
sentence the verification engine already knows how to score:

    "Senator Slotkin sponsored S 3819-119 (Paving the Way for
    American Industry Act) on Feb 16, 2026."

Same hash-based dedupe as the rest of the claims pipeline, so a
re-run is idempotent.

Usage:
  python jobs/backfill_claims_from_actions.py
  python jobs/backfill_claims_from_actions.py --members rashida_tlaib elissa_slotkin
  python jobs/backfill_claims_from_actions.py --limit-per-member 20
  python jobs/backfill_claims_from_actions.py --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import func  # noqa: E402

from models.database import (  # noqa: E402
    SessionLocal, Claim, Action, TrackedMember,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_claims_from_actions")


def _normalize_for_hash(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _claim_hash(person_id: str, normalized_text: str, source_url: str | None) -> str:
    h = hashlib.sha256()
    h.update((person_id or "").encode())
    h.update(b"|")
    h.update(normalized_text.encode())
    h.update(b"|")
    h.update((source_url or "").encode())
    return h.hexdigest()


def _format_chamber_title(member: TrackedMember) -> str:
    chamber = (member.chamber or "").lower()
    if "senate" in chamber:
        return "Senator"
    return "Rep."


def _claim_for_action(member: TrackedMember, action: Action, source_url: str | None) -> dict | None:
    """Compose a declarative claim from one Action row.

    Returns None when the action lacks the bill identifiers we need
    to make the claim verifiable (no point feeding the engine
    something it can't score)."""
    if not action.bill_congress or not action.bill_type or not action.bill_number:
        return None
    if not action.action_type:
        return None
    title = (member.display_name or member.person_id or "").strip()
    if not title:
        return None
    chamber_title = _format_chamber_title(member)

    bill_short = f"{action.bill_type.upper()} {action.bill_number}-{action.bill_congress}"
    when = (
        action.date.strftime("%B %-d, %Y") if isinstance(action.date, datetime)
        else action.date.isoformat() if isinstance(action.date, date)
        else (str(action.date) if action.date else None)
    )
    when_clause = f" on {when}" if when else ""

    bill_title = (action.title or "").strip()
    bill_title = bill_title[:120].rstrip()
    bill_title_clause = f" ({bill_title})" if bill_title else ""

    verb = "sponsored"
    if "cospons" in (action.action_type or "").lower():
        verb = "cosponsored"

    claim_text = (
        f"{chamber_title} {title} {verb} {bill_short}{bill_title_clause}{when_clause}."
    )

    # Category / intent help the matcher pick the right scoring profile.
    category = "legislative"
    intent = verb  # 'sponsored' or 'cosponsored' — matches the pipeline's vocabulary

    return {
        "person_id": member.person_id,
        "text": claim_text,
        "category": category,
        "intent": intent,
        "claim_date": action.date.date() if isinstance(action.date, datetime) else action.date,
        "claim_source_url": source_url,
        "bill_refs_json": None,
    }


def _has_action_source(action: Action, db) -> str | None:
    """Look up SourceDocument.url for the action via Action.source_id.
    Done lazily because a lot of older actions don't have a source."""
    if not action.source_id:
        return None
    from models.database import SourceDocument
    sd = db.query(SourceDocument).filter(SourceDocument.id == action.source_id).first()
    return sd.url if sd else None


def run(limit_per_member: int, person_ids: list[str] | None, dry_run: bool) -> int:
    db = SessionLocal()
    try:
        # Find members with zero claims
        members_q = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
        if person_ids:
            members_q = members_q.filter(TrackedMember.person_id.in_(person_ids))
        members = members_q.all()
        log.info("evaluating %d members", len(members))

        total_created = 0
        total_skipped = 0
        members_touched = 0

        for member in members:
            existing_claim_count = (
                db.query(func.count(Claim.id))
                  .filter(Claim.person_id == member.person_id)
                  .scalar() or 0
            )
            if existing_claim_count > 0:
                # Member already has claims; nothing to backfill.
                continue

            actions = (
                db.query(Action)
                  .filter(Action.person_id == member.person_id)
                  .order_by(Action.date.desc().nullslast())
                  .limit(limit_per_member)
                  .all()
            )
            if not actions:
                continue

            members_touched += 1
            created_for_this_member = 0
            for action in actions:
                payload = _claim_for_action(member, action, _has_action_source(action, db))
                if not payload:
                    total_skipped += 1
                    continue
                normalized = _normalize_for_hash(payload["text"])
                ch = _claim_hash(payload["person_id"], normalized, payload["claim_source_url"])

                # Idempotency: skip if a Claim row with this hash already exists.
                if db.query(Claim).filter(Claim.claim_hash == ch).first():
                    total_skipped += 1
                    continue

                if dry_run:
                    log.info("DRY: %s — %s", member.person_id, payload["text"][:120])
                    created_for_this_member += 1
                    total_created += 1
                    continue

                claim = Claim(
                    person_id=payload["person_id"],
                    text=payload["text"],
                    category=payload["category"],
                    intent=payload["intent"],
                    claim_date=payload["claim_date"],
                    claim_source_url=payload["claim_source_url"],
                    claim_hash=ch,
                    bill_refs_json=payload.get("bill_refs_json"),
                )
                db.add(claim)
                created_for_this_member += 1
                total_created += 1

            if not dry_run and created_for_this_member > 0:
                try:
                    db.commit()
                except Exception as exc:
                    db.rollback()
                    log.warning("commit failed for %s: %s", member.person_id, exc)
                    continue
                log.info("%s: +%d claims", member.person_id, created_for_this_member)

        log.info(
            "done. members_touched=%d created=%d skipped=%d",
            members_touched, total_created, total_skipped,
        )
    finally:
        db.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit-per-member", type=int, default=20,
                        help="Max claims to create per member (default 20)")
    parser.add_argument("--members", nargs="*", default=None,
                        help="Restrict to these person_ids (else all zero-claim members)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(
        limit_per_member=args.limit_per_member,
        person_ids=args.members,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
