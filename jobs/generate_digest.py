"""
Weekly Digest Generator

Generates personalized digest data for each verified subscriber.
For each subscriber, looks up their representatives and gathers
the last 7 days of activity (trades, votes, lobbying, anomalies).

Usage:
    python jobs/generate_digest.py               # Generate for all verified subscribers
    python jobs/generate_digest.py --preview 90210  # Preview digest for a zip code
"""

import argparse
import json
import os
import sys
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv()

import requests
from sqlalchemy import desc
from models.database import SessionLocal, TrackedMember, CongressionalTrade, Vote, MemberVote, Anomaly
from models.digest_models import DigestSubscriber
from models.stories_models import Story

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("generate_digest")


# ── Zip → State (copied from routers/politics.py to avoid circular imports) ──

def _zip_to_state(zip_code: str) -> Optional[str]:
    """Resolve a 5-digit zip code to a US state abbreviation."""
    try:
        from routers.politics_people import _ZIP_STATE
        prefix = zip_code[:3]
        return _ZIP_STATE.get(prefix)
    except ImportError:
        logger.warning("Could not import _ZIP_STATE from routers.politics_people")
        return None


def _get_representatives(db, state: str) -> List[Any]:
    """Get all active tracked members for a state."""
    return (
        db.query(TrackedMember)
        .filter(TrackedMember.state == state, TrackedMember.is_active == 1)
        .order_by(TrackedMember.chamber, TrackedMember.display_name)
        .all()
    )


def _build_rep_digest(db, member: Any, since_date: date) -> Dict[str, Any]:
    """Build digest data for a single representative."""
    pid = member.person_id

    # Recent trades
    trades = (
        db.query(CongressionalTrade)
        .filter(
            CongressionalTrade.person_id == pid,
            CongressionalTrade.transaction_date >= since_date,
        )
        .order_by(desc(CongressionalTrade.transaction_date))
        .limit(20)
        .all()
    )

    # Recent votes
    recent_votes = (
        db.query(Vote, MemberVote.position)
        .join(MemberVote, MemberVote.vote_id == Vote.id)
        .filter(
            MemberVote.person_id == pid,
            Vote.vote_date >= since_date,
        )
        .order_by(desc(Vote.vote_date))
        .limit(20)
        .all()
    )

    # Anomalies
    anomalies = (
        db.query(Anomaly)
        .filter(
            Anomaly.entity_id == pid,
            Anomaly.entity_type == "person",
        )
        .order_by(desc(Anomaly.detected_at))
        .limit(5)
        .all()
    )

    return {
        "name": member.display_name,
        "party": member.party,
        "chamber": member.chamber,
        "person_id": pid,
        "trades": [
            {
                "ticker": t.ticker,
                "asset_name": t.asset_name,
                "transaction_type": t.transaction_type,
                "amount_range": t.amount_range,
                "transaction_date": str(t.transaction_date) if t.transaction_date else None,
            }
            for t in trades
        ],
        "votes": [
            {
                "question": v.question,
                "vote_date": str(v.vote_date) if v.vote_date else None,
                "result": v.result,
                "position": pos,
                "related_bill": f"{v.related_bill_type}{v.related_bill_number}" if v.related_bill_type and v.related_bill_number else None,
            }
            for v, pos in recent_votes
        ],
        "lobbying": [],  # Cross-state lobbying TBD
        "anomalies": [
            {
                "pattern_type": a.pattern_type,
                "title": a.title,
                "score": a.score,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None,
            }
            for a in anomalies
        ],
    }


