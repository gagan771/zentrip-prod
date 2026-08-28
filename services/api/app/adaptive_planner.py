"""Deterministic personalization and validation helpers for adaptive itineraries.

The LLM is used to compose a grounded plan, not to decide hard scheduling rules.
These helpers are deliberately pure so ranking and safety behavior can be tested
without a database or a model provider.
"""

from __future__ import annotations

from datetime import date, datetime
import re
from typing import Any


DEFAULT_PROFILE: dict[str, Any] = {
    "interests": [],
    "pace": "balanced",
    "transportPreferences": [],
    "walkingTolerance": "medium",
    "wakeTime": "08:00",
    "sleepTime": "22:30",
    "travelParty": "solo",
    "accessibility": [],
    "foodPreferences": [],
    "avoidInterests": [],
}

_INTEREST_KEYWORDS = {
    "culture": ("culture", "temple", "museum", "heritage", "palace", "festival", "art", "arts"),
    "history": ("history", "fort", "monument", "tomb", "stupa", "archaeological"),
    "architecture": ("architecture", "palace", "fort", "mosque", "temple", "caves"),
    "food": ("food", "market", "cuisine", "restaurant", "langar", "street", "coffee", "tea"),
    "nature": ("nature", "park", "lake", "garden", "wildlife", "waterfall", "valley", "forest"),
    "wildlife": ("wildlife", "safari", "rhino", "tiger", "lion", "mangrove"),
    "adventure": ("trek", "adventure", "safari", "rafting", "mountain", "desert", "cave"),
    "spiritual": ("temple", "gurdwara", "church", "mosque", "pilgrimage", "ashram"),
    "shopping": ("market", "bazaar", "shopping", "craft", "textile", "artisan"),
    "beach": ("beach", "coast", "coastal", "island", "marine", "sea"),
    "wellness": ("wellness", "yoga", "ashram", "spa", "slow travel", "relax"),
    "photography": ("photo", "photography", "sunset", "sunrise", "viewpoint", "scenic"),
    "quiet": ("quiet", "peaceful", "uncrowded", "less crowded", "slow"),
}


def _text(value: Any) -> str:
    return str(value or "").strip().casefold()


