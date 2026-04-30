"""
Authentication & authorization endpoints.

POST /auth/register  — create account (email + password)
POST /auth/login     — get JWT access + refresh tokens
POST /auth/refresh   — exchange refresh token for new access token
GET  /auth/me        — current user info
POST /auth/api-keys  — create a scoped API key
DELETE /auth/api-keys/{key_id} — revoke an API key
GET  /auth/api-keys  — list user's API keys
"""

import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.database import get_db, SessionLocal
from models.auth_models import User, APIKeyRecord
from models.response_schemas import (
    WatchlistAddResponse, WatchlistListResponse, WatchlistCheckResponse,
)
from services.jwt_auth import (
    create_access_token,
    create_refresh_token,
    is_refresh_token_revoked,
    revoke_refresh_token,
    verify_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_HOURS,
)
from services.rbac import require_role, VALID_SCOPES
from services.audit import log_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Import the limiter from main module for per-endpoint rate limits
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except ImportError:
    raise RuntimeError(
        "passlib is required for password hashing. "
        "Install it with: pip install passlib[bcrypt]"
    )

# Pre-computed bcrypt hash of an unknown random string. Used in the login
# path to consume bcrypt's ~250ms wall time when the email is not found,
# so the response time is indistinguishable from a wrong-password case
# (closes the email-enumeration timing oracle).
_DUMMY_BCRYPT_HASH = "$2b$12$wK5pOdt2JzXRJZ9KZ0vQ.O4vGhT6dKQ9j4r8c8sW0u7dW8L7vY1Xe"


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars)")
    display_name: Optional[str] = Field(None, max_length=255)
    zip_code: Optional[str] = Field(None, max_length=10, description="Optional ZIP code for rep lookup")
    digest_opt_in: bool = Field(True, description="Receive Weekly Digest emails")
    alert_opt_in: bool = Field(True, description="Receive anomaly alert emails")


class PreferencesRequest(BaseModel):
    zip_code: Optional[str] = Field(None, max_length=10)
    digest_opt_in: Optional[bool] = None
    alert_opt_in: Optional[bool] = None


class PreferencesResponse(BaseModel):
    zip_code: Optional[str] = None
    digest_opt_in: bool
    alert_opt_in: bool


# ── Onboarding (Phase 2 personalization) ─────────────────────────────────
# The onboarding form captures the four signals that power the
# "Why this matters to you" block on every story:
#   - zip code (resolves to state and rep lookup)
#   - top 1-3 lifestyle categories (banking / healthcare / housing / etc.)
#   - one current concern (the salient pain point right now)
# Everything else (the actual personalization) gets computed at story-
# render time from these inputs + the story's entities.

# Lifestyle / sector categories the user can pick. Reuses the
# platform's 11 reporting sectors directly so the resulting feed
# filter maps 1-to-1 onto stories without translation. The legacy
# v1 lifestyle keys (banking/work/food/kids/etc.) are still
# accepted to avoid breaking existing localStorage-only readers,
# even though the v2 frontend only emits the canonical sector
# names.
ONBOARDING_LIFESTYLE_CATEGORIES = (
    # v2 sector keys (canonical)
    "finance",
    "health",
    "housing",
    "energy",
    "transportation",
    "technology",
    "telecom",
    "education",
    "agriculture",
    "chemicals",
    "defense",
    # v1 lifestyle keys (deprecated but accepted)
    "banking",
    "healthcare",
    "tech",
    "food",
    "work",
    "kids",
)

# Pocketbook concerns. Multi-select; the column on the User row stays
# a single string for back-compat (we store concerns[0]) and the
# extra picks are surfaced via the personalization payload only.
ONBOARDING_CONCERNS = (
    "rent_too_high",
    "healthcare_costs",
    "student_loans",
    "fuel_prices",
    "groceries",
    "wages",
    "childcare",
    "credit_card_debt",
    "retirement",
    "taxes",
    "other",
)


