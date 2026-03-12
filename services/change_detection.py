"""
Change Detection Service

After each daily sync, compares current row counts and key metrics against
the previous snapshot. Stores diffs as JSON for alerting and activity feeds.

Usage:
    from services.change_detection import capture_snapshot, compute_diff

    # After sync completes:
    snapshot = capture_snapshot(db)
    diff = compute_diff(snapshot)  # compares against last saved snapshot
    save_snapshot(snapshot)
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.database import (
    TrackedMember,
    Bill,
    MemberBillGroundTruth,
    Claim,
    ClaimEvaluation,
    GoldLedgerEntry,
    Action,
)

SNAPSHOT_DIR = Path(__file__).parent.parent / "data" / "snapshots"
LATEST_FILE = SNAPSHOT_DIR / "latest_snapshot.json"
DIFF_DIR = SNAPSHOT_DIR / "diffs"


def capture_snapshot(db: Session) -> Dict[str, Any]:
    """Capture current database counts and key metrics."""
    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "counts": {
            "members_active": db.query(func.count(TrackedMember.id)).filter(TrackedMember.is_active == 1).scalar() or 0,
            "bills": db.query(func.count(Bill.bill_id)).scalar() or 0,
            "groundtruth": db.query(func.count(MemberBillGroundTruth.id)).scalar() or 0,
            "claims": db.query(func.count(Claim.id)).scalar() or 0,
            "evaluations": db.query(func.count(ClaimEvaluation.id)).scalar() or 0,
            "gold_ledger": db.query(func.count(GoldLedgerEntry.id)).scalar() or 0,
            "actions": db.query(func.count(Action.id)).scalar() or 0,
        },
        "tier_distribution": dict(
            db.query(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
            .group_by(GoldLedgerEntry.tier).all()
        ),
    }
    return snapshot


def load_previous_snapshot() -> Optional[Dict[str, Any]]:
    """Load the most recent saved snapshot."""
    if not LATEST_FILE.exists():
        return None
    try:
        return json.loads(LATEST_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def save_snapshot(snapshot: Dict[str, Any]):
    """Save snapshot as the latest, and archive a timestamped copy."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    DIFF_DIR.mkdir(parents=True, exist_ok=True)

    LATEST_FILE.write_text(json.dumps(snapshot, indent=2))

    # Archive
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    archive = SNAPSHOT_DIR / f"snapshot_{ts}.json"
    archive.write_text(json.dumps(snapshot, indent=2))

    # Keep only last 30 archived snapshots
    archives = sorted(SNAPSHOT_DIR.glob("snapshot_*.json"), key=lambda p: p.name)
    if len(archives) > 30:
        for old in archives[:len(archives) - 30]:
            old.unlink()


def compute_diff(current: Dict[str, Any]) -> Dict[str, Any]:
    """Compare current snapshot against previous. Returns changes."""
    previous = load_previous_snapshot()

    diff = {
        "timestamp": current["timestamp"],
        "previous_timestamp": previous["timestamp"] if previous else None,
        "is_first_run": previous is None,
        "changes": {},
        "alerts": [],
    }

    if previous is None:
        diff["changes"] = {k: {"current": v, "delta": v} for k, v in current["counts"].items()}
        return diff

    prev_counts = previous.get("counts", {})
    curr_counts = current.get("counts", {})

    for key in curr_counts:
        prev_val = prev_counts.get(key, 0)
        curr_val = curr_counts[key]
        delta = curr_val - prev_val

        diff["changes"][key] = {
            "previous": prev_val,
            "current": curr_val,
            "delta": delta,
        }

        # Alert on significant drops
        if delta < 0 and abs(delta) > max(10, prev_val * 0.01):
            diff["alerts"].append({
                "type": "count_drop",
                "metric": key,
                "previous": prev_val,
                "current": curr_val,
                "delta": delta,
                "severity": "warning" if abs(delta) < prev_val * 0.05 else "critical",
            })

    # Tier distribution changes
    prev_tiers = previous.get("tier_distribution", {})
    curr_tiers = current.get("tier_distribution", {})
    tier_changes = {}
    for tier in set(list(prev_tiers.keys()) + list(curr_tiers.keys())):
        p = prev_tiers.get(tier, 0)
        c = curr_tiers.get(tier, 0)
        if p != c:
            tier_changes[tier] = {"previous": p, "current": c, "delta": c - p}
    if tier_changes:
        diff["tier_changes"] = tier_changes

    return diff


def save_diff(diff: Dict[str, Any]):
    """Save diff report."""
    DIFF_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    diff_file = DIFF_DIR / f"diff_{ts}.json"
    diff_file.write_text(json.dumps(diff, indent=2))

    # Keep last 30 diffs
    diffs = sorted(DIFF_DIR.glob("diff_*.json"), key=lambda p: p.name)
    if len(diffs) > 30:
        for old in diffs[:len(diffs) - 30]:
            old.unlink()


def run_change_detection(db: Session) -> Dict[str, Any]:
    """Full pipeline: capture, diff, save. Call after daily sync."""
    snapshot = capture_snapshot(db)
    diff = compute_diff(snapshot)
    save_snapshot(snapshot)
    save_diff(diff)

    # Log summary
    changes = diff.get("changes", {})
    alerts = diff.get("alerts", [])
    summary_parts = []
    for k, v in changes.items():
        d = v.get("delta", 0)
        if d != 0:
            sign = "+" if d > 0 else ""
            summary_parts.append(f"{k}: {sign}{d}")

    if summary_parts:
        print(f"[CHANGE] {', '.join(summary_parts)}")
    else:
        print("[CHANGE] No changes detected")

    if alerts:
        for a in alerts:
            print(f"[ALERT] {a['severity'].upper()}: {a['metric']} dropped by {abs(a['delta'])}")

    return diff
