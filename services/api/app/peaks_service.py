"""Geometry + compass ranking for Landscape Lens. No DEM / line-of-sight yet."""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, atan2, cos, degrees, radians, sin, sqrt


DEM_NOTE = (
    "No digital elevation model is loaded. Ranking uses catalog GPS plus compass "
    "field-of-view. Line-of-sight and terrain occlusion are not verified."
)


@dataclass(frozen=True)
class PeakCandidate:
    id: object
    name: str
    elevation_m: int
    latitude: float
    longitude: float
    description: str
    source_name: str
    last_verified: object
    status: str


@dataclass(frozen=True)
class RankedPeak:
    peak: PeakCandidate
    distance_km: float
    bearing_degrees: float
    angular_difference_degrees: float | None


def distance_bearing(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> tuple[float, float]:
    earth_radius_km = 6371.0
    lat_a, lat_b = radians(latitude_a), radians(latitude_b)
    delta_lat = radians(latitude_b - latitude_a)
    delta_lon = radians(longitude_b - longitude_a)
    haversine = sin(delta_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    distance = 2 * earth_radius_km * asin(min(1.0, sqrt(haversine)))
    bearing = (degrees(atan2(sin(delta_lon) * cos(lat_b), cos(lat_a) * sin(lat_b) - sin(lat_a) * cos(lat_b) * cos(delta_lon))) + 360) % 360
    return distance, bearing


def angular_difference(bearing_a: float, bearing_b: float) -> float:
    difference = abs(bearing_a - bearing_b) % 360
    return min(difference, 360 - difference)


def compass_direction(bearing: float) -> str:
    return ("N", "NE", "E", "SE", "S", "SW", "W", "NW")[round(bearing / 45) % 8]


def rank_peak_candidates(
    candidates: list[PeakCandidate],
    latitude: float,
    longitude: float,
    bearing: float | None = None,
    field_of_view: float = 90,
    radius_km: float = 250,
    limit: int = 8,
) -> list[RankedPeak]:
    ranked: list[RankedPeak] = []
    for peak in candidates:
        distance, peak_bearing = distance_bearing(latitude, longitude, peak.latitude, peak.longitude)
        if distance > radius_km:
            continue
        ang = angular_difference(peak_bearing, bearing) if bearing is not None else None
        if ang is not None and ang > field_of_view / 2:
            continue
        ranked.append(RankedPeak(peak=peak, distance_km=distance, bearing_degrees=peak_bearing, angular_difference_degrees=ang))
    if bearing is None:
        ranked.sort(key=lambda item: item.distance_km)
    else:
        ranked.sort(key=lambda item: (item.angular_difference_degrees or 0, item.distance_km))
    return ranked[:limit]


def identification_method(bearing: float | None) -> str:
    return "compass_fov_catalog" if bearing is not None else "catalog_distance"
