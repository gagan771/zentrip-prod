import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.comparison_service import (
    ScoredResult,
    ScoredStayResult,
    SearchInput,
    StaySearchInput,
    rank_results,
    rank_stay_results,
    search_adapters,
    search_stay_adapters,
)
from app.db import get_db
from app.deps import get_current_user
from app.models import Outcome, ProviderObservation, Recommendation, StayObservation, StayRecommendation, Trip, User
from app.provider_handoff import handoff_to_dict, stay_handoffs, transport_handoffs
from app.social_service import stay_context
from app.schemas import (
    CompareResultOut,
    CompareSearchRequest,
    CompareSearchResponse,
    OutcomeCreate,
    OutcomeOut,
    ProviderHandoffOut,
    StayResultOut,
    StaySearchRequest,
    StaySearchResponse,
    StayScoreComponentOut,
)

router = APIRouter(prefix="/v1/compare", tags=["compare"])


async def _assert_owned_trip(db: AsyncSession, trip_id: uuid.UUID, user_id: uuid.UUID) -> None:
    trip = (
        await db.execute(select(Trip.id).where(Trip.id == trip_id, Trip.user_id == user_id))
    ).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")


def _observation_from_scored(user_id: uuid.UUID, scored: ScoredResult) -> ProviderObservation:
    result = scored.result
    return ProviderObservation(
        user_id=user_id,
        provider=result.provider,
        mode=result.mode,
        external_id=result.external_id,
        origin=result.origin,
        destination=result.destination,
        departure_at=result.departure_at,
        arrival_at=result.arrival_at,
        base_price=result.base_price,
        fees=result.fees,
        total_price=result.total_price,
        duration_minutes=result.duration_minutes,
        cancellation_score=result.cancellation_score,
        reliability_score=result.reliability_score,
        convenience_score=result.convenience_score,
        availability=result.availability,
        source_kind=result.source_kind,
    )


def _result_out(recommendation: Recommendation, observation: ProviderObservation, scored: ScoredResult) -> CompareResultOut:
    # source_kind=mock maps only to an estimated provenance label. A future authorized
    # provider adapter may return live results, but this endpoint still requires the
    # client to perform/confirm a live check before a booking handoff.
    return CompareResultOut(
        recommendationId=recommendation.id,
        observationId=observation.id,
        provider=observation.provider,
        mode=observation.mode,
        origin=observation.origin,
        destination=observation.destination,
        departureAt=observation.departure_at,
        arrivalAt=observation.arrival_at,
        basePrice=observation.base_price,
        fees=observation.fees,
        totalPrice=observation.total_price,
        durationMinutes=observation.duration_minutes,
        cancellationScore=observation.cancellation_score,
        reliabilityScore=observation.reliability_score,
        availability=observation.availability,
        retrievedAt=observation.retrieved_at,
        freshness=recommendation.freshness,
        bookable=recommendation.bookable,
        liveCheckRequired=True,
        score=recommendation.score,
        badges=scored.badges,
        explanation=" ".join(scored.reasons),
    )


