"""
Stories routes — Auto-generated data stories from pattern detection.

Stories are drafted by Claude from structured evidence found in government
data, reviewed, then published to the /stories page, newsletter, and Twitter.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional

logger = logging.getLogger(__name__)

from models.database import get_db
from models.stories_models import Story
from models.response_schemas import StoriesListResponse

router = APIRouter(prefix="/stories", tags=["stories"])


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
        "stories": [
            {
                "id": s.id,
                "title": s.title,
                "slug": s.slug,
                "summary": s.summary,
                "category": s.category,
                "sector": s.sector,
                "entity_ids": s.entity_ids,
                "evidence": s.evidence,
                "status": s.status,
                "verification_score": getattr(s, 'verification_score', None),
                "verification_tier": getattr(s, 'verification_tier', None),
                "published_at": s.published_at.isoformat() if s.published_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in stories
        ],
    }


@router.get("/latest", response_model=StoriesListResponse)
def latest_stories(limit: int = Query(5, ge=1, le=200), db: Session = Depends(get_db)):
    """Get the N most recent published stories (for landing page, digest, Twitter)."""
    try:
        stories = (
            db.query(Story)
            .filter(Story.status == "published")
            .order_by(desc(Story.published_at))
            .limit(limit)
            .all()
        )
    except Exception as e:
        logger.warning("stories query failed (table may not exist): %s", e)
        return {"stories": []}
    return {
        "stories": [
            {
                "id": s.id,
                "title": s.title,
                "slug": s.slug,
                "summary": s.summary,
                "body": s.body,
                "category": s.category,
                "sector": s.sector,
                "entity_ids": s.entity_ids,
                "data_sources": s.data_sources,
                "verification_score": getattr(s, 'verification_score', None),
                "verification_tier": getattr(s, 'verification_tier', None),
                "published_at": s.published_at.isoformat() if s.published_at else None,
            }
            for s in stories
        ],
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

    # Only show published stories to public (drafts visible via /stories?status=draft)
    if story.status not in ("published", "draft"):
        raise HTTPException(status_code=404, detail="Story not found")

    return {
        "id": story.id,
        "title": story.title,
        "slug": story.slug,
        "summary": story.summary,
        "body": story.body,
        "category": story.category,
        "sector": story.sector,
        "entity_ids": story.entity_ids,
        "data_sources": story.data_sources,
        "evidence": story.evidence,
        "status": story.status,
        "verification_score": getattr(story, 'verification_score', None),
        "verification_tier": getattr(story, 'verification_tier', None),
        "verification_data": json.loads(story.verification_data) if getattr(story, 'verification_data', None) else None,
        "published_at": story.published_at.isoformat() if story.published_at else None,
        "created_at": story.created_at.isoformat() if story.created_at else None,
    }


@router.post("/{slug}/publish")
def publish_story(slug: str, db: Session = Depends(get_db)):
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
    db.commit()

    return {"message": "Published", "slug": slug, "published_at": story.published_at.isoformat()}
