"""Trip memory and long-term preference memory endpoints — the two Postgres-backed
tiers of 01-zentrip-companion.md §3's three-tier memory model (session memory, the
third tier, is Redis-only and lives in app/agent_gateway.py's *_session_message
functions, not here).

Writes are explicit client actions on purpose. Per the spec: trip memory can hold
deterministic system bookkeeping too (see app.agent_gateway._trip_reply), but
long-term preference memory is written "only after explicit opt-in" — never inferred
silently from a chat message — so there is no endpoint that lets free-form chat text
turn into a persisted preference without the user (or a client UI they interacted
with) calling this POST directly.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import Trip, TripMemoryNote, User, UserPreference
from app.schemas import (
    TripMemoryNoteCreate,
    TripMemoryNoteOut,
    UserPreferenceCreate,
    UserPreferenceOut,
)
from app.security import utcnow

router = APIRouter(tags=["memory"])


async def _assert_owned_trip(db: AsyncSession, trip_id: uuid.UUID, user_id: uuid.UUID) -> None:
    trip = (await db.execute(select(Trip.id).where(Trip.id == trip_id, Trip.user_id == user_id))).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")


def _note_out(note: TripMemoryNote) -> TripMemoryNoteOut:
    return TripMemoryNoteOut(id=note.id, tripId=note.trip_id, note=note.note, source=note.source, createdAt=note.created_at)


@router.get("/v1/trips/{trip_id}/memory", response_model=list[TripMemoryNoteOut])
async def list_trip_memory(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[TripMemoryNoteOut]:
    await _assert_owned_trip(db, trip_id, user.id)
    notes = (
        await db.execute(
            select(TripMemoryNote).where(TripMemoryNote.trip_id == trip_id).order_by(TripMemoryNote.created_at.desc())
        )
    ).scalars().all()
    return [_note_out(note) for note in notes]


@router.post("/v1/trips/{trip_id}/memory", response_model=TripMemoryNoteOut, status_code=status.HTTP_201_CREATED)
async def add_trip_memory(
    trip_id: uuid.UUID,
    body: TripMemoryNoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripMemoryNoteOut:
    await _assert_owned_trip(db, trip_id, user.id)
    note = TripMemoryNote(trip_id=trip_id, user_id=user.id, note=body.note, source="user")
    db.add(note)
    await db.commit()
    return _note_out(note)


def _preference_out(preference: UserPreference) -> UserPreferenceOut:
    return UserPreferenceOut(id=preference.id, statement=preference.statement, createdAt=preference.created_at)


@router.get("/v1/preferences", response_model=list[UserPreferenceOut])
async def list_preferences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[UserPreferenceOut]:
    preferences = (
        await db.execute(
            select(UserPreference)
            .where(UserPreference.user_id == user.id, UserPreference.superseded_at.is_(None))
            .order_by(UserPreference.created_at.desc())
        )
    ).scalars().all()
    return [_preference_out(preference) for preference in preferences]


@router.post("/v1/preferences", response_model=UserPreferenceOut, status_code=status.HTTP_201_CREATED)
async def add_preference(
    body: UserPreferenceCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> UserPreferenceOut:
    preference = UserPreference(user_id=user.id, statement=body.statement)
    db.add(preference)
    await db.commit()
    return _preference_out(preference)


@router.delete("/v1/preferences/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preference(
    preference_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    preference = (
        await db.execute(
            select(UserPreference).where(UserPreference.id == preference_id, UserPreference.user_id == user.id)
        )
    ).scalar_one_or_none()
    if preference is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference not found")
    # Soft delete, not a row removal — versioned per privacy §50 so a later "what did
    # Zentrip remember about me" view can still show the history, not just the present.
    preference.superseded_at = utcnow()
    await db.commit()
