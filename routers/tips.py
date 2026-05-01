"""Contributor tip endpoints.

Public:
    POST /tips                 - submit a tip (rate-limited)

Admin (requires admin role):
    GET  /tips                 - list tips, filter by status
    GET  /tips/{id}            - read one
    PATCH /tips/{id}           - status / notes update
    DELETE /tips/{id}          - hard delete (rare; usually status=dismissed)

Tips are NOT stories. The triage flow lives next to /ops/story-queue
in the admin UI but the router is here to keep tip lifecycle
self-contained. Submissions are deliberately low-friction:
contact_email is optional (lower the bar for the disengaged
audience), only `subject` and `body` are required.

Anti-abuse: per-IP rate limit on POST and a length cap on body.
The endpoint also stores the submitter IP for triage but never
returns it in any public response.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from models.database import get_db
from models.tips_models import Tip
from services.rbac import require_role
from services.audit import log_from_request

# Same rate-limiter convention as the rest of the routers.
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tips", tags=["tips"])


# ── Schemas ──────────────────────────────────────────────────────────

class TipSubmitRequest(BaseModel):
    subject: str = Field(..., min_length=4, max_length=255)
    body: str = Field(..., min_length=20, max_length=5000)
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = Field(None, max_length=120)
    related_story_slug: Optional[str] = Field(None, max_length=255)
    hint_sector: Optional[str] = Field(None, max_length=64)
    hint_entity: Optional[str] = Field(None, max_length=255)


class TipSubmitResponse(BaseModel):
    id: int
    status: str
    created_at: str


class TipAdminItem(BaseModel):
    id: int
    subject: str
    body: str
    contact_email: Optional[str]
    contact_name: Optional[str]
    related_story_slug: Optional[str]
    hint_sector: Optional[str]
    hint_entity: Optional[str]
    status: str
    admin_notes: Optional[str]
    submitter_ip: Optional[str]
    created_at: str
    triaged_at: Optional[str]
    triaged_by: Optional[str]


class TipListResponse(BaseModel):
    total: int
    tips: List[TipAdminItem]


class TipPatchRequest(BaseModel):
    status: Optional[str] = Field(None, max_length=16)
    admin_notes: Optional[str] = Field(None, max_length=5000)


def _serialize_admin(tip: Tip) -> TipAdminItem:
    return TipAdminItem(
        id=tip.id,
        subject=tip.subject,
        body=tip.body,
        contact_email=tip.contact_email,
        contact_name=tip.contact_name,
        related_story_slug=tip.related_story_slug,
        hint_sector=tip.hint_sector,
        hint_entity=tip.hint_entity,
        status=tip.status,
        admin_notes=tip.admin_notes,
        submitter_ip=tip.submitter_ip,
        created_at=tip.created_at.isoformat() if tip.created_at else "",
        triaged_at=tip.triaged_at.isoformat() if tip.triaged_at else None,
        triaged_by=tip.triaged_by,
    )


# ── Public submission ────────────────────────────────────────────────

@router.post("", response_model=TipSubmitResponse, status_code=201)
@limiter.limit("5/minute")
def submit_tip(
    body: TipSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Anyone can submit a tip. Rate-limited 5/min/IP."""
    ip = get_remote_address(request) if request else None

    tip = Tip(
        subject=body.subject.strip(),
        body=body.body.strip(),
        contact_email=(str(body.contact_email).strip() if body.contact_email else None),
        contact_name=(body.contact_name.strip() if body.contact_name else None),
        related_story_slug=(body.related_story_slug.strip() if body.related_story_slug else None),
        hint_sector=(body.hint_sector.strip().lower() if body.hint_sector else None),
        hint_entity=(body.hint_entity.strip() if body.hint_entity else None),
        submitter_ip=ip,
    )
    db.add(tip)
    try:
        db.commit()
        db.refresh(tip)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist tip from %s: %s", ip, exc)
        raise HTTPException(status_code=500, detail="Failed to save tip")

    log_from_request(
        db, request,
        action="tip_submit",
        resource="tips",
        resource_id=str(tip.id),
        details={"subject": tip.subject, "has_email": bool(tip.contact_email)},
    )
    logger.info("Tip submitted: id=%d subject=%r ip=%s", tip.id, tip.subject, ip)
    return TipSubmitResponse(
        id=tip.id,
        status=tip.status,
        created_at=tip.created_at.isoformat() if tip.created_at else "",
    )


# ── Admin triage ─────────────────────────────────────────────────────

@router.get("", response_model=TipListResponse)
def list_tips(
    request: Request,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """List tips for triage. Admin-only."""
    q = db.query(Tip)
    if status_filter:
        try:
            normalized = Tip.validate_status(status_filter)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        q = q.filter(Tip.status == normalized)
    total = q.count()
    rows = q.order_by(Tip.created_at.desc()).offset(offset).limit(limit).all()
    return TipListResponse(
        total=total,
        tips=[_serialize_admin(t) for t in rows],
    )


@router.get("/{tip_id}", response_model=TipAdminItem)
def get_tip(
    tip_id: int,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    return _serialize_admin(tip)


@router.patch("/{tip_id}", response_model=TipAdminItem)
def patch_tip(
    tip_id: int,
    body: TipPatchRequest,
    request: Request,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin: update status / notes on a tip."""
    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    changed = False
    if body.status is not None:
        try:
            tip.status = Tip.validate_status(body.status)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        changed = True
    if body.admin_notes is not None:
        tip.admin_notes = body.admin_notes
        changed = True

    if changed:
        tip.triaged_at = datetime.now(timezone.utc)
        tip.triaged_by = getattr(user, "email", None) or "admin"
        try:
            db.commit()
            db.refresh(tip)
        except Exception as exc:
            db.rollback()
            logger.error("tip patch failed for id=%d: %s", tip_id, exc)
            raise HTTPException(status_code=500, detail="Failed to update tip")
        log_from_request(
            db, request,
            action="tip_patch",
            resource="tips",
            resource_id=str(tip.id),
            user_id=getattr(user, "id", None),
            details={"status": tip.status, "notes_set": body.admin_notes is not None},
        )
    return _serialize_admin(tip)


@router.delete("/{tip_id}", status_code=204)
def delete_tip(
    tip_id: int,
    request: Request,
    user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin: hard-delete a tip. Use sparingly; prefer status=dismissed."""
    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    db.delete(tip)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("tip delete failed for id=%d: %s", tip_id, exc)
        raise HTTPException(status_code=500, detail="Failed to delete tip")
    log_from_request(
        db, request,
        action="tip_delete",
        resource="tips",
        resource_id=str(tip_id),
        user_id=getattr(user, "id", None),
    )
    return  # 204 No Content
