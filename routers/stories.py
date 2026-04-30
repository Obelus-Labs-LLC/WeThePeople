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


# ── Story Action Panel (public read) + personalization ─────────────


@router.get("/{slug}/actions")
@limiter.limit("60/minute")
def get_story_actions(
    slug: str,
    request: Request = None,  # noqa: B008 — required by @limiter.limit
    state: Optional[str] = Query(None, max_length=2),
    db: Session = Depends(get_db),
):
    """Return the Action Panel items for a published story.

    Optionally filter by `state` (2-letter code). Items with a
    geographic_filter that doesn't match the requested state are
    omitted; items without a geographic_filter always show.
    """
    from models.stories_models import StoryAction

    try:
        story = db.query(Story).filter(Story.slug == slug).first()
    except Exception as e:
        logger.warning("story actions lookup failed: %s", e)
        raise HTTPException(status_code=404, detail="Stories not available")
    if not story or story.status not in ("published", "retracted"):
        raise HTTPException(status_code=404, detail="Story not found")

    rows = (
        db.query(StoryAction)
        .filter(StoryAction.story_id == story.id)
        .order_by(StoryAction.display_order.asc(), StoryAction.id.asc())
        .all()
    )
    state_norm = (state or "").strip().upper() or None
    items = []
    for r in rows:
        if r.geographic_filter and state_norm and r.geographic_filter.upper() != state_norm:
            continue
        items.append({
            "id": r.id,
            "action_type": r.action_type,
            "title": r.title,
            "description": r.description,
            "is_passive": bool(r.is_passive),
            "geographic_filter": r.geographic_filter,
            "script_template": r.script_template,
            "external_url": r.external_url,
            "display_order": r.display_order,
        })
    return {"slug": slug, "actions": items}


class StoryActionPayload(BaseModel):
    """Admin write payload for creating / updating an Action Panel item."""
    action_type: str
    title: str
    description: Optional[str] = None
    is_passive: bool = False
    geographic_filter: Optional[str] = None
    script_template: Optional[str] = None
    external_url: Optional[str] = None
    display_order: int = 0