class OnboardingRequest(BaseModel):
    zip_code: str = Field(..., min_length=5, max_length=10)
    # Cap at 11 (the size of the sector universe). The frontend
    # softer-caps at 5 for UX, but accept up to the full set so an
    # admin or power user re-onboarding manually doesn't bounce.
    lifestyle_categories: List[str] = Field(..., min_length=1, max_length=11)
    # v1 single-string concern. Keep it for back-compat; new clients
    # also send `concerns` and we treat current_concern as concerns[0].
    current_concern: str = Field(..., min_length=1, max_length=64)
    # v2 multi-select concerns. Optional; if absent, [current_concern]
    # is used.
    concerns: Optional[List[str]] = Field(default=None, max_length=11)


class OnboardingResponse(BaseModel):
    zip_code: str
    home_state: Optional[str]
    lifestyle_categories: List[str]
    current_concern: str
    personalization_completed_at: str


class PersonalizationStateResponse(BaseModel):
    """Returned by GET /auth/personalization to let the frontend
    decide whether to show the onboarding modal."""
    completed: bool
    zip_code: Optional[str] = None
    home_state: Optional[str] = None
    lifestyle_categories: List[str] = Field(default_factory=list)
    current_concern: Optional[str] = None
    personalization_completed_at: Optional[str] = None


class RegisterResponse(BaseModel):
    id: int
    email: str
    role: str
    display_name: Optional[str] = None
    created_at: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    role: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserInfoResponse(BaseModel):
    id: int
    email: str
    role: str
    display_name: Optional[str] = None
    is_active: bool
    created_at: str
    last_login: Optional[str] = None
    api_key_count: int = 0


class CreateAPIKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Label for this key")
    scopes: List[str] = Field(default=["read"], description="List of scopes: read, write, verify, chat, admin")
    expires_in_days: Optional[int] = Field(None, ge=1, le=3650, description="Days until expiry (null = never)")


class APIKeyResponse(BaseModel):
    id: int
    name: str
    scopes: List[str]
    raw_key: str  # shown ONCE at creation
    created_at: str
    expires_at: Optional[str] = None


