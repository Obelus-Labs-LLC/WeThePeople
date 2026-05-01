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

import html as html_lib
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from models.database import get_db
from models.tips_models import Tip
from services.email import send_email
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


# Inbox address for new-tip notifications. Falls back to the
# operator inbox so prod doesn't silently lose tips when
# WTP_TIPS_INBOX is unset. Set to a comma-separated list to
# notify multiple editors.
_TIPS_INBOX_DEFAULT = "wethepeopleforus@gmail.com"


def _build_tip_notification_html(tip: Tip, ops_url: str) -> str:
    """Plain HTML alert to the editorial inbox. Mirrors the rest of
    our outgoing email style — minimal, no tracking pixels, links
    open the moderation queue."""
    subj = html_lib.escape(tip.subject or "(no subject)")
    body = html_lib.escape(tip.body or "")
    contact = (
        html_lib.escape(tip.contact_email or tip.contact_name or "anonymous")
    )
    sector = html_lib.escape(tip.hint_sector or "—")
    entity = html_lib.escape(tip.hint_entity or "—")
    related = html_lib.escape(tip.related_story_slug or "—")
    return f"""
    <!DOCTYPE html>
    <html><body style="background:#f8fafc;margin:0;padding:24px;font-family:'Inter',sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
        <tr><td>
          <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.24em;color:#b45309;text-transform:uppercase;font-weight:700;">New tip</div>
          <h1 style="font-family:Georgia,serif;font-size:20px;line-height:1.3;color:#0f172a;margin:8px 0 12px;">{subj}</h1>
          <div style="font-family:'Inter',sans-serif;font-size:14px;color:#0f172a;line-height:1.55;white-space:pre-wrap;border-left:3px solid #b45309;padding:6px 12px;background:#fef3c7;border-radius:6px;">{body}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;font-size:13px;color:#475569;">
            <tr><td style="padding:4px 0;"><b>From:</b> {contact}</td></tr>
            <tr><td style="padding:4px 0;"><b>Sector hint:</b> {sector}</td></tr>
            <tr><td style="padding:4px 0;"><b>Entity hint:</b> {entity}</td></tr>
            <tr><td style="padding:4px 0;"><b>Related story:</b> {related}</td></tr>
          </table>
          <a href="{ops_url}" style="display:inline-block;margin-top:18px;padding:10px 18px;background:#b45309;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open in queue</a>
        </td></tr>
      </table>
    </body></html>
    """.strip()


def _notify_editors_of_new_tip(tip: Tip) -> None:
    """Fire-and-forget Resend email to the editorial inbox. Best-
    effort: any failure is swallowed so tip submission never fails
    just because email is down."""
    inbox_csv = os.getenv("WTP_TIPS_INBOX", _TIPS_INBOX_DEFAULT)
    recipients = [a.strip() for a in inbox_csv.split(",") if a.strip()]
    if not recipients:
        return
    api_base = os.getenv("WTP_API_BASE", "https://api.wethepeopleforus.com")
    ops_url = f"{api_base}/ops/tips/{tip.id}"
    subject = f"[WTP tip] {(tip.subject or 'Untitled')[:80]}"
    html_body = _build_tip_notification_html(tip, ops_url)
    try:
        send_email(to=recipients, subject=subject, html=html_body)
    except Exception as exc:
        logger.warning("tip notify email failed for tip %d: %s", tip.id, exc)


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
    # Fire-and-forget editor notification. Failure here never breaks
    # submission — the tip is already persisted and visible in
    # /ops/tips even if the email never arrives.
    try:
        _notify_editors_of_new_tip(tip)
    except Exception as exc:
        logger.warning("tip notify dispatch failed for %d: %s", tip.id, exc)
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
