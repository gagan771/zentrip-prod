from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import RefreshToken, User
from app.schemas import (
    GoogleAuthRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    utcnow,
    verify_password,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])

_google_request = google_requests.Request()


async def _issue_tokens(db: AsyncSession, user: User) -> TokenResponse:
    raw_refresh, refresh_hash, expires_at = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=refresh_hash, expires_at=expires_at))
    await db.commit()
    return TokenResponse(accessToken=create_access_token(user.id), refreshToken=raw_refresh)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    await db.flush()
    return await _issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user is None or user.password_hash is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    return await _issue_tokens(db, user)


@router.post("/google", response_model=TokenResponse)
async def login_with_google(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not settings.google_client_id_list:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in isn't configured yet — set GOOGLE_CLIENT_IDS in the backend .env",
        )

    try:
        claims = google_id_token.verify_oauth2_token(body.idToken, _google_request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google token: {exc}")

    if claims.get("aud") not in settings.google_client_id_list:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token was not issued for this app")

    google_sub = claims["sub"]
    email = claims.get("email")
    name = claims.get("name") or (email.split("@")[0] if email else "Zentrip Traveler")

    user = (await db.execute(select(User).where(User.google_sub == google_sub))).scalar_one_or_none()
    if user is None and email:
        # Same person may have registered with email/password first — link accounts by email
        # instead of creating a duplicate.
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if user is None:
        user = User(email=email, name=name, google_sub=google_sub)
        db.add(user)
        await db.flush()
    elif user.google_sub is None:
        user.google_sub = google_sub

    return await _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    token_hash = hash_refresh_token(body.refreshToken)
    token_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()

    if (
        token_row is None
        or token_row.revoked_at is not None
        or token_row.expires_at < utcnow()
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid or expired")

    # Rotate: revoke the old refresh token and issue a brand new pair.
    token_row.revoked_at = utcnow()
    user = (await db.execute(select(User).where(User.id == token_row.user_id))).scalar_one()
    return await _issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, db: AsyncSession = Depends(get_db)) -> None:
    token_hash = hash_refresh_token(body.refreshToken)
    token_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()
    if token_row is not None:
        token_row.revoked_at = utcnow()
        await db.commit()


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
