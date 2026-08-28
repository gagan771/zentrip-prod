import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import GrocerySession, User
from app.schemas import GrocerySessionCreate, GrocerySessionOut

router = APIRouter(prefix="/v1/grocery", tags=["grocery"])
_PROVIDERS = {"blinkit", "flipkart", "zepto", "swiggy-instamart"}


def _session_out(session: GrocerySession) -> GrocerySessionOut:
    return GrocerySessionOut(id=session.id, provider=session.provider, items=session.items, createdAt=session.created_at)


@router.post("/{provider}/sessions", response_model=GrocerySessionOut, status_code=status.HTTP_201_CREATED)
async def save_session(
    provider: str,
    body: GrocerySessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrocerySessionOut:
    provider = provider.casefold()
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unsupported grocery provider")
    session = GrocerySession(user_id=user.id, provider=provider, items=body.items)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_out(session)


@router.get("/sessions/{session_id}", response_model=GrocerySessionOut)
async def get_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrocerySessionOut:
    from sqlalchemy import select

    session = (
        await db.execute(select(GrocerySession).where(GrocerySession.id == session_id, GrocerySession.user_id == user.id))
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grocery session not found")
    return _session_out(session)
