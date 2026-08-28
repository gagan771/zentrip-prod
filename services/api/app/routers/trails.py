"""Citation-aware trail catalog and offline package manifests."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Trail, TrailHazard, TrailWaypoint
from app.schemas import TrailDetailOut, TrailHazardOut, TrailPackageOut, TrailSummaryOut, TrailWaypointOut

router = APIRouter(prefix="/v1/trails", tags=["trails"])

_PUBLIC_STATUSES = ("published", "preview")


def _summary(trail: Trail) -> TrailSummaryOut:
    return TrailSummaryOut(
        id=trail.id,
        slug=trail.slug,
        name=trail.name,
        region=trail.region,
        summary=trail.summary,
        distanceKm=trail.distance_km,
        elevationGainM=trail.elevation_gain_m,
        minAltitudeM=trail.min_altitude_m,
        maxAltitudeM=trail.max_altitude_m,
        difficulty=trail.difficulty,
        seasonality=trail.seasonality,
        permitNotes=trail.permit_notes,
        verificationStatus=trail.verification_status,
        lastVerified=trail.last_verified,
        packageVersion=trail.package_version,
        navigationReady=trail.verification_status == "verified",
        sourceName=trail.source_name,
        sourceUrl=trail.source_url,
    )


def _waypoint(row: TrailWaypoint) -> TrailWaypointOut:
    return TrailWaypointOut(
        id=row.id,
        name=row.name,
        kind=row.kind,
        latitude=row.latitude,
        longitude=row.longitude,
        elevationM=row.elevation_m,
        description=row.description,
        sourceConfidence=row.source_confidence,
    )


def _hazard(row: TrailHazard) -> TrailHazardOut:
    return TrailHazardOut(
        id=row.id,
        category=row.category,
        description=row.description,
        latitude=row.latitude,
        longitude=row.longitude,
        sourceKind=row.source_kind,
        confidence=row.confidence,
        status=row.status,
        observedAt=row.observed_at,
        expiresAt=row.expires_at,
    )


async def _detail(db: AsyncSession, trail: Trail) -> TrailDetailOut:
    waypoints = (
        await db.execute(select(TrailWaypoint).where(TrailWaypoint.trail_id == trail.id).order_by(TrailWaypoint.name))
    ).scalars().all()
    now = datetime.utcnow()
    hazards = (
        await db.execute(
            select(TrailHazard)
            .where(
                TrailHazard.trail_id == trail.id,
                TrailHazard.status == "active",
                (TrailHazard.expires_at.is_(None) | (TrailHazard.expires_at > now)),
            )
            .order_by(TrailHazard.observed_at.desc())
        )
    ).scalars().all()
    return TrailDetailOut(
        **_summary(trail).model_dump(),
        routeGeojson=trail.route_geojson,
        waypoints=[_waypoint(row) for row in waypoints],
        hazards=[_hazard(row) for row in hazards],
    )


@router.get("", response_model=list[TrailSummaryOut])
async def list_trails(
    region: str | None = Query(default=None, max_length=100),
    difficulty: str | None = Query(default=None, pattern="^(easy|moderate|hard|expert)$"),
    db: AsyncSession = Depends(get_db),
) -> list[TrailSummaryOut]:
    statement = select(Trail).where(Trail.verification_status.in_(_PUBLIC_STATUSES)).order_by(Trail.name)
    if region:
        statement = statement.where(Trail.region.ilike(region))
    if difficulty:
        statement = statement.where(Trail.difficulty == difficulty)
    rows = (await db.execute(statement)).scalars().all()
    return [_summary(row) for row in rows]


@router.get("/{slug}", response_model=TrailDetailOut)
async def get_trail(slug: str, db: AsyncSession = Depends(get_db)) -> TrailDetailOut:
    trail = await db.scalar(select(Trail).where(Trail.slug == slug, Trail.verification_status.in_(_PUBLIC_STATUSES)))
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")
    return await _detail(db, trail)


@router.get("/{slug}/package", response_model=TrailPackageOut)
async def get_trail_package(slug: str, db: AsyncSession = Depends(get_db)) -> TrailPackageOut:
    trail = await db.scalar(select(Trail).where(Trail.slug == slug, Trail.verification_status.in_(_PUBLIC_STATUSES)))
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")
    return TrailPackageOut(
        trail=await _detail(db, trail),
        emergencyNumbers=[
            {"label": "National emergency", "number": "112", "source": "ERSS"},
            {"label": "Tourist helpline", "number": "1363", "source": "Ministry of Tourism"},
        ],
        packageWarning=(
            "This package contains preview or community data unless the trail is marked verified. "
            "It is not a substitute for local authorities, a guide, weather checks, or field navigation."
        ),
        generatedAt=datetime.utcnow(),
    )
