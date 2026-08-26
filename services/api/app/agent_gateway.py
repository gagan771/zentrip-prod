"""
The Agent Gateway, per 01-zentrip-companion.md §6:

    User -> Agent Gateway -> Context Builder -> Intent Router -> Policy Engine
         -> Orchestrator (tools / RAG / live providers) -> Response Engine

Phase 1 scope (00-engineering-phase-roadmap.md): the loop and its tool-use *skeleton*
are wired end to end, with session memory in Redis (the first of the three memory
tiers from 01-zentrip-companion.md §3). No real tools (search_transport, open_service,
etc.) are bound yet — those arrive with the features that implement them. The intent
classifier below is deliberately simple keyword matching: the spec's own ranking
philosophy (§47) is "start with rules, then learn," and an agent gateway is no different.
"""

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.comparison_service import find_known_locations
from app.knowledge_service import search_published_claims
from app.llm import LLMNotConfiguredError, LLMProviderError
from app.models import Trip, TripMemoryNote, User, UserPreference
from app.redis_client import redis

SESSION_TTL = timedelta(hours=2)

INTENT_KEYWORDS: dict[str, list[str]] = {
    "trip_planning": ["plan", "itinerary", "trip", "days in", "visit"],
    "compare": [
        "cheapest", "fastest", "compare", "train", "flight", "bus", "cab",
        # Stay search shares the "compare" intent (see _compare_reply) — same
        # category per 03-compare-decision-engine.md, not a separate tool.
        "hostel", "hotel", "where to stay", "place to stay", "accommodation",
    ],
    "translation": ["translate", "say in", "menu", "what does this mean"],
    "guide": ["what is this", "what am i looking at", "history of", "tell me about"],
    "payment": ["pay", "upi", "atm", "cash", "credit card", "debit card", "rupees", "wallet"],
    "services": ["need", "buy", "grocery", "toothpaste", "charger", "deliver"],
    "safety": ["scam", "help", "emergency", "lost my", "unsafe"],
    "community": ["events tonight", "what's happening", "meetup"],
    "buddy": ["travel buddy", "group to", "find people"],
}

# Policy tiers per 01-zentrip-companion.md §6 / master spec §43.
NO_CONFIRMATION_INTENTS = {"guide", "payment", "translation", "compare", "community", "chat"}
CONFIRMATION_INTENTS = {"trip_planning", "services", "buddy"}
STRONG_VERIFICATION_INTENTS = {"safety"}


@dataclass
class AgentReply:
    intent: str
    policy_tier: str
    reply: str
    confidence: str  # "estimated" | "live" | "verified" — see 00-consolidated-tech-stack.md §4
    citations: list[dict]
    # Structured hand-off payload for "services" — the parsed shopping-list items, so a
    # client can pre-fill the grocery screen instead of re-parsing the spoken reply text.
    # Empty for every other intent.
    items: list[str] = field(default_factory=list)


def classify_intent(text: str) -> str:
    lowered = text.lower()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return intent
    return "chat"


def tag_policy(intent: str) -> str:
    if intent in STRONG_VERIFICATION_INTENTS:
        return "strong_verification"
    if intent in CONFIRMATION_INTENTS:
        return "confirmation"
    return "no_confirmation"


async def build_context(user: User, db: AsyncSession | None = None) -> dict:
    """
    Context Builder, per 01-zentrip-companion.md §2/§3 — only loads what's permissioned,
    across the three memory tiers: profile fields always; trip memory (most recent notes
    on the user's latest trip) and long-term preference memory (active, non-superseded)
    when a db session is available. Session memory (Redis) is handled separately by
    load_session_messages/append_session_message — it's conversation turns, not durable
    facts, so it doesn't belong in this dict.

    No reply function reads tripMemory/preferences yet — there's no real LLM tool-use
    loop to hand them to (see module docstring: Phase 1 scope is keyword routing, not
    Claude tool-calling). This wires the read path for real so that loop has something
    to consume once it exists, instead of leaving the tiers unimplemented until then.
    """
    context: dict = {
        "userId": str(user.id),
        "name": user.name,
        "language": user.language,
        "country": user.country,
        "tripMemory": [],
        "preferences": [],
    }
    if db is None:
        return context

    trip = (
        await db.execute(select(Trip).where(Trip.user_id == user.id).order_by(Trip.created_at.desc()).limit(1))
    ).scalar_one_or_none()
    if trip is not None:
        notes = (
            await db.execute(
                select(TripMemoryNote)
                .where(TripMemoryNote.trip_id == trip.id)
                .order_by(TripMemoryNote.created_at.desc())
                .limit(10)
            )
        ).scalars().all()
        context["tripMemory"] = [note.note for note in reversed(notes)]

    preferences = (
        await db.execute(
            select(UserPreference)
            .where(UserPreference.user_id == user.id, UserPreference.superseded_at.is_(None))
            .order_by(UserPreference.created_at.desc())
        )
    ).scalars().all()
    context["preferences"] = [preference.statement for preference in preferences]
    return context


