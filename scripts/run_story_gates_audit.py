"""Run the two story quality gates against every non-archived story and
dump a structured report.

This wraps:
  * services.story_fact_checker.fact_check (per-story number verification)
  * services.story_data_gates.gate_sector (sector-wide data freshness)

For each story we record:
  - slug, id, category, sector, status
  - fact-check ok / list of FactIssue severities + summaries
  - sector data-gate ok / list of DataIssue severities + summaries

Usage:
    python scripts/run_story_gates_audit.py
    python scripts/run_story_gates_audit.py --json .planning/story_gates_audit.json
"""

import argparse
import json
import logging
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story
from services.story_fact_checker import fact_check
from services.story_data_gates import gate_sector

logging.basicConfig(level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def _issue_summary(issues):
    return [{
        "severity": getattr(i, "severity", "info"),
        "check": getattr(i, "check", ""),
        "claim": str(getattr(i, "claim", "")),
        "actual": getattr(i, "actual", None),
        "detail": getattr(i, "detail", ""),
    } for i in issues]


def main():
    parser = argparse.ArgumentParser(description="Run gate audit against stories")
    parser.add_argument("--status", default="published",
                        help="'published', 'draft', or 'all'")
    parser.add_argument("--json", dest="json_path", default=None,
                        help="Write full report to this JSON path")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    q = db.query(Story)
    if args.status == "all":
        q = q.filter(Story.status.in_(("draft", "published")))
    else:
        q = q.filter(Story.status == args.status)
    q = q.order_by(Story.id.asc())
    if args.limit > 0:
        q = q.limit(args.limit)

    stories = q.all()
    print(f"Auditing {len(stories)} stories (status={args.status})")

    # Cache sector-gate results so we don't rerun the same gate for every story.
    sector_gate_cache = {}

    report = {
        "total": len(stories),
        "fact_fail": 0,
        "fact_critical": 0,
        "gate_fail": 0,
        "by_severity": Counter(),
        "by_check": Counter(),
        "stories": [],
    }

    for s in stories:
        # 1. Fact-check
        try:
            fact_ok, fact_issues = fact_check(db, s)
        except Exception as exc:
            fact_ok = False
            fact_issues = []
            log.warning("fact_check crashed on %s: %s", s.slug, exc)
            report["fact_fail"] += 1

        # 2. Data gate (sector-wide, cached)
        sector = (s.sector or "").lower()
        if sector and sector not in sector_gate_cache:
            try:
                gate_ok, gate_issues = gate_sector(db, sector)
            except Exception as exc:
                gate_ok, gate_issues = False, []
                log.warning("gate_sector crashed for %s: %s", sector, exc)
            sector_gate_cache[sector] = (gate_ok, gate_issues)
        gate_ok, gate_issues = sector_gate_cache.get(sector, (True, []))

        fact_severities = [getattr(i, "severity", "info") for i in fact_issues]
        critical = [x for x in fact_severities if x == "critical"]
        if critical:
            report["fact_critical"] += 1
        if not fact_ok:
            report["fact_fail"] += 1
        if not gate_ok:
            report["gate_fail"] += 1

        for i in fact_issues:
            report["by_severity"][getattr(i, "severity", "info")] += 1
            report["by_check"][getattr(i, "check", "")] += 1

        entry = {
            "id": s.id,
            "slug": s.slug,
            "category": s.category,
            "sector": s.sector,
            "status": s.status,
            "fact_ok": fact_ok,
            "fact_issues": _issue_summary(fact_issues),
            "gate_ok": gate_ok,
            "gate_issues": _issue_summary(gate_issues),
        }
        report["stories"].append(entry)

        # Human-readable line for every story with any issue.
        if not fact_ok or critical or not gate_ok:
            print(f"[{s.id:>3}] {s.slug}")
            print(f"      category={s.category} sector={s.sector} status={s.status}")
            for i in fact_issues:
                print(f"      FACT {getattr(i, 'severity', '?')} {getattr(i, 'check', '')}: "
                      f"{getattr(i, 'claim', '')} — {getattr(i, 'detail', '')}")
            for i in gate_issues:
                print(f"      GATE {getattr(i, 'severity', '?')} {getattr(i, 'check', '')}: "
                      f"{getattr(i, 'detail', '')}")

    print("-- Summary --")
    print(f"  total={report['total']} fact_fail={report['fact_fail']} "
          f"fact_critical={report['fact_critical']} gate_fail={report['gate_fail']}")
    print(f"  by_severity={dict(report['by_severity'])}")
    print(f"  by_check={dict(report['by_check'])}")

    if args.json_path:
        with open(args.json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"  JSON report written to {args.json_path}")


if __name__ == "__main__":
    main()
