import asyncio
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.llm import LLMNotConfiguredError, LLMProviderError, generate_itinerary_days, provider_configuration_error
from app.models import ItineraryDay, KnowledgeClaim, KnowledgeEntity, KnowledgeSource, Trip, TripBooking, User
from app.schemas import (
    ActivityOut,
    GenerateItineraryResponse,
    ItineraryDayOut,
    TripBookingCreate,
    TripBookingOut,
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


def _booking_out(booking: TripBooking) -> TripBookingOut:
    return TripBookingOut(
        id=booking.id,
        kind=booking.kind,
        title=booking.title,
        provider=booking.provider,
        startsAt=booking.starts_at,
        endsAt=booking.ends_at,
        reference=booking.reference,
        status=booking.status,
        deepLink=booking.deep_link,
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
                KnowledgeEntity.entity_type.notin_([
                    "payment_info", "safety_info", "monument_feature",
                    "city_guide", "travel_route", "season", "viewpoint", "food_district",
                ]),
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


@router.post("/{trip_id}/bookings", response_model=TripBookingOut, status_code=201)
async def create_booking(
    trip_id: uuid.UUID,
    body: TripBookingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripBookingOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    if body.endsAt is not None and body.startsAt is not None and body.endsAt < body.startsAt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endsAt must not be before startsAt")
    booking = TripBooking(
        trip_id=trip.id,
        user_id=user.id,
        kind=body.kind,
        title=body.title,
        provider=body.provider,
        starts_at=body.startsAt,
        ends_at=body.endsAt,
        reference=body.reference,
        status=body.status,
        deep_link=body.deepLink,
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return _booking_out(booking)


@router.get("/{trip_id}/timeline", response_model=TripTimelineResponse)
async def get_trip_timeline(
    trip_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TripTimelineResponse:
    """Read/aggregation layer per spec 04 (Journey/Booking Hub) §"Backend": assembles
    the trip, itinerary days, and explicit booking/handoff records into one payload.
    Search recommendations remain excluded until a traveler explicitly saves one as
    a booking, avoiding accidental attribution to the wrong trip.
    """
    trip = await _load_owned_trip(db, trip_id, user.id)
    days = (
        await db.execute(select(ItineraryDay).where(ItineraryDay.trip_id == trip.id).order_by(ItineraryDay.day))
    ).scalars().all()
    bookings = (
        await db.execute(select(TripBooking).where(TripBooking.trip_id == trip.id).order_by(TripBooking.starts_at, TripBooking.created_at))
    ).scalars().all()
    return TripTimelineResponse(trip=_trip_out(trip), days=[_day_out(d) for d in days], bookings=[_booking_out(b) for b in bookings])


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
