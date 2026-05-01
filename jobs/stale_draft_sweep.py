"""Phase 4-Z: stale-draft sweep.

Surfaces draft stories that have been sitting in the queue without
editor action for N days, so the editorial team can triage them
before the data underneath goes stale. Mirrors the data-staleness
guard the daily orchestrator already runs on published stories.

Cadence: daily. Cheap (one indexed query) and only emails when
there's at least one stale draft so the inbox stays quiet during
healthy weeks.

Usage:
    python jobs/stale_draft_sweep.py --dry-run
    python jobs/stale_draft_sweep.py
    python jobs/stale_draft_sweep.py --threshold-days 3
"""

from __future__ import annotations

import argparse
import html as html_lib
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import desc

from models.database import SessionLocal
from models.stories_models import Story
from services.email import send_email

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("stale_draft_sweep")

INBOX_DEFAULT = os.getenv(
    "WTP_OPS_INBOX",
    os.getenv("WTP_TIPS_INBOX", "wethepeopleforus@gmail.com"),
)


def find_stale_drafts(db, threshold_days: int) -> List[Story]:
    """Drafts that haven't been touched in `threshold_days` days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=threshold_days)
    return (
        db.query(Story)
        .filter(Story.status == "draft")
        .filter(Story.updated_at < cutoff)
        .order_by(desc(Story.updated_at))
        .all()
    )


def _render_html(stale: List[Story], threshold_days: int, ops_url: str) -> str:
    rows: List[str] = []
    now = datetime.now(timezone.utc)
    for s in stale:
        age_days = (
            (now - s.updated_at).days if s.updated_at else None
        )
        ts = (
            s.updated_at.strftime("%Y-%m-%d") if s.updated_at else "unknown"
        )
        title = html_lib.escape((s.title or "(untitled)")[:90])
        slug = html_lib.escape(s.slug or "")
        rows.append(
            f"<tr>"
            f"<td style='padding:8px 12px;font-size:13px;'>"
            f"<a href='{ops_url}/{s.id}' style='color:#b45309;text-decoration:none;'>"
            f"{title}</a>"
            f"<div style='font-family:monospace;font-size:11px;color:#94a3b8;margin-top:2px;'>"
            f"{slug}</div></td>"
            f"<td style='padding:8px 12px;font-family:monospace;font-size:12px;color:#475569;text-align:right;white-space:nowrap;'>"
            f"{ts}</td>"
            f"<td style='padding:8px 12px;font-family:monospace;font-size:12px;color:#92400e;text-align:right;white-space:nowrap;'>"
            f"{age_days}d ago</td>"
            f"</tr>"
        )
    body = "".join(rows)
    return f"""
    <!DOCTYPE html>
    <html><body style="background:#f8fafc;margin:0;padding:24px;font-family:'Inter',sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <tr><td>
          <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.24em;color:#b45309;text-transform:uppercase;font-weight:700;">Stale drafts</div>
          <h1 style="font-family:Georgia,serif;font-size:22px;line-height:1.2;color:#0f172a;margin:8px 0 4px;">
            {len(stale)} draft{'s' if len(stale) != 1 else ''} untouched for {threshold_days}+ days
          </h1>
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#64748b;margin:0 0 16px;">
            Underlying data may have moved. Approve, reject, or update.
          </p>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            {body}
          </table>
          <a href="{ops_url}" style="display:inline-block;margin-top:18px;padding:10px 18px;background:#b45309;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Open story queue
          </a>
        </td></tr>
      </table>
    </body></html>
    """.strip()


def run(threshold_days: int = 5, dry_run: bool = False) -> int:
    db = SessionLocal()
    try:
        stale = find_stale_drafts(db, threshold_days)
        log.info("found %d stale drafts (threshold %dd)", len(stale), threshold_days)
        if not stale:
            return 0  # quiet inbox: don't send when nothing to triage
        api_base = os.getenv("WTP_API_BASE", "https://api.wethepeopleforus.com")
        ops_url = f"{api_base}/ops/story-queue"
        html_body = _render_html(stale, threshold_days, ops_url)
        recipients = [a.strip() for a in INBOX_DEFAULT.split(",") if a.strip()]
        subject = f"[WTP] {len(stale)} stale draft{'s' if len(stale) != 1 else ''} — {threshold_days}+ days untouched"
        if dry_run:
            log.info("DRY-RUN — would send to %s", recipients)
            for s in stale[:5]:
                log.info("  - %s [%s]", s.slug, s.updated_at)
            return 0
        ok = send_email(to=recipients, subject=subject, html=html_body)
        log.info("send: %s", "ok" if ok else "failed")
        return 0 if ok else 1
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Stale-draft sweep email")
    parser.add_argument("--threshold-days", type=int, default=5,
                        help="Drafts untouched for >= N days surface")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(threshold_days=args.threshold_days, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
