"""
Claims verification router — enterprise claim verification pipeline.

POST endpoints are rate-limited (5/day free, unlimited with enterprise key).
GET endpoints are free with no auth required.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Request, Depends, Response
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from models.database import get_db, Claim, ClaimEvaluation, TrackedMember
from models.response_schemas import VerificationResponse
from services.auth import require_enterprise_or_rate_limit
from services.claims.veritas_bridge import (
    run_verification as veritas_verify,
    run_verification_from_url as veritas_verify_url,
)


def _attach_quota_headers(response: Response, auth: dict) -> None:
    """Echo the per-tier daily quota on the response so the frontend
    can render the 'X of N today' badge without a second round-trip.
    These are distinct from the global RateLimit-* headers (which apply
    to ALL endpoints at 60/minute); these specifically reflect the
    per-day Veritas verification budget."""
    response.headers["X-Veritas-Tier"] = auth.get("tier", "free")
    response.headers["X-Veritas-Daily-Limit"] = str(auth.get("daily_limit", 5))
    response.headers["X-Veritas-Remaining"] = str(auth.get("remaining_today", -1))
    response.headers["X-Veritas-Reset-Seconds"] = str(auth.get("reset_seconds", 0))

logger = logging.getLogger(__name__)

router = APIRouter(tags=["claims"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class VerifyTextRequest(BaseModel):
    text: str = Field(..., min_length=20, max_length=100_000, description="Text to extract and verify claims from")
    source_url: Optional[str] = Field(None, description="Optional source URL for the text")


class VerifyUrlRequest(BaseModel):
    url: str = Field(..., min_length=10, description="URL to fetch and verify claims from")


# ---------------------------------------------------------------------------
# POST endpoints (rate-limited)
# ---------------------------------------------------------------------------

@router.post("/verify", response_model=VerificationResponse)
def verify_text(
    body: VerifyTextRequest,
    response: Response,
    auth: dict = Depends(require_enterprise_or_rate_limit),
    db: Session = Depends(get_db),
):
    """
    Submit text for claim verification using the Veritas engine.

    Claims are extracted deterministically (zero LLM, rule-based), then
    verified against the WTP database (lobbying, contracts, trades,
    committees, donations) and 29 external government APIs.

    No entity_id required. The system auto-detects entities from the text.

    **Authentication required.** Daily limits by tier:
      - free       — 5 / day
      - student    — 50 / day
      - pro        — 200 / day
      - newsroom   — 1000 / day (pooled across team)
      - enterprise — unlimited
    """
    logger.info("Veritas verification request: %d chars (tier=%s)", len(body.text), auth.get("tier"))

    _attach_quota_headers(response, auth)

    try:
        result = veritas_verify(
            db,
            text_input=body.text,
            source_url=body.source_url,
        )
        result["auth_tier"] = auth["tier"]
        # Echo quota into the JSON body too, so SDKs that don't surface
        # response headers can still display the "X of N today" UI.
        result["quota"] = {
            "tier": auth.get("tier"),
            "daily_limit": auth.get("daily_limit"),
            "remaining_today": auth.get("remaining_today"),
            "reset_seconds": auth.get("reset_seconds"),
        }
        return result
    except Exception as e:
        logger.error("Verification failed: %s", e)
        raise HTTPException(status_code=500, detail="Verification failed. Please try again later.")


@router.post("/verify-url", response_model=VerificationResponse)
def verify_url(
    body: VerifyUrlRequest,
    response: Response,
    auth: dict = Depends(require_enterprise_or_rate_limit),
    db: Session = Depends(get_db),
):
    """
    Submit URL for claim verification using the Veritas engine.

    Fetches the URL, extracts text, extracts claims deterministically
    (zero LLM), then verifies against all data sources.

    No entity_id required. The system auto-detects entities from the text.

    **Authentication required.** See /claims/verify for tier limits.
    """
    logger.info("Veritas URL verification request: %s (tier=%s)", body.url, auth.get("tier"))

    _attach_quota_headers(response, auth)

    try:
        result = veritas_verify_url(db, url=body.url)
        result["auth_tier"] = auth["tier"]
        result["quota"] = {
            "tier": auth.get("tier"),
            "daily_limit": auth.get("daily_limit"),
            "remaining_today": auth.get("remaining_today"),
            "reset_seconds": auth.get("reset_seconds"),
        }
        return result
    except Exception as e:
        logger.error("URL verification failed: %s", e)
        raise HTTPException(status_code=500, detail="Verification failed. Please try again later.")


# ---------------------------------------------------------------------------
# GET endpoints (free, no auth)
# ---------------------------------------------------------------------------

@router.get("/verifications")
def list_verifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    tier: Optional[str] = Query(None, description="Filter by tier: strong|moderate|weak|none"),
    db: Session = Depends(get_db),
):
    """Browse all claim verifications (paginated)."""
    query = (
        db.query(Claim, ClaimEvaluation)
          .outerjoin(ClaimEvaluation, ClaimEvaluation.claim_id == Claim.id)
    )

    if entity_id:
        query = query.filter(Claim.person_id == entity_id)
    if tier:
        query = query.filter(ClaimEvaluation.tier == tier)

    total = query.with_entities(func.count(func.distinct(Claim.id))).scalar()
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


@router.get("/verifications/{verification_id}")
def get_verification(verification_id: int, db: Session = Depends(get_db)):
    """Get a single verification with full detail."""
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

    # Resolve entity name — check politicians first, then companies across sectors
    entity_name = claim.person_id
    member = db.query(TrackedMember).filter(
        TrackedMember.person_id == claim.person_id
    ).first()
    if member:
        entity_name = member.display_name
    else:
        from models.tech_models import TrackedTechCompany
        from models.finance_models import TrackedInstitution
        from models.health_models import TrackedCompany
        from models.energy_models import TrackedEnergyCompany

        sector_lookups = [
            (TrackedTechCompany, "company_id"),
            (TrackedInstitution, "institution_id"),
            (TrackedCompany, "company_id"),
            (TrackedEnergyCompany, "company_id"),
        ]
        for model, id_col in sector_lookups:
            try:
                row = db.query(model).filter(
                    getattr(model, id_col) == claim.person_id
                ).first()
                if row:
                    entity_name = row.display_name
                    break
            except Exception as e:
                logger.debug("Entity lookup failed for %s in %s: %s", claim.person_id, model.__tablename__, e)
    result["entity_name"] = entity_name

    return result


@router.get("/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Aggregate verification stats for dashboard display."""
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


@router.get("/entity/{entity_type}/{entity_id}")
def get_entity_verifications(
    entity_type: str,  # Intentionally pass-through only — used for URL structure, not filtering
    entity_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get all verifications for a specific entity."""
    query = (
        db.query(Claim, ClaimEvaluation)
          .outerjoin(ClaimEvaluation, ClaimEvaluation.claim_id == Claim.id)
          .filter(Claim.person_id == entity_id)
    )

    total = query.with_entities(func.count(func.distinct(Claim.id))).scalar()
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
        return None
