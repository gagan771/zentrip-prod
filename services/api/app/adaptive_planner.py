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
    "preferredRegions": [],
}

# Traveller-facing city names are not stable: users say Bombay while the KB may
# use Mumbai, and Bangalore while the catalog uses Bengaluru.  Keep this map at
# the planning boundary so SQL retrieval, ranking, and validation agree on the
# same place instead of silently dropping otherwise valid candidates.
_CITY_ALIASES = {
    "bombay": "mumbai",
    "calcutta": "kolkata",
    "cochin": "kochi",
    "madras": "chennai",
    "bangalore": "bengaluru",
    "mysore": "mysuru",
    "poona": "pune",
    "baroda": "vadodara",
    "trivandrum": "thiruvananthapuram",
    "benares": "varanasi",
    "banaras": "varanasi",
    "allahabad": "prayagraj",
    "chhatrapati sambhajinagar": "chhatrapati sambhajinagar",
    "aurangabad": "chhatrapati sambhajinagar",
    "udagamandalam": "udagamandalam",
    "ooty": "udagamandalam",
}


def canonical_city(value: Any) -> str:
    """Normalize common Indian city aliases for matching, not for display."""
    normalized = re.sub(r"\s+", " ", _text(value)).strip()
    return _CITY_ALIASES.get(normalized, normalized)


def cities_match(left: Any, right: Any) -> bool:
    return canonical_city(left) == canonical_city(right)


def city_variants(value: Any) -> set[str]:
    """Return SQL-friendly spellings for a user-supplied city."""
    raw = re.sub(r"\s+", " ", _text(value)).strip()
    canonical = canonical_city(raw)
    return {
        spelling
        for spelling, target in {**_CITY_ALIASES, canonical: canonical}.items()
        if target == canonical
    } | {raw, canonical}


def allocate_city_days(cities: list[str], expected_days: int) -> list[str]:
    """Allocate contiguous route days in the requested city order."""
    if expected_days <= 0 or not cities:
        return []
    base, extra = divmod(expected_days, len(cities))
    allocation: list[str] = []
    for index, city in enumerate(cities):
        allocation.extend([city] * (base + (1 if index < extra else 0)))
    return allocation