async def run_compare(
    db: AsyncSession,
    user: User,
    *,
    origin: str,
    destination: str,
    departure_date: date,
    budget_level: str,
    trip_id: uuid.UUID | None = None,
) -> CompareSearchResponse:
    """Shared by the REST endpoint below and the Agent Gateway's "compare" intent
    (see app.agent_gateway) so a voice/chat request and a client-driven search persist
    observations/recommendations identically instead of drifting apart.
    """
    if trip_id:
        await _assert_owned_trip(db, trip_id, user.id)

    raw_results = search_adapters(
        SearchInput(
            origin=origin,
            destination=destination,
            departure_date=departure_date,
            budget_level=budget_level,
        )
    )
    ranked = rank_results(raw_results, budget_level)
    if not ranked:
        return CompareSearchResponse(
            results=[],
            isDemoData=False,
            liveCheckRequired=True,
            message="Open a live provider below for current fares. Typical corridor estimates exist for Delhi, Agra, and Jaipur.",
            handoffs=[ProviderHandoffOut(**handoff_to_dict(item)) for item in transport_handoffs(origin, destination, departure_date)],
        )

    observations = [_observation_from_scored(user.id, scored) for scored in ranked]
    db.add_all(observations)
    await db.flush()

    recommendations = [
        Recommendation(
            user_id=user.id,
            observation_id=observation.id,
            category="transport",
            rank=scored.rank,
            score=scored.score,
            reasons=scored.reasons,
            freshness="estimated",
            bookable=False,
        )
        for observation, scored in zip(observations, ranked, strict=True)
    ]
    db.add_all(recommendations)
    await db.flush()
    await db.commit()

    return CompareSearchResponse(
        results=[
            _result_out(recommendation, observation, scored)
            for recommendation, observation, scored in zip(recommendations, observations, ranked, strict=True)
        ],
        isDemoData=True,
        liveCheckRequired=True,
        message="Typical corridor estimates below. Live fares and booking open on IRCTC, RedBus, AbhiBus, Goibibo, MakeMyTrip, and other official sites.",
        handoffs=[ProviderHandoffOut(**handoff_to_dict(item)) for item in transport_handoffs(origin, destination, departure_date)],
    )