def _no_tool_reply(intent: str) -> str:
    if intent == "chat":
        return "I hear you. I don't have a specific tool wired for that yet, but I'm listening."
    return (
        f"I understood this as a '{intent}' request. The real tool for that isn't connected yet — "
        f"it lands in a later engineering phase (see 00-engineering-phase-roadmap.md). "
        f"For now this just confirms the routing works."
    )


async def _session_key(user_id: uuid.UUID) -> str:
    return f"zentrip:session:{user_id}"


async def load_session_messages(user_id: uuid.UUID) -> list[dict]:
    raw = await redis.get(await _session_key(user_id))
    return json.loads(raw) if raw else []


async def append_session_message(user_id: uuid.UUID, role: str, text: str) -> None:
    key = await _session_key(user_id)
    messages = await load_session_messages(user_id)
    messages.append({"role": role, "text": text})
    await redis.set(key, json.dumps(messages[-20:]), ex=int(SESSION_TTL.total_seconds()))


_STAY_KEYWORDS = ("hostel", "hotel", "stay", "accommodation")


async def _stay_reply(db: AsyncSession, user: User, city: str) -> tuple[str, str, list[dict]]:
    # Local import for the same reason as run_compare below.
    from app.routers.compare import run_stay_search

    check_in = date.today() + timedelta(days=1)
    check_out = check_in + timedelta(days=2)
    response = await run_stay_search(
        db, user, city=city, check_in=check_in, check_out=check_out, budget_level="backpacker"
    )
    if not response.results:
        return (response.message, "estimated", [])

    top = response.results[0]
    reply = (
        f"For {city}, the top demo stay is {top.provider} ({top.stayType}): ₹{top.pricePerNight}/night, "
        f"{top.rating}/5 rating, {top.distanceToCenterKm} km from the center. {response.message}"
    )
    return reply, "estimated", []


async def _compare_reply(db: AsyncSession, user: User, text: str) -> tuple[str, str, list[dict]]:
    # Local import: app.routers.compare doesn't import this module, but importing it
    # at module load time would run FastAPI router registration before app.main is
    # ready for it. Deferring to call time keeps agent_gateway importable standalone.
    from app.routers.compare import run_compare

    lowered = text.lower()
    codes = find_known_locations(text)
    wants_stay = any(keyword in lowered for keyword in _STAY_KEYWORDS)

    if wants_stay and codes:
        return await _stay_reply(db, user, codes[0])

    if len(codes) < 2:
        if codes:
            return (
                f"I can compare demo transport fares between two of Delhi, Agra, and Jaipur, or find a "
                f"demo place to stay in one of them. Did you mean a place to stay in {codes[0]}, or a "
                f"route to/from it?",
                "estimated",
                [],
            )
        return (
            "I can compare demo fares or stays for Delhi, Agra, and Jaipur right now. Tell me which two "
            "you're travelling between, or which one you want a place to stay in — for example "
            "'cheapest way from Delhi to Agra' or 'cheap hostel in Jaipur'.",
            "estimated",
            [],
        )

    origin, destination = codes[0], codes[1]
    departure_date = date.today() + timedelta(days=1)
    response = await run_compare(
        db,
        user,
        origin=origin,
        destination=destination,
        departure_date=departure_date,
        budget_level="backpacker",
    )
    if not response.results:
        return (response.message, "estimated", [])

    top = response.results[0]
    reply = (
        f"For {origin} to {destination} tomorrow, the top demo option is {top.provider} ({top.mode}): "
        f"₹{top.totalPrice} total, about {top.durationMinutes} minutes. {response.message}"
    )
    return reply, "estimated", []


async def _trip_reply(db: AsyncSession, user: User) -> tuple[str, str, list[dict]]:
    # Local import for the same reason as _compare_reply above.
    from app.routers.trips import regenerate_itinerary

    trip = (
        await db.execute(select(Trip).where(Trip.user_id == user.id).order_by(Trip.created_at.desc()).limit(1))
    ).scalar_one_or_none()
    if trip is None:
        return (
            "I don't have a trip started for you yet. Create one with your destination cities and "
            "dates first, then ask me to plan it.",
            "estimated",
            [],
        )

    try:
        new_days, _candidates = await regenerate_itinerary(db, trip)
    except LLMNotConfiguredError:
        return (
            "I can't generate an itinerary right now — the trip-planning model isn't configured "
            "on the backend yet.",
            "estimated",
            [],
        )
    except LLMProviderError:
        return ("I hit an error generating your itinerary just now. Try again in a moment.", "estimated", [])

    first_day = new_days[0] if new_days else None
    summary = ""
    if first_day is not None:
        names = ", ".join(a.get("name", "") for a in first_day.activities[:3] if a.get("name"))
        summary = f" Day 1 in {first_day.city}: {names}."
    reply = f"I've planned your {len(new_days)}-day trip.{summary} Check the Trip tab for the full itinerary."

    # Deterministic trip-memory write-back (source="system") — not LLM-inferred, so it
    # doesn't need the opt-in gate that free-text preference writes require. This is the
    # write half of the trip-memory tier build_context reads from above.
    db.add(
        TripMemoryNote(
            trip_id=trip.id,
            user_id=user.id,
            note=f"Itinerary regenerated for {', '.join(trip.cities)} ({len(new_days)} days).",
            source="system",
        )
    )
    await db.commit()
    # "estimated", not "verified" — this is LLM-synthesized itinerary text, only
    # partially grounded in cited KB claims, not a direct citation lookup like Guide.
    return reply, "estimated", []