def build_route_skeleton(trip: Any, ranked_candidates: list[dict[str, Any]], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a deterministic route/activity scaffold for the LLM to fill."""
    expected_days = (trip.end_date - trip.start_date).days + 1
    max_activities = int(constraints.get("maxActivitiesPerDay", 3))
    if _text((constraints.get("profile") or {}).get("pace")) == "relaxed":
        max_activities = min(max_activities, 2)
    sequence = allocate_city_days(list(trip.cities), expected_days)
    used: set[str] = set()
    skeleton: list[dict[str, Any]] = []
    for day_number, city in enumerate(sequence, start=1):
        available = [
            item for item in ranked_candidates
            if cities_match(item.get("city"), city) and str(item.get("placeId")) not in used
        ]
        choices = available[:max_activities]
        used.update(str(item.get("placeId")) for item in choices)
        previous_city = sequence[day_number - 2] if day_number > 1 else None
        route_key = f"{canonical_city(previous_city)}>{canonical_city(city)}" if previous_city else None
        route = (constraints.get("routeContext") or {}).get(route_key) if route_key else None
        skeleton.append(
            {
                "day": day_number,
                "city": city,
                "candidatePlaceIds": [str(item.get("placeId")) for item in choices],
                "maxActivities": max_activities,
                "maxDailyTravelMinutes": int(constraints.get("maxDailyTravelMinutes", 240)),
                "emptyBecauseNoReviewedCandidates": not bool(available),
                "incomingRoute": route,
            }
        )
    return skeleton

_INTEREST_KEYWORDS = {
    "culture": ("culture", "temple", "mandir", "museum", "heritage", "palace", "festival", "art", "arts"),
    "history": ("history", "fort", "qila", "monument", "tomb", "stupa", "archaeological"),
    "architecture": ("architecture", "palace", "fort", "mosque", "temple", "caves"),
    "food": ("food", "khana", "market", "cuisine", "restaurant", "langar", "street", "coffee", "tea"),
    "nature": ("nature", "prakriti", "park", "lake", "garden", "wildlife", "waterfall", "valley", "forest"),
    "wildlife": ("wildlife", "jangal", "safari", "rhino", "tiger", "lion", "mangrove"),
    "adventure": ("trek", "adventure", "safari", "rafting", "mountain", "pahad", "parvat", "desert", "cave"),
    "spiritual": ("temple", "mandir", "gurdwara", "gurudwara", "church", "mosque", "pilgrimage", "ashram"),
    "shopping": ("market", "bazaar", "shopping", "craft", "textile", "artisan"),
    "beach": ("beach", "coast", "coastal", "island", "marine", "sea", "samundar", "samudra", "sagar", "tat"),
    "wellness": ("wellness", "yoga", "ashram", "spa", "slow travel", "relax"),
    "photography": ("photo", "photography", "sunset", "sunrise", "viewpoint", "scenic"),
    "quiet": ("quiet", "peaceful", "uncrowded", "less crowded", "slow"),
}

_INTEREST_TAG_ALIASES = {
    "heritage": {"heritage", "history", "architecture", "monument", "archaeology"},
    "history": {"heritage", "history", "architecture", "monument", "archaeology"},
    "architecture": {"architecture", "heritage", "history", "monument"},
    "beach": {"beach", "coast", "coastal", "island", "marine"},
    "coast": {"beach", "coast", "coastal", "island", "marine"},
    "nature": {"nature", "wildlife", "forest", "lake", "waterfall", "mountains"},
    "wildlife": {"wildlife", "nature", "safari", "forest"},
    "adventure": {"adventure", "trekking", "trek", "mountains", "rafting"},
    "spiritual": {"spiritual", "temple", "pilgrimage", "ashram", "gurdwara", "church", "mosque"},
    "food": {"food", "cuisine", "culinary", "market", "restaurant", "tea", "coffee"},
    "shopping": {"shopping", "craft", "textile", "artisan", "market"},
    "quiet": {"quiet", "peaceful", "uncrowded", "slow travel", "wellness"},
    "slow travel": {"slow travel", "quiet", "peaceful", "wellness"},
}

_REGION_HINTS = {
    "North": ("north india", "north indian", "north", "uttar bharat", "uttar india"),
    "South": ("south india", "south indian", "south", "dakshin bharat", "dakshin india"),
    "East": ("east india", "east indian", "east", "purv bharat", "purvi india"),
    "West": ("west india", "west indian", "west", "pashchim bharat", "paschim india"),
    "Central": ("central india", "central indian", "central"),
    "North East": ("north east india", "northeast india", "north east", "northeast"),
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


def _keyword_pattern(keyword: str) -> str:
    """Match a phrase and common English plural forms without substring false positives."""
    parts = keyword.split()
    if not parts:
        return r"(?!)"
    last = re.escape(parts[-1]) + r"(?:s|es)?"
    return rf"(?<!\w){re.escape(' '.join(parts[:-1]) + (' ' if len(parts) > 1 else ''))}{last}(?!\w)"


def _positive_keyword(statements: str, keyword: str) -> bool:
    """Match a preference only when nearby language does not negate it."""
    for match in re.finditer(_keyword_pattern(keyword), statements):
        index = match.start()
        prefix = statements[max(0, index - 28):index]
        suffix = statements[match.end():match.end() + 16]
        negation = r"(?:not|don't|dont|avoid|no|without|dislike|hate|nahi|nahin)"
        if not re.search(rf"\b{negation}\b", prefix) and not re.match(rf"\s*{negation}\b", suffix):
            return True
    return False


def merge_profile(profile: dict[str, Any] | None, preference_statements: list[str] | None = None) -> dict[str, Any]:
    """Merge structured preferences with explicit legacy preference statements."""
    merged = {**DEFAULT_PROFILE, **(profile or {})}
    for key in ("interests", "transportPreferences", "accessibility", "foodPreferences"):
        merged[key] = _unique_strings(merged.get(key))
    merged["preferredRegions"] = [
        item for item in _unique_strings(merged.get("preferredRegions"))
        if item.title() in _REGION_HINTS
    ]

    statements = " ".join(_text(item) for item in (preference_statements or []))
    interest_terms = set(merged["interests"])
    avoid_terms = set(_unique_strings(merged.get("avoidInterests")))
    for interest, keywords in _INTEREST_KEYWORDS.items():
        if any(_positive_keyword(statements, keyword) for keyword in keywords):
            interest_terms.add(interest)
        elif any(re.search(_keyword_pattern(keyword), statements) for keyword in keywords):
            avoid_terms.add(interest)
    merged["interests"] = sorted(interest_terms)
    merged["avoidInterests"] = sorted(avoid_terms)
    regions = set(merged["preferredRegions"])
    non_compound_region_statements = re.sub(r"\bnorth[\s-]?east\b", " ", statements)
    for region, hints in _REGION_HINTS.items():
        source = statements if region == "North East" else non_compound_region_statements
        if any(_positive_keyword(source, hint) for hint in hints):
            regions.add(region)
    merged["preferredRegions"] = sorted(regions)

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
        if any(re.search(_keyword_pattern(keyword), corpus) for keyword in keywords):
            tags.add(interest)
    return tags


def _explicit_tags(candidate: dict[str, Any]) -> set[str]:
    """Return only editorial tags; free-text inference is kept out of hard fit checks."""
    profile = candidate.get("experienceProfile") or {}
    if not isinstance(profile, dict):
        return set()
    destination = profile.get("destinationProfile", {})
    tags = {_text(item) for item in profile.get("tags", [])}
    if isinstance(destination, dict):
        tags.update(_text(item) for item in destination.get("tags", []))
        kind = _text(destination.get("destinationKind"))
        if kind:
            tags.add(kind)
    return tags


def _interest_matches(interest: str, tags: set[str]) -> bool:
    normalized = _text(interest)
    aliases = _INTEREST_TAG_ALIASES.get(normalized, {normalized})
    return bool(aliases & tags)


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
    weather_preference = _text(constraints.get("weatherPreference"))
    if not month:
        if not weather_preference:
            return 0.75
        experience = candidate.get("experienceProfile") or {}
        destination = experience.get("destinationProfile", {}) if isinstance(experience, dict) else {}
        season_text = " ".join(
            [*(destination.get("bestSeasons", []) if isinstance(destination, dict) else []), experience.get("seasonality", "")]
        ).casefold()
        preference_terms = {
            "monsoon": ("monsoon", "rain"),
            "winter": ("winter", "snow", "december", "january", "february"),
            "summer": ("summer", "may", "june"),
        }.get(weather_preference, (weather_preference,))
        return 1.0 if any(term in season_text for term in preference_terms) else 0.55
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


def _region_fit(candidate: dict[str, Any], profile: dict[str, Any]) -> float:
    requested = {item.title() for item in _unique_strings(profile.get("preferredRegions"))}
    if not requested:
        return 0.75
    destination = ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
    actual = {str(destination.get("region", "")).title(), str(destination.get("state", "")).title()}
    return 1.0 if requested & actual else 0.3


def _freshness_fit(candidate: dict[str, Any]) -> float:
    """Prefer candidates whose operational observations are still current."""
    operational = ((candidate.get("experienceProfile") or {}).get("operational") or {})
    if not isinstance(operational, dict) or not operational:
        return 0.85
    stale_count = sum(
        1 for value in operational.values()
        if isinstance(value, dict) and value.get("stale") is True
    )
    return max(0.4, 1.0 - 0.2 * stale_count)


def _matches_term(candidate: dict[str, Any], term: str) -> bool:
    needle = _text(term)
    if not needle:
        return False
    aliases = candidate.get("aliases") if isinstance(candidate.get("aliases"), list) else []
    corpus = f"{candidate.get('placeId', '')} {candidate.get('name', '')} {candidate.get('fact', '')} {' '.join(str(alias) for alias in aliases)}".casefold()
    return bool(re.search(_keyword_pattern(needle), corpus)) or needle in _inferred_tags(candidate)


def score_candidate(candidate: dict[str, Any], profile: dict[str, Any], constraints: dict[str, Any]) -> dict[str, Any]:
    """Return a transparent score; higher is a better experience fit."""
    experience = candidate.get("experienceProfile") or {}
    if not isinstance(experience, dict):
        experience = {}
    interests = set(_unique_strings(profile.get("interests")))
    tags = _inferred_tags(candidate)
    explicit_tags = _explicit_tags(candidate)
    matched_interests = sum(_interest_matches(interest, explicit_tags) for interest in interests)
    # Editorial tags are authoritative for preference fit. Text-derived tags
    # remain useful for explanations and avoid/must-include matching, but must
    # not promote a place merely because a broad word appears in its fact.
    interest_fit = 0.55 if not interests else min(1.0, 0.35 + 0.65 * matched_interests / max(1, len(interests)))

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
    region_fit = _region_fit(candidate, profile)
    freshness_fit = _freshness_fit(candidate)

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
        0.20 * interest_fit
        + 0.15 * pace_fit
        + 0.13 * walking_fit
        + 0.13 * budget_fit
        + 0.12 * season_fit
        + 0.08 * trip_length_fit
        + 0.06 * party_fit
        + 0.05 * accessibility_fit
        + 0.06 * region_fit
        + 0.02 * freshness_fit
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
        "regionFit": round(region_fit, 3),
        "freshnessFit": round(freshness_fit, 3),
        "avoidPenalty": round(avoid_penalty, 3),
        "feedbackPenalty": round(feedback_penalty, 3),
        "feedbackBoost": round(feedback_boost, 3),
    }
    return {**candidate, "plannerScore": score, "scoreBreakdown": breakdown, "experienceTags": sorted(tags)}


def rank_candidates(candidates: list[dict[str, Any]], profile: dict[str, Any], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    avoid = _unique_strings(constraints.get("avoid")) + _unique_strings(profile.get("avoidInterests"))
    eligible = [candidate for candidate in candidates if not any(_matches_term(candidate, term) for term in avoid)]
    requested_regions = {item.title() for item in _unique_strings(profile.get("preferredRegions"))}
    if requested_regions:
        regional = [
            candidate for candidate in eligible
            if _region_fit(candidate, profile) >= 1.0
        ]
        # Regional intent is hard only when the catalog can satisfy it. This
        # keeps emerging or sparse regions useful instead of returning nothing.
        if regional:
            eligible = regional
    requested_interests = set(_unique_strings(profile.get("interests")))
    if requested_interests:
        interest_matched = [
            candidate for candidate in eligible
            if any(_interest_matches(interest, _explicit_tags(candidate)) for interest in requested_interests)
        ]
        # Explicit interests are hard when the reviewed catalog can satisfy
        # them; sparse or newly introduced interests still degrade gracefully.
        if interest_matched:
            eligible = interest_matched
    requested_accessibility = set(_unique_strings(profile.get("accessibility")))
    if requested_accessibility & {"wheelchair", "step_free", "step-free", "mobility"}:
        accessible = [
            candidate for candidate in eligible
            if _accessibility_fit(candidate, profile) >= 0.65
        ]
        # Accessibility is a safety constraint when the reviewed catalog can
        # satisfy it, but sparse catalogs still degrade gracefully.
        if accessible:
            eligible = accessible
    ranked = [score_candidate(candidate, profile, constraints) for candidate in eligible]
    return sorted(ranked, key=lambda candidate: (-float(candidate["plannerScore"]), str(candidate.get("name", ""))))


_RERANK_STOP_WORDS = {
    "and", "are", "best", "can", "for", "from", "give", "have", "help", "how", "india",
    "in", "me", "near", "of", "please", "should", "suggest", "the", "to", "trip", "want", "with",
}


def rerank_candidates(candidates: list[dict[str, Any]], query: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    """Apply a transparent lexical relevance pass after preference scoring.

    This is the local reranker seam: production can replace this function with a
    cross-encoder or managed reranker without changing candidate contracts. The
    current implementation rewards exact entity/tag matches and keeps the
    planner score as the dominant signal.
    """
    terms = [
        token for token in re.findall(r"[a-z0-9]+", _text(query))
        if len(token) >= 3 and token not in _RERANK_STOP_WORDS
    ]
    unique_terms = list(dict.fromkeys(terms))
    reranked: list[dict[str, Any]] = []
    for candidate in candidates:
        experience = candidate.get("experienceProfile") or {}
        destination = experience.get("destinationProfile") or {} if isinstance(experience, dict) else {}
        aliases = candidate.get("aliases") if isinstance(candidate.get("aliases"), list) else []
        tags = set(_inferred_tags(candidate))
        if isinstance(destination, dict):
            tags.update(_text(tag) for tag in destination.get("tags", []) if tag)
        name = _text(candidate.get("name"))
        corpus = " ".join(
            [name, _text(candidate.get("city")), _text(candidate.get("fact")), *(_text(alias) for alias in aliases)]
        )
        matched = sum(1 for term in unique_terms if term in corpus or any(term in tag for tag in tags))
        exact_name = sum(1 for term in unique_terms if re.search(rf"\b{re.escape(term)}\b", name))
        tag_matches = sum(1 for term in unique_terms if any(term in tag or tag in term for tag in tags))
        relevance = min(1.0, (matched / max(1, len(unique_terms))) * 0.55 + min(1.0, exact_name / 2) * 0.3 + min(1.0, tag_matches / 2) * 0.15)
        planner_score = float(candidate.get("plannerScore", 0.0))
        query_score = round(0.82 * planner_score + 0.18 * relevance, 4)
        reranked.append({
            **candidate,
            "plannerScore": query_score,
            "scoreBreakdown": {**(candidate.get("scoreBreakdown") or {}), "queryRelevance": round(relevance, 3)},
        })
    reranked.sort(key=lambda candidate: (-float(candidate["plannerScore"]), str(candidate.get("name", ""))))
    return reranked[:limit] if limit is not None else reranked


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


_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _operational_schedule(candidate: dict[str, Any]) -> tuple[int, int, set[int], bool, bool]:
    """Read only explicit operational hours; sunrise/sunset remains advisory."""
    experience = candidate.get("experienceProfile") or {}
    operational = experience.get("operational") or {} if isinstance(experience, dict) else {}
    hours = operational.get("hours") if isinstance(operational, dict) else None
    if not isinstance(hours, dict):
        return 0, 24 * 60, set(), False, False
    schedule = _text(hours.get("schedule"))
    clock_times = [int(hour) * 60 + int(minute) for hour, minute in re.findall(r"(?<!\d)(\d{1,2}):(\d{2})", schedule)]
    explicit_window = len(clock_times) >= 2
    opening, closing = (clock_times[0], clock_times[1]) if explicit_window else (0, 24 * 60)
    closures: set[int] = set()
    for day_name, weekday in _WEEKDAYS.items():
        if day_name in _text(" ".join(hours.get("weeklyClosure", []) if isinstance(hours.get("weeklyClosure"), list) else [])):
            closures.add(weekday)
    return opening, closing, closures, explicit_window, bool(hours.get("stale") or hours.get("conflict"))


def _weather_block(candidate: dict[str, Any], constraints: dict[str, Any]) -> str | None:
    """Return a hard closure message only for explicitly supplied live alerts."""
    alerts = constraints.get("weatherAlerts")
    if not isinstance(alerts, dict):
        return None
    city = canonical_city(candidate.get("city"))
    alert = alerts.get(city) or alerts.get(str(candidate.get("city", "")))
    if not isinstance(alert, dict) or not alert.get("closed"):
        return None
    return str(alert.get("message") or f"weather closure reported for {candidate.get('city')}")


_GROUNDING_STOP_WORDS = {
    "a", "an", "and", "at", "best", "by", "day", "for", "from", "in", "is", "it",
    "of", "on", "the", "this", "to", "trip", "visit", "your", "with",
}


def _reason_is_grounded(reason: str, candidate: dict[str, Any]) -> bool:
    """Allow only reasons supported by the selected record or safe planning language."""
    tokens = {
        token for token in re.findall(r"[a-z0-9]+", _text(reason))
        if len(token) >= 3 and token not in _GROUNDING_STOP_WORDS
    }
    if not tokens:
        return True
    experience = candidate.get("experienceProfile") or {}
    destination = experience.get("destinationProfile", {}) if isinstance(experience, dict) else {}
    corpus_parts = [candidate.get("name", ""), candidate.get("fact", ""), *sorted(_inferred_tags(candidate))]
    if isinstance(destination, dict):
        corpus_parts.extend([destination.get("destinationKind", ""), *destination.get("tags", [])])
    supported = {
        token for token in re.findall(r"[a-z0-9]+", _text(" ".join(str(part) for part in corpus_parts)))
        if len(token) >= 3
    }
    safe_planning_terms = {
        "accessible", "afternoon", "based", "balanced", "because", "calm", "chosen", "culture",
        "early", "evening", "family", "fit", "food", "good", "heritage", "interest", "interests",
        "leisure", "match", "matches", "morning", "nature", "option", "pace", "photography",
        "preference", "preferences", "relaxed", "selected", "shopping", "slow", "spiritual", "stated",
        "travel", "traveler", "travellers", "wildlife",
    }
    return tokens <= (supported | safe_planning_terms)


def validate_generated_days(days: Any, trip: Any, candidates: list[dict[str, Any]], constraints: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Validate model output against requested cities, places, time, and daily limits."""
    errors: list[str] = []
    warnings: list[str] = []
    expected_days = (trip.end_date - trip.start_date).days + 1
    candidate_by_id = {str(item["placeId"]): item for item in candidates}
    allowed_cities = {canonical_city(city) for city in trip.cities}
    expected_city_sequence = allocate_city_days(list(trip.cities), expected_days)
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
        if canonical_city(city) not in allowed_cities:
            errors.append(f"unrequested city: {city}")
        elif 1 <= day_number <= expected_days and expected_city_sequence[day_number - 1] and not cities_match(city, expected_city_sequence[day_number - 1]):
            errors.append(
                f"day {day_number} is out of route order: expected {expected_city_sequence[day_number - 1]}"
            )
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
        day_cost = 0
        for raw_activity in raw_activities:
            if not isinstance(raw_activity, dict):
                errors.append(f"day {day_number} contains an invalid activity")
                continue
            place_id = str(raw_activity.get("placeId", ""))
            candidate = candidate_by_id.get(place_id)
            if candidate is None:
                errors.append(f"unknown place ID on day {day_number}")
                continue
            if not cities_match(candidate.get("city"), city):
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
            activity_date = trip.start_date + (date.resolution * (day_number - 1))
            opening, closing, closures, explicit_window, hours_uncertain = _operational_schedule(candidate)
            if activity_date.weekday() in closures:
                errors.append(f"{candidate['name']} is closed on {activity_date.strftime('%A')}")
            elif explicit_window and (start < opening or start + duration > closing):
                errors.append(f"{candidate['name']} is outside reviewed opening hours on day {day_number}")
            if hours_uncertain:
                warnings.append(f"opening hours for {candidate['name']} are stale or conflicting; verify before visiting")
            weather_message = _weather_block(candidate, constraints)
            if weather_message:
                errors.append(f"weather restriction for {candidate['name']}: {weather_message}")
            try:
                travel_minutes = int(raw_activity.get("travelMinutes", 0) or 0)
            except (TypeError, ValueError):
                travel_minutes = -1
            if travel_minutes < 0:
                errors.append(f"invalid travel time for {candidate['name']}")
                travel_minutes = 0
            activity = {
                **raw_activity,
                "placeId": place_id,
                "placeName": candidate["name"],
                "durationMinutes": duration,
                "travelMinutes": travel_minutes,
                "status": raw_activity.get("status", "planned"),
            }
            try:
                estimated_cost = int(raw_activity.get("estimatedCostINR", 0) or 0)
            except (TypeError, ValueError):
                estimated_cost = -1
            if estimated_cost < 0:
                errors.append(f"invalid estimated cost for {candidate['name']}")
                estimated_cost = 0
            if not estimated_cost:
                profile = candidate.get("experienceProfile") or {}
                ticketing = ((profile.get("operational") or {}).get("ticketing") or {}) if isinstance(profile, dict) else {}
                candidate_cost = profile.get("estimatedCostINR") if isinstance(profile, dict) else None
                candidate_cost = candidate_cost or ticketing.get("priceINR")
                if isinstance(candidate_cost, (int, float)):
                    estimated_cost = max(0, int(candidate_cost))
            activity["estimatedCostINR"] = estimated_cost
            day_cost += estimated_cost
            # Carry claim-level provenance onto each activity so the client can
            # explain why a place was selected without reconstructing the
            # planner's retrieval pool.
            for key in ("claimId", "sourceUrl", "lastVerified", "confidence"):
                value = candidate.get(key)
                if value is not None:
                    activity_key = {
                        "claimId": "sourceClaimId",
                        "sourceUrl": "sourceUrl",
                        "lastVerified": "lastVerified",
                        "confidence": "confidence",
                    }[key]
                    activity[activity_key] = value
            candidate_requires_booking = bool((candidate.get("experienceProfile") or {}).get("bookingRequired", False))
            if candidate_requires_booking and not bool(raw_activity.get("bookingRequired", False)):
                warnings.append(f"booking flag restored for {candidate['name']} from reviewed knowledge")
            activity["bookingRequired"] = candidate_requires_booking or bool(raw_activity.get("bookingRequired", False))
            reason = str(raw_activity.get("reason", "")).strip()
            if reason and not _reason_is_grounded(reason, candidate):
                warnings.append(f"day {day_number} reason was replaced because it was not grounded in the selected place")
                activity["reason"] = "Selected from reviewed knowledge for your trip preferences."
            activities.append(
                activity
            )
        max_daily_travel = constraints.get("maxDailyTravelMinutes")
        if max_daily_travel is not None:
            try:
                max_daily_travel = int(max_daily_travel)
            except (TypeError, ValueError):
                max_daily_travel = None
        if max_daily_travel is not None and sum(int(item.get("travelMinutes", 0)) for item in activities) > max_daily_travel:
            errors.append(f"day {day_number} exceeds max daily travel time")
        daily_budget = constraints.get("dailyBudget")
        if daily_budget is not None:
            try:
                daily_budget = int(daily_budget)
            except (TypeError, ValueError):
                daily_budget = None
        if daily_budget is not None and day_cost > daily_budget:
            errors.append(f"day {day_number} exceeds daily budget")
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
    assigned_cities = allocate_city_days(list(trip.cities), expected_days)
    city_day_counts: dict[str, int] = {}
    for assigned_city in assigned_cities:
        city_day_counts[_text(assigned_city)] = city_day_counts.get(_text(assigned_city), 0) + 1
    city_day_seen: dict[str, int] = {}
    days: list[dict[str, Any]] = []
    for index in range(expected_days):
        city = assigned_cities[index]
        city_key = _text(city)
        city_day_seen[city_key] = city_day_seen.get(city_key, 0) + 1
        city_candidates = [
            item for item in ranked_candidates
            if cities_match(item.get("city"), city) and str(item["placeId"]) not in used
        ]
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
            ticketing = ((experience.get("operational") or {}).get("ticketing") or {})
            candidate_cost = experience.get("estimatedCostINR") or ticketing.get("priceINR")
            activities.append(
                {
                    "startTime": f"{start // 60:02d}:{start % 60:02d}",
                    "placeId": str(candidate["placeId"]),
                    "placeName": candidate["name"],
                    "durationMinutes": duration,
                    "travelMinutes": 0,
                    "estimatedCostINR": int(candidate_cost) if isinstance(candidate_cost, (int, float)) else 0,
                    "reason": "Grounded place selected for your stated interests and pace.",
                    "bookingRequired": bool(experience.get("bookingRequired", False)),
                    "status": "planned",
                    "sourceClaimId": candidate.get("claimId"),
                    "sourceUrl": candidate.get("sourceUrl"),
                    "lastVerified": candidate.get("lastVerified"),
                    "confidence": candidate.get("confidence"),
                }
            )
            # Preserve a realistic transfer/rest buffer and guarantee that the
            # deterministic fallback never creates overlapping activities.
            cursor = start + duration + 30
        days.append({"day": index + 1, "date": (trip.start_date + (date.resolution * index)).isoformat(), "city": city, "activities": activities})
    return days
