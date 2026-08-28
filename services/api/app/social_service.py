"""Minimal real tools for the `community` and `buddy` intents (specs 08 and 10).

Both are deliberately deterministic, seed-free, and honest about being demos —
the same philosophy as comparison_service's corridor adapters:

- Community: a small curated demo event list for the three corridor cities.
  Implements the one behavior spec 08 calls out explicitly ("stale posters do
  not remain visible"): events past their end_time are filtered out at query
  time, never shown.
- Buddy: deterministic compatibility scoring per 10's V1 weights (date overlap
  25% + destination 20% + budget 15% + travel style 15% + interests 10% +
  starting location 5% + accommodation 5% + other 5%), scored against demo
  groups. Results are aggregated cards only — no personal details pre-consent,
  matching §23.4/§85.
"""

from datetime import date, datetime, timedelta

_CORRIDOR_CITIES = {"delhi", "agra", "jaipur"}


def _demo_events(now: datetime | None = None) -> list[dict]:
    """Curated demo events for the corridor. end_time is computed relative to
    `now` so most entries are live when queried; two are intentionally stale to
    exercise the freshness filter."""
    now = now or datetime.now()
    def at(days_ahead: int, start_hour: int, duration_hours: int) -> tuple[str, str]:
        start = (now + timedelta(days=days_ahead)).replace(
            hour=start_hour, minute=0, second=0, microsecond=0
        )
        end = start + timedelta(hours=duration_hours)
        return start.isoformat(), end.isoformat()

    s1, e1 = at(0, 19, 3)      # tonight
    s2, e2 = at(0, 8, 2)       # this morning
    s3, e3 = at(1, 18, 2)      # tomorrow evening
    s4, e4 = at(-3, 18, 2)     # stale — 3 days ago
    s5, e5 = at(-1, 20, 3)     # stale — yesterday night
    return [
        {"id": "evt_demo_1", "city": "Jaipur", "title": "Rooftop Acoustic Jam Night",
         "venue": "Hostel Mewar rooftop", "category": "music", "startTime": s1, "endTime": e1,
         "source": "venue_verified", "verificationStatus": "verified"},
        {"id": "evt_demo_2", "city": "Delhi", "title": "Hauz Khas Heritage Walk",
         "venue": "Hauz Khas village entrance", "category": "heritage-walk", "startTime": s2, "endTime": e2,
         "source": "organizer_verified", "verificationStatus": "verified"},
        {"id": "evt_demo_3", "city": "Agra", "title": "Backpackers' Meena Bazaar Trip",
         "venue": "Sadar Bazaar meeting point", "category": "market-walk", "startTime": s3, "endTime": e3,
         "source": "community_reported", "verificationStatus": "pending_review"},
        {"id": "evt_demo_4", "city": "Delhi", "title": "OLD Open-mic at Paharganj",
         "venue": "Paharganj cafe", "category": "music", "startTime": s4, "endTime": e4,
         "source": "community_reported", "verificationStatus": "verified"},
        {"id": "evt_demo_5", "city": "Jaipur", "title": "OLD Sunset photo walk, Amber",
         "venue": "Amber Fort gate", "category": "photography", "startTime": s5, "endTime": e5,
         "source": "venue_verified", "verificationStatus": "verified"},
    ]


def find_tonight_events(text: str, now: datetime | None = None) -> list[dict]:
    """Events for a mentioned corridor city (or all corridor cities if none).
    Stale events (end_time in the past) are hidden — spec 08 §21's explicit
    'stale posters do not remain visible' requirement."""
    lowered = text.lower()
    city = next((c for c in _CORRIDOR_CITIES if c in lowered), None)
    now = now or datetime.now()
    events = [e for e in _demo_events(now) if datetime.fromisoformat(e["endTime"]) > now]
    if city:
        events = [e for e in events if e["city"].lower() == city]
    return sorted(events, key=lambda e: e["startTime"])


def stay_context(city: str, check_in: date, check_out: date, stay_type: str) -> list[str]:
    """Return privacy-safe aggregate context for a stay recommendation.

    This deliberately returns event titles and member counts only. It never exposes
    another traveller's identity, profile, or booking record before consent.
    """
    if stay_type != "hostel":
        return []

    signals: list[str] = []
    events = find_tonight_events(city)
    if events:
        event = events[0]
        signals.append(f"A current community event is listed in {city}: {event['title']}.")

    normalized_city = city.casefold()
    group_count = 0
    member_count = 0
    for group in _DEMO_GROUPS:
        overlap = max(check_in, group["startDate"]) <= min(check_out, group["endDate"])
        if group["destination"] == normalized_city and overlap and group["accommodation"] == "hostels":
            group_count += 1
            member_count += group["members"]
    if group_count:
        signals.append(f"{member_count} members across {group_count} upcoming group(s) prefer hostels in {city}.")
    return signals


# ---------------------------------------------------------------------------
# Buddy matchmaking — deterministic V1 score per 10-travel-buddy-group-matchmaking.md
# ---------------------------------------------------------------------------

