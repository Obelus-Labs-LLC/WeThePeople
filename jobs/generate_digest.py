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


def main():
    parser = argparse.ArgumentParser(description="Generate weekly digest data")
    parser.add_argument("--preview", type=str, help="Preview digest for a zip code (no subscriber needed)")
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
