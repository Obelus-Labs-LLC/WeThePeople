"""
Civic engagement API — accountability tracking, proposals, annotations,
badges, verification, and scoring.

Endpoints:
  /civic/promises          — CRUD + voting on politician promises
  /civic/proposals         — citizen proposals with lifecycle
  /civic/annotations       — bill section annotations
  /civic/badges            — badge definitions + user badges
  /civic/verify            — citizen verification flow
  /civic/leaderboard       — scored rankings with hot/confidence
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text

from models.database import get_db, Bill, Person
from models.auth_models import User
from models.civic_models import (
    Promise, Milestone, CivicVote, Proposal, BillAnnotation,
    Badge, UserBadge, wilson_score, hot_score,
)
from services.jwt_auth import get_current_user, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/civic", tags=["civic"])
limiter = Limiter(key_func=get_remote_address)


# ── Schemas ───────────────────────────────────────────────────────────


class PromiseCreate(BaseModel):
    person_id: str
    person_name: str = ""
    title: str = Field(..., max_length=500)
    description: str = ""
    source_url: str = ""
    promise_date: Optional[str] = None
    category: str = ""
    linked_bill_ids: List[str] = []
    linked_action_ids: List[int] = []


class MilestoneCreate(BaseModel):
    title: str = Field(..., max_length=500)
    description: str = ""
    evidence_url: str = ""


class ProposalCreate(BaseModel):
    title: str = Field(..., max_length=500)
    body: str = Field(..., max_length=10000)
    category: str = ""
    sector: str = ""


class AnnotationCreate(BaseModel):
    bill_id: str = Field(..., min_length=1, max_length=64)
    section_ref: str = Field("", max_length=200)
    text_excerpt: str = Field("", max_length=2000)
    comment: str = Field(..., min_length=1, max_length=5000)
    sentiment: str = "neutral"  # support, oppose, neutral, question


class VoteRequest(BaseModel):
    target_type: str  # promise, proposal, annotation
    target_id: int
    value: int = Field(..., ge=-1, le=1)  # +1 or -1


class VerifyResidenceRequest(BaseModel):
    zip_code: str = Field(..., min_length=5, max_length=10)


# ── Helpers ───────────────────────────────────────────────────────────


def _serialize_promise(p: Promise) -> dict:
    return {
        "id": p.id,
        "person_id": p.person_id,
        "person_name": p.person_name,
        "title": p.title,
        "description": p.description,
        "source_url": p.source_url,
        "promise_date": p.promise_date.isoformat() if p.promise_date else None,
        "category": p.category,
        "status": p.status,
        "retire_reason": p.retire_reason,
        "progress": p.progress,
        "confidence_score": p.confidence_score,
        "hot_score": p.hot_score,
        "linked_bill_ids": json.loads(p.linked_bill_ids) if p.linked_bill_ids else [],
        "linked_action_ids": json.loads(p.linked_action_ids) if p.linked_action_ids else [],
        "milestones": [
            {
                "id": m.id,
                "title": m.title,
                "description": m.description,
                "evidence_url": m.evidence_url,
                "status": m.status,
                "achieved_date": m.achieved_date.isoformat() if m.achieved_date else None,
            }
            for m in (p.milestones or [])
        ],
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _update_scores(db: Session, target_type: str, target_id: int):
    """Recompute Wilson + hot scores after a vote change.

    Two concurrent voters used to race here: both would read the same
    counts, both would compute the same `ws` — and the first writer's
    incremental update was overwritten when the second writer committed.

    Fix: take a row-level write lock on the target row before counting,
    so the second voter blocks until the first commit lands. On SQLite
    this maps to ``BEGIN IMMEDIATE`` semantics; on Postgres to
    ``SELECT ... FOR UPDATE``. SQLAlchemy's ``with_for_update`` does the
    right thing on Postgres and is a no-op on SQLite, so we also issue
    a manual ``BEGIN IMMEDIATE`` for the SQLite path.
    """
    if target_type == "promise":
        model = Promise
    elif target_type == "proposal":
        model = Proposal
    elif target_type == "annotation":
        model = BillAnnotation
    else:
        return

    # SQLite: escalate to a write transaction before counting so the
    # entire COUNT → write sequence is serialized against other writers.
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "sqlite":
        try:
            db.execute(text("BEGIN IMMEDIATE"))
        except Exception:
            # Already inside a write transaction (or driver doesn't
            # support it) — proceed; with_for_update covers Postgres.
            pass

    obj = (
        db.query(model)
        .filter(model.id == target_id)
        .with_for_update()
        .first()
    )
    if not obj:
        db.commit()
        return

    ups = db.query(func.count(CivicVote.id)).filter(
        CivicVote.target_type == target_type,
        CivicVote.target_id == target_id,
        CivicVote.value == 1,
    ).scalar() or 0
    downs = db.query(func.count(CivicVote.id)).filter(
        CivicVote.target_type == target_type,
        CivicVote.target_id == target_id,
        CivicVote.value == -1,
    ).scalar() or 0

    ws = wilson_score(ups, downs)

    obj.confidence_score = ws
    if hasattr(obj, "hot_score") and obj.created_at:
        epoch = obj.created_at.timestamp() if obj.created_at else 0
        obj.hot_score = hot_score(ups, downs, epoch)
    if hasattr(obj, "upvotes"):
        obj.upvotes = ups
        obj.downvotes = downs
    db.commit()


def _check_badge_progress(db: Session, user_id: int, action: str):
    """Check if user earned a new badge from this action."""
    BADGE_ACTIONS = {
        "vote": ["first_vote", "voter_10", "voter_100"],
        "promise": ["promise_tracker"],
        "proposal": ["first_proposal", "proposer_10"],
        "annotation": ["bill_reader", "annotator_10"],
        "verify": ["verified_citizen"],
    }
    slugs = BADGE_ACTIONS.get(action, [])
    for slug in slugs:
        badge = db.query(Badge).filter(Badge.slug == slug).first()
        if not badge:
            continue
        existing = db.query(UserBadge).filter(
            UserBadge.user_id == user_id, UserBadge.badge_id == badge.id
        ).first()
        if existing:
            existing.progress_count += 1
            continue
        # Count qualifying actions
        if action == "vote":
            count = db.query(CivicVote).filter(CivicVote.user_id == user_id).count()
        elif action == "promise":
            count = db.query(Promise).filter(Promise.created_by == user_id).count()
        elif action == "proposal":
            count = db.query(Proposal).filter(Proposal.author_id == user_id).count()
        elif action == "annotation":
            count = db.query(BillAnnotation).filter(BillAnnotation.user_id == user_id).count()
        elif action == "verify":
            count = 1
        else:
            count = 0

        if count >= badge.threshold:
            ub = UserBadge(user_id=user_id, badge_id=badge.id, progress_count=count)
            db.add(ub)
    db.commit()


# ══════════════════════════════════════════════════════════════════════
#  PROMISES (Accountability Tracking)
# ══════════════════════════════════════════════════════════════════════


@router.get("/promises")
def list_promises(
    person_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort: str = Query("hot", description="hot, confidence, newest"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List promises with filtering and scoring-based sort."""
    q = db.query(Promise)
    if person_id:
        q = q.filter(Promise.person_id == person_id)
    if category:
        q = q.filter(Promise.category == category)
    if status_filter:
        q = q.filter(Promise.status == status_filter)

    total = q.count()

    if sort == "hot":
        q = q.order_by(desc(Promise.hot_score))
    elif sort == "confidence":
        q = q.order_by(desc(Promise.confidence_score))
    else:
        q = q.order_by(desc(Promise.created_at))

    items = q.offset(offset).limit(limit).all()
    return {"total": total, "items": [_serialize_promise(p) for p in items]}


