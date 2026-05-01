"""Phase 3 thread A follow-on: weekly engagement report to editors.

Aggregates the action_clicks table for the past 7 days and emails
a digest to WTP_OPS_INBOX (default WTP_TIPS_INBOX → editorial inbox).
Surfaces:
  - Total CTA clicks
  - By action_type (which CTAs people choose)
  - By sector (which sectors mobilize the most action)
  - Top 10 stories by clicks
  - Week-over-week deltas (+/- vs prior 7-day window)

Cadence: weekly. Cheap to compute.

Usage:
    python jobs/send_engagement_report.py --dry-run
    python jobs/send_engagement_report.py
    python jobs/send_engagement_report.py --window-days 30
"""

from __future__ import annotations

import argparse
import html as html_lib
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import func

from models.database import SessionLocal
from models.stories_models import ActionClick, Story
from services.email import send_email

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("send_engagement_report")

INBOX_DEFAULT = os.getenv(
    "WTP_OPS_INBOX",
    os.getenv("WTP_TIPS_INBOX", "wethepeopleforus@gmail.com"),
)


def _aggregate(db, since: datetime) -> dict:
    total = (
        db.query(func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .scalar() or 0
    )
    by_type = (
        db.query(ActionClick.action_type, func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .group_by(ActionClick.action_type)
        .order_by(func.count(ActionClick.id).desc())
        .all()
    )
    by_sector = (
        db.query(Story.sector, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.sector)
        .order_by(func.count(ActionClick.id).desc())
        .limit(15)
        .all()
    )
    top_stories = (
        db.query(Story.slug, Story.title, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.slug, Story.title)
        .order_by(func.count(ActionClick.id).desc())
        .limit(10)
        .all()
    )
    return {
        "total": total,
        "by_type": list(by_type),
        "by_sector": list(by_sector),
        "top_stories": list(top_stories),
    }


def _delta_str(curr: int, prev: int) -> str:
    if prev == 0:
        return "—" if curr == 0 else f"+{curr}"
    diff = curr - prev
    if diff == 0:
        return "0"
    return f"+{diff}" if diff > 0 else str(diff)


def _render_html(window_days: int, current: dict, previous: dict, ops_url: str) -> str:
    by_type_rows = "".join(
        f"<tr><td style='padding:6px 12px;font-family:monospace;font-size:13px;'>"
        f"{html_lib.escape(t or '(none)')}</td>"
        f"<td style='padding:6px 12px;font-family:monospace;font-size:13px;text-align:right;'>{c}</td></tr>"
        for t, c in current["by_type"]
    ) or "<tr><td style='padding:8px;color:#94a3b8;'>No clicks recorded.</td></tr>"

    by_sector_rows = "".join(
        f"<tr><td style='padding:6px 12px;font-family:monospace;font-size:13px;'>"
        f"{html_lib.escape(s or '(none)')}</td>"
        f"<td style='padding:6px 12px;font-family:monospace;font-size:13px;text-align:right;'>{c}</td></tr>"
        for s, c in current["by_sector"]
    ) or "<tr><td style='padding:8px;color:#94a3b8;'>—</td></tr>"

    top_rows = "".join(
        f"<tr><td style='padding:8px 12px;font-size:13px;'>"
        f"<a href='https://journal.wethepeopleforus.com/story/{html_lib.escape(slug or '')}'"
        f" style='color:#b45309;text-decoration:none;'>{html_lib.escape((title or slug or '')[:90])}</a></td>"
        f"<td style='padding:8px 12px;font-family:monospace;font-size:13px;text-align:right;'>{c}</td></tr>"
        for slug, title, c in current["top_stories"]
    ) or "<tr><td colspan='2' style='padding:8px;color:#94a3b8;'>No clicks this window.</td></tr>"

    delta = _delta_str(current["total"], previous["total"])

    return f"""
    <!DOCTYPE html>
    <html><body style="background:#f8fafc;margin:0;padding:24px;font-family:'Inter',sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <tr><td>
          <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.24em;color:#b45309;text-transform:uppercase;font-weight:700;">Engagement report</div>
          <h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.2;color:#0f172a;margin:8px 0 4px;">
            Last {window_days} days
          </h1>
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#64748b;margin:0 0 16px;">
            Action Panel CTA clicks across the journal site.
          </p>

          <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;padding:16px;margin-bottom:18px;">
            <div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#92400e;">
              Total clicks
            </div>
            <div style="font-family:Georgia,serif;font-size:36px;font-weight:700;color:#0f172a;line-height:1.1;margin-top:4px;">
              {current['total']}
            </div>
            <div style="font-family:monospace;font-size:12px;color:#78350f;margin-top:4px;">
              {delta} vs prior {window_days} days
            </div>
          </div>

          <h2 style="font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.16em;color:#b45309;text-transform:uppercase;font-weight:700;margin:16px 0 6px;">By action type</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">{by_type_rows}</table>

          <h2 style="font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.16em;color:#b45309;text-transform:uppercase;font-weight:700;margin:18px 0 6px;">By sector</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">{by_sector_rows}</table>

          <h2 style="font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.16em;color:#b45309;text-transform:uppercase;font-weight:700;margin:18px 0 6px;">Top stories</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">{top_rows}</table>

          <a href="{ops_url}" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#b45309;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Open the live dashboard
          </a>
        </td></tr>
      </table>
    </body></html>
    """.strip()


def run(window_days: int = 7, dry_run: bool = False, recipients: Optional[List[str]] = None) -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        since_curr = now - timedelta(days=window_days)
        since_prev = now - timedelta(days=window_days * 2)
        # Previous window aggregator filters [since_prev, since_curr)
        current = _aggregate(db, since_curr)
        # For previous, do a plain count between bounds:
        prev_total = (
            db.query(func.count(ActionClick.id))
            .filter(ActionClick.clicked_at >= since_prev)
            .filter(ActionClick.clicked_at < since_curr)
            .scalar() or 0
        )
        previous = {"total": prev_total}

        api_base = os.getenv("WTP_API_BASE", "https://api.wethepeopleforus.com")
        ops_url = f"{api_base}/ops/engagement?window_days={window_days}"
        html_body = _render_html(window_days, current, previous, ops_url)

        log.info(
            "report: %d clicks (last %dd) vs %d prior",
            current["total"], window_days, prev_total,
        )

        inbox_csv = ",".join(recipients) if recipients else INBOX_DEFAULT
        to_list = [a.strip() for a in inbox_csv.split(",") if a.strip()]
        subject = f"[WTP] Engagement report — {current['total']} clicks last {window_days}d"

        if dry_run:
            log.info("DRY-RUN — would send to %s", to_list)
            return 0
        ok = send_email(to=to_list, subject=subject, html=html_body)
        log.info("send: %s", "ok" if ok else "failed")
        return 0 if ok else 1
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Weekly engagement report email")
    parser.add_argument("--window-days", type=int, default=7)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--recipient", action="append",
                        help="Override inbox; repeatable")
    args = parser.parse_args()
    return run(
        window_days=args.window_days,
        dry_run=args.dry_run,
        recipients=args.recipient,
    )


if __name__ == "__main__":
    sys.exit(main())