def generate_digest_for_subscriber(db, subscriber: DigestSubscriber) -> Dict[str, Any]:
    """Generate the full digest for one subscriber."""
    state = subscriber.state or _zip_to_state(subscriber.zip_code)
    if not state:
        return {"error": f"No state found for zip {subscriber.zip_code}"}

    members = _get_representatives(db, state)
    seven_days_ago = date.today() - timedelta(days=7)

    reps = [_build_rep_digest(db, m, seven_days_ago) for m in members]

    # Recent published stories (last 7 days)
    recent_stories = (
        db.query(Story)
        .filter(Story.status == "published")
        .filter(Story.published_at >= datetime.combine(seven_days_ago, datetime.min.time()).replace(tzinfo=timezone.utc))
        .order_by(desc(Story.published_at))
        .limit(3)
        .all()
    )
    top_stories = [
        {
            "title": s.title,
            "slug": s.slug,
            "summary": s.summary,
            "sector": s.sector,
            "category": s.category,
        }
        for s in recent_stories
    ]

    return {
        "subscriber": {
            "email": subscriber.email,
            "zip_code": subscriber.zip_code,
            "state": state,
        },
        "representatives": reps,
        "top_stories": top_stories,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def generate_preview(zip_code: str) -> Dict[str, Any]:
    """Generate a preview digest for a zip code (no subscriber needed)."""
    state = _zip_to_state(zip_code)
    if not state:
        return {"error": f"No state found for zip {zip_code}"}

    db = SessionLocal()
    try:
        members = _get_representatives(db, state)
        seven_days_ago = date.today() - timedelta(days=7)
        reps = [_build_rep_digest(db, m, seven_days_ago) for m in members]

        recent_stories = (
            db.query(Story)
            .filter(Story.status == "published")
            .filter(Story.published_at >= datetime.combine(seven_days_ago, datetime.min.time()).replace(tzinfo=timezone.utc))
            .order_by(desc(Story.published_at))
            .limit(3)
            .all()
        )
        top_stories = [
            {"title": s.title, "slug": s.slug, "summary": s.summary, "sector": s.sector}
            for s in recent_stories
        ]

        return {
            "zip_code": zip_code,
            "state": state,
            "representatives": reps,
            "top_stories": top_stories,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()


RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("WTP_DIGEST_FROM", "digest@wethepeopleforus.com")
SITE_URL = "https://wethepeopleforus.com"


def _render_digest_html(digest: Dict[str, Any]) -> str:
    """Render a digest dict into an HTML email."""
    state = digest.get("subscriber", {}).get("state", "??")
    reps = digest.get("representatives", [])
    stories = digest.get("top_stories", [])

    rep_rows = ""
    for r in reps:
        name = r.get("name", "Unknown")
        party = r.get("party", "")
        chamber = r.get("chamber", "")
        trades = r.get("recent_trades", [])
        votes = r.get("recent_votes", [])
        anomalies = r.get("anomalies", [])

        trade_count = len(trades)
        vote_count = len(votes)
        anomaly_count = len(anomalies)

        rep_rows += f"""
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;">
            <strong>{name}</strong> ({party}-{state}, {chamber})<br>
            <span style="color:#64748b;font-size:13px;">
              {trade_count} trades | {vote_count} votes | {anomaly_count} flags
            </span>
          </td>
        </tr>"""

    story_items = ""
    for s in stories:
        story_items += f"""
        <li style="margin-bottom:8px;">
          <a href="{SITE_URL}/stories/{s.get('slug', '')}" style="color:#3b82f6;text-decoration:none;">
            {s.get('title', 'Untitled')}
          </a>
          <br><span style="color:#94a3b8;font-size:12px;">{s.get('summary', '')[:120]}</span>
        </li>"""

    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
      <div style="background:#0f172a;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:24px;">WeThePeople Weekly</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Your representatives this week — {state}</p>
      </div>

      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;">
        <h2 style="font-size:18px;margin:0 0 12px;">Your Representatives</h2>
        <table style="width:100%;border-collapse:collapse;">
          {rep_rows if rep_rows else '<tr><td style="padding:12px;color:#94a3b8;">No activity this week.</td></tr>'}
        </table>
      </div>

      {"<div style='padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:0;'><h2 style='font-size:18px;margin:0 0 12px;'>This Week in Influence</h2><ul style='padding-left:20px;margin:0;'>" + story_items + "</ul></div>" if story_items else ""}

      <div style="padding:16px 24px;background:#0f172a;color:#94a3b8;font-size:12px;text-align:center;border-radius:0 0 12px 12px;">
        <a href="{SITE_URL}" style="color:#3b82f6;text-decoration:none;">wethepeopleforus.com</a>
        &nbsp;|&nbsp;
        <a href="https://x.com/WTPForUs" style="color:#3b82f6;text-decoration:none;">@WTPForUs</a>
        <br><br>
        Data from Congress.gov, Senate LDA, USASpending, FEC, and other public sources.
      </div>
    </div>
    """


def _send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend API."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email send to %s", to)
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
                "to": [to],
                "subject": subject,
                "html": html,
                "reply_to": "wethepeopleforus@gmail.com",
            },
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info("  Email sent to %s (id: %s)", to, resp.json().get("id", "?"))
            return True
        else:
            logger.error("  Resend error %d: %s", resp.status_code, resp.text[:200])
            return False
    except Exception as e:
        logger.error("  Failed to send email to %s: %s", to, e)
        return False


def main():
    parser = argparse.ArgumentParser(description="Generate weekly digest data")
    parser.add_argument("--preview", type=str, help="Preview digest for a zip code (no subscriber needed)")
    parser.add_argument("--send", action="store_true", help="Actually send emails (default: generate only)")
    args = parser.parse_args()

    if args.preview:
        cleaned = "".join(c for c in args.preview if c.isdigit())[:5]
        if len(cleaned) < 5:
            logger.error("Invalid zip code: %s", args.preview)
            sys.exit(1)
        digest = generate_preview(cleaned)
        print(json.dumps(digest, indent=2, default=str))
        return

    # Generate digests for all verified subscribers
    db = SessionLocal()
    try:
        subscribers = db.query(DigestSubscriber).filter_by(verified=True).all()
        logger.info("Generating digests for %d verified subscribers", len(subscribers))

        # Ensure output directory exists
        digest_dir = ROOT / "data" / "digests"
        digest_dir.mkdir(parents=True, exist_ok=True)

        for sub in subscribers:
            logger.info("  Generating digest for %s (zip: %s)", sub.email, sub.zip_code)
            try:
                digest = generate_digest_for_subscriber(db, sub)

                # Save to file
                safe_email = sub.email.replace("@", "_at_").replace(".", "_")
                filename = f"{safe_email}_{date.today().isoformat()}.json"
                filepath = digest_dir / filename

                with open(filepath, "w") as f:
                    json.dump(digest, f, indent=2, default=str)

                # Send email if --send flag is set
                if args.send:
                    subject = f"WeThePeople Weekly — {digest.get('subscriber', {}).get('state', 'US')} ({date.today().strftime('%b %d')})"
                    html = _render_digest_html(digest)
                    _send_email(sub.email, subject, html)

                # Update last_sent_at
                sub.last_sent_at = datetime.now(timezone.utc)
                db.commit()

                logger.info("    Saved to %s", filepath)
            except Exception as e:
                logger.error("    FAILED for %s: %s", sub.email, e)
                db.rollback()

        logger.info("Done! Generated %d digests.", len(subscribers))
    finally:
        db.close()


if __name__ == "__main__":
    main()
