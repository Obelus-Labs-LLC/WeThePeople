from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from models.database import Bill, BillAction
from utils.normalization import compute_action_dedupe_hash


def compute_status_bucket(bill_actions: List[BillAction]) -> Tuple[str, str]:
    """Compute bill status bucket from action timeline.

    Pure/deterministic, no network.

    Expects `bill_actions` sorted by date DESC for the "unknown" fallback.
    """

    if not bill_actions:
        return ("unknown", "No actions found")

    action_data = [(action.action_text, action.action_date) for action in bill_actions]

    # Rule 1: Enacted
    for text, _date in action_data:
        text_lower = (text or "").lower()
        if "became public law" in text_lower or "became law" in text_lower:
            snippet = text[:80] + "..." if len(text) > 80 else text
            return ("enacted", snippet)

    # Rule 2: Presented to President
    for text, _date in action_data:
        text_lower = (text or "").lower()
        if "presented to president" in text_lower:
            snippet = text[:80] + "..." if len(text) > 80 else text
            return ("to_president", snippet)

    # Rule 3: Failed
    failed_patterns = [
        "failed",
        "rejected",
        "cloture motion not invoked",
        "motion to proceed rejected",
        "vetoed by the president",
    ]
    for text, _date in action_data:
        text_lower = (text or "").lower()
        for pattern in failed_patterns:
            if pattern in text_lower:
                snippet = text[:80] + "..." if len(text) > 80 else text
                return ("failed", snippet)

    # Rule 4/5/6: Passed chambers
    passed_house_action = None
    for text, date in action_data:
        text_lower = (text or "").lower()
        if "passed house" in text_lower or "agreed to in house" in text_lower:
            passed_house_action = (text, date)
            break

    passed_senate_action = None
    for text, date in action_data:
        text_lower = (text or "").lower()
        if "passed senate" in text_lower or "agreed to in senate" in text_lower:
            passed_senate_action = (text, date)
            break

    if passed_house_action and passed_senate_action:
        later_action = (
            passed_senate_action
            if passed_senate_action[1] > passed_house_action[1]
            else passed_house_action
        )
        snippet = later_action[0][:80] + "..." if len(later_action[0]) > 80 else later_action[0]
        return ("passed_both", snippet)

    if passed_senate_action:
        snippet = (
            passed_senate_action[0][:80] + "..."
            if len(passed_senate_action[0]) > 80
            else passed_senate_action[0]
        )
        return ("passed_senate", snippet)

    if passed_house_action:
        snippet = (
            passed_house_action[0][:80] + "..."
            if len(passed_house_action[0]) > 80
            else passed_house_action[0]
        )
        return ("passed_house", snippet)

    # Rule 7: In committee
    for text, _date in action_data:
        text_lower = (text or "").lower()
        if "referred to" in text_lower or "committee" in text_lower:
            snippet = text[:80] + "..." if len(text) > 80 else text
            return ("in_committee", snippet)

    # Rule 8: Introduced
    for text, _date in action_data:
        text_lower = (text or "").lower()
        if "introduced in" in text_lower:
            snippet = text[:80] + "..." if len(text) > 80 else text
            return ("introduced", snippet)

    # Rule 9: Unknown
    first_action = bill_actions[-1]
    snippet = (
        first_action.action_text[:80] + "..."
        if len(first_action.action_text) > 80
        else first_action.action_text
    )
    return ("unknown", snippet)


def normalize_bill_timeline(db: Session, *, bill_id: str) -> Dict[str, Any]:
    """Normalize bill timeline invariants for a single bill.

    Invariants enforced:
    - `Bill.latest_action_date` equals max(`BillAction.action_date`) when actions exist.
    - `Bill.status_bucket` is non-null when actions exist.
    - `BillAction.dedupe_hash` is filled consistently and duplicates are removed based
      on computed dedupe hash (bill_id + action_date + normalized action_text).

    Returns a small stats dict suitable for tests/ops.
    """

    bill = db.query(Bill).filter(Bill.bill_id == bill_id).one_or_none()
    if bill is None:
        raise ValueError(f"unknown bill_id: {bill_id}")

    actions = (
        db.query(BillAction)
        .filter(BillAction.bill_id == bill_id)
        .order_by(BillAction.action_date.desc(), BillAction.id.desc())
        .all()
    )

    hashes_filled = 0
    duplicates_deleted = 0

    # Fill missing hashes deterministically, then delete duplicates.
    # Keep the lowest id for each dedupe hash.
    seen: Dict[str, int] = {}

    # Work oldest->newest so the "keep" decision is stable.
    for a in sorted(actions, key=lambda x: (x.action_date, x.id)):
        date_str = a.action_date.strftime("%Y-%m-%d")
        computed = compute_action_dedupe_hash(bill_id, date_str, a.action_text or "")

        if not a.dedupe_hash:
            a.dedupe_hash = computed
            hashes_filled += 1

        # Use computed hash as the key even if existing dedupe_hash differs.
        # (This handles legacy rows where dedupe_hash was missing.)
        if computed in seen:
            # Duplicate: delete this row.
            db.delete(a)
            duplicates_deleted += 1
        else:
            seen[computed] = a.id

    db.flush()

    # Re-query after dedupe
    actions2 = (
        db.query(BillAction)
        .filter(BillAction.bill_id == bill_id)
        .order_by(BillAction.action_date.desc(), BillAction.id.desc())
        .all()
    )

    if actions2:
        latest = actions2[0]
        bill.latest_action_date = latest.action_date
        bill.latest_action_text = latest.action_text

        status_bucket, status_reason = compute_status_bucket(actions2)
        bill.status_bucket = status_bucket
        bill.status_reason = status_reason

    db.commit()

    return {
        "bill_id": bill_id,
        "actions_total": len(actions2),
        "dedupe_hashes_filled": hashes_filled,
        "duplicates_deleted": duplicates_deleted,
        "latest_action_date": bill.latest_action_date.isoformat() if bill.latest_action_date else None,
        "status_bucket": bill.status_bucket,
    }
