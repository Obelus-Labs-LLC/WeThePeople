"""Phase 2 alert system.

Walks every authenticated User who opted in (`alert_opt_in=1`) and,
for each, finds stories published since their `last_alert_at`
watermark that match their personalization (sector match) OR their
watchlist (entity_id appears in story.entity_ids). Sends one
Resend email per user with up to N matches and bumps the watermark.

Cadence: hourly. The schedule entry is added to jobs/scheduler.py
in the same change set; this script can also be run manually:

    python jobs/send_alerts.py --dry-run
    python jobs/send_alerts.py
    python jobs/send_alerts.py --user dshonsmith@gmail.com   # one user
    python jobs/send_alerts.py --max-stories 10              # cap per email

Idempotent: a user without matches still has their watermark
bumped so we don't keep re-scanning the same window. Safe to
re-run; the watermark prevents duplicate sends.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

import requests
from sqlalchemy import desc

from models.database import SessionLocal, Bill, BillAction
from models.auth_models import User, UserWatchlistItem
from models.stories_models import Story

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("send_alerts")


# Reuse the same lifestyle->story-sector mapping as generate_digest.py
# so the alert and the weekly digest agree on what counts as a match.
_SECTOR_KEY_TO_STORY_SECTORS: Dict[str, List[str]] = {
    "finance":        ["finance"],
    "banking":        ["finance"],
    "health":         ["health"],
    "healthcare":     ["health"],
    "housing":        ["housing"],
    "energy":         ["energy"],
    "transportation": ["transportation", "energy"],
    "technology":     ["technology", "tech"],
    "tech":           ["technology", "tech"],
    "telecom":        ["telecom"],
    "education":      ["education"],
    "agriculture":    ["agriculture"],
    "food":           ["agriculture"],
    "chemicals":      ["chemicals"],
    "defense":        ["defense"],
}

# How far back to look for matches when the watermark is null. Caps
# the first-run blast for a user who's been opted-in for a while
# without alerts firing.
COLD_START_DAYS = 7

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("WTP_DIGEST_FROM", "wethepeopleforus@gmail.com")
SITE_URL = "https://wethepeopleforus.com"
JOURNAL_URL = "https://journal.wethepeopleforus.com"


def _user_lifestyle(user: User) -> List[str]:
    raw = (user.lifestyle_categories or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x).strip().lower() for x in parsed if str(x).strip()]
    except (ValueError, TypeError):
        pass
    return [c.strip().lower() for c in raw.split(",") if c.strip()]


def _watchlist_entity_ids(db, user_id: int) -> List[str]:
    rows = (
        db.query(UserWatchlistItem.entity_id)
        .filter(UserWatchlistItem.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows if r[0]]


def _allowed_sectors_for(lifestyle: List[str]) -> set:
    out: set = set()
    for k in lifestyle:
        for v in _SECTOR_KEY_TO_STORY_SECTORS.get((k or "").lower(), []):
            out.add(v)
    return out


def _entity_match(story: Story, watchlist_ids: Iterable[str]) -> bool:
    if not watchlist_ids:
        return False
    raw = story.entity_ids
    ids: List[str] = []
    if isinstance(raw, list):
        ids = [str(x) for x in raw if x]
    elif isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                ids = [str(x) for x in parsed if x]
        except (ValueError, TypeError):
            ids = [s.strip() for s in raw.split(",") if s.strip()]
    if not ids:
        return False
    wl = {w.lower() for w in watchlist_ids}
    return any((eid or "").lower() in wl for eid in ids)


def find_matches_for_user(
    db,
    user: User,
    *,
    cold_start_days: int = COLD_START_DAYS,
) -> List[Story]:
    """Return the unalerted stories matching the user's profile.

    Window starts at user.last_alert_at; falls back to NOW -
    COLD_START_DAYS for first-time users so the very first run
    doesn't blast every published story ever.
    """
    window_start = user.last_alert_at
    if window_start is None:
        window_start = datetime.now(timezone.utc) - timedelta(days=cold_start_days)

    candidates: List[Story] = (
        db.query(Story)
        .filter(Story.status == "published")
        .filter(Story.published_at > window_start)
        .order_by(desc(Story.published_at))
        .limit(100)
        .all()
    )
    if not candidates:
        return []

    lifestyle = _user_lifestyle(user)
    allowed = _allowed_sectors_for(lifestyle)
    watchlist = _watchlist_entity_ids(db, user.id)

    matches: List[Story] = []
    for s in candidates:
        sector_match = (
            allowed and (s.sector or "").lower() in allowed
        )
        ent_match = _entity_match(s, watchlist)
        if sector_match or ent_match:
            matches.append(s)
    return matches


def _watchlisted_bill_ids(db, user_id: int) -> List[str]:
    """Return the user's watchlist entries with entity_type='bill'."""
    rows = (
        db.query(UserWatchlistItem.entity_id)
        .filter(UserWatchlistItem.user_id == user_id)
        .filter(UserWatchlistItem.entity_type == "bill")
        .all()
    )
    return [r[0] for r in rows if r[0]]


