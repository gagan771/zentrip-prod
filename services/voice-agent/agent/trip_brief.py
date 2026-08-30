from __future__ import annotations

import json

_NO_TRIP = '{"hasTrip":false}'


def spoken_trip_instructions(raw: str) -> str:
    try:
        data = json.loads(raw or _NO_TRIP)
    except json.JSONDecodeError:
        data = {"hasTrip": False}
    if not data.get("hasTrip"):
        return (
            "This traveler has no saved trip yet. Help them notice a place. "
            "Do not invent an itinerary they already booked."
        )
    cities = ", ".join(str(city) for city in (data.get("cities") or []) if city) or "India"
    start = data.get("startDate") or "an open start"
    end = data.get("endDate") or "an open end"
    focus_city = str(data.get("focusCity") or "").strip()
    focus_kind = str(data.get("focusKind") or "")
    stops = [str(stop) for stop in (data.get("focusStops") or []) if stop]
    day_line = ""
    if focus_city and focus_kind == "today":
        day_line = f" Today they are in {focus_city}."
    elif focus_city and focus_kind == "upcoming":
        day_line = f" Next planned day is {focus_city} on {data.get('focusDate')}."
    elif focus_city:
        day_line = f" Most recent planned day was {focus_city}."
    if stops:
        day_line += f" Planned stops: {', '.join(stops)}. Use search_knowledge for those places. Do not invent extra stops."
    return (
        f"This traveler's trip: {cities}, {start} to {end}. "
        f"Status {data.get('status') or 'draft'}. Budget {data.get('budget') or 'unspecified'}.{day_line} "
        "Use get_trip_context when they ask what to do today or about their plan. "
        "Do not invent bookings or ticket times. Never read IDs aloud."
    )


def _trip_data(raw: str) -> dict:
    try:
        data = json.loads(raw or _NO_TRIP)
    except json.JSONDecodeError:
        return {"hasTrip": False}
    return data if isinstance(data, dict) else {"hasTrip": False}


def focus_city(raw: str) -> str:
    return str(_trip_data(raw).get("focusCity") or "").strip()


def greeting_instructions(raw: str) -> str:
    data = _trip_data(raw)
    city = str(data.get("focusCity") or "").strip()
    kind = str(data.get("focusKind") or "")
    if city and kind == "today":
        return (
            f"Greet briefly as Zenny. In one short sentence, mention they are in {city} today. "
            "Then wait. Do not list features or recite the itinerary."
        )
    if city and kind == "upcoming":
        return (
            f"Greet briefly as Zenny. You may mention their next city is {city}. Then wait. "
            "Do not dump a feature list."
        )
    return "Greet briefly as Zenny and wait. Do not dump a feature list."


def trip_context_from_metadata(*candidates: object) -> str:
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return text[:2000]
    return _NO_TRIP
