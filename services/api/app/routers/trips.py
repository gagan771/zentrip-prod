import asyncio
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.llm import LLMNotConfiguredError, LLMProviderError, generate_itinerary_days, provider_configuration_error
from app.models import ItineraryDay, KnowledgeClaim, KnowledgeEntity, KnowledgeSource, Trip, User
from app.schemas import (
    ActivityOut,
    GenerateItineraryResponse,
    ItineraryDayOut,
    TripCreate,
    TripOut,
    TripTimelineResponse,
)

router = APIRouter(prefix="/v1/trips", tags=["trips"])


def _trip_out(trip: Trip) -> TripOut:
    return TripOut(
        id=trip.id,
        originCountry=trip.origin_country,
        startDate=trip.start_date,
        endDate=trip.end_date,
        cities=trip.cities,
        budgetLevel=trip.budget_level,
        status=trip.status,
    )


def _day_out(day: ItineraryDay) -> ItineraryDayOut:
    return ItineraryDayOut(
        day=day.day,
        date=day.date,
        city=day.city,
        activities=[ActivityOut(**activity) for activity in day.activities],
    )


async def _load_owned_trip(db: AsyncSession, trip_id: uuid.UUID, user_id: uuid.UUID) -> Trip:
    trip = (
        await db.execute(select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id))
    ).scalar_one_or_none()
    if trip is None:
        # Same 404 whether it doesn't exist or belongs to someone else — no ownership enumeration.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return trip


async def _load_candidate_places(db: AsyncSession, cities: list[str]) -> list[dict]:
    # Itinerary generation is only allowed to see reviewed, published claims. The
    # older KnowledgeEntity.fact column is a display summary, not a source boundary.
    rows = (
        await db.execute(
            select(KnowledgeEntity, KnowledgeClaim, KnowledgeSource)
            .join(KnowledgeClaim, KnowledgeClaim.entity_id == KnowledgeEntity.id)
            .join(KnowledgeSource, KnowledgeSource.id == KnowledgeClaim.source_id)
            .where(
                KnowledgeEntity.city.in_(cities),
                KnowledgeEntity.status == "published",
                KnowledgeClaim.verification_status == "published",
                KnowledgeSource.status == "active",
            )
            .order_by(KnowledgeClaim.last_verified.desc())
        )
    ).all()
    candidates: dict[str, dict] = {}
    for entity, claim, source in rows:
        # The itinerary tool accepts one fact per place today. Prefer the newest
        # reviewed claim deterministically; a later guide response can use all claims.
        candidates.setdefault(
            str(entity.id),
            {
                "placeId": str(entity.id),
                "name": entity.name,
                "city": entity.city,
                "fact": claim.claim,
                "source": source.name,
                "sourceUrl": source.source_url,
                "lastVerified": claim.last_verified.isoformat(),
                "confidence": claim.confidence,
            },
        )
    return list(candidates.values())


@router.post("", response_model=TripOut, status_code=status.HTTP_201_CREATED)
async def create_trip(
    body: TripCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TripOut:
    if body.endDate < body.startDate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endDate must not be before startDate")

    trip = Trip(
        user_id=user.id,
        origin_country=body.originCountry,
        start_date=body.startDate,
        end_date=body.endDate,
        cities=body.cities,
        budget_level=body.budgetLevel,
    )
    db.add(trip)
    await db.commit()
    return _trip_out(trip)


@router.get("/{trip_id}", response_model=TripOut)
async def get_trip(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TripOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    return _trip_out(trip)


@router.get("/{trip_id}/itinerary", response_model=list[ItineraryDayOut])
async def get_itinerary(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[ItineraryDayOut]:
    trip = await _load_owned_trip(db, trip_id, user.id)
    days = (
        await db.execute(select(ItineraryDay).where(ItineraryDay.trip_id == trip.id).order_by(ItineraryDay.day))
    ).scalars().all()
    return [_day_out(d) for d in days]


@router.get("/{trip_id}/timeline", response_model=TripTimelineResponse)
async def get_trip_timeline(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TripTimelineResponse:
    """Read/aggregation layer per spec 04 (Journey/Booking Hub) §"Backend": assembles
    the trip + its itinerary days into a single payload so a client doesn't need two
    round trips (GET /{trip_id} then GET /{trip_id}/itinerary).

    Intentionally excludes Recommendation/StayRecommendation rows (Compare and Stay
    Search results): those tables have no trip_id today, only user_id, so there is no
    real foreign key to join on here. Guessing an association (e.g. matching by date
    overlap) would silently misattribute a recommendation to the wrong trip. A future
    pass needs to add trip_id to those tables — booked/selected outcomes on them — before
    they can be merged into this timeline as genuine "bookings" alongside itinerary days.
    """
    trip = await _load_owned_trip(db, trip_id, user.id)
    days = (
        await db.execute(select(ItineraryDay).where(ItineraryDay.trip_id == trip.id).order_by(ItineraryDay.day))
    ).scalars().all()
    return TripTimelineResponse(trip=_trip_out(trip), days=[_day_out(d) for d in days])


async def regenerate_itinerary(db: AsyncSession, trip: Trip) -> tuple[list[ItineraryDay], list[dict]]:
    """Shared by the REST endpoint below and the Agent Gateway's "trip_planning" intent
    (see app.agent_gateway) so a voice/chat request and a client-driven regenerate
    persist itinerary days identically instead of drifting apart. Raises
    LLMNotConfiguredError / LLMProviderError from app.llm — callers decide how to
    surface those (HTTP error vs. a spoken fallback reply).
    """
    candidates = await _load_candidate_places(db, trip.cities)
    days_raw = await asyncio.to_thread(generate_itinerary_days, trip, candidates)

    # Regenerate: replace whatever itinerary existed before.
    await db.execute(delete(ItineraryDay).where(ItineraryDay.trip_id == trip.id))

    new_days: list[ItineraryDay] = []
    for raw_day in days_raw:
        day_date = trip.start_date + timedelta(days=raw_day["day"] - 1)
        row = ItineraryDay(
            trip_id=trip.id,
            day=raw_day["day"],
            date=day_date,
            city=raw_day["city"],
            activities=raw_day["activities"],
        )
        db.add(row)
        new_days.append(row)

    trip.status = "planned"
    await db.commit()
    return new_days, candidates


@router.post("/{trip_id}/generate-itinerary", response_model=GenerateItineraryResponse)
async def generate_itinerary(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> GenerateItineraryResponse:
    trip = await _load_owned_trip(db, trip_id, user.id)

    try:
        new_days, candidates = await regenerate_itinerary(db, trip)
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=provider_configuration_error(),
        )
    except LLMProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return GenerateItineraryResponse(
        tripId=trip.id,
        days=[_day_out(d) for d in new_days],
        groundedInKnowledgeBase=len(candidates) > 0,
    )
