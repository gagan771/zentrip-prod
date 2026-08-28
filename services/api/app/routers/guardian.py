"""Deterministic Guardian incident state machine for Phase 3."""

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import GuardianIncident, User
from app.schemas import GuardianIncidentAction, GuardianIncidentCreate, GuardianIncidentOut

router = APIRouter(prefix="/v1/guardian", tags=["guardian"])
_ACTIVE = ("created", "checked_in", "shared")


def _out(incident: GuardianIncident) -> GuardianIncidentOut:
    return GuardianIncidentOut(
        id=incident.id,
        category=incident.category,
        status=incident.status,
        note=incident.note,
        latitude=incident.latitude,
        longitude=incident.longitude,
        checkinAt=incident.checkin_at,
        sharedAt=incident.shared_at,
        resolvedAt=incident.resolved_at,
        createdAt=incident.created_at,
        updatedAt=incident.updated_at,
    )


async def _owned_active(db: AsyncSession, incident_id: uuid.UUID, user_id: uuid.UUID) -> GuardianIncident:
    incident = await db.scalar(
        select(GuardianIncident).where(
            GuardianIncident.id == incident_id,
            GuardianIncident.user_id == user_id,
        )
    )
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    if incident.status not in _ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Incident is already resolved")
    return incident


@router.get("/incidents/active", response_model=GuardianIncidentOut | None)
async def active_incident(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardianIncidentOut | None:
    incident = await db.scalar(
        select(GuardianIncident)
        .where(GuardianIncident.user_id == user.id, GuardianIncident.status.in_(_ACTIVE))
        .order_by(GuardianIncident.created_at.desc())
        .limit(1)
    )
    return _out(incident) if incident else None


@router.post("/incidents", response_model=GuardianIncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: GuardianIncidentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardianIncidentOut:
    existing = await db.scalar(
        select(GuardianIncident).where(
            GuardianIncident.user_id == user.id,
            GuardianIncident.status.in_(_ACTIVE),
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resolve the current incident first")
    incident = GuardianIncident(
        user_id=user.id,
        category=body.category,
        note=body.note,
        latitude=body.latitude,
        longitude=body.longitude,
        status="created",
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return _out(incident)


@router.post("/incidents/{incident_id}/checkin", response_model=GuardianIncidentOut)
async def checkin_incident(
    incident_id: uuid.UUID,
    body: GuardianIncidentAction | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardianIncidentOut:
    incident = await _owned_active(db, incident_id, user.id)
    if incident.status not in ("created", "checked_in"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Check-in is not valid after location sharing")
    body = body or GuardianIncidentAction()
    if body.note:
        incident.note = body.note
    incident.checkin_at = datetime.utcnow()
    incident.status = "checked_in"
    await db.commit()
    await db.refresh(incident)
    return _out(incident)


@router.post("/incidents/{incident_id}/share", response_model=GuardianIncidentOut)
async def share_incident(
    incident_id: uuid.UUID,
    body: GuardianIncidentAction,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardianIncidentOut:
    incident = await _owned_active(db, incident_id, user.id)
    latitude = body.latitude if body.latitude is not None else incident.latitude
    longitude = body.longitude if body.longitude is not None else incident.longitude
    if latitude is None or longitude is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Location coordinates are required")
    incident.latitude = latitude
    incident.longitude = longitude
    incident.shared_at = datetime.utcnow()
    incident.status = "shared"
    await db.commit()
    await db.refresh(incident)
    return _out(incident)


@router.post("/incidents/{incident_id}/resolve", response_model=GuardianIncidentOut)
async def resolve_incident(
    incident_id: uuid.UUID,
    body: GuardianIncidentAction | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardianIncidentOut:
    incident = await _owned_active(db, incident_id, user.id)
    if body and body.note:
        incident.note = f"{incident.note}\n{body.note}" if incident.note else body.note
    incident.status = "resolved"
    incident.resolved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(incident)
    return _out(incident)
