"""
The Agent Gateway, per 01-zentrip-companion.md §6:

    User -> Agent Gateway -> Context Builder -> Intent Router -> Policy Engine
         -> Orchestrator (tools / RAG / live providers) -> Response Engine

The loop and its tool-use skeleton are wired end to end, with session memory in Redis
(the first of the three memory tiers from 01-zentrip-companion.md §3). Corridor tools
are deterministic and source-aware; live providers remain explicit integration seams.
The intent classifier below is deliberately simple keyword matching: the spec's own
ranking philosophy (§47) is "start with rules, then learn," and an agent gateway is no different.
"""

import asyncio
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_intent import classify_intent, is_backchannel
from app.adaptive_planner import merge_profile, rank_candidates, select_diverse_recommendations
from app.comparison_service import find_known_locations
from app.knowledge_learning import record_knowledge_interaction
from app.knowledge_service import search_published_claims
from app.llm import LLMNotConfiguredError, LLMProviderError
from app.phrasebook import _translation_reply
from app.models import RiskPattern, TravelerProfile, Trip, TripMemoryNote, User, UserPreference
from app.redis_client import redis
from app.social_service import find_buddy_matches, find_tonight_events, parse_buddy_request
from app.spoken import spoken_preview

SESSION_TTL = timedelta(hours=2)

# Policy tiers per 01-zentrip-companion.md §6 / master spec §43.
NO_CONFIRMATION_INTENTS = {"guide", "recommendation", "payment", "translation", "compare", "community", "chat"}
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
    interaction_id: uuid.UUID | None = None


def tag_policy(intent: str) -> str:
    if intent in STRONG_VERIFICATION_INTENTS:
        return "strong_verification"
    if intent in CONFIRMATION_INTENTS:
        return "confirmation"
    return "no_confirmation"


async def build_context(user: User, db: AsyncSession | None = None, trip_id: uuid.UUID | None = None) -> dict:
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
        "travelerProfile": {},
        "tripContext": None,
    }
    if db is None:
        return context

    trip_query = select(Trip).where(Trip.user_id == user.id)
    if trip_id is not None:
        trip_query = trip_query.where(Trip.id == trip_id)
    else:
        trip_query = trip_query.order_by(Trip.created_at.desc()).limit(1)
    trip = (await db.execute(trip_query)).scalar_one_or_none()
    if trip is not None:
        context["tripContext"] = {
            "cities": trip.cities,
            "startDate": trip.start_date.isoformat(),
            "endDate": trip.end_date.isoformat(),
            "budgetLevel": trip.budget_level,
        }
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
    traveler_profile = await db.scalar(select(TravelerProfile).where(TravelerProfile.user_id == user.id))
    context["travelerProfile"] = traveler_profile.preferences if traveler_profile else {}
    return context


async def _recommendation_reply(db: AsyncSession, text: str, context: dict | None = None) -> tuple[str, str, list[dict]]:
    """Recommend diverse Indian destinations from the same cited candidate pool as planning."""
    from app.routers.trips import _load_candidate_places

    candidates = await _load_candidate_places(db, None)
    preference_statements = list((context or {}).get("preferences", []))
    profile = merge_profile((context or {}).get("travelerProfile") or {}, [text, *preference_statements])
    lowered = text.casefold()
    budget = "luxury" if any(term in lowered for term in ("luxury", "premium", "splurge")) else "backpacker" if any(term in lowered for term in ("cheap", "budget", "backpack")) else "mixed"
    trip_days = None
    duration_match = re.search(r"\b(\d+)\s*day", lowered)
    if duration_match:
        trip_days = int(duration_match.group(1))
    trip_context = (context or {}).get("tripContext") or {}
    travel_month = date.today().month
    if trip_context.get("startDate"):
        try:
            travel_month = date.fromisoformat(trip_context["startDate"]).month
        except ValueError:
            pass
    ranked = rank_candidates(
        candidates,
        profile,
        {
            "budgetLevel": trip_context.get("budgetLevel") or budget,
            "tripDays": trip_days or ((date.fromisoformat(trip_context["endDate"]) - date.fromisoformat(trip_context["startDate"])).days + 1 if trip_context.get("startDate") and trip_context.get("endDate") else None),
            "travelMonth": travel_month,
            "avoid": ["crowded"] if "avoid crowd" in lowered else [],
        },
    )
    selected = select_diverse_recommendations(ranked, limit=5)
    if not selected:
        return "I don't have enough reviewed destination data for that request yet. Try a theme such as heritage, beaches, wildlife, food, wellness, or mountains.", "estimated", []

    lines: list[str] = []
    citations: list[dict] = []
    for item in selected[:3]:
        tags = ", ".join(item.get("experienceTags", [])[:3]) or "India travel"
        breakdown = item.get("scoreBreakdown", {})
        season_note = "good seasonal fit" if breakdown.get("seasonFit", 0) >= 0.9 else "check seasonal conditions"
        lines.append(f"{item['name']} ({item['city']}) — {tags}; {season_note}. {item['fact']}")
        citations.append(
            {
                "sourceName": item.get("source", "Zentrip reviewed source"),
                "sourceUrl": item.get("sourceUrl"),
                "sourceLocator": None,
                "lastVerified": date.fromisoformat(item["lastVerified"]) if item.get("lastVerified") else None,
                "confidence": item.get("confidence", "estimated"),
            }
        )
    confidence = "verified" if all(item.get("confidence") == "verified" for item in selected[:3]) else "estimated"
    return "My strongest matches for you are: " + " ".join(lines) + " Ask for a tighter shortlist if you share dates, budget, and whether you prefer cities, coast, mountains, wildlife, or heritage.", confidence, citations


