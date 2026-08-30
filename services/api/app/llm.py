"""Grounded itinerary generation through a swappable LLM provider.

OpenRouter is the default provider and uses its free-model router during Phase 1.
The model still receives only retrieved KnowledgeEntity candidates and must call the
fixed return_itinerary tool. The validation pass below is the final boundary: model
output cannot reference a place that was not retrieved from the Knowledge Base.
"""

import json
from typing import Any

import anthropic

from app.config import settings
from app.models import Trip
from app.provider_http import http_session


class LLMNotConfiguredError(Exception):
    pass


class LLMProviderError(Exception):
    pass


_ITINERARY_TOOL = {
    "name": "return_itinerary",
    "description": "Return the generated day-by-day itinerary for the trip.",
    "input_schema": {
        "type": "object",
        "properties": {
            "days": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "day": {"type": "integer", "description": "1-indexed day number"},
                        "city": {"type": "string"},
                        "activities": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "startTime": {"type": "string", "description": "HH:MM"},
                                    "placeId": {"type": "string", "description": "Must exactly match a candidate placeId."},
                                    "placeName": {"type": "string"},
                                    "durationMinutes": {"type": "integer"},
                                    "travelMinutes": {"type": "integer", "description": "Known transfer minutes; use 0 when unknown."},
                                    "estimatedCostINR": {"type": "integer", "description": "Reviewed estimate in INR; use 0 when unknown."},
                                    "reason": {"type": "string", "description": "Must trace back to a candidate place's fact."},
                                    "bookingRequired": {"type": "boolean"},
                                },
                                "required": ["startTime", "placeId", "placeName", "durationMinutes", "reason", "bookingRequired"],
                            },
                        },
                    },
                    "required": ["day", "city", "activities"],
                },
            }
        },
        "required": ["days"],
    },
}

_SYSTEM_PROMPT = (
    "You are Zentrip's itinerary planner for travelers visiting India. Build a day-by-day "
    "plan using ONLY the candidate places provided in the user message for factual grounding. "
    "Use plannerContext to personalize interests, pace, walking tolerance, travel party, "
    "accessibility, budget, season, trip length, and explicit constraints. Prefer candidates "
    "with higher plannerScore and good season/accessibility fit, but never violate hard constraints. "
    "Respect destination safety notes, permit requirements, altitude acclimatisation, wildlife "
    "uncertainty, religious-site etiquette, and transfer buffers. Follow plannerContext's "
    "citySequence in order: do not move a day to another city or place an activity in a "
    "different city from that day's city. Respect maxActivitiesPerDay and "
    "maxDailyTravelMinutes; include travelMinutes when known and keep the daily total within "
    "the limit. Use routeSkeleton as the deterministic scaffold: prefer its candidatePlaceIds "
    "and never add a place outside candidatePlaces. "
    "the limit. Treat stale operational data as a warning only and never present it as a current "
    "opening, price, or availability fact. Use reviewed opening hours when present, and include "
    "estimatedCostINR only when the candidate supplies it. "
    "Use a candidate's exact placeId and placeName whenever you include it. Do not invent "
    "places, opening hours, prices, travel times, or historical facts. If a city has no good "
    "candidates, leave that day empty rather than making one up. If validationFeedback is "
    "present, repair every listed issue before returning the tool call. Call the "
    "return_itinerary tool with your answer."
)


def provider_configuration_error() -> str:
    if settings.llm_provider == "anthropic":
        return "Itinerary generation isn't configured yet — set ANTHROPIC_API_KEY in the backend .env"
    return "Itinerary generation isn't configured yet — set OPENROUTER_API_KEY in the backend .env"