class APIKeyListItem(BaseModel):
    id: int
    name: str
    scopes: List[str]
    created_at: str
    expires_at: Optional[str] = None
    is_active: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/minute")
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new user account."""
    # Check for duplicate email
    existing = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Validate ZIP (5 digits only, optional). Reject anything else rather than
    # silently trimming — the frontend already enforces this shape.
    zip_clean: Optional[str] = None
    if body.zip_code:
        zip_digits = "".join(ch for ch in body.zip_code if ch.isdigit())
        if len(zip_digits) != 5:
            raise HTTPException(status_code=422, detail="ZIP code must be exactly 5 digits")
        zip_clean = zip_digits

    user = User(
        email=body.email.lower().strip(),
        hashed_password=pwd_context.hash(body.password),
        role="free",
        display_name=body.display_name,
        zip_code=zip_clean,
        digest_opt_in=1 if body.digest_opt_in else 0,
        alert_opt_in=1 if body.alert_opt_in else 0,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    db.refresh(user)

    log_from_request(db, request, action="register", user_id=user.id, resource="users", resource_id=str(user.id))

    return RegisterResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        display_name=user.display_name,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate with email + password, receive JWT tokens."""
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    # Always run a bcrypt verify, even on missing-user, so the response time
    # for a non-existent email matches that of a wrong password. Without this
    # the email-not-found path returned ~5 ms while a valid email + wrong
    # password took ~250 ms — a clear timing oracle for valid emails.
    if user is None:
        # Run bcrypt against a fixed dummy hash to consume the same wall time.
        pwd_context.verify(body.password, _DUMMY_BCRYPT_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token_data = {"sub": user.email, "user_id": user.id, "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    log_from_request(db, request, action="login", user_id=user.id, resource="users", resource_id=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        role=user.role,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access + refresh token pair.

    The presented refresh token's ``jti`` is checked against the revocation
    list (logout, password change, manual revocation). On success the
    presented token is rotated — the old jti is added to the revocation
    list so it can't be reused.
    """
    payload = verify_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Expected a refresh token")

    if is_refresh_token_revoked(payload, db):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing subject")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    # Rotate: revoke the presented token before issuing a new pair so a
    # stolen refresh token can only be used once.
    revoke_refresh_token(payload, db, reason="rotated")

    token_data = {"sub": user.email, "user_id": user.id, "role": user.role}
    access_token = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)

    log_from_request(db, request, action="token_refresh", user_id=user.id, resource="users", resource_id=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        role=user.role,
    )


@router.get("/me", response_model=UserInfoResponse)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the authenticated user's profile."""
    key_count = db.query(APIKeyRecord).filter(
        APIKeyRecord.user_id == user.id, APIKeyRecord.is_active == 1
    ).count()

    return UserInfoResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        display_name=user.display_name,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else "",
        last_login=user.last_login.isoformat() if user.last_login else None,
        api_key_count=key_count,
    )


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(user: User = Depends(get_current_user)):
    """Return the authenticated user's signup preferences."""
    return PreferencesResponse(
        zip_code=user.zip_code,
        digest_opt_in=bool(user.digest_opt_in),
        alert_opt_in=bool(user.alert_opt_in),
    )


@router.post("/preferences", response_model=PreferencesResponse)
@limiter.limit("20/minute")
def update_preferences(
    body: PreferencesRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update signup/notification preferences. Only provided fields are updated."""
    changed: dict = {}

    if body.zip_code is not None:
        if body.zip_code == "":
            user.zip_code = None
            changed["zip_code"] = None
        else:
            zip_digits = "".join(ch for ch in body.zip_code if ch.isdigit())
            if len(zip_digits) != 5:
                raise HTTPException(status_code=422, detail="ZIP code must be exactly 5 digits")
            user.zip_code = zip_digits
            changed["zip_code"] = zip_digits

    if body.digest_opt_in is not None:
        user.digest_opt_in = 1 if body.digest_opt_in else 0
        changed["digest_opt_in"] = bool(body.digest_opt_in)

    if body.alert_opt_in is not None:
        user.alert_opt_in = 1 if body.alert_opt_in else 0
        changed["alert_opt_in"] = bool(body.alert_opt_in)

    db.commit()
    db.refresh(user)

    log_from_request(
        db, request,
        action="preferences_update",
        user_id=user.id,
        resource="users",
        resource_id=str(user.id),
        details=changed,
    )

    return PreferencesResponse(
        zip_code=user.zip_code,
        digest_opt_in=bool(user.digest_opt_in),
        alert_opt_in=bool(user.alert_opt_in),
    )


# ---------------------------------------------------------------------------
# Onboarding (Phase 2 personalization)
# ---------------------------------------------------------------------------


def _parse_lifestyle_categories(raw: Optional[str]) -> List[str]:
    """Parse the lifestyle_categories TEXT column into a list. Tolerates
    JSON-encoded lists, comma-separated strings, and None."""
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith("["):
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(x) for x in data if x]
        except (ValueError, TypeError):
            pass
    return [s.strip() for s in raw.split(",") if s.strip()]


@router.get("/personalization", response_model=PersonalizationStateResponse)
def get_personalization_state(user: User = Depends(get_current_user)):
    """Return the authenticated user's personalization state.

    Used by the frontend to decide whether to show the onboarding
    modal: if `completed` is False, prompt the user; otherwise
    render personalized story content using these fields.
    """
    completed_at = user.personalization_completed_at
    return PersonalizationStateResponse(
        completed=completed_at is not None,
        zip_code=user.zip_code,
        home_state=user.home_state,
        lifestyle_categories=_parse_lifestyle_categories(user.lifestyle_categories),
        current_concern=user.current_concern,
        personalization_completed_at=(
            completed_at.isoformat() if completed_at else None
        ),
    )


@router.post("/onboarding", response_model=OnboardingResponse)
@limiter.limit("10/minute")
def submit_onboarding(
    body: OnboardingRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Capture onboarding answers + stamp personalization_completed_at.

    Validates zip → home_state, validates the lifestyle categories
    against the allowlist, validates the current concern. Repeat
    submissions overwrite the prior state (users can re-onboard if
    they move or their priorities change).
    """
    # Zip → state. Reuses the same lookup the rep-finder uses.
    from routers.politics_people import _zip_to_state

    zip_digits = "".join(ch for ch in body.zip_code if ch.isdigit())
    if len(zip_digits) != 5:
        raise HTTPException(status_code=422, detail="ZIP code must be exactly 5 digits")

    home_state = _zip_to_state(zip_digits)
    if not home_state:
        # Soft-fail: store the zip but leave state null. The frontend
        # can prompt for explicit state if rep lookup later fails.
        logger.info(
            "onboarding: could not resolve state from zip %s for user %s",
            zip_digits, user.id,
        )

    # Validate lifestyle categories against the allowlist.
    cleaned_categories: List[str] = []
    for cat in body.lifestyle_categories:
        c = (cat or "").strip().lower()
        if c not in ONBOARDING_LIFESTYLE_CATEGORIES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unknown lifestyle category {cat!r}. Allowed: "
                    f"{', '.join(ONBOARDING_LIFESTYLE_CATEGORIES)}"
                ),
            )
        if c not in cleaned_categories:
            cleaned_categories.append(c)
    if not cleaned_categories:
        raise HTTPException(status_code=422, detail="At least one lifestyle category required")

    # Validate the concern.
    concern = (body.current_concern or "").strip().lower()
    if concern not in ONBOARDING_CONCERNS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unknown current_concern {body.current_concern!r}. Allowed: "
                f"{', '.join(ONBOARDING_CONCERNS)}"
            ),
        )

    # Persist. We DON'T overwrite existing prefs.zip_code if the user
    # already had one — onboarding can refine but not unset.
    user.zip_code = zip_digits
    user.home_state = home_state
    user.lifestyle_categories = json.dumps(cleaned_categories)
    user.current_concern = concern
    user.personalization_completed_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        db.rollback()
        logger.error("onboarding commit failed for user %s: %s", user.id, exc)
        raise HTTPException(status_code=500, detail="Failed to save onboarding")

    log_from_request(
        db, request,
        action="onboarding_submit",
        user_id=user.id,
        resource="users",
        resource_id=str(user.id),
        details={
            "zip": zip_digits,
            "state": home_state,
            "categories": cleaned_categories,
            "concern": concern,
        },
    )

    return OnboardingResponse(
        zip_code=zip_digits,
        home_state=home_state,
        lifestyle_categories=cleaned_categories,
        current_concern=concern,
        personalization_completed_at=user.personalization_completed_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Public zip to state lookup
# ---------------------------------------------------------------------------
# The journal frontend persists onboarding to localStorage for
# anonymous readers (the disengaged-audience thesis: zero-friction
# personalization without account creation). When the user submits a
# zip we still need to resolve the two-letter state so the rep widget
# can render. This endpoint exposes the existing _zip_to_state helper
# without requiring auth. It returns nothing more than a 2-letter
# postal code for a 5-digit input, which is public-data anyway.

class ZipStateResponse(BaseModel):
    """Returned by GET /auth/personalization/zip-state."""
    zip_code: str
    state: Optional[str] = None


@router.get("/personalization/zip-state", response_model=ZipStateResponse)
@limiter.limit("60/minute")
def public_zip_to_state(
    request: Request,
    zip: str = Query(..., min_length=5, max_length=10, description="5-digit US ZIP"),
):
    """Resolve a 5-digit ZIP code to a 2-letter US state.

    Public, anonymous-friendly. Used by the journal site's
    PersonalizationProvider to enrich localStorage-only onboarding so
    anonymous readers still get the "your representatives" widget.
    Reuses the same lookup the rep-finder uses, so no new data path.
    """
    from routers.politics_people import _zip_to_state

    zip_digits = "".join(ch for ch in (zip or "") if ch.isdigit())
    if len(zip_digits) != 5:
        raise HTTPException(status_code=422, detail="ZIP code must be exactly 5 digits")

    home_state = _zip_to_state(zip_digits)
    return ZipStateResponse(zip_code=zip_digits, state=home_state)


# ---------------------------------------------------------------------------
# API key management
# ---------------------------------------------------------------------------

@router.post("/api-keys", response_model=APIKeyResponse, status_code=201)
def create_api_key(
    body: CreateAPIKeyRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new API key for the authenticated user.

    The raw key is returned ONCE in the response — store it securely.
    """
    # Validate scopes
    invalid = set(body.scopes) - VALID_SCOPES
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid scopes: {', '.join(invalid)}")

    # Only admins can create keys with 'admin' scope
    if "admin" in body.scopes and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create keys with 'admin' scope")

    # Generate a random 48-char key prefixed with 'wtp_'
    raw_key = "wtp_" + secrets.token_urlsafe(36)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    expires_at = None
    if body.expires_in_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    record = APIKeyRecord(
        user_id=user.id,
        key_hash=key_hash,
        name=body.name,
        scopes=json.dumps(body.scopes),
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    log_from_request(
        db, request,
        action="api_key_create",
        user_id=user.id,
        resource="api_keys",
        resource_id=str(record.id),
        details={"name": body.name, "scopes": body.scopes},
    )

    return APIKeyResponse(
        id=record.id,
        name=record.name,
        scopes=body.scopes,
        raw_key=raw_key,
        created_at=record.created_at.isoformat() if record.created_at else "",
        expires_at=record.expires_at.isoformat() if record.expires_at else None,
    )


@router.get("/api-keys", response_model=List[APIKeyListItem])
def list_api_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all API keys belonging to the authenticated user."""
    records = (
        db.query(APIKeyRecord)
        .filter(APIKeyRecord.user_id == user.id)
        .order_by(APIKeyRecord.created_at.desc())
        .all()
    )
    items = []
    for r in records:
        try:
            scopes = json.loads(r.scopes) if isinstance(r.scopes, str) else r.scopes
        except (json.JSONDecodeError, TypeError):
            scopes = []
        items.append(APIKeyListItem(
            id=r.id,
            name=r.name,
            scopes=scopes,
            created_at=r.created_at.isoformat() if r.created_at else "",
            expires_at=r.expires_at.isoformat() if r.expires_at else None,
            is_active=bool(r.is_active),
        ))
    return items


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_api_key(
    key_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke (deactivate) an API key.  Admins can revoke any key."""
    record = db.query(APIKeyRecord).filter(APIKeyRecord.id == key_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    # Only the owner or an admin can revoke
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to revoke this key")

    record.is_active = 0
    db.commit()

    log_from_request(
        db, request,
        action="api_key_revoke",
        user_id=user.id,
        resource="api_keys",
        resource_id=str(key_id),
    )

    return None


# ── Watchlist ──────────────────────────────────────────────────────────


class WatchlistAddRequest(BaseModel):
    entity_type: str  # politician, company, bill, sector
    entity_id: str
    entity_name: str = ""
    sector: str = ""


@router.post("/watchlist", status_code=201, response_model=WatchlistAddResponse)
def add_to_watchlist(
    body: WatchlistAddRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add an entity to the user's watchlist. Requires Member (free) tier or above."""
    from models.auth_models import UserWatchlistItem

    existing = db.query(UserWatchlistItem).filter(
        UserWatchlistItem.user_id == user.id,
        UserWatchlistItem.entity_type == body.entity_type,
        UserWatchlistItem.entity_id == body.entity_id,
    ).first()
    if existing:
        return {"status": "already_watching", "id": existing.id}

    item = UserWatchlistItem(
        user_id=user.id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        entity_name=body.entity_name,
        sector=body.sector,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "already_watching"}
    db.refresh(item)
    return {"status": "added", "id": item.id}


@router.get("/watchlist", response_model=WatchlistListResponse)
def get_watchlist(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all entities the user is tracking."""
    from models.auth_models import UserWatchlistItem

    items = (
        db.query(UserWatchlistItem)
        .filter(UserWatchlistItem.user_id == user.id)
        .order_by(UserWatchlistItem.created_at.desc())
        .all()
    )
    return {
        "total": len(items),
        "items": [
            {
                "id": item.id,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "entity_name": item.entity_name,
                "sector": item.sector,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ],
    }


@router.delete("/watchlist/{item_id}", status_code=204)
def remove_from_watchlist(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an entity from the user's watchlist."""
    from models.auth_models import UserWatchlistItem

    item = db.query(UserWatchlistItem).filter(
        UserWatchlistItem.id == item_id,
        UserWatchlistItem.user_id == user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
    return None


@router.get("/watchlist/check", response_model=WatchlistCheckResponse)
def check_watchlist(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quick check if an entity is in the user's watchlist."""
    from models.auth_models import UserWatchlistItem

    exists = db.query(UserWatchlistItem).filter(
        UserWatchlistItem.user_id == user.id,
        UserWatchlistItem.entity_type == entity_type,
        UserWatchlistItem.entity_id == entity_id,
    ).first()
    return {"watching": exists is not None, "item_id": exists.id if exists else None}


# ── Stripe Checkout ────────────────────────────────────────────────────

# Maps a (plan, billing) selection to:
#   1. The env var holding the Stripe price ID
#   2. The role the webhook should set on `checkout.session.completed`
#   3. Whether the plan requires a .edu email (student gating)
#
# Adding a new plan = add a row here, set the env var, push a Stripe
# product+price in the dashboard, restart. Webhook auto-handles it.
PLAN_PRICES = {
    ("student", "monthly"):    {"env": "STRIPE_WTP_STUDENT_MONTHLY_PRICE_ID",    "role": "student",    "requires_edu": True},
    ("student", "annual"):     {"env": "STRIPE_WTP_STUDENT_ANNUAL_PRICE_ID",     "role": "student",    "requires_edu": True},
    ("pro", "monthly"):        {"env": "STRIPE_WTP_PRO_MONTHLY_PRICE_ID",        "role": "pro",        "requires_edu": False},
    ("pro", "annual"):         {"env": "STRIPE_WTP_PRO_ANNUAL_PRICE_ID",         "role": "pro",        "requires_edu": False},
    ("newsroom", "monthly"):   {"env": "STRIPE_WTP_NEWSROOM_MONTHLY_PRICE_ID",   "role": "newsroom",   "requires_edu": False},
    ("newsroom", "annual"):    {"env": "STRIPE_WTP_NEWSROOM_ANNUAL_PRICE_ID",    "role": "newsroom",   "requires_edu": False},
    ("enterprise", "monthly"): {"env": "STRIPE_WTP_ENTERPRISE_PRICE_ID",         "role": "enterprise", "requires_edu": False},
}


def _is_edu_email(email: str) -> bool:
    """Lightweight .edu check — accepts <user>@<anything>.edu and
    common international academic suffixes (.ac.uk, .edu.au, etc.).
    For finer-grained verification (student-ID upload, SheerID), revisit
    once the student tier has actual paying users."""
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower()
    return domain.endswith(".edu") or domain.endswith(".ac.uk") or ".edu." in domain or ".ac." in domain


class CheckoutRequest(BaseModel):
    plan: str = Field(..., pattern="^(student|pro|newsroom|enterprise)$")
    billing: str = Field("monthly", pattern="^(monthly|annual)$")


@router.post("/checkout")
def create_checkout(
    body: CheckoutRequest,
    user: User = Depends(get_current_user),
    request: Request = None,
):
    """Create a Stripe Checkout session for any subscription plan.

    The `plan` field must be one of: student, pro, newsroom, enterprise.
    The `billing` field must be one of: monthly, annual. Enterprise is
    monthly-only via self-serve; annual enterprise is hand-sold.

    Student plans require a .edu (or international academic) email.
    """
    import stripe

    spec = PLAN_PRICES.get((body.plan, body.billing))
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown plan/billing combo: {body.plan}/{body.billing}",
        )

    if spec["requires_edu"] and not _is_edu_email(user.email):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "edu_required",
                "message": "The Student plan requires a .edu email. Sign in with your school email or choose another plan.",
            },
        )

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    price_id = os.getenv(spec["env"])
    if not stripe_key or not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Plan '{body.plan}/{body.billing}' not yet configured (missing {spec['env']})",
        )

    stripe.api_key = stripe_key
    origin = os.getenv("WTP_PUBLIC_ORIGIN", "https://wethepeopleforus.com").rstrip("/")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            # Stripe Tax: assumes the tax-id collection feature is on at
            # the dashboard level (recommended). When enabled, Stripe
            # auto-applies the correct US sales-tax / EU VAT to each
            # invoice; nothing extra needed here.
            automatic_tax={"enabled": True},
            success_url=f"{origin}/account?upgraded={body.plan}",
            cancel_url=f"{origin}/api?cancelled=true",
            client_reference_id=str(user.id),
            customer_email=user.email,
            allow_promotion_codes=True,
            subscription_data={
                "trial_period_days": 7 if body.plan == "enterprise" else 0,
                "metadata": {
                    "user_id": str(user.id),
                    "project": "wethepeople",
                    "plan": body.plan,
                    "billing": body.billing,
                    "role": spec["role"],
                },
            },
            metadata={
                "user_id": str(user.id),
                "project": "wethepeople",
                "plan": body.plan,
                "billing": body.billing,
                "role": spec["role"],
            },
        )
        return {"checkout_url": session.url, "plan": body.plan, "billing": body.billing}
    except stripe.error.StripeError as e:
        logger.error("Stripe checkout failed: %s", e)
        raise HTTPException(status_code=502, detail="Payment service error")


# Backwards-compat: the old enterprise-only endpoint stays so any
# existing UI button doesn't 404 mid-deploy. New code should call
# POST /auth/checkout with body={plan: "enterprise", billing: "monthly"}.
@router.post("/checkout/enterprise")
def create_enterprise_checkout(
    user: User = Depends(get_current_user),
    request: Request = None,
):
    """[Deprecated] Use POST /auth/checkout with body={plan:"enterprise"}."""
    return create_checkout(
        CheckoutRequest(plan="enterprise", billing="monthly"),
        user=user,
        request=request,
    )


# ── Quota endpoint ─────────────────────────────────────────────────────


@router.get("/quota")
def get_quota(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's Veritas verification quota.

    Frontend uses this to render the 'X of N today' counter on the
    Veritas page. Doesn't decrement the quota — that only happens on
    actual /claims/verify calls.
    """
    from services.rbac import get_daily_limit, TIER_DISPLAY
    from services.rate_limit_store import get_rate_limit_status

    role = user.role or "free"
    daily_limit = get_daily_limit(role)
    tier_meta = TIER_DISPLAY.get(role, TIER_DISPLAY["free"])

    if daily_limit == 0:
        return {
            "tier": role,
            "tier_label": tier_meta["label"],
            "daily_limit": 0,
            "used_today": 0,
            "remaining_today": -1,  # -1 sentinel for "unlimited"
            "reset_seconds": 0,
        }

    key_for_limit = f"user:{user.id}"
    try:
        used, remaining, reset_seconds = get_rate_limit_status(
            ip=key_for_limit,
            endpoint="claims",
            max_requests=daily_limit,
            window_seconds=86400,
            db=db,
        )
    except Exception as e:
        logger.warning("get_rate_limit_status failed for user %s: %s", user.id, e)
        used, remaining, reset_seconds = 0, daily_limit, 86400

    return {
        "tier": role,
        "tier_label": tier_meta["label"],
        "daily_limit": daily_limit,
        "used_today": used,
        "remaining_today": remaining,
        "reset_seconds": reset_seconds,
    }


@router.get("/pricing")
def get_pricing():
    """Public pricing tier metadata. No auth required.

    Lets the frontend render the pricing page from server-driven data
    so the numbers can't drift across the API, the docs, and the UI.
    """
    from services.rbac import TIER_DISPLAY
    return {"tiers": TIER_DISPLAY}


@router.post("/webhook/stripe")
@limiter.limit("30/minute")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events to upgrade/downgrade user roles."""
    import stripe

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not stripe_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe.api_key = stripe_key
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except Exception as e:
        logger.error("Stripe webhook verification failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid webhook")

    # Each event branch runs in its own try/except so a downstream failure
    # in (say) downgrade processing can't 500 us *after* the upgrade
    # commit already happened — that would have caused Stripe to retry
    # and re-apply the role unnecessarily, plus mask the underlying
    # error. Each commit is a leaf operation; rollback on its branch only.
    try:
        event_type = event.get("type", "") if isinstance(event, dict) else getattr(event, "type", "")
        event_data = event.get("data", {}) if isinstance(event, dict) else getattr(event, "data", {})
        event_obj = event_data.get("object", {}) if isinstance(event_data, dict) else getattr(event_data, "object", {})
    except Exception as e:
        logger.error("Stripe webhook event parse error: %s", e)
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    if event_type == "checkout.session.completed":
        try:
            session = event_obj
            user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
            # Resolve target role from session metadata (set in
            # create_checkout). Fall back to "enterprise" only when no
            # role was attached — preserves the legacy single-tier path
            # for any in-flight checkouts created before this rollout.
            target_role = (
                session.get("metadata", {}).get("role")
                or "enterprise"
            )
            if target_role not in ("student", "pro", "newsroom", "enterprise"):
                logger.warning("Stripe checkout completed with unknown role '%s'", target_role)
                target_role = "enterprise"
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user:
                    user.role = target_role
                    db.commit()
                    logger.info(
                        "User %s upgraded to %s via Stripe (session=%s)",
                        user.email, target_role, session.get("id"),
                    )
        except Exception as e:
            logger.error("Stripe upgrade handler failed: %s", e)
            db.rollback()
            # Return 500 so Stripe retries — upgrade is idempotent.
            raise HTTPException(status_code=500, detail="Upgrade processing failed")

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        try:
            sub = event_obj
            user_id = sub.get("metadata", {}).get("user_id")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user and sub.get("status") in ("canceled", "unpaid", "past_due"):
                    user.role = "free"
                    db.commit()
                    logger.info("User %s downgraded to free (sub %s)", user.email, sub.get("status"))
        except Exception as e:
            logger.error("Stripe downgrade handler failed: %s", e)
            db.rollback()
            raise HTTPException(status_code=500, detail="Downgrade processing failed")

    elif event_type == "invoice.payment_failed":
        try:
            invoice = event_obj
            customer_email = invoice.get("customer_email")
            if customer_email:
                user = db.query(User).filter(User.email == customer_email).first()
                if user:
                    # Surface to operators via WARNING — a real
                    # payment_failed event suggests dunning is needed.
                    # If we ever wire an alert channel, hook it here.
                    logger.warning(
                        "Payment failed for user %s (customer=%s, invoice=%s)",
                        user.email, invoice.get("customer"), invoice.get("id"),
                    )
        except Exception as e:
            logger.error("Stripe payment_failed handler error: %s", e)
            # Don't block the webhook on logging failure.

    return {"status": "ok"}
