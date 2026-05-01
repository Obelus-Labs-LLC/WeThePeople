"""Engagement event endpoints.

Phase 3 thread A. Action Panel CTA clicks are recorded here so the
ops engagement dashboard can show which scripts + sectors actually
move readers, and which actions are dead weight.

Public:
    POST /events/action-click       — record a click. Optional auth.

Admin:
    GET /events/action-click/stats  — aggregate counters.

Privacy notes:
- No IP captured at the row level. Rate limiting is per-IP at the
  middleware layer; the limit key never lands in the database.
- user_id is filled when the request carries a valid session cookie
  or Bearer token, otherwise null (anonymous click).
- No referrer, no user-agent, no fingerprint. The minimal viable
  signal: which action the user chose to engage with.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.database import get_db
from models.stories_models import ActionClick, Story, StoryAction
from services.jwt_auth import get_optional_user
from services.rbac import require_role

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/events", tags=["events"])


# ── Schemas ──────────────────────────────────────────────────────────

class ActionClickRequest(BaseModel):
    story_slug: str = Field(..., min_length=1, max_length=255)
    action_id: int = Field(..., ge=1)


class ActionClickResponse(BaseModel):
    ok: bool


class ActionClickAggRow(BaseModel):
    action_type: str
    clicks: int


class ActionClickStatsResponse(BaseModel):
    window_days: int
    total: int
    by_type: List[ActionClickAggRow]
    by_sector: List[dict]
    top_stories: List[dict]


# ── Public click recorder ────────────────────────────────────────────

@router.post("/action-click", response_model=ActionClickResponse, status_code=201)
@limiter.limit("60/minute")
def record_action_click(
    body: ActionClickRequest,
    request: Request,
    user=Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Record a CTA click on the Action Panel.

    Idempotency: not enforced. A double-click counts as two; the
    aggregator dedupes at query time when needed.
    Validates that the action_id actually belongs to the story_slug
    so the endpoint can't be abused to inflate counts on arbitrary
    actions.
    """
    story = db.query(Story).filter(Story.slug == body.story_slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    action = (
        db.query(StoryAction)
        .filter(StoryAction.id == body.action_id)
        .filter(StoryAction.story_id == story.id)
        .first()
    )
    if not action:
        raise HTTPException(
            status_code=404,
            detail="Action does not belong to this story",
        )

    row = ActionClick(
        story_id=story.id,
        action_id=action.id,
        action_type=action.action_type,
        user_id=getattr(user, "id", None),
    )
    db.add(row)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("action-click insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record click")

    return ActionClickResponse(ok=True)


# ── Admin aggregate stats ────────────────────────────────────────────

@router.get("/action-click/stats", response_model=ActionClickStatsResponse)
def action_click_stats(
    window_days: int = 30,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Aggregate clicks for the last `window_days` days.

    Powers the /ops/engagement dashboard. Three rollups:
      - by action_type: which CTAs people choose
      - by sector: which sectors mobilize the most engagement
      - top_stories: the highest-traction individual stories
    """
    if window_days <= 0 or window_days > 365:
        raise HTTPException(status_code=422, detail="window_days must be 1..365")

    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    total = (
        db.query(func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .scalar() or 0
    )

    by_type_rows = (
        db.query(ActionClick.action_type, func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .group_by(ActionClick.action_type)
        .order_by(func.count(ActionClick.id).desc())
        .all()
    )
    by_type = [
        ActionClickAggRow(action_type=t, clicks=c) for (t, c) in by_type_rows
    ]

    # Sector rollup joins through Story.
    by_sector_rows = (
        db.query(Story.sector, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.sector)
        .order_by(func.count(ActionClick.id).desc())
        .limit(20)
        .all()
    )
    by_sector = [
        {"sector": s or "(unset)", "clicks": c} for (s, c) in by_sector_rows
    ]

    top_stories_rows = (
        db.query(Story.slug, Story.title, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.slug, Story.title)
        .order_by(func.count(ActionClick.id).desc())
        .limit(10)
        .all()
    )
    top_stories = [
        {"slug": slug, "title": title, "clicks": c}
        for (slug, title, c) in top_stories_rows
    ]

    return ActionClickStatsResponse(
        window_days=window_days,
        total=total,
        by_type=by_type,
        by_sector=by_sector,
        top_stories=top_stories,
    )
