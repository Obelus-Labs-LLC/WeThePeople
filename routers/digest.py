"""
Digest routes — Email digest subscription management.

Endpoints:
  POST /digest/subscribe — Subscribe to weekly digest
  GET  /digest/verify/{token} — Verify email
  GET  /digest/unsubscribe/{token} — Unsubscribe
  GET  /digest/preview/{zip_code} — Preview digest content for a zip code
"""

import json
import uuid
from datetime import datetime, timedelta, date, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, desc

from models.database import (
    SessionLocal,
    TrackedMember,
    CongressionalTrade,
    Vote,
    MemberVote,
    Anomaly,
)
from models.digest_models import DigestSubscriber

router = APIRouter(prefix="/digest", tags=["digest"])


# ── Zip → State mapping (reuse from politics router) ──

_ZIP_STATE: Dict[str, str] = {}


def _ensure_zip_map():
    """Lazy-load the zip→state map from the politics router."""
    global _ZIP_STATE
    if _ZIP_STATE:
        return
    try:
        from routers.politics import _ZIP_STATE as politics_zip
        _ZIP_STATE.update(politics_zip)
    except ImportError:
        pass


def _zip_to_state(zip_code: str) -> Optional[str]:
    _ensure_zip_map()
    prefix = zip_code[:3]
    return _ZIP_STATE.get(prefix)


# ── Request models ──

class SubscribeRequest(BaseModel):
    email: str
    zip_code: str
    sectors: Optional[List[str]] = None


# ── Endpoints ──

@router.post("/subscribe")
def subscribe_to_digest(req: SubscribeRequest):
    """Subscribe to the weekly influence digest."""
    # Validate zip code
    cleaned = "".join(c for c in req.zip_code if c.isdigit())[:5]
    if len(cleaned) < 5:
        raise HTTPException(status_code=400, detail="Invalid zip code — must be 5 digits")

    state = _zip_to_state(cleaned)

    db = SessionLocal()
    try:
        # Check for existing subscriber
        existing = db.query(DigestSubscriber).filter_by(email=req.email).first()
        if existing:
            if existing.verified:
                return {"status": "already_subscribed", "message": "This email is already subscribed."}
            else:
                return {"status": "pending_verification", "message": "Check your email to verify your subscription."}

        # Generate tokens
        verification_token = uuid.uuid4().hex
        unsubscribe_token = uuid.uuid4().hex

        subscriber = DigestSubscriber(
            email=req.email,
            zip_code=cleaned,
            state=state,
            frequency="weekly",
            verified=False,
            verification_token=verification_token,
            unsubscribe_token=unsubscribe_token,
            sectors=json.dumps(req.sectors) if req.sectors else None,
        )
        db.add(subscriber)
        db.commit()

        return {
            "status": "subscribed",
            "message": "Check your email to verify your subscription.",
            "verification_token": verification_token,  # In production, this would be emailed, not returned
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Subscription failed: {str(e)}")
    finally:
        db.close()


@router.get("/verify/{token}")
def verify_subscription(token: str):
    """Verify an email subscription via the token sent in the verification email."""
    db = SessionLocal()
    try:
        subscriber = db.query(DigestSubscriber).filter_by(verification_token=token).first()
        if not subscriber:
            raise HTTPException(status_code=404, detail="Invalid or expired verification token")

        if subscriber.verified:
            return {"status": "already_verified", "message": "Your subscription is already verified."}

        subscriber.verified = True
        db.commit()
        return {"status": "verified", "message": "Your subscription has been verified. You'll receive your first digest soon!"}
    finally:
        db.close()


@router.get("/unsubscribe/{token}")
def unsubscribe(token: str):
    """Unsubscribe from the digest via the unsubscribe token."""
    db = SessionLocal()
    try:
        subscriber = db.query(DigestSubscriber).filter_by(unsubscribe_token=token).first()
        if not subscriber:
            raise HTTPException(status_code=404, detail="Invalid unsubscribe token")

        db.delete(subscriber)
        db.commit()
        return {"status": "unsubscribed", "message": "You have been unsubscribed from the weekly digest."}
    finally:
        db.close()


@router.get("/preview/{zip_code}")
def preview_digest(zip_code: str):
    """
    Preview what a weekly digest would look like for a given zip code.
    Returns the digest data structure without requiring a subscription.
    """
    cleaned = "".join(c for c in zip_code if c.isdigit())[:5]
    if len(cleaned) < 5:
        raise HTTPException(status_code=400, detail="Invalid zip code — must be 5 digits")

    state = _zip_to_state(cleaned)
    if not state:
        raise HTTPException(status_code=404, detail=f"No state found for zip code {cleaned}")

    db = SessionLocal()
    try:
        # Look up representatives for this zip's state
        members = (
            db.query(TrackedMember)
            .filter(TrackedMember.state == state, TrackedMember.is_active == 1)
            .order_by(TrackedMember.chamber, TrackedMember.display_name)
            .all()
        )

        if not members:
            return {
                "zip_code": cleaned,
                "state": state,
                "representatives": [],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "message": "No tracked representatives found for this state.",
            }

        seven_days_ago = date.today() - timedelta(days=7)
        representatives_data = []

        for member in members:
            pid = member.person_id

            # Recent trades (last 7 days)
            trades = (
                db.query(CongressionalTrade)
                .filter(
                    CongressionalTrade.person_id == pid,
                    CongressionalTrade.transaction_date >= seven_days_ago,
                )
                .order_by(desc(CongressionalTrade.transaction_date))
                .limit(10)
                .all()
            )

            # Recent votes (last 7 days)
            recent_votes = (
                db.query(Vote, MemberVote.position)
                .join(MemberVote, MemberVote.vote_id == Vote.id)
                .filter(
                    MemberVote.person_id == pid,
                    Vote.vote_date >= seven_days_ago,
                )
                .order_by(desc(Vote.vote_date))
                .limit(10)
                .all()
            )

            # Anomalies for this member
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

            rep_data: Dict[str, Any] = {
                "name": member.display_name,
                "party": member.party,
                "chamber": member.chamber,
                "person_id": pid,
                "photo_url": member.photo_url,
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
                "lobbying": [],  # Lobbying data requires cross-referencing state companies — deferred
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
            representatives_data.append(rep_data)

        return {
            "zip_code": cleaned,
            "state": state,
            "representatives": representatives_data,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()