def find_bill_actions_for_user(
    db,
    user: User,
    *,
    cold_start_days: int = COLD_START_DAYS,
) -> List[Tuple[Bill, BillAction]]:
    """Return new bill_actions on the user's watchlisted bills since
    the watermark. Capped at 20 to bound a single email payload.

    Each match is (Bill, BillAction); the email renderer uses both
    so the reader sees the bill title + the new action together.
    """
    bill_ids = _watchlisted_bill_ids(db, user.id)
    if not bill_ids:
        return []

    window_start = user.last_alert_at
    if window_start is None:
        window_start = datetime.now(timezone.utc) - timedelta(days=cold_start_days)

    rows = (
        db.query(BillAction, Bill)
        .join(Bill, Bill.bill_id == BillAction.bill_id)
        .filter(BillAction.bill_id.in_(bill_ids))
        .filter(BillAction.action_date > window_start)
        .order_by(desc(BillAction.action_date))
        .limit(20)
        .all()
    )
    return [(b, a) for (a, b) in rows]


def _render_email(
    user: User,
    stories: List[Story],
    bill_updates: Optional[List[Tuple[Bill, BillAction]]] = None,
) -> str:
    """Plain HTML, deliberately minimal. No tracking pixels, no
    fancy layout — the disengaged-audience thesis says clarity beats
    polish.

    The email has up to two sections:
      - Stories: matches by sector or watchlisted entity
      - Bill updates: new actions on watchlisted bills
    """
    bill_updates = bill_updates or []

    # Story rows.
    story_rows: List[str] = []
    for s in stories:
        url = f"{JOURNAL_URL}/story/{s.slug}"
        sector = (s.sector or "").upper()
        story_rows.append(
            f"""
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
                <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.18em;color:#6b7280;text-transform:uppercase;">{sector}</div>
                <a href="{url}" style="font-family:Georgia,serif;font-size:18px;color:#0f172a;text-decoration:none;font-weight:600;line-height:1.35;">{s.title}</a>
                <div style="font-family:'Inter',sans-serif;font-size:14px;color:#475569;line-height:1.5;margin-top:6px;">{s.summary or ''}</div>
                <a href="{url}" style="font-family:'Inter',sans-serif;font-size:13px;color:#b45309;text-decoration:underline;display:inline-block;margin-top:6px;">Read on the Journal &rarr;</a>
              </td>
            </tr>
            """
        )

    # Bill-update rows.
    bill_rows: List[str] = []
    for bill, action in bill_updates:
        bill_url = f"{SITE_URL}/politics/bill/{bill.bill_id}"
        bill_label = (
            f"{(bill.bill_type or '').upper()} {bill.bill_number or ''}"
        ).strip() or bill.bill_id
        title = bill.title or bill_label
        action_date = (
            action.action_date.strftime("%b %d, %Y")
            if action.action_date else ""
        )
        chamber = (action.chamber or "").upper()
        bill_rows.append(
            f"""
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
                <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.18em;color:#6b7280;text-transform:uppercase;">{bill_label}{' · ' + chamber if chamber else ''}{' · ' + action_date if action_date else ''}</div>
                <a href="{bill_url}" style="font-family:Georgia,serif;font-size:17px;color:#0f172a;text-decoration:none;font-weight:600;line-height:1.35;">{title}</a>
                <div style="font-family:'Inter',sans-serif;font-size:13px;color:#475569;line-height:1.5;margin-top:6px;">{action.action_text or ''}</div>
                <a href="{bill_url}" style="font-family:'Inter',sans-serif;font-size:13px;color:#b45309;text-decoration:underline;display:inline-block;margin-top:6px;">See full bill &rarr;</a>
              </td>
            </tr>
            """
        )

    n_total = len(stories) + len(bill_updates)
    title = (
        f"{n_total} update for you on WeThePeople"
        if n_total == 1
        else f"{n_total} updates for you on WeThePeople"
    )

    sections: List[str] = []
    if story_rows:
        sections.append(
            "<h2 style=\"font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.18em;"
            "color:#b45309;text-transform:uppercase;font-weight:700;margin:12px 0 4px;\">"
            "New stories</h2>"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>"
            + "".join(story_rows) + "</table>"
        )
    if bill_rows:
        sections.append(
            "<h2 style=\"font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.18em;"
            "color:#b45309;text-transform:uppercase;font-weight:700;margin:18px 0 4px;\">"
            "Bills you follow</h2>"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>"
            + "".join(bill_rows) + "</table>"
        )

    return f"""
    <!DOCTYPE html>
    <html><body style="background:#f8fafc;margin:0;padding:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <tr><td>
          <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.24em;color:#b45309;text-transform:uppercase;font-weight:700;">WeThePeople Alerts</div>
          <h1 style="font-family:Georgia,serif;font-size:22px;line-height:1.3;color:#0f172a;margin:8px 0 4px;">{title}</h1>
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#64748b;margin:0 0 16px;">
            From the sectors, entities, and bills you follow.
          </p>
          {''.join(sections)}
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#94a3b8;margin-top:24px;">
            <a href="{SITE_URL}/account?tab=notifications" style="color:#94a3b8;text-decoration:underline;">Manage your alert settings</a>
          </p>
        </td></tr>
      </table>
    </body></html>
    """.strip()


