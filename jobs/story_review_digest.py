"""
Story Review Digest — Daily email to wethepeopleforus@gmail.com

Runs once a day (cron: 08:00 UTC). Queries the stories table for anything in
status='draft', renders an HTML email, and sends it via Resend. The email
contains the full text of every draft plus direct approve/reject links to
/ops/story-queue so the reviewer can act in one click.

This is Gate 5 of the checks-and-balances pipeline. It exists because:
    - Auto-detection (Gates 1-4) can still produce stories a human wouldn't publish.
    - The user wants every story approved before it reaches the public.
    - Without a daily nudge, drafts pile up and the queue becomes invisible.

Usage:
    python jobs/story_review_digest.py
    python jobs/story_review_digest.py --dry-run
    python jobs/story_review_digest.py --preview     # print to stdout, don't send
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(os.path.join(str(ROOT), ".env"))

import requests
from sqlalchemy import desc

from models.database import SessionLocal
from models.stories_models import Story

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("story_review_digest")


RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("WTP_DIGEST_FROM", "digest@wethepeopleforus.com")
TO_EMAIL = os.getenv("WTP_REVIEW_TO", "wethepeopleforus@gmail.com")
API_BASE = os.getenv("WTP_API_BASE", "https://api.wethepeopleforus.com")
PRESS_KEY = os.getenv("WTP_PRESS_KEY", "")


# ──────────────────────────────────────────────────────────────────────────
# HTML rendering
# ──────────────────────────────────────────────────────────────────────────

def _escape(s: str) -> str:
    if not s:
        return ""
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;"))


def _story_card(story: Story) -> str:
    """Render one story as a self-contained HTML card with approve/reject buttons."""
    body_preview = (story.body or "")[:2500]
    if len(story.body or "") > 2500:
        body_preview += "\n\n[... truncated, view full story in queue ...]"

    # Pre-format body: convert markdown-ish tables and headings to something
    # reasonable without pulling in a markdown library.
    safe_body = _escape(body_preview).replace("\n\n", "</p><p>").replace("\n", "<br>")

    entities = ", ".join(story.entity_ids or []) if isinstance(story.entity_ids, list) else ""
    sources = ", ".join(story.data_sources or []) if isinstance(story.data_sources, list) else ""

    approve_url = f"{API_BASE}/ops/story-queue/{story.id}/approve"
    reject_url = f"{API_BASE}/ops/story-queue/{story.id}/reject"

    return f"""
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;background:#fff;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">
        #{story.id} · {_escape(story.category or '?')} · {_escape(story.sector or 'cross-sector')}
      </div>
      <h2 style="font-size:18px;margin:0 0 8px;color:#0f172a;">{_escape(story.title or 'Untitled')}</h2>
      <p style="font-size:13px;color:#475569;margin:0 0 12px;font-style:italic;">
        {_escape(story.summary or '')}
      </p>
      <div style="font-size:12px;color:#64748b;margin-bottom:12px;">
        <strong>Entities:</strong> {_escape(entities) or '<em>none</em>'}<br>
        <strong>Sources:</strong> {_escape(sources) or '<em>none</em>'}
      </div>
      <div style="font-size:13px;color:#1e293b;line-height:1.55;padding:12px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;">
        <p>{safe_body}</p>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#94a3b8;">
        Press-key required on both buttons. Reject retains the story in the DB as status='retracted'.
      </div>
      <div style="margin-top:12px;">
        <a href="{approve_url}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px;">Approve &amp; Publish</a>
        <a href="{reject_url}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;">Reject</a>
      </div>
    </div>
    """


def render_html(drafts: List[Story]) -> str:
    """Build the full HTML email body."""
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")
    count = len(drafts)

    if count == 0:
        body_html = """
        <div style="padding:32px;text-align:center;color:#64748b;background:#f8fafc;border-radius:8px;">
          <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">No drafts in the queue today.</h2>
          <p style="margin:0;font-size:13px;">Story detection ran but produced nothing that cleared Gates 1-4.</p>
        </div>
        """
    else:
        cards = "".join(_story_card(s) for s in drafts)
        body_html = f"""
        <p style="font-size:14px;color:#475569;margin:0 0 24px;">
          {count} draft{'s' if count != 1 else ''} cleared Gates 1-4 and are waiting for your approval.
          Nothing will be published until you approve it. Reject drafts you don't want.
        </p>
        {cards}
        """

    return f"""
    <div style="max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;padding:16px;">
      <div style="background:#0f172a;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">WTP Story Review Queue</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">{now} · {count} draft{'s' if count != 1 else ''} pending</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px;">
        {body_html}
      </div>
      <div style="padding:16px;color:#94a3b8;font-size:11px;text-align:center;">
        This email is sent daily at 08:00 UTC by jobs/story_review_digest.py. Drafts are held in
        status='draft' until you approve or reject them. This is Gate 5 of the story pipeline.
      </div>
    </div>
    """


# ──────────────────────────────────────────────────────────────────────────
# Send
# ──────────────────────────────────────────────────────────────────────────

def send_email(subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set — refusing to send")
        return False
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [TO_EMAIL],
                "subject": subject,
                "html": html,
                "reply_to": "wethepeopleforus@gmail.com",
            },
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info("Review digest sent to %s (id: %s)",
                     TO_EMAIL, resp.json().get("id", "?"))
            return True
        log.error("Resend error %d: %s", resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        log.error("Failed to send review digest: %s", exc)
        return False


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Daily story review digest")
    parser.add_argument("--dry-run", action="store_true",
                        help="Query drafts but do not send email")
    parser.add_argument("--preview", action="store_true",
                        help="Print HTML to stdout instead of sending")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        drafts = (
            db.query(Story)
            .filter(Story.status == "draft")
            .order_by(desc(Story.created_at))
            .limit(100)
            .all()
        )
        log.info("Found %d draft(s) in the queue", len(drafts))

        html = render_html(drafts)

        if args.preview:
            print(html)
            return

        if args.dry_run:
            log.info("[dry-run] Would email %d draft(s) to %s", len(drafts), TO_EMAIL)
            return

        if not drafts:
            log.info("Queue is empty — skipping email")
            return

        subject = f"WTP Review Queue — {len(drafts)} draft{'s' if len(drafts) != 1 else ''} pending"
        send_email(subject, html)
    finally:
        db.close()


if __name__ == "__main__":
    main()