@router.post("/{slug}/actions")
@limiter.limit("30/minute")
def create_story_action(
    slug: str,
    body: StoryActionPayload,
    request: Request,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin: create one Action Panel item on a story. Editor uses
    this to attach 1-3 actions per story before publication."""
    from models.stories_models import StoryAction

    story = db.query(Story).filter(Story.slug == slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    try:
        action_type = StoryAction.validate_action_type(body.action_type)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    row = StoryAction(
        story_id=story.id,
        action_type=action_type,
        title=body.title.strip()[:200],
        description=(body.description or "").strip() or None,
        is_passive=1 if body.is_passive else 0,
        geographic_filter=(body.geographic_filter or "").strip().upper() or None,
        script_template=(body.script_template or "").strip() or None,
        external_url=(body.external_url or "").strip() or None,
        display_order=int(body.display_order or 0),
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    return {
        "id": row.id,
        "story_id": row.story_id,
        "action_type": row.action_type,
        "title": row.title,
    }


@router.get("/{slug}/personalization")
@limiter.limit("60/minute")
def get_story_personalization(
    slug: str,
    request: Request = None,  # noqa: B008 — required by @limiter.limit
    state: Optional[str] = Query(None, max_length=2, description="2-letter state code"),
    lifestyle: Optional[str] = Query(None, description="Comma-separated user lifestyle/sector categories"),
    concern: Optional[str] = Query(None, max_length=64, description="User's primary concern (v1, single-string)"),
    concerns: Optional[str] = Query(None, description="Comma-separated list of user concerns (v2, multi-select)"),
    db: Session = Depends(get_db),
):
    """Build a 'Why this matters to you' payload for a story.

    Public endpoint. Frontend either calls /auth/personalization first
    (if user is logged in) or reads onboarding state from localStorage
    (if anonymous), then passes the relevant pieces here as query
    params. Returns 1-3 personalized hooks that anchor the story to
    the reader's life:

      - matched_lifestyle: lifestyle categories the user picked that
        appear in this story's sector / category
      - your_representatives: senators + house member for the user's
        state, only when they're named in the story OR the story
        category implies congressional involvement (legislation,
        committee, vote, trade)
      - concern_anchor: a one-line framing that connects the story
        to the user's current_concern, if a meaningful link exists

    Returns an empty payload (200 OK with empty fields) when the user
    didn't onboard or when no anchors apply. The frontend gracefully
    falls back to a generic story header.
    """
    from models.stories_models import Story
    from sqlalchemy import or_

    try:
        story = db.query(Story).filter(Story.slug == slug).first()
    except Exception as e:
        logger.warning("personalization lookup failed: %s", e)
        raise HTTPException(status_code=404, detail="Stories not available")
    if not story or story.status not in ("published", "retracted"):
        raise HTTPException(status_code=404, detail="Story not found")

    state_norm = (state or "").strip().upper() or None
    lifestyle_norm: List[str] = (
        [c.strip().lower() for c in (lifestyle or "").split(",") if c.strip()]
        if lifestyle else []
    )
    # Concerns: prefer the v2 multi-select param; fall back to the v1
    # single-string. The anchor lookup is keyed by (concern, sector),
    # so we walk the list and pick the first concern that produces a
    # non-empty anchor for this story.
    concerns_list: List[str] = (
        [c.strip().lower() for c in (concerns or "").split(",") if c.strip()]
        if concerns else []
    )
    if not concerns_list and concern:
        concerns_list = [(concern or "").strip().lower()]

    # 1. Matched lifestyle. Map story.category and story.sector into
    #    the user's lifestyle vocabulary.
    matched_lifestyle = _match_lifestyle(story, lifestyle_norm)

    # 2. Your representatives. Only attach when the story is
    #    congressional-flavored (politics sector OR a category that
    #    implies congressional context) AND we have a state.
    reps = []
    congressional_categories = {
        "trade_before_legislation", "lobby_then_win", "lobby_contract_loop",
        "pac_committee_pipeline", "tax_lobbying", "budget_lobbying",
        "trade_cluster", "stock_act_violation", "committee_stock_trade",
        "bipartisan_buying", "trade_timing", "prolific_trader",
        "full_influence_loop", "regulatory_loop", "education_pipeline",
    }
    is_congressional = (
        (story.sector or "").lower() == "politics"
        or (story.category or "").lower() in congressional_categories
    )
    if state_norm and is_congressional:
        try:
            from models.database import TrackedMember
            rep_rows = (
                db.query(TrackedMember)
                .filter(TrackedMember.state == state_norm)
                .filter(TrackedMember.is_active == 1)
                .order_by(TrackedMember.chamber.desc(), TrackedMember.display_name.asc())
                .all()
            )
            for r in rep_rows:
                reps.append({
                    "person_id": r.person_id,
                    "display_name": r.display_name,
                    "chamber": r.chamber,
                    "party": r.party,
                    "state": r.state,
                    "photo_url": r.photo_url,
                })
        except Exception as e:
            logger.warning("rep lookup failed for state %s: %s", state_norm, e)

    # 3. Concern anchor. One-line framing keyed off the user's
    #    concerns. Walks each concern in priority order; the first
    #    one that yields a non-empty anchor wins.
    concern_anchor: Optional[str] = None
    for c in concerns_list or [None]:
        anchor = _concern_anchor_for_story(story, c, matched_lifestyle)
        if anchor:
            concern_anchor = anchor
            break

    return {
        "slug": slug,
        "matched_lifestyle": matched_lifestyle,
        "your_representatives": reps,
        "concern_anchor": concern_anchor,
        "has_personalization": bool(matched_lifestyle or reps or concern_anchor),
    }


def _match_lifestyle(story: Story, user_lifestyle: List[str]) -> List[str]:
    """Return the subset of `user_lifestyle` that matches the story.

    Mapping is heuristic but stable: each story sector / category
    points to one or two lifestyle categories the disengaged-audience
    onboarding form offers. Unknown sectors return an empty list.
    """
    if not user_lifestyle:
        return []

    sector = (story.sector or "").lower()
    category = (story.category or "").lower()

    # Story-side signals -> user-lifestyle vocabulary. The lookup
    # carries both the v2 sector keys (which match the platform's
    # canonical sectors 1-to-1) and the legacy v1 lifestyle keys so
    # older localStorage records still resolve.
    sector_to_lifestyle = {
        # v2 (canonical) sector keys
        "finance":         {"finance", "banking"},
        "health":          {"health", "healthcare"},
        "housing":         {"housing"},
        "energy":          {"energy", "transportation"},
        "transportation":  {"transportation"},
        "technology":      {"technology", "tech"},
        "tech":            {"technology", "tech"},
        "education":       {"education", "kids"},
        "agriculture":     {"agriculture", "food"},
        "telecom":         {"telecom", "technology", "tech"},
        "chemicals":       {"chemicals"},
        "defense":         {"defense"},
    }
    category_to_lifestyle = {
        "tax_lobbying":         {"work"},
        "budget_lobbying":      {"work"},
        "lobby_contract_loop":  {"work"},
        "education_pipeline":   {"kids", "education"},
    }

    candidates: set[str] = set()
    candidates |= sector_to_lifestyle.get(sector, set())
    candidates |= category_to_lifestyle.get(category, set())
    if not candidates:
        return []
    return [c for c in user_lifestyle if c in candidates]


def _concern_anchor_for_story(
    story: Story,
    concern: Optional[str],
    matched_lifestyle: List[str],
) -> Optional[str]:
    """Generate a one-line plain-English hook tying the story to the
    reader's current_concern. Returns None when there's no clean
    mapping — better silence than forced relevance."""
    if not concern:
        return None
    sector = (story.sector or "").lower()

    # Map (concern, sector) -> headline framing. Specific to the
    # disengaged-audience thesis: anchor in personal cost.
    table = {
        ("rent_too_high",      "finance"):  "This story is about the banks that decide your mortgage and rent rules.",
        ("rent_too_high",      "housing"):  "This story is about the policies that shape what you pay for housing.",
        ("healthcare_costs",   "health"):   "This story is about the companies and rules that drive what you pay for healthcare.",
        ("student_loans",      "finance"):  "This story is about the banks involved in student loan servicing.",
        ("student_loans",      "education"):"This story is about the policies that shape student-loan terms.",
        ("fuel_prices",        "energy"):   "This story is about the energy industry that affects what you pay at the pump.",
        ("fuel_prices",        "transportation"): "This story is about the transport sector that affects fuel costs.",
        ("groceries",          "agriculture"): "This story is about the agriculture industry that affects food prices.",
        ("groceries",          "tech"):     "This story is about the tech platforms that affect grocery delivery and pricing.",
        ("wages",              "finance"):  "This story is about the financial-services rules that affect wages and employment.",
        ("wages",              "tech"):     "This story is about tech-industry policies that affect tech-sector wages and labor rules.",
        ("childcare",          "education"):"This story is about the policies that affect childcare costs and access.",
        ("credit_card_debt",   "finance"):  "This story is about the banks that issue your credit cards.",
        ("retirement",         "finance"):  "This story is about the financial firms that hold your retirement money.",
    }
    msg = table.get((concern, sector))
    if msg:
        return msg
    # Fallback: if the user has a matched lifestyle, mention the sector
    # without the concern.
    if matched_lifestyle:
        return f"This story touches {matched_lifestyle[0]} — one of the categories you flagged in onboarding."
    return None


@router.delete("/{slug}/actions/{action_id}")
@limiter.limit("30/minute")
def delete_story_action(
    slug: str,
    action_id: int,
    request: Request,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin: delete an Action Panel item."""
    from models.stories_models import StoryAction

    story = db.query(Story).filter(Story.slug == slug).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    row = (
        db.query(StoryAction)
        .filter(StoryAction.id == action_id, StoryAction.story_id == story.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")
    db.delete(row)
    db.commit()
    return {"deleted": action_id}


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