def _send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set; skipping send to %s", to)
        return False
    try:
        from services.email import RESEND_API_URL
    except Exception:
        RESEND_API_URL = "https://api.resend.com/emails"
    try:
        resp = requests.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
                "reply_to": "wethepeopleforus@gmail.com",
            },
            timeout=12,
        )
        if 200 <= resp.status_code < 300:
            log.info("  email -> %s (id=%s)", to, resp.json().get("id", "?"))
            return True
        log.error("  resend %d for %s: %s", resp.status_code, to, resp.text[:200])
        return False
    except Exception as e:
        log.error("  resend exception for %s: %s", to, e)
        return False


def run(
    dry_run: bool = False,
    only_email: Optional[str] = None,
    max_stories: int = 5,
) -> int:
    """Returns the number of users sent at least one alert."""
    db = SessionLocal()
    try:
        q = (
            db.query(User)
            .filter(User.alert_opt_in == 1)
            .filter(User.is_active == 1)
        )
        if only_email:
            q = q.filter(User.email == only_email.lower().strip())
        users = q.all()
        log.info("scanning %d alert-opted users", len(users))

        sent = 0
        now = datetime.now(timezone.utc)
        for u in users:
            try:
                story_matches = find_matches_for_user(db, u)
                bill_updates = find_bill_actions_for_user(db, u)
                if not story_matches and not bill_updates:
                    log.info("  %s: no matches; bumping watermark", u.email)
                    if not dry_run:
                        u.last_alert_at = now
                        db.commit()
                    continue
                story_picks = story_matches[:max_stories]
                # Cap bill updates separately so a single noisy bill doesn't
                # crowd out story-driven alerts. 5 / 5 keeps the email
                # short.
                bill_picks = bill_updates[:max_stories]
                total = len(story_picks) + len(bill_picks)
                subject = (
                    f"{total} new "
                    f"{'update' if total == 1 else 'updates'} on WeThePeople"
                )
                html = _render_email(u, story_picks, bill_picks)
                if dry_run:
                    log.info(
                        "  DRY-RUN %s: %d story match(es), %d bill update(s)",
                        u.email, len(story_picks), len(bill_picks),
                    )
                    continue
                ok = _send_email(u.email, subject, html)
                if ok:
                    u.last_alert_at = now
                    db.commit()
                    sent += 1
                else:
                    db.rollback()
            except Exception as exc:
                log.error("  %s failed: %s", u.email, exc)
                db.rollback()
        log.info("done. sent %d alerts.", sent)
        return sent
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Send Phase 2 story alerts")
    parser.add_argument("--dry-run", action="store_true", help="Preview without sending")
    parser.add_argument("--user", default=None, help="Limit to one email")
    parser.add_argument("--max-stories", type=int, default=5, help="Cap per email")
    args = parser.parse_args()
    run(dry_run=args.dry_run, only_email=args.user, max_stories=args.max_stories)
    return 0


if __name__ == "__main__":
    sys.exit(main())
