"""Coverage report (Phase L3).

This script prints a deterministic operational completeness snapshot without
making any network calls.

It is designed to be used in the quality gate as a warn-only step.

Examples:
  python scripts/coverage_report.py --worst 10
  python scripts/coverage_report.py --best 10 --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

# Allow running as: python scripts/coverage_report.py
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from models.database import SessionLocal
from services.coverage import compute_coverage_report
from services.ops.pilot_cohort import get_pilot_person_ids


_COMPONENT_LABELS = {
    "has_claims": "claims",
    "has_evaluations": "evaluations",
    "has_groundtruth": "groundtruth",
    "has_bills": "bills",
    "has_min_viable_enriched_bills": "min_viable_enrichment",
}


def _missing_components(member_row: Dict[str, Any]) -> List[str]:
    comps = member_row.get("coverage_components") or {}
    missing: List[str] = []
    for key in [
        "has_claims",
        "has_evaluations",
        "has_groundtruth",
        "has_bills",
        "has_min_viable_enriched_bills",
    ]:
        if not comps.get(key, False):
            missing.append(_COMPONENT_LABELS.get(key, key))
    return missing


def _print_table(members: List[Dict[str, Any]]) -> None:
    cols = [
        ("score", 7),
        ("claims", 7),
        ("evals", 7),
        ("gold", 7),
        ("gt", 5),
        ("person_id", 24),
        ("name", 28),
        ("missing", 34),
    ]

    def fmt(val: Any, width: int) -> str:
        s = str(val)
        if len(s) > width:
            return s[: width - 1] + "…"
        return s.ljust(width)

    header = " ".join(
        [
            fmt("coverage", 7),
            fmt("claims", 7),
            fmt("evals", 7),
            fmt("gold", 7),
            fmt("gt", 5),
            fmt("person_id", 24),
            fmt("display_name", 28),
            fmt("missing", 34),
        ]
    )
    print(header)
    print("-" * len(header))

    for m in members:
        cov = m.get("coverage_score")
        if cov is None:
            cov = m.get("score")

        missing = ",".join(_missing_components(m))
        print(
            " ".join(
                [
                    fmt(cov, 7),
                    fmt(m.get("claims_total"), 7),
                    fmt(m.get("evaluations_total"), 7),
                    fmt(m.get("gold_rows_total"), 7),
                    fmt(m.get("groundtruth_rows_total"), 5),
                    fmt(m.get("person_id"), 24),
                    fmt(m.get("display_name"), 28),
                    fmt(missing, 34),
                ]
            )
        )


def main() -> int:
    p = argparse.ArgumentParser(description="Operational coverage report")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--worst", type=int, default=10, help="Show N lowest-coverage members")
    g.add_argument("--best", type=int, default=None, help="Show N highest-coverage members")
    p.add_argument("--include-inactive", action="store_true", help="Include inactive tracked members")
    p.add_argument("--pilot-only", action="store_true", help="Filter to the canonical pilot cohort")
    p.add_argument("--json", action="store_true", help="Print JSON instead of a table")

    args = p.parse_args()

    order = "worst"
    limit = args.worst
    if args.best is not None:
        order = "best"
        limit = args.best

    db = SessionLocal()
    try:
        person_ids = None
        if args.pilot_only:
            person_ids = get_pilot_person_ids(db)
        report = compute_coverage_report(
            db,
            person_ids=person_ids,
            limit=max(1, int(limit)),
            offset=0,
            active_only=not args.include_inactive,
            order=order,
        )
    finally:
        db.close()

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print(
        f"Coverage report: members={report['summary']['tracked_members_total']} bills_enrichment_rate={report['summary']['bills_enrichment_rate']}"
    )
    _print_table(report["members"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
