"""Keyword intent router and lightweight slot parser for Zenny.

The spec ranking philosophy (01-zentrip-companion.md §47) is "start with rules, then
learn." Guide is ordered before trip_planning so "when to visit Hampi" is not stolen
by the word "visit".
"""

from __future__ import annotations

import re

INTENT_KEYWORDS: dict[str, list[str]] = {
    # Safety FIRST: "I need help, I feel unsafe" also contains services' "need".
    "safety": ["scam", "scams", "help me", "help, i", "emergency", "lost my", "unsafe", "in danger"],
    "recommendation": [
        "recommend", "recommendation", "suggest", "where should i go", "where should i travel",
        "best places", "best destination", "offbeat", "hidden gem", "beach holiday", "weekend getaway",
    ],
    "app_help": [
        "can i book", "book a train", "book train", "does zentrip", "what features",
        "what can zentrip", "what can this app", "how does booking work", "do you take payment",
        "can you book", "app feature", "what does the app do",
    ],
    "guide": [
        "what is this", "what am i looking at", "history of", "tell me about",
        "monument", "temple", "fort", "palace", "tomb", "caves", "stupa",
        "weather", "season", "when to visit", "best time", "sunset", "sunrise", "viewpoint",
        "how far", "distance", "hidden", "quiet", "food street", "bazaar", "langar",
        "food belt", "cafe street", "permit", "altitude", "dunes", "wagah",
        "ferry", "beach", "how long to", "best sunset",
        "gopuram", "sarovar", "charbagh", "diwan", "ratha", "stupa",
        "safari", "falls", "monastery", "stepwell",
        "open", "closed", "opening", "hours", "timing", "currently",
    ],
    "trip_planning": [
        "plan", "itinerary", "trip", "days in", "visit",
        "what should i do", "what do i do today", "on my plan", "today's plan",
    ],
    "compare": [
        "cheapest", "fastest", "compare", "train", "flight", "bus", "cab",
        "hostel", "hotel", "where to stay", "place to stay", "accommodation",
    ],
    "translation": ["translate", "say in", "menu", "what does this mean"],
    "payment": ["pay", "upi", "atm", "cash", "credit card", "debit card", "rupees", "wallet"],
    "services": ["need", "buy", "grocery", "toothpaste", "charger", "deliver"],
    "community": ["events tonight", "what's happening", "meetup"],
    "buddy": ["travel buddy", "travel buddies", "find buddies", "find people", "join for"],
}

_PHRASEBOOK_LANGUAGES = (
    "hindi", "punjabi", "gujarati", "marathi", "bengali",
    "tamil", "telugu", "kannada", "malayalam",
)

_TRANSLATION_PHRASE_HINTS = ("thank you", "thanks", "how much", "toilet", "bathroom",
                             "expensive", "vegetarian")


def _mentions_phrasebook_language(text: str) -> bool:
    lowered = text.lower()
    return any(f"in {lang}" in lowered or f"to {lang}" in lowered for lang in _PHRASEBOOK_LANGUAGES)


def classify_intent(text: str) -> str:
    lowered = text.lower()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return intent
    if _mentions_phrasebook_language(text) and any(hint in lowered for hint in _TRANSLATION_PHRASE_HINTS):
        return "translation"
    return "chat"


_BUDGET_LEVELS = {
    "backpacker": ("backpacker", "budget", "cheap", "affordable", "low cost"),
    "comfort": ("comfort", "comfortable", "midrange", "mid-range"),
    "luxury": ("luxury", "luxurious", "premium", "splurge", "five star", "5 star"),
}
_TRANSPORT_HINTS = {
    "train": ("train", "rail", "railway"),
    "flight": ("flight", "fly", "airline", "airport"),
    "bus": ("bus", "volvo"),
    "cab": ("cab", "taxi", "car", "driver"),
    "metro": ("metro", "subway"),
}
_FOOD_HINTS = {
    "vegetarian": ("vegetarian", "veg", "shakahari"),
    "vegan": ("vegan",),
    "halal": ("halal",),
    "jain": ("jain",),
}
_ACCESSIBILITY_HINTS = {
    "wheelchair": ("wheelchair", "wheel chair"),
    "step-free": ("step free", "step-free", "no stairs"),
    "mobility": ("mobility", "limited walking", "less walking"),
}


def parse_travel_slots(text: str) -> dict:
    """Extract bounded, explainable travel slots for retrieval and planning.

    This is deliberately not an LLM parser: slots are hints, never authorization
    to invent facts. Unknown or ambiguous values are omitted so the planner can
    ask a follow-up question or use its safe defaults.
    """
    lowered = " ".join(str(text or "").casefold().split())
    result: dict = {"profile": {}, "constraints": {}, "confidence": {}}

    duration = re.search(r"\b(\d{1,2})\s*(?:day|days|night|nights|din|raat)\b", lowered)
    if duration:
        days = max(1, min(60, int(duration.group(1))))
        result["constraints"]["tripDays"] = days
        result["confidence"]["tripDays"] = "high"

    budget_amount = re.search(r"(?:₹|rs\.?|inr\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\b", lowered)
    if budget_amount:
        amount = float(budget_amount.group(1).replace(",", ""))
        suffix = budget_amount.group(2) or ""
        if suffix == "k" or suffix == "thousand":
            amount *= 1000
        elif suffix in {"lakh", "lac"}:
            amount *= 100000
        result["constraints"]["dailyBudget"] = max(0, min(10_000_000, int(amount)))
        result["confidence"]["dailyBudget"] = "medium"

    for level, hints in _BUDGET_LEVELS.items():
        if any(hint in lowered for hint in hints):
            result["constraints"]["budgetLevel"] = level
            result["confidence"]["budgetLevel"] = "medium"
            break

    result["profile"]["transportPreferences"] = [
        key for key, hints in _TRANSPORT_HINTS.items() if any(hint in lowered for hint in hints)
    ]
    result["profile"]["foodPreferences"] = [
        key for key, hints in _FOOD_HINTS.items() if any(hint in lowered for hint in hints)
    ]
    result["profile"]["accessibility"] = [
        key for key, hints in _ACCESSIBILITY_HINTS.items() if any(hint in lowered for hint in hints)
    ]
    if any(term in lowered for term in ("monsoon", "rainy", "rain")):
        result["constraints"]["weatherPreference"] = "monsoon"
    elif any(term in lowered for term in ("snow", "winter", "cold")):
        result["constraints"]["weatherPreference"] = "winter"
    elif any(term in lowered for term in ("summer", "hot")):
        result["constraints"]["weatherPreference"] = "summer"
    if result["constraints"].get("weatherPreference"):
        result["confidence"]["weatherPreference"] = "medium"

    # Empty arrays are noise in the downstream profile and make telemetry less
    # readable, so omit them while keeping the response shape stable.
    result["profile"] = {key: value for key, value in result["profile"].items() if value}
    return result


_BACKCHANNELS = {
    "ok",
    "okay",
    "k",
    "yeah",
    "yes",
    "yep",
    "yup",
    "uh huh",
    "uhhuh",
    "mm",
    "mmm",
    "hmm",
    "hm",
    "right",
    "sure",
    "got it",
    "thanks",
    "thank you",
    "cool",
    "alright",
    "all right",
    "go on",
    "continue",
}


def is_backchannel(text: str) -> bool:
    compact = " ".join("".join(ch if ch.isalnum() or ch.isspace() else " " for ch in text.lower()).split())
    return compact in _BACKCHANNELS
