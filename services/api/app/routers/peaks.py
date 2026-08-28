"""Geometry-first nearby peak lookup for the Landscape Lens."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Peak
from app.peaks_service import (
    DEM_NOTE,
    PeakCandidate,
    compass_direction,
    distance_bearing,
    identification_method,
    rank_peak_candidates,
)
from app.schemas import PeakOut, PeaksResponse

router = APIRouter(prefix="/v1/peaks", tags=["peaks"])

# Backward-compatible aliases for the original geometry test/helpers. The
# implementation lives in peaks_service so the route and offline consumers use
# exactly the same math.
_distance_bearing = distance_bearing
_direction = compass_direction


@router.get("/nearby", response_model=PeaksResponse)
async def nearby_peaks(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    bearing: float | None = Query(default=None, ge=0, lt=360),
    field_of_view: float = Query(default=90, alias="fieldOfView", gt=0, le=180),
    radius_km: float = Query(default=250, alias="radiusKm", gt=0, le=500),
    db: AsyncSession = Depends(get_db),
) -> PeaksResponse:
    peaks = (await db.execute(select(Peak).where(Peak.status.in_(("published", "preview"))))).scalars().all()
    candidates = [
        PeakCandidate(
            id=peak.id,
            name=peak.name,
            elevation_m=peak.elevation_m,
            latitude=peak.latitude,
            longitude=peak.longitude,
            description=peak.description,
            source_name=peak.source_name,
            last_verified=peak.last_verified,
            status=peak.status,
        )
        for peak in peaks
    ]
    ranked = rank_peak_candidates(
        candidates,
        latitude,
        longitude,
        bearing=bearing,
        field_of_view=field_of_view,
        radius_km=radius_km,
    )
    results = [
        PeakOut(
            id=item.peak.id,
            name=item.peak.name,
            elevationM=item.peak.elevation_m,
            latitude=item.peak.latitude,
            longitude=item.peak.longitude,
            distanceKm=round(item.distance_km, 1),
            bearingDegrees=round(item.bearing_degrees, 1),
            direction=compass_direction(item.bearing_degrees),
            confidence="estimated" if item.peak.status != "published" else "verified",
            description=item.peak.description,
            sourceName=item.peak.source_name,
            lastVerified=item.peak.last_verified,
            angularDifferenceDegrees=None if item.angular_difference_degrees is None else round(item.angular_difference_degrees, 1),
            lineOfSight="unverified",
        )
        for item in ranked
    ]
    return PeaksResponse(
        results=results,
        latitude=latitude,
        longitude=longitude,
        bearingDegrees=bearing,
        fieldOfView=field_of_view if bearing is not None else None,
        demApplied=False,
        identificationMethod=identification_method(bearing),
        demNote=DEM_NOTE,
    )