# Demo groups: destination, date range, budget band (INR), style, interests,
# starting location, accommodation preference.
_DEMO_GROUPS: list[dict] = [
    {
        "id": "grp_spiti_oct", "name": "Spiti Circuit October", "members": 5,
        "destination": "spiti", "startDate": date(2026, 10, 12), "endDate": date(2026, 10, 19),
        "budgetBand": (18000, 22000), "style": "backpacking", "interests": ["photography", "trekking"],
        "startLocation": "delhi", "accommodation": "hostels",
    },
    {
        "id": "grp_jaipur_wknd", "name": "Jaipur Weekend Wanderers", "members": 3,
        "destination": "jaipur", "startDate": date(2026, 9, 12), "endDate": date(2026, 9, 14),
        "budgetBand": (8000, 12000), "style": "relaxed", "interests": ["food", "photography"],
        "startLocation": "delhi", "accommodation": "hostels",
    },
    {
        "id": "grp_jaipur_oct", "name": "Jaipur Golden Triangle Hostels", "members": 6,
        "destination": "jaipur", "startDate": date(2026, 10, 8), "endDate": date(2026, 10, 16),
        "budgetBand": (7000, 14000), "style": "backpacking", "interests": ["architecture", "food"],
        "startLocation": "delhi", "accommodation": "hostels",
    },
    {
        "id": "grp_agra_daytrip", "name": "Agra Day-Trip Crew", "members": 4,
        "destination": "agra", "startDate": date(2026, 9, 5), "endDate": date(2026, 9, 6),
        "budgetBand": (4000, 7000), "style": "fast-paced", "interests": ["history"],
        "startLocation": "delhi", "accommodation": "any",
    },
]

_WEIGHTS = {
    "dates": 25, "destination": 20, "budget": 15, "style": 15,
    "interests": 10, "startLocation": 5, "accommodation": 5,
}


def _parse_budget(text: str) -> tuple[int, int] | None:
    import re

    numbers = [int(n.replace(",", "")) for n in re.findall(r"(?:₹|rs\.?\s?)?(\d{1,3}(?:,\d{3})|\d{3,6})(?:k\b)?", text.lower())]
    scaled = [n * 1000 if n < 1000 and ("k" in text.lower() or "000" not in str(n)) else n for n in numbers]
    if len(scaled) >= 2:
        return (min(scaled[:2]), max(scaled[:2]))
    if len(scaled) == 1:
        return (0, scaled[0])
    return None


def score_buddy_match(request: dict, group: dict) -> int:
    """Deterministic compatibility score (0-100) using exactly the V1 weights
    from 10-travel-buddy-group-matchmaking.md §23.3."""
    score = 0

    # Dates: overlap fraction of the shorter window × weight.
    req_start, req_end = request.get("startDate"), request.get("endDate")
    if req_start and req_end:
        overlap_start = max(req_start, group["startDate"])
        overlap_end = min(req_end, group["endDate"])
        if overlap_end >= overlap_start:
            req_days = max((req_end - req_start).days, 1)
            grp_days = max((group["endDate"] - group["startDate"]).days, 1)
            overlap_days = (overlap_end - overlap_start).days + 1
            score += int(_WEIGHTS["dates"] * overlap_days / min(req_days, grp_days))
    elif request.get("month") == group["startDate"].strftime("%B").lower():
        score += int(_WEIGHTS["dates"] * 0.5)

    if request.get("destination") == group["destination"]:
        score += _WEIGHTS["destination"]

    req_band = request.get("budgetBand")
    if req_band:
        lo = max(req_band[0], group["budgetBand"][0])
        hi = min(req_band[1], group["budgetBand"][1])
        if hi >= lo:
            score += _WEIGHTS["budget"]

    if request.get("style") == group["style"]:
        score += _WEIGHTS["style"]

    shared = set(request.get("interests", [])) & set(group["interests"])
    all_interests = set(request.get("interests", [])) | set(group["interests"])
    if all_interests:
        # Jaccard similarity of interests, scaled to the 10-point weight.
        score += int(_WEIGHTS["interests"] * len(shared) / len(all_interests))

    if request.get("startLocation") == group["startLocation"]:
        score += _WEIGHTS["startLocation"]
    if request.get("accommodation") in (None, group["accommodation"], "any"):
        score += _WEIGHTS["accommodation"]

    return min(score, 100)


def find_buddy_matches(request: dict) -> list[dict]:
    """Aggregated cards only — never personal details pre-consent (§23.4)."""
    matches = []
    for group in _DEMO_GROUPS:
        matches.append({
            "groupId": group["id"],
            "name": group["name"],
            "destination": group["destination"].capitalize(),
            "dateRange": f"{group['startDate'].strftime('%b %d')}–{group['endDate'].strftime('%b %d')}",
            "members": group["members"],
            "budgetBand": f"₹{group['budgetBand'][0]:,}–₹{group['budgetBand'][1]:,}",
            "style": group["style"],
            "interests": ", ".join(group["interests"]),
            "compatibility": score_buddy_match(request, group),
        })
    return sorted(matches, key=lambda m: m["compatibility"], reverse=True)


def parse_buddy_request(text: str, today: date | None = None) -> dict:
    """Conversational parse of the match dimensions we can detect from rules —
    same 'start with rules, then learn' philosophy as find_known_locations."""
    import re

    lowered = text.lower()
    today = today or date.today()

    destination = None
    for candidate in ("spiti", "jaipur", "agra", "delhi", "manali", "rishikesh"):
        if candidate in lowered:
            destination = candidate
            break

    month = None
    month_match = re.search(r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b", lowered)
    if month_match:
        month = month_match.group(1)

    style = "relaxed" if any(w in lowered for w in ("slow", "chill", "relaxed")) else (
        "fast-paced" if any(w in lowered for w in ("fast", "packed")) else None
    )
    interests = [i for i in ("photography", "trekking", "food", "history") if i in lowered]
    accommodation = "hostels" if "hostel" in lowered else ("hotel" if "hotel" in lowered else None)

    return {
        "destination": destination,
        "month": month,
        "style": style,
        "interests": interests,
        "accommodation": accommodation,
        "startLocation": "delhi" if "delhi" in lowered else None,
        "budgetBand": _parse_budget(lowered),
    }
