#!/usr/bin/env python3
"""
Generate the SQL script that sets status='retracted' on every story the
audit (scripts/audit_published_stories.py) flagged for UNPUBLISH PERMANENTLY,
with a per-story retraction_reason citing the specific failure modes.

The 3 REVISE-AND-REPUBLISH stories are NOT touched by this script. They
stay published in the database but remain unreachable while the journal
review-mode placeholder is up.

Reads:
    .planning/STORY_AUDIT_REPORT.json

Writes:
    scripts/retract_audit_round_2026_05_01.sql

The user reviews the SQL and runs it on Hetzner. No DB write happens here.
"""

import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / ".planning" / "STORY_AUDIT_REPORT.json"
OUTPUT = ROOT / "scripts" / "retract_audit_round_2026_05_01.sql"


def _escape(s: str) -> str:
    """SQLite-safe single-quote escaping."""
    return s.replace("'", "''")


def main():
    with open(INPUT, "r", encoding="utf-8") as f:
        audited = json.load(f)

    unpub = [a for a in audited if a["decision"] == "UNPUBLISH PERMANENTLY"]
    revise = [a for a in audited if a["decision"] == "REVISE AND REPUBLISH"]

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = []
    lines.append("-- Editorial-standards regression-audit retraction round")
    lines.append(f"-- Generated: {timestamp}")
    lines.append(f"-- Source standard: research/EDITORIAL_STANDARDS.md")
    lines.append(f"-- Source audit: scripts/audit_published_stories.py")
    lines.append(f"--")
    lines.append(f"-- Stories to retract: {len(unpub)}")
    lines.append(f"-- Stories left published (REVISE AND REPUBLISH): {len(revise)}")
    lines.append(f"--")
    lines.append("-- Wraps every UPDATE in a single transaction so any failure rolls back")
    lines.append("-- the whole batch. The journal subdomain is already serving the")
    lines.append("-- editorial-review placeholder, so retracting these rows has no")
    lines.append("-- public-facing effect; it cleans up the database canonically and")
    lines.append("-- ensures the stories cannot accidentally be re-served if the")
    lines.append("-- review-mode flag is flipped off.")
    lines.append("")
    lines.append("BEGIN TRANSACTION;")
    lines.append("")

    for a in unpub:
        story_id = a["id"]
        title = _escape(a["title"][:200])
        slug = _escape(a["slug"])
        # Build a compact retraction reason from the findings
        codes = sorted({f["code"] for f in a["findings"] if f["severity"] in ("HIGH", "MEDIUM")})
        reason_lines = [
            "Retracted under editorial standards regression audit (2026-05-01).",
            "Failed: " + ", ".join(codes) + ".",
            "See research/EDITORIAL_STANDARDS.md and .planning/STORY_AUDIT_REPORT.md.",
        ]
        reason = _escape(" ".join(reason_lines))
        lines.append(f"-- #{story_id} [{a['verification_tier']}] {a['category']} — {title[:80]}")
        lines.append(
            "UPDATE stories SET "
            "status = 'retracted', "
            f"retraction_reason = '{reason}', "
            "updated_at = CURRENT_TIMESTAMP "
            f"WHERE id = {story_id} AND slug = '{slug}' AND status = 'published';"
        )
        lines.append("")

    lines.append("-- Sanity-check counts inside the transaction. If either is wrong,")
    lines.append("-- ROLLBACK manually.")
    lines.append("SELECT COUNT(*) AS retracted_in_this_batch FROM stories WHERE retraction_reason LIKE 'Retracted under editorial standards regression audit (2026-05-01)%';")
    lines.append(f"-- expected: {len(unpub)}")
    lines.append("")
    lines.append("SELECT COUNT(*) AS still_published FROM stories WHERE status = 'published';")
    lines.append(f"-- expected: {len(revise)} (the REVISE AND REPUBLISH set, listed below)")
    if revise:
        lines.append("--")
        lines.append("-- Stories that remain published (still gated behind the placeholder):")
        for a in revise:
            lines.append(f"--   #{a['id']:4} {a['slug']} — {a['title'][:80]}")
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"  UPDATE statements: {len(unpub)}")
    print(f"  Stories left published: {len(revise)}")


if __name__ == "__main__":
    main()