@router.post("/search", response_model=CompareSearchResponse)
async def compare_search(
    body: CompareSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CompareSearchResponse:
    return await run_compare(
        db,
        user,
        origin=body.origin,
        destination=body.destination,
        departure_date=body.departureDate,
        budget_level=body.budgetLevel,
        trip_id=body.tripId,
    )


def _stay_observation_from_scored(user_id: uuid.UUID, scored: ScoredStayResult) -> StayObservation:
    result = scored.result
    return StayObservation(
        user_id=user_id,
        provider=result.provider,
        stay_type=result.stay_type,
        external_id=result.external_id,
        city=result.city,
        check_in=result.check_in,
        check_out=result.check_out,
        price_per_night=result.price_per_night,
        total_price=result.total_price,
        rating=result.rating,
        distance_to_center_km=result.distance_to_center_km,
        cancellation_score=result.cancellation_score,
        availability=result.availability,
        source_kind=result.source_kind,
    )


def _stay_result_out(
    recommendation: StayRecommendation, observation: StayObservation, scored: ScoredStayResult
) -> StayResultOut:
    return StayResultOut(
        recommendationId=recommendation.id,
        observationId=observation.id,
        provider=observation.provider,
        stayType=observation.stay_type,
        city=observation.city,
        checkIn=observation.check_in,
        checkOut=observation.check_out,
        pricePerNight=observation.price_per_night,
        totalPrice=observation.total_price,
        rating=observation.rating,
        distanceToCenterKm=observation.distance_to_center_km,
        cancellationScore=observation.cancellation_score,
        availability=observation.availability,
        retrievedAt=observation.retrieved_at,
        freshness=recommendation.freshness,
        bookable=recommendation.bookable,
        liveCheckRequired=True,
        score=recommendation.score,
        badges=scored.badges,
        explanation=" ".join(scored.reasons),
        scoreBreakdown=[StayScoreComponentOut(**item) for item in scored.score_breakdown],
        contextSignals=scored.context_signals,
    )


async def run_stay_search(
    db: AsyncSession,
    user: User,
    *,
    city: str,
    check_in: date,
    check_out: date,
    budget_level: str,
    guests: int = 1,
    traveler_style: str = "balanced",
) -> StaySearchResponse:
    """Stay-search counterpart to run_compare above — same shared-function reasoning:
    a future Agent Gateway "search_stays" tool call and this REST endpoint should
    persist identical StayObservation/StayRecommendation rows.
    """
    raw_results = search_stay_adapters(
        StaySearchInput(
            city=city,
            check_in=check_in,
            check_out=check_out,
            budget_level=budget_level,
            guests=guests,
            traveler_style=traveler_style,
        )
    )
    context_signals = {
        result.external_id: stay_context(city, check_in, check_out, result.stay_type)
        for result in raw_results
    }
    ranked = rank_stay_results(raw_results, budget_level, traveler_style, context_signals)
    if not ranked:
        return StaySearchResponse(
            results=[],
            isDemoData=False,
            liveCheckRequired=True,
            message="Open a live stay site below for current rates. Typical corridor estimates exist for Delhi, Agra, and Jaipur.",
            handoffs=[ProviderHandoffOut(**handoff_to_dict(item)) for item in stay_handoffs(city, check_in, check_out, guests)],
        )

    observations = [_stay_observation_from_scored(user.id, scored) for scored in ranked]
    db.add_all(observations)
    await db.flush()

    recommendations = [
        StayRecommendation(
            user_id=user.id,
            observation_id=observation.id,
            rank=scored.rank,
            score=scored.score,
            reasons=scored.reasons,
            freshness="estimated",
            bookable=False,
        )
        for observation, scored in zip(observations, ranked, strict=True)
    ]
    db.add_all(recommendations)
    await db.flush()
    await db.commit()

    return StaySearchResponse(
        results=[
            _stay_result_out(recommendation, observation, scored)
            for recommendation, observation, scored in zip(recommendations, observations, ranked, strict=True)
        ],
        isDemoData=True,
        liveCheckRequired=True,
        message="Typical corridor stay estimates below. Live rooms and booking open on MakeMyTrip, Goibibo, Booking.com, Agoda, Airbnb, and Hostelworld.",
        handoffs=[ProviderHandoffOut(**handoff_to_dict(item)) for item in stay_handoffs(city, check_in, check_out, guests)],
    )


@router.post("/stays/search", response_model=StaySearchResponse)
async def stay_search(
    body: StaySearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaySearchResponse:
    if body.checkOut <= body.checkIn:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="checkOut must be after checkIn")
    return await run_stay_search(
        db,
        user,
        city=body.city,
        check_in=body.checkIn,
        check_out=body.checkOut,
        budget_level=body.budgetLevel,
        guests=body.guests,
        traveler_style=body.travelerStyle,
    )


@router.get("/handoffs", response_model=list[ProviderHandoffOut])
async def list_transport_handoffs(
    origin: str,
    destination: str,
    departureDate: date,
    user: User = Depends(get_current_user),
) -> list[ProviderHandoffOut]:
    del user
    return [ProviderHandoffOut(**handoff_to_dict(item)) for item in transport_handoffs(origin, destination, departureDate)]


@router.get("/stays/handoffs", response_model=list[ProviderHandoffOut])
async def list_stay_handoffs(
    city: str,
    checkIn: date,
    checkOut: date,
    guests: int = 1,
    user: User = Depends(get_current_user),
) -> list[ProviderHandoffOut]:
    del user
    if checkOut <= checkIn:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="checkOut must be after checkIn")
    return [ProviderHandoffOut(**handoff_to_dict(item)) for item in stay_handoffs(city, checkIn, checkOut, guests)]


@router.post("/recommendations/{recommendation_id}/outcomes", response_model=OutcomeOut, status_code=status.HTTP_201_CREATED)
async def record_outcome(
    recommendation_id: uuid.UUID,
    body: OutcomeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OutcomeOut:
    recommendation = (
        await db.execute(
            select(Recommendation).where(Recommendation.id == recommendation_id, Recommendation.user_id == user.id)
        )
    ).scalar_one_or_none()
    if recommendation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation not found")

    outcome = Outcome(
        user_id=user.id,
        recommendation_id=recommendation.id,
        outcome_type=body.outcomeType,
        details=body.details,
    )
    db.add(outcome)
    await db.commit()
    return OutcomeOut(
        id=outcome.id,
        recommendationId=outcome.recommendation_id,
        outcomeType=outcome.outcome_type,
        createdAt=outcome.created_at,
    )