@router.get("/promises/{promise_id}")
def get_promise(promise_id: int, db: Session = Depends(get_db)):
    p = db.query(Promise).filter(Promise.id == promise_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Promise not found")
    return _serialize_promise(p)


@router.post("/promises", status_code=201)
@limiter.limit("10/minute")
def create_promise(body: PromiseCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = db.query(Person.person_id, Person.display_name).filter(Person.person_id == body.person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="person_id not found")
    for bid in body.linked_bill_ids:
        if not db.query(Bill.bill_id).filter(Bill.bill_id == bid).first():
            raise HTTPException(status_code=404, detail=f"linked bill_id not found: {bid}")
    p = Promise(
        person_id=body.person_id,
        person_name=body.person_name or person.display_name,
        title=body.title,
        description=body.description,
        source_url=body.source_url,
        promise_date=datetime.fromisoformat(body.promise_date) if body.promise_date else None,
        category=body.category,
        linked_bill_ids=json.dumps(body.linked_bill_ids) if body.linked_bill_ids else None,
        linked_action_ids=json.dumps(body.linked_action_ids) if body.linked_action_ids else None,
        created_by=user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    _check_badge_progress(db, user.id, "promise")
    return _serialize_promise(p)


@router.patch("/promises/{promise_id}")
def update_promise_status(
    promise_id: int,
    new_status: str = Query(..., description="pending, in_progress, partially_fulfilled, fulfilled, broken, retired"),
    retire_reason: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Promise).filter(Promise.id == promise_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Promise not found")
    if p.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the creator or an admin can update this promise")
    valid = {"pending", "in_progress", "partially_fulfilled", "fulfilled", "broken", "retired"}
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    p.status = new_status
    if new_status == "retired" and retire_reason:
        p.retire_reason = retire_reason
    db.commit()
    return _serialize_promise(p)


@router.post("/promises/{promise_id}/milestones", status_code=201)
@limiter.limit("10/minute")
def add_milestone(
    promise_id: int,
    body: MilestoneCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Promise).filter(Promise.id == promise_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Promise not found")
    m = Milestone(
        promise_id=promise_id,
        title=body.title,
        description=body.description,
        evidence_url=body.evidence_url,
    )
    db.add(m)
    db.commit()
    # Recalculate progress
    milestones = db.query(Milestone).filter(Milestone.promise_id == promise_id).all()
    if milestones:
        achieved = sum(1 for ms in milestones if ms.status == "achieved")
        p.progress = int(achieved / len(milestones) * 100)
        db.commit()
    db.refresh(m)
    return {"id": m.id, "title": m.title, "status": m.status}


@router.patch("/milestones/{milestone_id}")
def update_milestone(
    milestone_id: int,
    new_status: str = Query(..., description="pending, achieved, missed"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.query(Milestone).filter(Milestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    m.status = new_status
    if new_status == "achieved":
        m.achieved_date = datetime.now(timezone.utc)
    db.commit()
    # Recalculate parent promise progress
    milestones = db.query(Milestone).filter(Milestone.promise_id == m.promise_id).all()
    if milestones:
        achieved = sum(1 for ms in milestones if ms.status == "achieved")
        p = db.query(Promise).filter(Promise.id == m.promise_id).first()
        if p:
            p.progress = int(achieved / len(milestones) * 100)
            db.commit()
    return {"id": m.id, "status": m.status, "achieved_date": m.achieved_date.isoformat() if m.achieved_date else None}


# ══════════════════════════════════════════════════════════════════════
#  VOTING
# ══════════════════════════════════════════════════════════════════════


@router.post("/vote")
@limiter.limit("30/minute")
def cast_vote(body: VoteRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.target_type not in ("promise", "proposal", "annotation"):
        raise HTTPException(status_code=400, detail="Invalid target_type")
    if body.value not in (1, -1):
        raise HTTPException(status_code=400, detail="Value must be 1 or -1")

    existing = db.query(CivicVote).filter(
        CivicVote.user_id == user.id,
        CivicVote.target_type == body.target_type,
        CivicVote.target_id == body.target_id,
    ).first()

    if existing:
        if existing.value == body.value:
            # Undo vote
            db.delete(existing)
            db.commit()
            _update_scores(db, body.target_type, body.target_id)
            return {"action": "removed"}
        existing.value = body.value
        db.commit()
    else:
        vote = CivicVote(
            user_id=user.id,
            target_type=body.target_type,
            target_id=body.target_id,
            value=body.value,
        )
        db.add(vote)
        db.commit()

    _update_scores(db, body.target_type, body.target_id)
    _check_badge_progress(db, user.id, "vote")
    return {"action": "voted", "value": body.value}


# ══════════════════════════════════════════════════════════════════════
#  PROPOSALS
# ══════════════════════════════════════════════════════════════════════


@router.get("/proposals")
def list_proposals(
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort: str = Query("hot"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Proposal).filter(Proposal.status != "draft")
    if category:
        q = q.filter(Proposal.category == category)
    if status_filter:
        q = q.filter(Proposal.status == status_filter)

    total = q.count()

    if sort == "hot":
        q = q.order_by(desc(Proposal.hot_score))
    elif sort == "confidence":
        q = q.order_by(desc(Proposal.confidence_score))
    else:
        q = q.order_by(desc(Proposal.created_at))

    items = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": p.id,
                "title": p.title,
                "body": p.body[:300] + "..." if len(p.body) > 300 else p.body,
                "category": p.category,
                "sector": p.sector,
                "status": p.status,
                "upvotes": p.upvotes,
                "downvotes": p.downvotes,
                "confidence_score": p.confidence_score,
                "hot_score": p.hot_score,
                "published_at": p.published_at.isoformat() if p.published_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in items
        ],
    }


@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: int, db: Session = Depends(get_db)):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {
        "id": p.id,
        "title": p.title,
        "body": p.body,
        "category": p.category,
        "sector": p.sector,
        "status": p.status,
        "retire_reason": p.retire_reason,
        "upvotes": p.upvotes,
        "downvotes": p.downvotes,
        "confidence_score": p.confidence_score,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.post("/proposals", status_code=201)
@limiter.limit("10/minute")
def create_proposal(body: ProposalCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = Proposal(
        author_id=user.id,
        title=body.title,
        body=body.body,
        category=body.category,
        sector=body.sector,
        status="published",
        published_at=datetime.now(timezone.utc),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    _check_badge_progress(db, user.id, "proposal")
    return {"id": p.id, "title": p.title, "status": p.status}


@router.patch("/proposals/{proposal_id}")
def update_proposal_status(
    proposal_id: int,
    new_status: str = Query(...),
    retire_reason: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if p.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the author or an admin can update this proposal")
    p.status = new_status
    if new_status == "retired" and retire_reason:
        p.retire_reason = retire_reason
    if new_status == "closed":
        p.closed_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": p.id, "status": p.status}


# ══════════════════════════════════════════════════════════════════════
#  BILL ANNOTATIONS
# ══════════════════════════════════════════════════════════════════════


@router.get("/annotations")
def list_annotations(
    bill_id: str = Query(...),
    section_ref: Optional[str] = Query(None),
    sort: str = Query("confidence"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(BillAnnotation).filter(BillAnnotation.bill_id == bill_id)
    if section_ref:
        q = q.filter(BillAnnotation.section_ref == section_ref)

    total = q.count()

    if sort == "confidence":
        q = q.order_by(desc(BillAnnotation.confidence_score))
    else:
        q = q.order_by(desc(BillAnnotation.created_at))

    items = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "bill_id": bill_id,
        "items": [
            {
                "id": a.id,
                "section_ref": a.section_ref,
                "text_excerpt": a.text_excerpt,
                "comment": a.comment,
                "sentiment": a.sentiment,
                "upvotes": a.upvotes,
                "downvotes": a.downvotes,
                "confidence_score": a.confidence_score,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in items
        ],
    }


@router.post("/annotations", status_code=201)
@limiter.limit("10/minute")
def create_annotation(body: AnnotationCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.sentiment not in ("support", "oppose", "neutral", "question"):
        raise HTTPException(status_code=400, detail="sentiment must be support, oppose, neutral, or question")
    if not db.query(Bill.bill_id).filter(Bill.bill_id == body.bill_id).first():
        raise HTTPException(status_code=404, detail="bill_id not found")
    a = BillAnnotation(
        bill_id=body.bill_id,
        user_id=user.id,
        section_ref=body.section_ref,
        text_excerpt=body.text_excerpt,
        comment=body.comment,
        sentiment=body.sentiment,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    _check_badge_progress(db, user.id, "annotation")
    return {"id": a.id, "bill_id": a.bill_id, "section_ref": a.section_ref}


# ══════════════════════════════════════════════════════════════════════
#  BADGES
# ══════════════════════════════════════════════════════════════════════


@router.get("/badges")
def list_badges(db: Session = Depends(get_db)):
    """All available badges."""
    badges = db.query(Badge).order_by(Badge.category, Badge.threshold).all()
    return {
        "total": len(badges),
        "items": [
            {
                "id": b.id,
                "slug": b.slug,
                "name": b.name,
                "description": b.description,
                "icon": b.icon,
                "category": b.category,
                "threshold": b.threshold,
                "level": b.level,
            }
            for b in badges
        ],
    }


@router.get("/badges/mine")
def my_badges(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Badges earned by the current user."""
    earned = db.query(UserBadge).filter(UserBadge.user_id == user.id).all()
    return {
        "total": len(earned),
        "items": [
            {
                "badge_slug": ub.badge.slug,
                "badge_name": ub.badge.name,
                "badge_icon": ub.badge.icon,
                "badge_category": ub.badge.category,
                "earned_at": ub.earned_at.isoformat() if ub.earned_at else None,
                "progress_count": ub.progress_count,
            }
            for ub in earned
        ],
    }


# ══════════════════════════════════════════════════════════════════════
#  CITIZEN VERIFICATION
# ══════════════════════════════════════════════════════════════════════


@router.get("/verification")
def get_verification_status(user: User = Depends(get_current_user)):
    """Current verification level for the authenticated user."""
    return {
        "level": user.verification_level or 0,
        "level_label": ["unverified", "residence_verified", "document_verified"][min(user.verification_level or 0, 2)],
        "verified_zip": user.verified_zip,
        "verified_state": user.verified_state,
        "verified_at": user.verified_at.isoformat() if user.verified_at else None,
        "method": user.verification_method,
    }


@router.post("/verify/residence")
@limiter.limit("5/minute")
def verify_residence(
    body: VerifyResidenceRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify residence via zip code. Sets verification_level=1.

    In production this would trigger an SMS or letter verification.
    For now, we accept the zip code and look up the state.
    """
    from routers.politics_people import _zip_to_state

    cleaned = body.zip_code.strip().replace("-", "")[:5]
    if not cleaned.isdigit() or len(cleaned) != 5:
        raise HTTPException(status_code=400, detail="Invalid zip code")

    state = _zip_to_state(cleaned)
    if not state:
        raise HTTPException(status_code=400, detail="Could not resolve zip code to state")

    user.verification_level = max(user.verification_level or 0, 1)
    user.verified_zip = cleaned
    user.verified_state = state
    user.verified_at = datetime.now(timezone.utc)
    user.verification_method = "zip_lookup"
    db.commit()

    _check_badge_progress(db, user.id, "verify")

    return {
        "level": 1,
        "state": state,
        "zip": cleaned,
        "message": f"Residence verified: {state}. You can now see district-specific content.",
    }


# ══════════════════════════════════════════════════════════════════════
#  LEADERBOARD (Scored Rankings)
# ══════════════════════════════════════════════════════════════════════


@router.get("/leaderboard")
def leaderboard(
    content_type: str = Query("promise", description="promise or proposal"),
    sort: str = Query("hot", description="hot, confidence, newest"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Ranked content using Wilson confidence or hot score."""
    if content_type == "promise":
        model = Promise
    elif content_type == "proposal":
        model = Proposal
    else:
        raise HTTPException(status_code=400, detail="content_type must be promise or proposal")

    q = db.query(model)
    if content_type == "proposal":
        q = q.filter(Proposal.status != "draft")

    if sort == "hot":
        q = q.order_by(desc(model.hot_score))
    elif sort == "confidence":
        q = q.order_by(desc(model.confidence_score))
    else:
        q = q.order_by(desc(model.created_at))

    items = q.limit(limit).all()

    results = []
    for item in items:
        entry = {
            "id": item.id,
            "title": item.title,
            "confidence_score": item.confidence_score,
            "hot_score": item.hot_score,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        if content_type == "promise":
            entry["person_id"] = item.person_id
            entry["person_name"] = item.person_name
            entry["status"] = item.status
            entry["progress"] = item.progress
        else:
            entry["upvotes"] = item.upvotes
            entry["downvotes"] = item.downvotes
            entry["status"] = item.status
        results.append(entry)

    return {"content_type": content_type, "sort": sort, "items": results}


# ---------------------------------------------------------------------------
# Phase 3 Thread C — local civic graph
# ---------------------------------------------------------------------------
# /civic/state/{state} returns a single combined payload powering the
# per-state landing page on the core site. Aggregates:
#   - Active state legislators (cap at 12 for the rail)
#   - Recent state bills (currently empty until the OpenStates bill
#     sync runs; endpoint is shape-correct so the UI ships now)
#   - Federal reps for the same state from TrackedMember (so the
#     page bridges federal + state in one place)
#   - User-engagement signals if any are present (story counts
#     scoped to the state via entity_ids match)

@router.get("/state/{state}")
def civic_state_landing(
    state: str,
    db: Session = Depends(get_db),
):
    """Combined per-state landing payload (federal + state)."""
    from models.state_models import StateLegislator, StateBill
    from models.database import TrackedMember

    code = (state or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        raise HTTPException(
            status_code=422,
            detail="state must be a 2-letter postal code (e.g. 'NY').",
        )

    try:
        legislators = (
            db.query(StateLegislator)
            .filter(StateLegislator.state == code)
            .filter(StateLegislator.is_active == True)  # noqa: E712
            .order_by(StateLegislator.chamber.desc(), StateLegislator.name.asc())
            .limit(12)
            .all()
        )
        legislator_total = (
            db.query(StateLegislator)
            .filter(StateLegislator.state == code)
            .filter(StateLegislator.is_active == True)  # noqa: E712
            .count()
        )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "state legislators lookup failed for %s: %s", code, exc,
        )
        legislators = []
        legislator_total = 0

    try:
        bills = (
            db.query(StateBill)
            .filter(StateBill.state == code)
            .order_by(desc(StateBill.latest_action_date))
            .limit(10)
            .all()
        )
        bill_total = (
            db.query(StateBill).filter(StateBill.state == code).count()
        )
    except Exception:
        bills = []
        bill_total = 0

    try:
        federal = (
            db.query(TrackedMember)
            .filter(TrackedMember.state == code)
            .filter(TrackedMember.is_active == 1)
            .order_by(TrackedMember.chamber.desc(), TrackedMember.display_name.asc())
            .all()
        )
    except Exception:
        federal = []

    return {
        "state": code,
        "federal_reps": [
            {
                "person_id": r.person_id,
                "display_name": r.display_name,
                "chamber": r.chamber,
                "party": r.party,
                "state": r.state,
                "photo_url": r.photo_url,
            }
            for r in federal
        ],
        "state_legislators": {
            "total": legislator_total,
            "items": [
                {
                    "ocd_id": leg.ocd_id,
                    "name": leg.name,
                    "chamber": leg.chamber,
                    "party": leg.party,
                    "district": leg.district,
                    "photo_url": leg.photo_url,
                }
                for leg in legislators
            ],
        },
        "state_bills": {
            "total": bill_total,
            "items": [
                {
                    "bill_id": b.bill_id,
                    "identifier": b.identifier,
                    "title": b.title,
                    "session": b.legislative_session,
                    "latest_action": b.latest_action,
                    "latest_action_date": (
                        str(b.latest_action_date) if b.latest_action_date else None
                    ),
                    "sponsor_name": b.sponsor_name,
                    "source_url": b.source_url,
                }
                for b in bills
            ],
        },
    }


# ── /civic/state/{state}/bill/{bill_id} ──────────────────────────────
# Single state bill detail. Returns title, sponsor, latest action,
# subjects, sector tag (derived from subjects). Powers a future
# /civic/state/MI/bill/<id> page or alert deep-link.

# Map OpenStates `subject` strings (free-text but loosely standardized)
# to the platform's canonical sector slugs. Rough tagging — a single
# bill can match multiple sectors; we return the first hit.
_SUBJECT_TO_SECTOR = {
    "agriculture":      "agriculture",
    "agricultural":     "agriculture",
    "food":             "agriculture",
    "banking":          "finance",
    "banks":            "finance",
    "financial":        "finance",
    "insurance":        "finance",
    "credit":           "finance",
    "investment":       "finance",
    "health":           "health",
    "medical":          "health",
    "medicare":         "health",
    "medicaid":         "health",
    "hospital":         "health",
    "drug":             "health",
    "housing":          "housing",
    "rent":             "housing",
    "mortgage":         "housing",
    "real estate":      "housing",
    "property":         "housing",
    "energy":           "energy",
    "utility":          "energy",
    "electric":         "energy",
    "oil":              "energy",
    "gas":              "energy",
    "renewable":        "energy",
    "transportation":   "transportation",
    "highway":          "transportation",
    "road":             "transportation",
    "transit":          "transportation",
    "vehicle":          "transportation",
    "technology":       "technology",
    "internet":         "technology",
    "broadband":        "technology",
    "data":             "technology",
    "privacy":          "technology",
    "telecom":          "telecom",
    "telecommunications":"telecom",
    "education":        "education",
    "school":           "education",
    "teacher":          "education",
    "student":          "education",
    "chemical":         "chemicals",
    "environmental":    "chemicals",
    "pollution":        "chemicals",
    "defense":          "defense",
    "military":         "defense",
    "veteran":          "defense",
    "weapon":           "defense",
}


def _sector_for_state_bill(subjects_json: Optional[str]) -> Optional[str]:
    """Return a canonical sector slug derived from the bill's
    subjects. None if no rule matches."""
    if not subjects_json:
        return None
    try:
        subjects = json.loads(subjects_json)
        if not isinstance(subjects, list):
            return None
    except (ValueError, TypeError):
        return None
    for s in subjects:
        s_lower = (s or "").lower()
        for keyword, sector in _SUBJECT_TO_SECTOR.items():
            if keyword in s_lower:
                return sector
    return None


@router.get("/state/{state}/bill/{bill_id}")
def civic_state_bill_detail(
    state: str,
    bill_id: str,
    db: Session = Depends(get_db),
):
    """Single state-bill detail with sector tag inferred from
    OpenStates subjects."""
    from models.state_models import StateBill

    code = (state or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        raise HTTPException(status_code=422, detail="state must be 2-letter")

    bill = (
        db.query(StateBill)
        .filter(StateBill.state == code)
        .filter(StateBill.bill_id == bill_id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="State bill not found")

    sector = _sector_for_state_bill(bill.subjects)
    subjects: list = []
    if bill.subjects:
        try:
            parsed = json.loads(bill.subjects)
            if isinstance(parsed, list):
                subjects = parsed
        except (ValueError, TypeError):
            subjects = []

    return {
        "bill_id": bill.bill_id,
        "state": bill.state,
        "session": bill.legislative_session,
        "identifier": bill.identifier,
        "title": bill.title,
        "subjects": subjects,
        "inferred_sector": sector,
        "sponsor_name": bill.sponsor_name,
        "latest_action": bill.latest_action,
        "latest_action_date": (
            str(bill.latest_action_date) if bill.latest_action_date else None
        ),
        "source_url": bill.source_url,
    }
