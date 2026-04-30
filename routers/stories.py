"""
Stories routes — Auto-generated data stories from pattern detection.

Stories are drafted by Claude from structured evidence found in government
data, reviewed, then published to the /stories page, newsletter, and Twitter.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, HTTPException, Depends, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List

logger = logging.getLogger(__name__)

from models.database import get_db
from models.stories_models import Story, StoryCorrection
from models.response_schemas import StoriesListResponse
from services.jwt_auth import get_current_user
from services.rbac import require_role

router = APIRouter(prefix="/stories", tags=["stories"])
limiter = Limiter(key_func=get_remote_address)


VALID_CORRECTION_TYPES = {"correction", "clarification", "retraction", "reader_report", "update"}


class CorrectionRequest(BaseModel):
    correction_type: str = "correction"
    description: str

    def model_post_init(self, __context):
        if self.correction_type not in VALID_CORRECTION_TYPES:
            raise ValueError(f"correction_type must be one of {VALID_CORRECTION_TYPES}")


class ErrorReportRequest(BaseModel):
    story_slug: str
    reporter_email: Optional[str] = None
    description: str


def _safe_json_loads(val):
    """Parse JSON string, returning None on any error."""
    if not val:
        return None
    try:
        return json.loads(val) if isinstance(val, str) else val
    except (json.JSONDecodeError, TypeError):
        return None


def _serialize_story_summary(s: Story) -> dict:
    """Serialize a Story for list endpoints (no body)."""
    return {
        "id": s.id,
        "title": s.title,
        "slug": s.slug,
        "summary": s.summary,
        "category": s.category,
        "sector": s.sector,
        "entity_ids": s.entity_ids,
        "evidence": s.evidence,
        "status": s.status,
        "verification_score": s.verification_score,
        "verification_tier": s.verification_tier,
        "ai_generated": getattr(s, "ai_generated", None),
        "data_date_range": getattr(s, "data_date_range", None),
        "data_freshness_at": (
            s.data_freshness_at.isoformat()
            if getattr(s, "data_freshness_at", None) else None
        ),
        "published_at": s.published_at.isoformat() if s.published_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _serialize_story_full(s: Story) -> dict:
    """Serialize a Story with all fields for detail endpoints."""
    base = _serialize_story_summary(s)
    # Pull the Wayback snapshot URL out of evidence if present. Set
    # by the approve flow when the Save Page Now request succeeds.
    wayback_url = None
    wayback_at = None
    if isinstance(s.evidence, dict):
        wayback_url = s.evidence.get("wayback_url")
        wayback_at = s.evidence.get("wayback_archived_at")
    base.update({
        "body": s.body,
        "data_sources": s.data_sources,
        "verification_data": _safe_json_loads(s.verification_data),
        "correction_history": getattr(s, "correction_history", None) or [],
        "retraction_reason": getattr(s, "retraction_reason", None),
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        # Wayback Machine permanent archive URL, when the approve
        # flow's Save Page Now request succeeded. Surfaced on the
        # public story page as "View archived copy" so journalists
        # citing the story have a permanent URL.
        "wayback_url": wayback_url,
        "wayback_archived_at": wayback_at,
        # The 60-second simplified summary, when generated. Frontend
        # renders a toggle when this is non-null. The
        # /{slug}/simplified endpoint generates it on demand the
        # first time it's requested.
        "summary_simplified": getattr(s, "summary_simplified", None),
        "summary_simplified_model": getattr(s, "summary_simplified_model", None),
    })
    return base


@router.get("/")
def list_stories(
    sector: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: str = Query("published"),
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List stories, filtered by sector/category/status, ordered by published_at."""
    try:
        query = db.query(Story).filter(Story.status == status)

        if sector:
            query = query.filter(Story.sector == sector)
        if category:
            query = query.filter(Story.category == category)

        total = query.count()

        if status == "published":
            query = query.order_by(desc(Story.published_at))
        else:
            query = query.order_by(desc(Story.created_at))

        stories = query.offset(offset).limit(limit).all()
    except Exception as e:
        logger.warning("stories query failed (table may not exist): %s", e)
        return {"total": 0, "limit": limit, "offset": offset, "stories": []}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "stories": [_serialize_story_summary(s) for s in stories],
    }