def _client() -> anthropic.Anthropic:
    if not settings.anthropic_api_key:
        raise LLMNotConfiguredError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _trip_prompt(trip: Trip, candidate_places: list[dict], planner_context: dict | None = None) -> str:
    num_days = (trip.end_date - trip.start_date).days + 1
    return json.dumps(
        {
            "trip": {
                "cities": trip.cities,
                "numDays": num_days,
                "budgetLevel": trip.budget_level,
                "originCountry": trip.origin_country,
            },
            "candidatePlaces": candidate_places,
            "plannerContext": planner_context or {},
        },
        ensure_ascii=False,
    )


def _generate_with_anthropic(trip: Trip, candidate_places: list[dict], planner_context: dict | None = None) -> list[dict]:
    response = _client().messages.create(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        tools=[_ITINERARY_TOOL],
        tool_choice={"type": "tool", "name": "return_itinerary"},
        messages=[{"role": "user", "content": _trip_prompt(trip, candidate_places, planner_context)}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "return_itinerary":
            return block.input["days"]
    raise LLMProviderError("Claude did not return the expected return_itinerary tool call")


def _openrouter_tool() -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": _ITINERARY_TOOL["name"],
            "description": _ITINERARY_TOOL["description"],
            "parameters": _ITINERARY_TOOL["input_schema"],
        },
    }


def _generate_with_openrouter(trip: Trip, candidate_places: list[dict], planner_context: dict | None = None) -> list[dict]:
    if not settings.openrouter_api_key:
        raise LLMNotConfiguredError("OPENROUTER_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name

    response = http_session().post(
        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
        headers=headers,
        json={
            "model": settings.openrouter_model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _trip_prompt(trip, candidate_places, planner_context)},
            ],
            "tools": [_openrouter_tool()],
            "tool_choice": {"type": "function", "function": {"name": "return_itinerary"}},
            "max_tokens": 768,
        },
        timeout=45,
    )
    if not response.ok:
        raise LLMProviderError(f"OpenRouter returned HTTP {response.status_code}: {response.text[:500]}")

    try:
        message = response.json()["choices"][0]["message"]
        tool_call = next(call for call in message.get("tool_calls", []) if call["function"]["name"] == "return_itinerary")
        return json.loads(tool_call["function"]["arguments"])["days"]
    except (KeyError, IndexError, StopIteration, TypeError, json.JSONDecodeError) as exc:
        raise LLMProviderError("OpenRouter did not return the expected return_itinerary tool call") from exc


def _validate_days(days: Any, trip: Trip, candidate_places: list[dict]) -> list[dict]:
    if not isinstance(days, list):
        raise LLMProviderError("Itinerary response had an invalid days value")

    candidates = {str(place["placeId"]): place for place in candidate_places}
    allowed_cities = {city.casefold() for city in trip.cities}
    validated: list[dict] = []
    for raw_day in days:
        if not isinstance(raw_day, dict) or not isinstance(raw_day.get("activities"), list):
            raise LLMProviderError("Itinerary response had an invalid day")
        city = str(raw_day.get("city", ""))
        if city.casefold() not in allowed_cities:
            raise LLMProviderError(f"Itinerary response referenced an unrequested city: {city}")

        activities: list[dict] = []
        for activity in raw_day["activities"]:
            if not isinstance(activity, dict) or str(activity.get("placeId")) not in candidates:
                raise LLMProviderError("Itinerary response referenced a place outside the Knowledge Base")
            candidate = candidates[str(activity["placeId"])]
            activity["placeName"] = candidate["name"]
            activities.append(activity)
        validated.append({**raw_day, "activities": activities})
    return validated


def generate_itinerary_days(trip: Trip, candidate_places: list[dict], planner_context: dict | None = None) -> list[dict]:
    """Return the validated raw days list stored by the trip router."""
    if settings.llm_provider == "anthropic":
        days = _generate_with_anthropic(trip, candidate_places, planner_context)
    elif settings.llm_provider == "openrouter":
        days = _generate_with_openrouter(trip, candidate_places, planner_context)
    else:
        raise LLMProviderError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")
    return _validate_days(days, trip, candidate_places)