_SERVICE_LEAD_INS = (
    "i need to buy ", "i need ", "i want ", "need to buy ", "can you get me ", "can you buy me ",
    "buy me ", "get me ", "please get ", "please buy ",
)
_SERVICE_LEAD_ARTICLES = re.compile(r"^(a|an|the|some)\s+")
_SERVICE_SPLIT = re.compile(r",|\band\b|&")


def _extract_service_items(text: str) -> list[str]:
    """Deterministic heuristic extraction, not real NLU — matches the spirit of
    find_known_locations above (§47's "start with rules, then learn"). Strips a
    known lead-in phrase, then splits on and/,/& — good enough for the traveler
    persona's actual phrasing ("I need toothpaste and a USB-C charger"), not a
    general-purpose parser.
    """
    lowered = text.strip().lower()
    for lead_in in _SERVICE_LEAD_INS:
        if lowered.startswith(lead_in):
            lowered = lowered[len(lead_in):]
            break

    items: list[str] = []
    for part in _SERVICE_SPLIT.split(lowered):
        cleaned = part.strip().strip(".!?")
        cleaned = _SERVICE_LEAD_ARTICLES.sub("", cleaned)
        if cleaned:
            items.append(cleaned)
    return items


def _services_reply(text: str) -> tuple[str, str, list[dict], list[str]]:
    """Per 01-zentrip-companion.md §9: "I need toothpaste and a charger" routes here,
    classified as services, then hands to `open_service`. There's no real tool-calling
    loop yet (see module docstring), so this returns the parsed item list as structured
    data (AgentReply.items) instead of a tool call — the client is expected to read
    that list and open the grocery screen with it pre-filled, per
    05-india-services-layer-grocery-integration.md's flow. Whether the client actually
    does that yet is a separate, not-yet-wired piece of work.
    """
    items = _extract_service_items(text)
    if not items:
        return (
            "Tell me what you need, like 'I need toothpaste and a USB-C charger,' and I'll open "
            "grocery hand-off for those items.",
            "estimated",
            [],
            [],
        )
    item_list = ", ".join(items)
    reply = (
        f"Got it — {item_list}. I can open Blinkit, Flipkart Minutes, Zepto, or Swiggy Instamart to "
        f"search for those. Confirm to continue."
    )
    return reply, "estimated", [], items


async def _guide_reply(db: AsyncSession, text: str) -> tuple[str, str, list[dict]]:
    rows = await search_published_claims(db, query=text, limit=2)
    if not rows:
        return (
            "I don't have a reviewed source for that yet. Ask me about a landmark in Delhi, Agra, or Jaipur, or try another name.",
            "estimated",
            [],
        )

    spoken_facts: list[str] = []
    citations: list[dict] = []
    for claim, entity, source in rows:
        spoken_facts.append(f"{entity.name}: {claim.claim}")
        citations.append(
            {
                "sourceName": source.name,
                "sourceUrl": source.source_url,
                "sourceLocator": claim.source_locator,
                "lastVerified": claim.last_verified,
                "confidence": claim.confidence,
            }
        )
    return " ".join(spoken_facts), "verified", citations


async def handle_message(user: User, text: str, db: AsyncSession | None = None) -> AgentReply:
    intent = classify_intent(text)
    policy_tier = tag_policy(intent)
    context = await build_context(user, db)  # noqa: F841 — real read path now; see build_context's docstring

    await append_session_message(user.id, "user", text)
    items: list[str] = []
    # "payment" reuses the guide's citation-first KB lookup rather than its own function —
    # per 18-payment-assistance.md, it's "just a content category," not a separate service.
    if intent in ("guide", "payment") and db is not None:
        reply_text, confidence, citations = await _guide_reply(db, text)
    elif intent == "compare" and db is not None:
        reply_text, confidence, citations = await _compare_reply(db, user, text)
    elif intent == "trip_planning" and db is not None:
        reply_text, confidence, citations = await _trip_reply(db, user)
    elif intent == "services":
        reply_text, confidence, citations, items = _services_reply(text)
    else:
        reply_text = _no_tool_reply(intent)
        confidence = "estimated"
        citations = []
    await append_session_message(user.id, "assistant", reply_text)

    return AgentReply(
        intent=intent, policy_tier=policy_tier, reply=reply_text, confidence=confidence, citations=citations, items=items
    )


async def handle_voice_turn(user: User, transcript: str, db: AsyncSession) -> AgentReply:
    """Voice-first entrypoint; transcript text never becomes a chat UI contract."""
    return await handle_message(user, transcript, db)
