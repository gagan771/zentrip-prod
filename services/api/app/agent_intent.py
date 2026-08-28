"""Keyword intent router for Zenny — kept import-light so tests do not spin Redis.

The spec ranking philosophy (01-zentrip-companion.md §47) is "start with rules, then
learn." Guide is ordered before trip_planning so "when to visit Hampi" is not stolen
by the word "visit".
"""

INTENT_KEYWORDS: dict[str, list[str]] = {
    # Safety FIRST: "I need help, I feel unsafe" also contains services' "need".
    "safety": ["scam", "scams", "help me", "help, i", "emergency", "lost my", "unsafe", "in danger"],
    "recommendation": [
        "recommend", "recommendation", "suggest", "where should i go", "where should i travel",
        "best places", "best destination", "offbeat", "hidden gem", "beach holiday", "weekend getaway",
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
    ],
    "trip_planning": ["plan", "itinerary", "trip", "days in", "visit"],
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