def _no_tool_reply(intent: str) -> str:
    if intent == "chat":
        return (
            "I can suggest Indian destinations, help with monuments and history, trains and cabs, UPI and cash, "
            "safety, translation, groceries, or finding travel buddies. What do you need?"
        )
    return (
        f"I understood this as a {intent.replace('_', ' ')} request. "
        "Try a short question — for example a place name, a route, or what you need to buy."
    )


async def _session_key(user_id: uuid.UUID, session_id: str | None = None) -> str:
    if session_id:
        safe_suffix = re.sub(r"[^a-zA-Z0-9_.:-]", "-", session_id)[:96]
        return f"zentrip:session:{user_id}:{safe_suffix}"
    return f"zentrip:session:{user_id}"


async def load_session_messages(user_id: uuid.UUID, session_id: str | None = None) -> list[dict]:
    raw = await redis.get(await _session_key(user_id, session_id))
    return json.loads(raw) if raw else []


async def append_session_message(user_id: uuid.UUID, role: str, text: str, session_id: str | None = None) -> None:
    key = await _session_key(user_id, session_id)
    messages = await load_session_messages(user_id, session_id)
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
        names = ", ".join(item.displayName for item in response.handoffs[:6]) or "IRCTC, RedBus, Goibibo, MakeMyTrip"
        return (
            f"{response.message} I can open live booking on {names}.",
            "estimated",
            [],
        )

    top = response.results[0]
    live = ", ".join(item.displayName for item in response.handoffs[:5])
    reply = (
        f"For {origin} to {destination}, a typical {top.mode} estimate is about {top.durationMinutes} minutes. "
        f"Live fares are on {live}. Open Compare or Book live to check out on those sites."
    )
    return reply, "estimated", []


async def _trip_reply(
    db: AsyncSession, user: User, trip_id: uuid.UUID | None = None
) -> tuple[str, str, list[dict]]:
    # Local import for the same reason as _compare_reply above.
    from app.routers.trips import regenerate_itinerary

    trip_query = select(Trip).where(Trip.user_id == user.id)
    if trip_id is not None:
        trip_query = trip_query.where(Trip.id == trip_id)
    else:
        trip_query = trip_query.order_by(Trip.created_at.desc()).limit(1)
    trip = (await db.execute(trip_query)).scalar_one_or_none()
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


_EMERGENCY_KEYWORDS = ("emergency", "help me", "i'm in danger", "im in danger", "unsafe", "attack", "ambulance", "police now")


def _is_emergency(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in _EMERGENCY_KEYWORDS)


