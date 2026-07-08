"""
STAP Phase 5 — Authentication Router

Endpoints:
  POST /auth/register     — Create new account
  POST /auth/login        — Login → access_token + refresh_token
  POST /auth/refresh      — Refresh access token
  GET  /auth/me           — Get current user profile
  PUT  /auth/me           — Update profile
  GET  /auth/subscription — Get current subscription details
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.auth_service import (
    create_user,
    create_social_user,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    require_user,
    get_tier_limits,
)
from app.models.domain import User
from app.utils.logger import logger
from app.core.config import settings

# Google Auth Libraries
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter(prefix="/auth", tags=["Authentication (Phase 5)"])


# ─── Request/Response Schemas ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    name: str = Field(..., min_length=2, max_length=100)

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400  # 24 hours in seconds
    user: dict

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    subscription_tier: str
    is_active: bool
    created_at: str
    api_key: Optional[str] = None

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    telegram_chat_id: Optional[str] = None


# ─── Register ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Create a new account. Returns tokens immediately (auto-login after register).
    Default tier: free (3 symbols, 1 alert rule).
    """
    user = await create_user(
        email=body.email,
        password=body.password,
        name=body.name,
        db=db,
    )

    # Generate tokens
    token_data = {"sub": str(user.id), "email": user.email, "tier": user.subscription_tier}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_dict(user),
    )


@router.post("/signup", response_model=LoginResponse, status_code=201)
async def signup(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Alias for register endpoint.
    """
    return await register(body, db)


# ─── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Login with email + password. Returns access_token (24h) + refresh_token (30d).
    Use `username` field for email (OAuth2 spec requirement).
    """
    user = await authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = {"sub": str(user.id), "email": user.email, "tier": user.subscription_tier}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    logger.info(f"User logged in: {user.email}")

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_dict(user),
    )


# ─── Refresh Token ────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a new access token."""
    payload = decode_token(body.refresh_token)
    
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    user_id = payload.get("sub")
    from app.services.auth_service import get_user_by_id
    user = await get_user_by_id(int(user_id), db)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    token_data = {"sub": str(user.id), "email": user.email, "tier": user.subscription_tier}
    new_access = create_access_token(token_data)

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "expires_in": 86400,
    }


# ─── Get Current User ─────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(user: User = Depends(require_user)):
    """Get current authenticated user profile + subscription details."""
    limits = get_tier_limits(user.subscription_tier)
    return {
        **_user_dict(user, include_api_key=True),
        "limits": limits,
    }


# ─── Update Profile ───────────────────────────────────────────────────────────

@router.put("/me")
async def update_me(
    body: UpdateProfileRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile fields."""
    if body.name is not None:
        user.name = body.name.strip()
    if body.telegram_chat_id is not None:
        user.telegram_chat_id = body.telegram_chat_id.strip()

    await db.commit()
    await db.refresh(user)
    return _user_dict(user)


# ─── Subscription Info ────────────────────────────────────────────────────────

@router.get("/subscription")
async def get_subscription(user: User = Depends(require_user)):
    """Get current subscription tier and limits."""
    limits = get_tier_limits(user.subscription_tier)
    return {
        "tier": user.subscription_tier,
        "limits": limits,
        "upgrade_url": "/billing/checkout" if user.subscription_tier == "free" else None,
    }


class GoogleLoginRequest(BaseModel):
    token: str


@router.post("/google", response_model=LoginResponse)
async def google_login(body: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Login or Sign Up with Google OAuth2.
    Verifies the client-side credential token and returns the TradeIQ JWT tokens.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID is not configured in backend settings"
        )

    try:
        # Verify the ID Token
        id_info = id_token.verify_oauth2_token(
            body.token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )

        # Validate issuer
        if id_info['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')

        email = id_info.get("email")
        name = id_info.get("name", "Google User")

        if not email:
            raise ValueError('Email missing from Google token.')

    except ValueError as e:
        logger.error(f"Google login token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Google ID Token: {str(e)}"
        )

    # Get or create the user
    user = await create_social_user(email=email, name=name, db=db)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled"
        )

    token_data = {"sub": str(user.id), "email": user.email, "tier": user.subscription_tier}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    logger.info(f"User logged in via Google OAuth: {user.email}")

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_dict(user),
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _user_dict(user: User, include_api_key: bool = False) -> dict:
    d = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "subscription_tier": user.subscription_tier,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
    if include_api_key:
        d["api_key"] = user.api_key
    return d
