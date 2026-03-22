"""
Claims verification router — enterprise claim verification pipeline.

POST endpoints are rate-limited (5/day free, unlimited with enterprise key).
GET endpoints are free with no auth required.
"""

from fastapi import APIRouter, Query, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy import func, desc

from models.database import SessionLocal, Claim, ClaimEvaluation, TrackedMember
from services.auth import require_enterprise_or_rate_limit
from services.claims.pipeline import run_verification, run_verification_from_url

router = APIRouter(tags=["claims"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class VerifyTextRequest(BaseModel):
    text: str = Field(..., min_length=20, max_length=100_000, description="Text to extract and verify claims from")
    entity_id: str = Field(..., min_length=1, description="person_id or company_id")
    entity_type: str = Field("politician", description="politician | tech | finance | health | energy")
    source_url: Optional[str] = Field(None, description="Optional source URL for the text")


class VerifyUrlRequest(BaseModel):
    url: str = Field(..., min_length=10, description="URL to fetch and verify claims from")
    entity_id: str = Field(..., min_length=1, description="person_id or company_id")
    entity_type: str = Field("politician", description="politician | tech | finance | health | energy")


# ---------------------------------------------------------------------------
# POST endpoints (rate-limited)
# ---------------------------------------------------------------------------

@router.post("/verify")
def verify_text(
    body: VerifyTextRequest,
    auth: dict = Depends(require_enterprise_or_rate_limit),
):
    """
    Submit text + entity for claim verification.

    Extracts claims from the text using AI, then matches each claim against
    the legislative record (votes, bills, trades, lobbying).

    Rate limited: 5/day for free tier, unlimited with enterprise API key.
    """
    valid_types = {"politician", "tech", "finance", "health", "energy"}
    if body.entity_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of: {', '.join(valid_types)}")

    db = SessionLocal()
    try:
        result = run_verification(
            db,
            text=body.text,
            entity_id=body.entity_id,
            entity_type=body.entity_type,
            source_url=body.source_url,
        )
        result["auth_tier"] = auth["tier"]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)[:200]}")
    finally:
        db.close()


@router.post("/verify-url")
def verify_url(
    body: VerifyUrlRequest,
    auth: dict = Depends(require_enterprise_or_rate_limit),
):
    """
    Submit URL + entity for claim verification.

    Fetches the URL, extracts text, then runs the full verification pipeline.

    Rate limited: 5/day for free tier, unlimited with enterprise API key.
    """
    valid_types = {"politician", "tech", "finance", "health", "energy"}
    if body.entity_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of: {', '.join(valid_types)}")

    db = SessionLocal()
    try:
        result = run_verification_from_url(
            db,
            url=body.url,
            entity_id=body.entity_id,
            entity_type=body.entity_type,
        )
        result["auth_tier"] = auth["tier"]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)[:200]}")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET endpoints (free, no auth)
# ---------------------------------------------------------------------------

