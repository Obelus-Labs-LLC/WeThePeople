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

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.orm import Session

from models.database import get_db
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
