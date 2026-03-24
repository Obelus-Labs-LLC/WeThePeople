"""
Stories routes — Auto-generated data stories from pattern detection.

Stories are drafted by Claude from structured evidence found in government
data, reviewed, then published to the /stories page, newsletter, and Twitter.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional

from models.database import SessionLocal
from models.stories_models import Story

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("/")
def list_stories(
    sector: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: str = Query("published"),
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """List stories, filtered by sector/category/status, ordered by published_at."""
    db = SessionLocal()
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
                    "published_at": s.published_at.isoformat() if s.published_at else None,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in stories
            ],
        }
    finally:
        db.close()


@router.get("/latest")
def latest_stories(limit: int = Query(5, ge=1, le=20)):
    """Get the N most recent published stories (for landing page, digest, Twitter)."""
    db = SessionLocal()
    try:
        stories = (
            db.query(Story)
            .filter(Story.status == "published")
            .order_by(desc(Story.published_at))
            .limit(limit)
            .all()
        )
        return {
            "stories": [
                {
                    "id": s.id,
                    "title": s.title,
                    "slug": s.slug,
                    "summary": s.summary,
                    "category": s.category,
                    "sector": s.sector,
                    "published_at": s.published_at.isoformat() if s.published_at else None,
                }
                for s in stories
            ],
        }
    finally:
        db.close()


@router.get("/stats")
def story_stats():
    """Count of stories by sector and category."""
    db = SessionLocal()
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

        return {
            "total_published": total,
            "total_drafts": drafts,
            "by_sector": by_sector,
            "by_category": by_category,
        }
    finally:
        db.close()


@router.get("/{slug}")
def get_story(slug: str):
    """Get a single story by slug."""
    db = SessionLocal()
    try:
        story = db.query(Story).filter(Story.slug == slug).first()
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
            "published_at": story.published_at.isoformat() if story.published_at else None,
            "created_at": story.created_at.isoformat() if story.created_at else None,
        }
    finally:
        db.close()


@router.post("/{slug}/publish")
def publish_story(slug: str):
    """Publish a draft story (sets status to published and published_at timestamp)."""
    db = SessionLocal()
    try:
        story = db.query(Story).filter(Story.slug == slug).first()
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")

        if story.status == "published":
            return {"message": "Already published", "slug": slug}

        story.status = "published"
        story.published_at = datetime.now(timezone.utc)
        db.commit()

        return {"message": "Published", "slug": slug, "published_at": story.published_at.isoformat()}
    finally:
        db.close()
