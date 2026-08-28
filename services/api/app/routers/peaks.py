"""Geometry-first nearby peak lookup for the Landscape Lens."""

from math import asin, atan2, cos, degrees, radians, sin, sqrt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Peak
from app.schemas import PeakOut, PeaksResponse

router = APIRouter(prefix="/v1/peaks", tags=["peaks"])


def _distance_bearing(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> tuple[float, float]:
    earth_radius_km = 6371.0
    lat_a, lat_b = radians(latitude_a), radians(latitude_b)
    delta_lat = radians(latitude_b - latitude_a)
    delta_lon = radians(longitude_b - longitude_a)
    haversine = sin(delta_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    distance = 2 * earth_radius_km * asin(min(1.0, sqrt(haversine)))
    bearing = (degrees(atan2(sin(delta_lon) * cos(lat_b), cos(lat_a) * sin(lat_b) - sin(lat_a) * cos(lat_b) * cos(delta_lon))) + 360) % 360
    return distance, bearing


def _direction(bearing: float) -> str:
    return ("N", "NE", "E", "SE", "S", "SW", "W", "NW")[round(bearing / 45) % 8]


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
    ranked: list[tuple[Peak, float, float]] = []
    for peak in peaks:
        distance, peak_bearing = _distance_bearing(latitude, longitude, peak.latitude, peak.longitude)
        if distance > radius_km:
            continue
        if bearing is not None:
            difference = abs(peak_bearing - bearing)
            difference = min(difference, 360 - difference)
            if difference > field_of_view / 2:
                continue
        ranked.append((peak, distance, peak_bearing))
    ranked.sort(key=lambda item: item[1])
    results = [
        PeakOut(
            id=peak.id,
            name=peak.name,
            elevationM=peak.elevation_m,
            latitude=peak.latitude,
            longitude=peak.longitude,
            distanceKm=round(distance, 1),
            bearingDegrees=round(peak_bearing, 1),
            direction=_direction(peak_bearing),
            confidence="estimated" if peak.status != "published" else "verified",
            description=peak.description,
            sourceName=peak.source_name,
            lastVerified=peak.last_verified,
        )
        for peak, distance, peak_bearing in ranked[:8]
    ]
    return PeaksResponse(results=results, latitude=latitude, longitude=longitude, bearingDegrees=bearing)