def _unique_strings(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _text(value)
        if item and item not in seen:
            result.append(item)
            seen.add(item)
    return result


def _positive_keyword(statements: str, keyword: str) -> bool:
    """Match a preference only when nearby language does not negate it."""
    start = 0
    while True:
        index = statements.find(keyword, start)
        if index < 0:
            return False
        prefix = statements[max(0, index - 28):index]
        if not re.search(r"\b(?:not|don't|dont|avoid|no|without|dislike|hate)\b", prefix):
            return True
        start = index + len(keyword)


def merge_profile(profile: dict[str, Any] | None, preference_statements: list[str] | None = None) -> dict[str, Any]:
    """Merge structured preferences with explicit legacy preference statements."""
    merged = {**DEFAULT_PROFILE, **(profile or {})}
    for key in ("interests", "transportPreferences", "accessibility", "foodPreferences"):
        merged[key] = _unique_strings(merged.get(key))

    statements = " ".join(_text(item) for item in (preference_statements or []))
    interest_terms = set(merged["interests"])
    avoid_terms = set(_unique_strings(merged.get("avoidInterests")))
    for interest, keywords in _INTEREST_KEYWORDS.items():
        if any(_positive_keyword(statements, keyword) for keyword in keywords):
            interest_terms.add(interest)
        elif any(keyword in statements for keyword in keywords):
            avoid_terms.add(interest)
    merged["interests"] = sorted(interest_terms)
    merged["avoidInterests"] = sorted(avoid_terms)

    if any(term in statements for term in ("relaxed", "slow", "not packed")):
        merged["pace"] = "relaxed"
    elif any(term in statements for term in ("packed", "as much as possible", "busy")):
        merged["pace"] = "packed"
    if "train" in statements and "train" not in merged["transportPreferences"]:
        merged["transportPreferences"].append("train")
    if "flight" in statements and "flight" not in merged["transportPreferences"]:
        merged["transportPreferences"].append("flight")
    if any(term in statements for term in ("avoid walking", "less walking", "low walking")):
        merged["walkingTolerance"] = "low"
    return merged


def _inferred_tags(candidate: dict[str, Any]) -> set[str]:
    profile = candidate.get("experienceProfile") or {}
    tags = {_text(item) for item in profile.get("tags", [])} if isinstance(profile, dict) else set()
    destination_profile = profile.get("destinationProfile", {}) if isinstance(profile, dict) else {}
    if isinstance(destination_profile, dict):
        tags.update(_text(item) for item in destination_profile.get("tags", []))
        destination_kind = _text(destination_profile.get("destinationKind"))
        if destination_kind:
            tags.add(destination_kind)
    aliases = candidate.get("aliases") if isinstance(candidate.get("aliases"), list) else []
    corpus = f"{candidate.get('name', '')} {candidate.get('fact', '')} {' '.join(str(alias) for alias in aliases)}".casefold()
    for interest, keywords in _INTEREST_KEYWORDS.items():
        if any(keyword in corpus for keyword in keywords):
            tags.add(interest)
    return tags


_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _season_months(value: Any) -> set[int]:
    raw = _text(value).replace("–", "-").replace("—", "-")
    found = [_MONTHS[name] for name in re.findall(r"\b(" + "|".join(_MONTHS) + r")\b", raw)]
    if len(found) < 2:
        return set(found)
    start, end = found[0], found[1]
    if start <= end:
        return set(range(start, end + 1))
    return set(range(start, 13)) | set(range(1, end + 1))


def _season_fit(candidate: dict[str, Any], constraints: dict[str, Any]) -> float:
    month = constraints.get("travelMonth")
    if not month:
        return 0.75
    try:
        month = int(month)
    except (TypeError, ValueError):
        return 0.75
    experience = candidate.get("experienceProfile") or {}
    destination = experience.get("destinationProfile", {}) if isinstance(experience, dict) else {}
    season_values = []
    if isinstance(destination, dict):
        season_values.extend(destination.get("bestSeasons", []))
    if isinstance(experience, dict) and experience.get("seasonality"):
        season_values.append(experience["seasonality"])
    months = set().union(*(_season_months(value) for value in season_values)) if season_values else set()
    return 1.0 if month in months else 0.45 if months else 0.75


def _trip_length_fit(candidate: dict[str, Any], constraints: dict[str, Any]) -> float:
    trip_days = constraints.get("tripDays")
    destination = ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
    if not trip_days or not isinstance(destination, dict):
        return 0.75
    try:
        trip_days = int(trip_days)
        minimum = int(destination.get("typicalStayMinDays", 1))
        maximum = int(destination.get("typicalStayMaxDays", max(minimum, 3)))
    except (TypeError, ValueError):
        return 0.75
    if minimum <= trip_days <= maximum:
        return 1.0
    distance = minimum - trip_days if trip_days < minimum else trip_days - maximum
    return max(0.35, 1.0 - 0.2 * distance)


def _party_fit(candidate: dict[str, Any], profile: dict[str, Any]) -> float:
    party = _text(profile.get("travelParty")) or "solo"
    destination = ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
    accessibility = destination.get("accessibility", {}) if isinstance(destination, dict) else {}
    if not isinstance(accessibility, dict):
        return 0.75
    rating = _text(accessibility.get(party))
    return {"high": 1.0, "medium": 0.78, "low": 0.4}.get(rating, 0.75)


def _accessibility_fit(candidate: dict[str, Any], profile: dict[str, Any]) -> float:
    requested = set(_unique_strings(profile.get("accessibility")))
    if not requested:
        return 0.85
    destination = ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
    accessibility = destination.get("accessibility", {}) if isinstance(destination, dict) else {}
    wheelchair_level = _text(accessibility.get("wheelchair")) if isinstance(accessibility, dict) else ""
    if any(term in requested for term in {"wheelchair", "step_free", "step-free", "mobility"}):
        return {"high": 1.0, "medium": 0.65, "limited": 0.2}.get(wheelchair_level, 0.45)
    return 0.75


def _matches_term(candidate: dict[str, Any], term: str) -> bool:
    needle = _text(term)
    if not needle:
        return False
    corpus = f"{candidate.get('placeId', '')} {candidate.get('name', '')} {candidate.get('fact', '')}".casefold()
    return needle in corpus or needle in _inferred_tags(candidate)


def score_candidate(candidate: dict[str, Any], profile: dict[str, Any], constraints: dict[str, Any]) -> dict[str, Any]:
    """Return a transparent score; higher is a better experience fit."""
    experience = candidate.get("experienceProfile") or {}
    if not isinstance(experience, dict):
        experience = {}
    interests = set(_unique_strings(profile.get("interests")))
    tags = _inferred_tags(candidate)
    interest_fit = 0.55 if not interests else min(1.0, 0.35 + 0.65 * len(interests & tags) / max(1, len(interests)))

    pace = _text(profile.get("pace")) or "balanced"
    energy = _text(experience.get("energy")) or "medium"
    pace_fit = {
        "relaxed": {"low": 1.0, "medium": 0.78, "high": 0.4},
        "balanced": {"low": 0.85, "medium": 1.0, "high": 0.78},
        "packed": {"low": 0.7, "medium": 0.9, "high": 1.0},
    }.get(pace, {"low": 0.8, "medium": 0.9, "high": 0.8}).get(energy, 0.75)

    walking = _text(profile.get("walkingTolerance")) or "medium"
    walking_level = _text(experience.get("walkingLevel")) or "medium"
    walking_fit = {"low": {"low": 1.0, "medium": 0.65, "high": 0.25}, "medium": {"low": 0.9, "medium": 1.0, "high": 0.7}, "high": {"low": 0.8, "medium": 0.95, "high": 1.0}}.get(walking, {}).get(walking_level, 0.75)
    season_fit = _season_fit(candidate, constraints)
    trip_length_fit = _trip_length_fit(candidate, constraints)
    party_fit = _party_fit(candidate, profile)
    accessibility_fit = _accessibility_fit(candidate, profile)

    budget = _text(constraints.get("budgetLevel")) or "mixed"
    item_budget = _text(experience.get("budgetLevel")) or "medium"
    budget_band = {"backpacker": "low", "comfort": "medium", "luxury": "high"}.get(budget, budget)
    if budget_band == "mixed" or item_budget == "mixed":
        budget_fit = 0.85
    else:
        budget_distance = abs({"low": 0, "medium": 1, "high": 2}.get(budget_band, 1) - {"low": 0, "medium": 1, "high": 2}.get(item_budget, 1))
        budget_fit = {0: 1.0, 1: 0.72, 2: 0.45}.get(budget_distance, 0.65)

    avoid = _unique_strings(constraints.get("avoid")) + _unique_strings(profile.get("avoidInterests"))
    avoid_penalty = 0.0 if not any(_matches_term(candidate, term) for term in avoid) else 1.0
    feedback_penalty = 0.0
    feedback_boost = 0.0
    for feedback in constraints.get("recentFeedback", []) if isinstance(constraints.get("recentFeedback"), list) else []:
        if not isinstance(feedback, dict) or feedback.get("action") not in {"accept", "complete", "reject", "replace"}:
            continue
        item_key = _text(feedback.get("itemKey"))
        reason = _text(feedback.get("reason"))
        if item_key.endswith(_text(candidate.get("placeId"))) or _text(candidate.get("name")) in item_key:
            if feedback.get("action") == "accept" or feedback.get("action") == "complete":
                feedback_boost += 0.18
            else:
                feedback_penalty += 0.45
        elif "crowd" in reason and _text(experience.get("crowdLevel")) == "high":
            feedback_penalty += 0.15
        elif "walk" in reason and walking_level == "high":
            feedback_penalty += 0.15

    score = max(0.0, round(
        0.27 * interest_fit
        + 0.16 * pace_fit
        + 0.13 * walking_fit
        + 0.13 * budget_fit
        + 0.12 * season_fit
        + 0.08 * trip_length_fit
        + 0.06 * party_fit
        + 0.05 * accessibility_fit
        + feedback_boost
        - avoid_penalty
        - feedback_penalty,
        4,
    ))
    breakdown = {
        "interestFit": round(interest_fit, 3),
        "paceFit": round(pace_fit, 3),
        "walkingFit": round(walking_fit, 3),
        "budgetFit": round(budget_fit, 3),
        "seasonFit": round(season_fit, 3),
        "tripLengthFit": round(trip_length_fit, 3),
        "partyFit": round(party_fit, 3),
        "accessibilityFit": round(accessibility_fit, 3),
        "avoidPenalty": round(avoid_penalty, 3),
        "feedbackPenalty": round(feedback_penalty, 3),
        "feedbackBoost": round(feedback_boost, 3),
    }
    return {**candidate, "plannerScore": score, "scoreBreakdown": breakdown, "experienceTags": sorted(tags)}


def rank_candidates(candidates: list[dict[str, Any]], profile: dict[str, Any], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    avoid = _unique_strings(constraints.get("avoid")) + _unique_strings(profile.get("avoidInterests"))
    ranked = [score_candidate(candidate, profile, constraints) for candidate in candidates if not any(_matches_term(candidate, term) for term in avoid)]
    return sorted(ranked, key=lambda candidate: (-float(candidate["plannerScore"]), str(candidate.get("name", ""))))


def select_diverse_recommendations(ranked: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    """Return high-fit suggestions without filling the list with one city or theme."""
    selected: list[dict[str, Any]] = []
    seen_cities: set[str] = set()
    seen_kinds: set[str] = set()
    for candidate in ranked:
        profile = candidate.get("experienceProfile") or {}
        destination = profile.get("destinationProfile", {}) if isinstance(profile, dict) else {}
        kind = _text(destination.get("destinationKind")) if isinstance(destination, dict) else ""
        city = _text(candidate.get("city"))
        if len(selected) < limit and (city not in seen_cities or kind not in seen_kinds):
            selected.append(candidate)
            seen_cities.add(city)
            if kind:
                seen_kinds.add(kind)
        if len(selected) >= limit:
            return selected
    return selected


def _parse_time(value: Any) -> int | None:
    raw = str(value or "")
    try:
        parsed = datetime.strptime(raw, "%H:%M")
    except ValueError:
        return None
    return parsed.hour * 60 + parsed.minute


def validate_generated_days(days: Any, trip: Any, candidates: list[dict[str, Any]], constraints: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Validate model output against requested cities, places, time, and daily limits."""
    errors: list[str] = []
    warnings: list[str] = []
    expected_days = (trip.end_date - trip.start_date).days + 1
    candidate_by_id = {str(item["placeId"]): item for item in candidates}
    allowed_cities = {_text(city) for city in trip.cities}
    max_activities = int(constraints.get("maxActivitiesPerDay", 3))
    wake_time = _parse_time(constraints.get("wakeTime"))
    sleep_time = _parse_time(constraints.get("sleepTime"))
    seen_days: set[int] = set()
    used_places: set[str] = set()
    validated: list[dict[str, Any]] = []

    if not isinstance(days, list):
        return [], {"passed": False, "errors": ["days must be a list"], "warnings": [], "expectedDays": expected_days}
    if not candidates:
        errors.append("no grounded knowledge candidates available")

    for raw_day in days:
        if not isinstance(raw_day, dict):
            errors.append("day must be an object")
            continue
        try:
            day_number = int(raw_day.get("day"))
        except (TypeError, ValueError):
            errors.append("day number is invalid")
            continue
        city = str(raw_day.get("city", "")).strip()
        if day_number < 1 or day_number > expected_days:
            errors.append(f"day {day_number} is outside the trip")
        if _text(city) not in allowed_cities:
            errors.append(f"unrequested city: {city}")
        if day_number in seen_days:
            errors.append(f"duplicate day: {day_number}")
        seen_days.add(day_number)
        raw_activities = raw_day.get("activities")
        if not isinstance(raw_activities, list):
            errors.append(f"day {day_number} activities is invalid")
            continue
        if len(raw_activities) > max_activities:
            errors.append(f"day {day_number} exceeds {max_activities} activities")

        previous_end = -1
        activities: list[dict[str, Any]] = []
        for raw_activity in raw_activities:
            if not isinstance(raw_activity, dict):
                errors.append(f"day {day_number} contains an invalid activity")
                continue
            place_id = str(raw_activity.get("placeId", ""))
            candidate = candidate_by_id.get(place_id)
            if candidate is None:
                errors.append(f"unknown place ID on day {day_number}")
                continue
            if _text(candidate.get("city")) != _text(city):
                errors.append(f"place city mismatch for {candidate['name']} on day {day_number}")
            if place_id in used_places:
                errors.append(f"duplicate place across itinerary: {candidate['name']}")
            used_places.add(place_id)
            start = _parse_time(raw_activity.get("startTime"))
            if start is None:
                errors.append(f"invalid start time on day {day_number}")
                continue
            try:
                duration = int(raw_activity.get("durationMinutes"))
            except (TypeError, ValueError):
                duration = 0
            if duration < 15 or duration > 720:
                errors.append(f"invalid duration for {candidate['name']}")
                continue
            if wake_time is not None and start < wake_time:
                errors.append(f"activity starts before wake time on day {day_number}")
            if sleep_time is not None and start + duration > sleep_time and (wake_time is None or sleep_time >= wake_time):
                errors.append(f"activity ends after sleep time on day {day_number}")
            if start < previous_end:
                errors.append(f"overlapping activities on day {day_number}")
            previous_end = start + duration
            activities.append(
                {
                    **raw_activity,
                    "placeId": place_id,
                    "placeName": candidate["name"],
                    "durationMinutes": duration,
                    "status": raw_activity.get("status", "planned"),
                }
            )
        validated.append({"day": day_number, "city": city, "activities": activities})

    included = {place_id for place_id in used_places}
    for required in _unique_strings(constraints.get("mustInclude")):
        if not any(_matches_term(candidate_by_id[place_id], required) for place_id in included if place_id in candidate_by_id):
            errors.append(f"required place not included: {required}")

    if len(seen_days) < expected_days:
        errors.append(f"plan contains {len(seen_days)} of {expected_days} days")
    validated.sort(key=lambda day: day["day"])
    result = {"passed": not errors, "errors": errors, "warnings": warnings, "expectedDays": expected_days}
    return validated, result


def fallback_days(trip: Any, ranked_candidates: list[dict[str, Any]], profile: dict[str, Any], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    """Produce a grounded, low-risk plan when the model provider is unavailable."""
    expected_days = (trip.end_date - trip.start_date).days + 1
    max_activities = int(constraints.get("maxActivitiesPerDay", 3))
    if _text(profile.get("pace")) == "relaxed":
        max_activities = min(max_activities, 2)
    wake_time = _parse_time(profile.get("wakeTime")) or 9 * 60
    sleep_time = _parse_time(profile.get("sleepTime"))
    by_city: dict[str, list[dict[str, Any]]] = {}
    for candidate in ranked_candidates:
        by_city.setdefault(_text(candidate.get("city")), []).append(candidate)
    used: set[str] = set()
    assigned_cities = [trip.cities[min(len(trip.cities) - 1, index * len(trip.cities) // max(1, expected_days))] for index in range(expected_days)]
    city_day_counts: dict[str, int] = {}
    for assigned_city in assigned_cities:
        city_day_counts[_text(assigned_city)] = city_day_counts.get(_text(assigned_city), 0) + 1
    city_day_seen: dict[str, int] = {}
    days: list[dict[str, Any]] = []
    for index in range(expected_days):
        city = assigned_cities[index]
        city_key = _text(city)
        city_day_seen[city_key] = city_day_seen.get(city_key, 0) + 1
        city_candidates = [item for item in by_city.get(_text(city), []) if str(item["placeId"]) not in used]
        required = _unique_strings(constraints.get("mustInclude"))
        required_choices = [item for item in city_candidates if any(_matches_term(item, term) for term in required)]
        choices = required_choices + [item for item in city_candidates if item not in required_choices]
        remaining_days = city_day_counts[city_key] - city_day_seen[city_key] + 1
        target_activities = min(max_activities, max(1, (len(city_candidates) + remaining_days - 1) // remaining_days)) if city_candidates else 0
        activities: list[dict[str, Any]] = []
        cursor = max(9 * 60, wake_time)
        for candidate in choices[:target_activities]:
            start = cursor
            experience = candidate.get("experienceProfile") or {}
            if not isinstance(experience, dict):
                experience = {}
            duration = max(15, min(720, int(experience.get("durationMinutes", 90))))
            if sleep_time is not None and sleep_time >= wake_time and start + duration > sleep_time:
                break
            used.add(str(candidate["placeId"]))
            activities.append(
                {
                    "startTime": f"{start // 60:02d}:{start % 60:02d}",
                    "placeId": str(candidate["placeId"]),
                    "placeName": candidate["name"],
                    "durationMinutes": duration,
                    "reason": "Grounded place selected for your stated interests and pace.",
                    "bookingRequired": bool(experience.get("bookingRequired", False)),
                    "status": "planned",
                }
            )
            # Preserve a realistic transfer/rest buffer and guarantee that the
            # deterministic fallback never creates overlapping activities.
            cursor = start + duration + 30
        days.append({"day": index + 1, "date": (trip.start_date + (date.resolution * index)).isoformat(), "city": city, "activities": activities})
    return days