def _emergency_reply() -> tuple[str, str, list[dict]]:
    """Deterministic, no-retrieval emergency answer — 15-zentrip-guardian-safety.md's
    "if in danger, one tap / one sentence gets the number" requirement. Never depends on
    the KB being seeded or search matching; always speaks the number first."""
    return (
        "If you're in immediate danger, call 112 now — India's single emergency number for "
        "police, fire, and ambulance. For tourist help, call 1363.",
        "verified",
        [
            {
                "sourceName": "Emergency Response Support System (ERSS), Ministry of Home Affairs",
                "sourceUrl": "https://112.gov.in/",
                "sourceLocator": None,
                "lastVerified": None,
                "confidence": "verified",
            },
            {
                "sourceName": "Ministry of Tourism, Government of India — Tourist Infoline",
                "sourceUrl": "https://tourism.gov.in/",
                "sourceLocator": None,
                "lastVerified": None,
                "confidence": "verified",
            },
        ],
    )


async def _guide_reply(db: AsyncSession, text: str, *, limit: int = 8) -> tuple[str, str, list[dict]]:
    rows = await search_published_claims(db, query=text, limit=limit)
    if not rows:
        return (
            "I don't have a reviewed source for that yet. Ask about a major Indian monument, city, "
            "route, season, sunset point, or food street — for example the Taj Mahal, Diwan-i-Khas, "
            "Golden Temple, Hampi, when to visit Jaipur, Delhi to Agra distance, or Mehtab Bagh sunset.",
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


async def _risk_reply(db: AsyncSession, text: str) -> tuple[str, str, list[dict]] | None:
    """Return only published, pattern-based risk entries for a named corridor city."""
    lowered = text.casefold()
    city = next((candidate for candidate in ("Delhi", "Agra", "Jaipur") if candidate.casefold() in lowered), None)
    if not city:
        return None
    rows = list((await db.scalars(
        select(RiskPattern)
        .where(RiskPattern.status == "published", RiskPattern.city.ilike(city))
        .order_by(RiskPattern.last_verified.desc())
        .limit(3)
    )).all())
    if not rows:
        return None
    lines = [f"{row.location_label}: {row.pattern} Recommended action: {row.recommendation}" for row in rows]
    citations = [
        {
            "sourceName": row.source_name,
            "sourceUrl": row.source_url,
            "sourceLocator": row.location_label,
            "lastVerified": row.last_verified,
            "confidence": row.confidence,
        }
        for row in rows
    ]
    return "Risk patterns for " + city + " (confidence and freshness shown in the app): " + " ".join(lines), "estimated", citations


def _community_reply(text: str) -> tuple[str, str, list[dict]]:
    """Per 08-destination-community.md: 'what's happening tonight in <city>?' —
    demo corridor events with stale entries hidden at query time."""
    events = find_tonight_events(text)
    if not events:
        return (
            "I don't have any upcoming verified events on the demo list right now. "
            "Try asking about Delhi, Agra, or Jaipur.",
            "estimated",
            [],
        )
    lines = []
    for event in events[:3]:
        when = datetime.fromisoformat(event["startTime"]).strftime("%A %I:%M %p").lstrip("0")
        freshness = "verified" if event["verificationStatus"] == "verified" else "community-reported"
        lines.append(f"{event['title']} in {event['city']} ({when}, {freshness})")
    return (
        "Here's what's coming up on the demo community board: " + ". ".join(lines) + ".",
        "estimated",
        [],
    )


def _buddy_reply(text: str) -> tuple[str, str, list[dict]]:
    """Per 10-travel-buddy-group-matchmaking.md's V1 deterministic score, against
    demo groups. Aggregated cards only — no personal details pre-consent (§23.4)."""
    request = parse_buddy_request(text)
    matches = find_buddy_matches(request)
    if not matches or matches[0]["compatibility"] <= 0:
        return (
            "Tell me a destination, rough dates, and budget — like 'trekking in Spiti this "
            "October, ₹20k, starting from Delhi' — and I'll find matching demo travel groups.",
            "estimated",
            [],
        )
    top = matches[0]
    others = len([m for m in matches[1:] if m["compatibility"] > 0])
    extra = f" {others} more group{'s' if others != 1 else ''} also matched." if others else ""
    reply = (
        f"Best demo match: {top['name']} — {top['destination']}, {top['dateRange']}, "
        f"{top['members']} members, {top['budgetBand']}, {top['style']}, "
        f"{top['interests']} · Compatibility {top['compatibility']}%.{extra}"
    )
    return reply, "estimated", []


async def handle_message(
    user: User,
    text: str,
    db: AsyncSession | None = None,
    session_id: str | None = None,
    *,
    voice: bool = False,
    trip_id: uuid.UUID | None = None,
) -> AgentReply:
    intent = classify_intent(text)
    policy_tier = tag_policy(intent)
    context = await build_context(user, db, trip_id=trip_id) if db is not None and (not voice or intent == "recommendation") else {"preferences": []}

    if voice:
        asyncio.create_task(append_session_message(user.id, "user", text, session_id))
    else:
        await append_session_message(user.id, "user", text, session_id)
    items: list[str] = []
    # "payment" reuses the guide's citation-first KB lookup rather than its own function —
    # per 18-payment-assistance.md, it's "just a content category," not a separate service.
    # Same for "safety" (15/16): Guardian/emergency/scam content rides this pipeline too,
    # with one addition below — an emergency-keyword fast path that answers first with the
    # 112 number regardless of what else the KB search returns.
    if intent == "recommendation" and db is not None:
        reply_text, confidence, citations = await _recommendation_reply(db, text, context)
    elif intent in ("guide", "payment", "safety") and db is not None:
        reply_text, confidence, citations = await _guide_reply(db, text, limit=3 if voice else 8)
        if intent == "safety" and not _is_emergency(text):
            risk_result = await _risk_reply(db, text)
            if risk_result:
                reply_text, confidence, citations = risk_result
        if intent == "safety" and _is_emergency(text):
            emergency_reply, emergency_confidence, emergency_citations = _emergency_reply()
            # Lead with the emergency answer; append anything else KB retrieval found.
            reply_text = f"{emergency_reply} {reply_text}" if reply_text != (
                "I don't have a reviewed source for that yet. Ask me about a landmark in Delhi, Agra, or Jaipur, or try another name."
            ) else emergency_reply
            confidence = emergency_confidence if emergency_citations else confidence
            citations = emergency_citations + citations
    elif intent == "compare" and db is not None:
        reply_text, confidence, citations = await _compare_reply(db, user, text)
    elif intent == "trip_planning" and db is not None:
        if voice:
            reply_text, confidence, citations = (
                "Open the Trip tab for a full itinerary. Ask me a short question about a monument, "
                "route, season, or food street and I'll answer from sourced records.",
                "estimated",
                [],
            )
        else:
            reply_text, confidence, citations = await _trip_reply(db, user, trip_id=trip_id)
    elif intent == "services":
        reply_text, confidence, citations, items = _services_reply(text)
    elif intent == "translation":
        reply_text, confidence, citations = await _translation_reply(text)
    elif intent == "community":
        reply_text, confidence, citations = _community_reply(text)
    elif intent == "buddy":
        reply_text, confidence, citations = _buddy_reply(text)
    else:
        reply_text = _no_tool_reply(intent)
        confidence = "estimated"
        citations = []
    if voice:
        asyncio.create_task(append_session_message(user.id, "assistant", reply_text, session_id))
    else:
        await append_session_message(user.id, "assistant", reply_text, session_id)

    interaction_id = None
    if db is not None:
        # Learning telemetry must not make an otherwise healthy answer fail while
        # a deployment is being migrated. The failed transaction is rolled back.
        try:
            interaction = await record_knowledge_interaction(
                db,
                user,
                query=text,
                intent=intent,
                result_count=len(citations),
                citation_count=len(citations),
                confidence=confidence,
                session_id=session_id,
            )
            await db.commit()
            interaction_id = interaction.id
        except Exception:  # noqa: BLE001 — telemetry is non-critical to the reply
            await db.rollback()

    return AgentReply(
        intent=intent,
        policy_tier=policy_tier,
        reply=reply_text,
        confidence=confidence,
        citations=citations,
        items=items,
        interaction_id=interaction_id,
    )


async def handle_voice_turn(
    user: User,
    transcript: str,
    db: AsyncSession,
    session_id: str | None = None,
    trip_id: uuid.UUID | None = None,
) -> AgentReply | None:
    """Voice-first entrypoint; transcript text never becomes a chat UI contract."""
    if is_backchannel(transcript):
        return None
    result = await handle_message(
        user, transcript, db, session_id=session_id, voice=True, trip_id=trip_id
    )
    result.reply = spoken_preview(result.reply)
    return result
