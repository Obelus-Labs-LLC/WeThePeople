"""Power Map invariant checks

Validations:
- Power Map generation produces no dangling edges
- Node ids are unique

This is a *structural* invariant: it validates the graph contract without
requiring any network calls.

Usage:
    python scripts/check_power_map_invariants.py
"""

import os
import sys

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, GoldLedgerEntry
from services.power_map import build_person_power_map


def main() -> int:
    db = SessionLocal()
    try:
        person_ids = [
            row[0]
            for row in db.query(GoldLedgerEntry.person_id).distinct().order_by(GoldLedgerEntry.person_id.asc()).all()
        ]

        # If no Gold rows exist yet, this is not a failure.
        if not person_ids:
            print("✅ Power Map invariants: PASS (no gold_ledger rows)")
            return 0

        for pid in person_ids:
            graph = build_person_power_map(db, person_id=pid, limit=500)

            node_ids = [n.get("id") for n in graph.get("nodes", [])]
            if len(node_ids) != len(set(node_ids)):
                print(f"❌ FAIL: Duplicate node ids for person_id={pid}")
                return 1

            nodeset = set(node_ids)
            for e in graph.get("edges", []):
                if e.get("source") not in nodeset:
                    print(f"❌ FAIL: Dangling edge source for person_id={pid}: {e.get('source')}")
                    return 1
                if e.get("target") not in nodeset:
                    print(f"❌ FAIL: Dangling edge target for person_id={pid}: {e.get('target')}")
                    return 1

        print("✅ Power Map invariants: PASS")
        print(f"  people: {len(person_ids)}")
        return 0

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
