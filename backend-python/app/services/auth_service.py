"""
STAP Phase 5 — Authentication Service

JWT-based authentication with:
- Registration (email + password)
- Login (email + password → access_token + refresh_token)
- Token refresh
- Password hashing (bcrypt)
- Subscription tier enforcement
"""

from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.domain import User
from app.utils.logger import logger


# ─── Password Hashing ─────────────────────────────────────────────────────────

import bcrypt

def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        plain_bytes = plain.encode('utf-8')
        hashed_bytes = hashed.encode('utf-8')
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


# ─── JWT Token Management ─────────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=24))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─── User CRUD ────────────────────────────────────────────────────────────────

async def get_user_by_email(email: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()

async def get_user_by_id(user_id: int, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()

async def create_user(
    email: str,
    password: str,
    name: str,
    db: AsyncSession,
) -> User:
    """Create a new user with hashed password."""
    # Check if email exists
    existing = await get_user_by_email(email, db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        name=name.strip(),
        subscription_tier="free",
        api_key=secrets.token_urlsafe(32),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info(f"New user registered: {email}")
    return user


async def create_social_user(
    email: str,
    name: str,
    db: AsyncSession,
) -> User:
    """Create a new user registered via social login (Google OAuth2)."""
    # Check if email exists
    existing = await get_user_by_email(email, db)
    if existing:
        return existing

    # Generate a random password since login is via OAuth
    random_password = secrets.token_urlsafe(32)

    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(random_password),
        name=name.strip(),
        subscription_tier="free",
        api_key=secrets.token_urlsafe(32),
        is_verified=True,  # Social logins are pre-verified by the provider
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info(f"New social user registered: {email}")
    return user


async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[User]:
    """Verify email + password, return user or None."""
    user = await get_user_by_email(email.lower().strip(), db)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ─── Dependency: Get Current User ─────────────────────────────────────────────

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    FastAPI dependency — extracts user from JWT.
    Returns None if no token (for public endpoints).
    Raises 401 if token is invalid/expired.
    """
    if token is None:
        return None

    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await get_user_by_id(int(user_id), db)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return user


async def require_user(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Dependency that REQUIRES authentication (raises 401 if not logged in)."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_pro(
    user: User = Depends(require_user),
) -> User:
    """Dependency that requires Pro subscription or higher."""
    allowed_tiers = {"pro", "pro_annual", "enterprise"}
    if user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Pro subscription required. Current tier: {user.subscription_tier}"
        )
    return user


# ─── Subscription Tier Limits ─────────────────────────────────────────────────

TIER_LIMITS = {
    "free": {
        "max_symbols": 3,
        "max_alert_rules": 1,
        "sentiment_access": False,
        "websocket_access": False,
        "api_access": False,
    },
    "pro": {
        "max_symbols": 999,
        "max_alert_rules": 50,
        "sentiment_access": True,
        "websocket_access": True,
        "api_access": False,
    },
    "pro_annual": {
        "max_symbols": 999,
        "max_alert_rules": 50,
        "sentiment_access": True,
        "websocket_access": True,
        "api_access": False,
    },
    "enterprise": {
        "max_symbols": 999,
        "max_alert_rules": 999,
        "sentiment_access": True,
        "websocket_access": True,
        "api_access": True,
    },
}

def get_tier_limits(tier: str) -> dict:
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])
