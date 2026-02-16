"""Pilot-only coverage threshold check.

This script is designed for the quality gate:
- deterministic
- no network calls
- supports temp DB via WTP_DB_URL

Rule:
- Pilot cohort only
- Enforce coverage_score >= 0.75
- Ground truth is treated as optional when:
    - NO_NETWORK=1, OR
    - no Congress API key is present (CONGRESS_API_KEY / API_KEY_CONGRESS)

Usage:
  python scripts/check_pilot_coverage_threshold.py
  python scripts/check_pilot_coverage_threshold.py --threshold 0.75
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy import inspect

# Allow running as: python scripts/check_pilot_coverage_threshold.py
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from models.database import SessionLocal
from services.coverage import compute_coverage_report
from services.ops.pilot_cohort import get_pilot_person_ids


def _tracked_members_has_pilot_column(db) -> bool:
    try:
        insp = inspect(db.get_bind())
        cols = insp.get_columns("tracked_members")
        col_names = {c.get("name") for c in cols}
        return "pilot" in col_names
    except Exception:
        return False


def _groundtruth_optional() -> bool:
    if os.getenv("NO_NETWORK") == "1":
        return True
    api_key = os.getenv("CONGRESS_API_KEY") or os.getenv("API_KEY_CONGRESS")
    return not bool(api_key)


def _score_for_gate(member_row: Dict[str, Any], *, groundtruth_optional: bool) -> float:
    raw = int(member_row.get("coverage_score_raw") or 0)
    comps = member_row.get("coverage_components") or {}
    has_gt = bool(comps.get("has_groundtruth"))

    effective_raw = raw
    if groundtruth_optional and not has_gt:
        effective_raw = min(5, raw + 1)

    return round(effective_raw / 5.0, 4)


def _missing_components(member_row: Dict[str, Any], *, groundtruth_optional: bool) -> List[str]:
    comps = member_row.get("coverage_components") or {}

    missing: List[str] = []
    if not comps.get("has_claims", False):
        missing.append("claims")
    if not comps.get("has_evaluations", False):
        missing.append("evaluations")
    if not comps.get("has_bills", False):
        missing.append("bills")
    if not comps.get("has_min_viable_enriched_bills", False):
        missing.append("min_viable_enrichment")

    if not groundtruth_optional and not comps.get("has_groundtruth", False):
        missing.append("groundtruth")

    return missing


def main() -> int:
    p = argparse.ArgumentParser(description="Pilot-only coverage threshold check")
    p.add_argument("--threshold", type=float, default=0.75, help="Minimum required coverage score")
    args = p.parse_args()

    threshold = float(args.threshold)
    if threshold <= 0 or threshold > 1.0:
        print(f"Invalid --threshold {threshold}. Expected 0 < threshold <= 1.0")
        return 2

    db = SessionLocal()
    try:
        has_pilot_col = _tracked_members_has_pilot_column(db)
        if not has_pilot_col:
            env_val = os.getenv("PILOT_PERSON_IDS")
            if not (env_val and env_val.strip()):
                print("PILOT_PERSON_IDS not set and tracked_members.pilot not available")
                return 2

        pilot_ids = get_pilot_person_ids(db)
        if not pilot_ids:
            if has_pilot_col:
                print("No pilot members found (tracked_members.pilot=1)")
            else:
                print("PILOT_PERSON_IDS set but no active tracked_members matched")
            return 2

        report = compute_coverage_report(
            db,
            person_ids=pilot_ids,
            limit=500,
            offset=0,
            active_only=True,
            order="worst",
        )
    finally:
        db.close()

    gt_optional = _groundtruth_optional()

    failing: List[Dict[str, Any]] = []
    for m in report.get("members", []):
        score_gate = _score_for_gate(m, groundtruth_optional=gt_optional)
        if score_gate < threshold:
            failing.append({"row": m, "score_gate": score_gate})

    print(
        f"PILOT COVERAGE THRESHOLD\n"
        f"  threshold: {threshold}\n"
        f"  pilots: {len(report.get('members', []))}\n"
        f"  groundtruth_optional: {gt_optional}"
    )

    if not failing:
        print("PASS: pilot coverage threshold OK")
        return 0

    print("\nFAIL: pilot coverage below threshold")
    for item in failing:
        row = item["row"]
        missing = _missing_components(row, groundtruth_optional=gt_optional)
        print(
            f"- {row.get('person_id')} ({row.get('display_name')}): "
            f"score={row.get('coverage_score')} gate_score={item['score_gate']} missing={missing}"
        )

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