@router.get("/verifications")
def list_verifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    tier: Optional[str] = Query(None, description="Filter by tier: strong|moderate|weak|none"),
):
    """Browse all claim verifications (paginated)."""
    db = SessionLocal()
    try:
        query = (
            db.query(Claim, ClaimEvaluation)
              .outerjoin(ClaimEvaluation, ClaimEvaluation.claim_id == Claim.id)
        )

        if entity_id:
            query = query.filter(Claim.person_id == entity_id)
        if tier:
            query = query.filter(ClaimEvaluation.tier == tier)

        total = query.count()
        rows = (
            query
            .order_by(desc(Claim.created_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

        items = []
        for claim, evaluation in rows:
            item = {
                "id": claim.id,
                "person_id": claim.person_id,
                "text": claim.text,
                "category": claim.category,
                "intent": claim.intent,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                "source_url": claim.claim_source_url,
                "created_at": claim.created_at.isoformat() if claim.created_at else None,
            }
            if evaluation:
                item["evaluation"] = {
                    "tier": evaluation.tier,
                    "score": evaluation.score,
                    "relevance": evaluation.relevance,
                    "progress": evaluation.progress,
                    "timing": evaluation.timing,
                }
            else:
                item["evaluation"] = None
            items.append(item)

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }
    finally:
        db.close()


@router.get("/verifications/{verification_id}")
def get_verification(verification_id: int):
    """Get a single verification with full detail."""
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == verification_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Verification not found")

        evaluation = db.query(ClaimEvaluation).filter(
            ClaimEvaluation.claim_id == claim.id
        ).first()

        result = {
            "id": claim.id,
            "person_id": claim.person_id,
            "text": claim.text,
            "category": claim.category,
            "intent": claim.intent,
            "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            "source_url": claim.claim_source_url,
            "created_at": claim.created_at.isoformat() if claim.created_at else None,
            "bill_refs": claim.bill_refs_json,
        }

        if evaluation:
            import json
            result["evaluation"] = {
                "tier": evaluation.tier,
                "score": evaluation.score,
                "relevance": evaluation.relevance,
                "progress": evaluation.progress,
                "timing": evaluation.timing,
                "matched_bill_id": evaluation.matched_bill_id,
                "evidence": _safe_json(evaluation.evidence_json),
                "why": _safe_json(evaluation.why_json),
            }
        else:
            result["evaluation"] = None

        # Resolve entity name
        member = db.query(TrackedMember).filter(
            TrackedMember.person_id == claim.person_id
        ).first()
        result["entity_name"] = member.display_name if member else claim.person_id

        return result
    finally:
        db.close()


@router.get("/dashboard/stats")
def get_dashboard_stats():
    """Aggregate verification stats for dashboard display."""
    db = SessionLocal()
    try:
        total_claims = db.query(func.count(Claim.id)).scalar() or 0
        total_evaluated = db.query(func.count(ClaimEvaluation.id)).scalar() or 0

        # Tier distribution
        tier_rows = (
            db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
              .group_by(ClaimEvaluation.tier)
              .all()
        )
        tier_distribution = {tier: count for tier, count in tier_rows}

        # Category distribution
        cat_rows = (
            db.query(Claim.category, func.count(Claim.id))
              .group_by(Claim.category)
              .all()
        )
        category_distribution = {cat: count for cat, count in cat_rows}

        # Unique entities verified
        unique_entities = db.query(func.count(func.distinct(Claim.person_id))).scalar() or 0

        # Recent verifications
        recent = (
            db.query(Claim, ClaimEvaluation)
              .outerjoin(ClaimEvaluation, ClaimEvaluation.claim_id == Claim.id)
              .order_by(desc(Claim.created_at))
              .limit(5)
              .all()
        )
        recent_items = []
        for claim, evaluation in recent:
            recent_items.append({
                "id": claim.id,
                "person_id": claim.person_id,
                "text": claim.text[:100] + "..." if len(claim.text) > 100 else claim.text,
                "tier": evaluation.tier if evaluation else None,
                "created_at": claim.created_at.isoformat() if claim.created_at else None,
            })

        return {
            "total_claims": total_claims,
            "total_evaluated": total_evaluated,
            "tier_distribution": tier_distribution,
            "category_distribution": category_distribution,
            "unique_entities": unique_entities,
            "recent": recent_items,
        }
    finally:
        db.close()


@router.get("/entity/{entity_type}/{entity_id}")
def get_entity_verifications(
    entity_type: str,
    entity_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get all verifications for a specific entity."""
    db = SessionLocal()
    try:
        query = (
            db.query(Claim, ClaimEvaluation)
              .outerjoin(ClaimEvaluation, ClaimEvaluation.claim_id == Claim.id)
              .filter(Claim.person_id == entity_id)
        )

        total = query.count()
        rows = (
            query
            .order_by(desc(Claim.created_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

        items = []
        for claim, evaluation in rows:
            item = {
                "id": claim.id,
                "text": claim.text,
                "category": claim.category,
                "intent": claim.intent,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                "source_url": claim.claim_source_url,
            }
            if evaluation:
                item["evaluation"] = {
                    "tier": evaluation.tier,
                    "score": evaluation.score,
                    "relevance": evaluation.relevance,
                }
            else:
                item["evaluation"] = None
            items.append(item)

        # Tier summary for this entity
        tier_rows = (
            db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
              .join(Claim, ClaimEvaluation.claim_id == Claim.id)
              .filter(Claim.person_id == entity_id)
              .group_by(ClaimEvaluation.tier)
              .all()
        )
        tier_summary = {tier: count for tier, count in tier_rows}

        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "total": total,
            "tier_summary": tier_summary,
            "limit": limit,
            "offset": offset,
            "items": items,
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_json(raw):
    """Parse JSON string safely, return None on failure."""
    if not raw:
        return None
    import json
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw
