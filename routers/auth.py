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
from sqlalchemy.orm import Session

from models.database import get_db, SessionLocal
from models.auth_models import User, APIKeyRecord
from services.jwt_auth import (
    create_access_token,
    create_refresh_token,
    verify_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_HOURS,
)
from services.rbac import require_role, VALID_SCOPES
from services.audit import log_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except ImportError:
    # Graceful fallback so the app still imports if passlib is not installed yet
    import hashlib as _hl
    logger.warning("passlib not installed — using SHA-256 fallback (NOT safe for production)")

    class _FallbackContext:
        def hash(self, password: str) -> str:
            return _hl.sha256(password.encode()).hexdigest()

        def verify(self, plain: str, hashed: str) -> bool:
            return _hl.sha256(plain.encode()).hexdigest() == hashed

    pwd_context = _FallbackContext()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255, description="User email")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars)")
    display_name: Optional[str] = Field(None, max_length=255)


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
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new user account."""
    # Check for duplicate email
    existing = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email.lower().strip(),
        hashed_password=pwd_context.hash(body.password),
        role="free",
        display_name=body.display_name,
    )
    db.add(user)
    db.commit()
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
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate with email + password, receive JWT tokens."""
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not pwd_context.verify(body.password, user.hashed_password):
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
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    payload = verify_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Expected a refresh token")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing subject")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

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
    if body.expires_in_days:
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


@router.post("/watchlist", status_code=201)
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
    db.commit()
    db.refresh(item)
    return {"status": "added", "id": item.id}


@router.get("/watchlist")
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


@router.get("/watchlist/check")
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


@router.post("/checkout/enterprise")
def create_enterprise_checkout(
    user: User = Depends(get_current_user),
    request: Request = None,
):
    """Create a Stripe Checkout session for Enterprise upgrade."""
    import stripe

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    price_id = os.getenv("STRIPE_WTP_ENTERPRISE_PRICE_ID")

    if not stripe_key or not price_id:
        raise HTTPException(status_code=503, detail="Payment system not configured")

    stripe.api_key = stripe_key

    # Determine base URL for redirects
    origin = "https://wethepeopleforus.com"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{origin}/account?upgraded=true",
            cancel_url=f"{origin}/account?cancelled=true",
            client_reference_id=str(user.id),
            customer_email=user.email,
            subscription_data={
                "trial_period_days": 7,
                "metadata": {"user_id": str(user.id), "project": "wethepeople"},
            },
            metadata={"user_id": str(user.id), "project": "wethepeople"},
        )
        return {"checkout_url": session.url}
    except stripe.error.StripeError as e:
        logger.error("Stripe checkout failed: %s", e)
        raise HTTPException(status_code=502, detail="Payment service error")


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events to upgrade/downgrade user roles."""
    import stripe

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not stripe_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe.api_key = stripe_key
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
        else:
            event = stripe.Event.construct_from(json.loads(payload), stripe_key)
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.error("Stripe webhook verification failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid webhook")

    db = SessionLocal()
    try:
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user:
                    user.role = "enterprise"
                    db.commit()
                    logger.info("User %s upgraded to enterprise via Stripe", user.email)

        elif event["type"] in ("customer.subscription.deleted", "customer.subscription.updated"):
            sub = event["data"]["object"]
            user_id = sub.get("metadata", {}).get("user_id")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user and sub.get("status") in ("canceled", "unpaid", "past_due"):
                    user.role = "free"
                    db.commit()
                    logger.info("User %s downgraded to free (sub %s)", user.email, sub.get("status"))

        elif event["type"] == "invoice.payment_failed":
            invoice = event["data"]["object"]
            customer_email = invoice.get("customer_email")
            if customer_email:
                user = db.query(User).filter(User.email == customer_email).first()
                if user:
                    logger.warning("Payment failed for user %s", user.email)

    finally:
        db.close()

    return {"status": "ok"}
