"""Spoken-safe trip snapshot for Zenny. No emails, IDs, or booking secrets."""

from __future__ import annotations

import json
import uuid
from datetime import date

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ItineraryDay, Trip

_MAX_CITIES = 8
_MAX_STOPS = 3


def _stop_names(activities: object) -> list[str]:
    names: list[str] = []
    if not isinstance(activities, list):
        return names
    for item in activities:
        if not isinstance(item, dict):
            continue
        name = str(item.get("place_name") or item.get("placeName") or "").strip()
        if name and name not in names:
            names.append(name)
        if len(names) >= _MAX_STOPS:
            break
    return names


def today_itinerary_brief(days: list, today: date | None = None) -> dict:
    if not days:
        return {}
    today = today or date.today()
    dated = [day for day in days if getattr(day, "date", None)]
    if not dated:
        return {}
    exact = next((day for day in dated if day.date == today), None)
    if exact is not None:
        focus, kind = exact, "today"
    else:
        upcoming = [day for day in dated if day.date > today]
        if upcoming:
            focus, kind = min(upcoming, key=lambda day: day.date), "upcoming"
        else:
            focus, kind = max(dated, key=lambda day: day.date), "recent"
    city = str(getattr(focus, "city", "") or "").strip()
    if not city:
        return {}
    return {
        "focusKind": kind,
        "focusCity": city,
        "focusDate": focus.date.isoformat(),
        "focusStops": _stop_names(getattr(focus, "activities", None)),
    }


def format_trip_context(
    trip: Trip | None,
    days: list | None = None,
    today: date | None = None,
) -> dict:
    if trip is None:
        return {"hasTrip": False}
    cities = [str(city).strip() for city in (trip.cities or []) if str(city).strip()][:_MAX_CITIES]
    payload = {
        "hasTrip": True,
        "cities": cities,
        "startDate": trip.start_date.isoformat() if trip.start_date else None,
        "endDate": trip.end_date.isoformat() if trip.end_date else None,
        "budget": trip.budget_level,
        "status": trip.status,
        "originCountry": trip.origin_country,
    }
    payload.update(today_itinerary_brief(days or [], today))
    return payload


def spoken_today_plan(trip_context: dict | None) -> str:
    trip = trip_context if isinstance(trip_context, dict) else {}
    if not trip.get("hasTrip"):
        return (
            "You don't have a saved trip yet. I won't invent a day for you. "
            "Open the Trip tab when you want one, or ask me about a place."
        )
    city = str(trip.get("focusCity") or "").strip()
    kind = str(trip.get("focusKind") or "")
    stops = [str(stop) for stop in (trip.get("focusStops") or []) if stop]
    if city and kind == "today":
        if stops:
            return (
                f"Today you're in {city}. Your plan has {', '.join(stops)}. "
                "Ask me about one of those and I'll stay with sourced facts."
            )
        return f"Today you're in {city}. Ask me about a place there."
    if city and kind == "upcoming":
        when = trip.get("focusDate") or "soon"
        extra = f" Planned stops: {', '.join(stops)}." if stops else ""
        return f"Your next planned day is {city} on {when}.{extra} I don't invent bookings."
    cities = ", ".join(str(item) for item in (trip.get("cities") or []) if item)
    return (
        f"You have a trip{' through ' + cities if cities else ''}. "
        "Ask me about a place, or open the Trip tab for the full days."
    )


def trip_context_json(
    trip: Trip | None,
    days: list | None = None,
    today: date | None = None,
) -> str:
    return json.dumps(format_trip_context(trip, days=days, today=today), separators=(",", ":"))


async def load_voice_trip(
    db: AsyncSession,
    user_id: uuid.UUID,
    trip_id: uuid.UUID | None = None,
) -> Trip | None:
    if trip_id is not None:
        return (
            await db.execute(select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id))
        ).scalar_one_or_none()
    rank = case(
        (Trip.status == "active", 0),
        (Trip.status == "planned", 1),
        (Trip.status == "draft", 2),
        else_=3,
    )
    return (
        await db.execute(
            select(Trip)
            .where(Trip.user_id == user_id, Trip.status != "completed")
            .order_by(rank, Trip.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def load_voice_trip_days(db: AsyncSession, trip_id: uuid.UUID) -> list[ItineraryDay]:
    return list(
        (
            await db.execute(
                select(ItineraryDay).where(ItineraryDay.trip_id == trip_id).order_by(ItineraryDay.day)
            )
        ).scalars().all()
    )