@router.get("/latest", response_model=StoriesListResponse)
def latest_stories(
    # Cap raised to 500 so the journal home (search index) and the
    # sitemap edge function can ask for the full corpus in one call.
    # The dataset is ~150 published stories — well within memory and
    # well within FastAPI's response time budget.
    limit: int = Query(5, ge=1, le=500),
    category: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get the N most recent published stories (for landing page, digest, Twitter).
    Optionally filter by category or sector."""
    try:
        query = db.query(Story).filter(Story.status == "published")
        if category:
            query = query.filter(Story.category == category)
        if sector:
            query = query.filter(Story.sector == sector)
        stories = query.order_by(desc(Story.published_at)).limit(limit).all()
    except Exception as e:
        logger.warning("stories query failed (table may not exist): %s", e)
        return {"stories": []}
    return {
        "stories": [_serialize_story_full(s) for s in stories],
    }


@router.get("/stats")
def story_stats(db: Session = Depends(get_db)):
    """Count of stories by sector and category."""
    try:
        by_sector = {}
        rows = (
            db.query(Story.sector, func.count())
            .filter(Story.status == "published")
            .group_by(Story.sector)
            .all()
        )
        for sector, count in rows:
            by_sector[sector or "cross-sector"] = count

        by_category = {}
        rows = (
            db.query(Story.category, func.count())
            .filter(Story.status == "published")
            .group_by(Story.category)
            .all()
        )
        for cat, count in rows:
            by_category[cat] = count

        total = db.query(Story).filter(Story.status == "published").count()
        drafts = db.query(Story).filter(Story.status == "draft").count()
    except Exception as e:
        logger.warning("story stats query failed (table may not exist): %s", e)
        return {"total_published": 0, "total_drafts": 0, "by_sector": {}, "by_category": {}}

    return {
        "total_published": total,
        "total_drafts": drafts,
        "by_sector": by_sector,
        "by_category": by_category,
    }


@router.get("/corrections/all")
def all_corrections(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Public endpoint: list all corrections and retractions across all stories."""
    try:
        total = db.query(StoryCorrection).count()
        corrections = (
            db.query(StoryCorrection)
            .order_by(desc(StoryCorrection.corrected_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

        story_ids = {c.story_id for c in corrections}
        stories = {
            s.id: s for s in db.query(Story).filter(Story.id.in_(story_ids)).all()
        } if story_ids else {}

        return {
            "total": total,
            "corrections": [
                {
                    "id": c.id,
                    "story_id": c.story_id,
                    "story_title": stories.get(c.story_id, Story(title="Unknown")).title,
                    "story_slug": stories.get(c.story_id, Story(slug="unknown")).slug,
                    "type": c.correction_type,
                    "description": c.description,
                    "date": c.corrected_at.isoformat() if c.corrected_at else None,
                }
                for c in corrections
            ],
        }
    except Exception as e:
        logger.warning("corrections query failed: %s", e)
        return {"total": 0, "corrections": []}


@router.post("/report-error")
@limiter.limit("5/minute")
def report_error(
    body: ErrorReportRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Public endpoint: anyone can report an error in a story."""
    story = db.query(Story).filter(Story.slug == body.story_slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    contact = body.reporter_email or "anonymous"
    correction = StoryCorrection(
        story_id=story.id,
        correction_type="reader_report",
        description="[Report from %s] %s" % (contact, body.description),
        corrected_by="reader",
    )
    db.add(correction)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to save error report for %s: %s", body.story_slug, e)
        raise HTTPException(status_code=500, detail="Failed to submit report")

    logger.info("Error report received for %s from %s", body.story_slug, contact)
    return {"message": "Thank you. Your report has been received and will be reviewed by our editorial team."}


@router.get("/{slug}")
def get_story(slug: str, db: Session = Depends(get_db)):
    """Get a single story by slug."""
    try:
        story = db.query(Story).filter(Story.slug == slug).first()
    except Exception as e:
        logger.warning("story lookup failed (table may not exist): %s", e)
        raise HTTPException(status_code=404, detail="Stories not available")
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Show published and retracted stories (retracted shows retraction notice)
    if story.status not in ("published", "retracted"):
        raise HTTPException(status_code=404, detail="Story not found")

    result = _serialize_story_full(story)

    # Load correction history from StoryCorrection table
    try:
        corrections = (
            db.query(StoryCorrection)
            .filter(StoryCorrection.story_id == story.id)
            .order_by(desc(StoryCorrection.corrected_at))
            .all()
        )
        result["corrections"] = [
            {
                "type": c.correction_type,
                "description": c.description,
                "date": c.corrected_at.isoformat() if c.corrected_at else None,
            }
            for c in corrections
        ]
    except Exception:
        result["corrections"] = []

    return result


@router.get("/{slug}/simplified")
@limiter.limit("30/minute")
def get_story_simplified(
    slug: str,
    request: Request = None,  # noqa: B008 — required by @limiter.limit
    db: Session = Depends(get_db),
):
    """Return the 60-second simplified version of a published story.

    Generates lazily on first request via Haiku and caches on the row.
    Subsequent requests are free. Returns null when generation fails
    so the frontend can fall back to the full summary.
    """
    try:
        story = db.query(Story).filter(Story.slug == slug).first()
    except Exception as e:
        logger.warning("simplified lookup failed: %s", e)
        raise HTTPException(status_code=404, detail="Stories not available")
    if not story or story.status not in ("published", "retracted"):
        raise HTTPException(status_code=404, detail="Story not found")

    if story.summary_simplified and story.summary_simplified.strip():
        return {
            "slug": slug,
            "simplified": story.summary_simplified,
            "model": story.summary_simplified_model,
            "generated": False,
        }

    # Lazy-generate. Best-effort: return null on failure.
    try:
        from services.story_simplified_summary import generate_and_cache
        text = generate_and_cache(story, db)
    except Exception as e:
        logger.warning("simplified generation failed: %s", e)
        text = None

    return {
        "slug": slug,
        "simplified": text,
        "model": story.summary_simplified_model if text else None,
        "generated": bool(text),
    }


@router.post("/{slug}/publish")
@limiter.limit("10/minute")
def publish_story(slug: str, request: Request, user=Depends(require_role("admin")), db: Session = Depends(get_db)):
    """Publish a draft story (sets status to published and published_at timestamp)."""
    try:
        story = db.query(Story).filter(Story.slug == slug).first()
    except Exception as e:
        logger.warning("story publish failed (table may not exist): %s", e)
        raise HTTPException(status_code=404, detail="Stories not available")
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if story.status == "published":
        return {"message": "Already published", "slug": slug}

    story.status = "published"
    story.published_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to publish story %s: %s", slug, e)
        raise HTTPException(status_code=500, detail="Failed to publish story")

    return {"message": "Published", "slug": slug, "published_at": story.published_at.isoformat()}


@router.post("/{slug}/retract")
@limiter.limit("10/minute")
def retract_story(
    slug: str,
    request: Request,
    reason: str = Query(..., min_length=10),
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Retract a published story. The story remains visible with a retraction notice."""
    story = db.query(Story).filter(Story.slug == slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    story.status = "retracted"
    story.retraction_reason = reason

    # Add to correction history
    correction = StoryCorrection(
        story_id=story.id,
        correction_type="retraction",
        description=reason,
        corrected_by="editorial",
    )
    db.add(correction)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to retract story %s: %s", slug, e)
        raise HTTPException(status_code=500, detail="Failed to retract story")

    logger.info("Story retracted: %s — %s", slug, reason)
    return {"message": "Retracted", "slug": slug, "reason": reason}


@router.post("/{slug}/correct")
@limiter.limit("10/minute")
def correct_story(
    slug: str,
    body: CorrectionRequest,
    request: Request,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Record a correction to a published story."""
    story = db.query(Story).filter(Story.slug == slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    correction = StoryCorrection(
        story_id=story.id,
        correction_type=body.correction_type,
        description=body.description,
        corrected_by="editorial",
    )
    db.add(correction)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to add correction for %s: %s", slug, e)
        raise HTTPException(status_code=500, detail="Failed to record correction")

    return {"message": "Correction recorded", "slug": slug, "type": body.correction_type}


