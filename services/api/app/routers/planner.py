"""Adaptive, versioned itinerary planning and human feedback APIs."""

import asyncio
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.adaptive_planner import (
    DEFAULT_PROFILE,
    allocate_city_days,
    build_route_skeleton,
    canonical_city,
    cities_match,
    fallback_days,
    merge_profile,
    rank_candidates,
    validate_generated_days,
)
from app.config import settings
from app.db import get_db
from app.deps import get_current_staff, get_current_user
from app.llm import LLMNotConfiguredError, LLMProviderError, generate_itinerary_days
from app.models import (
    EditorialRule,
    DestinationRoute,
    ItineraryDay,
    ItineraryFeedback,
    ItineraryPlan,
    KnowledgeEntity,
    KnowledgeSource,
    PlannerRun,
    TravelerProfile,
    Trip,
    User,
    UserPreference,
)
from app.routers.trips import _load_candidate_places, _load_owned_trip
from app.schemas import (
    AdaptivePlanCreate,
    EditorialRuleCreate,
    EditorialRuleDecision,
    EditorialRuleOut,
    ItineraryDayOut,
    ItineraryFeedbackCreate,
    ItineraryFeedbackOut,
    ItineraryPlanOut,
    PlanStaffDecision,
    TripConstraintsInput,
    TravelerProfileInput,
    TravelerProfileOut,
)

router = APIRouter(prefix="/v1", tags=["adaptive-planner"])


def _profile_out(profile: dict, updated_at: datetime) -> TravelerProfileOut:
    return TravelerProfileOut(**{**DEFAULT_PROFILE, **profile, "updatedAt": updated_at})


async def _route_context(db: AsyncSession, cities: list[str]) -> dict[str, dict]:
    """Load reviewed inter-city route ranges for the requested consecutive stops."""
    if len(cities) < 2:
        return {}
    origin_entity = aliased(KnowledgeEntity)
    destination_entity = aliased(KnowledgeEntity)
    rows = (
        await db.execute(
            select(DestinationRoute, origin_entity, destination_entity)
            .join(origin_entity, DestinationRoute.origin_entity_id == origin_entity.id)
            .join(destination_entity, DestinationRoute.destination_entity_id == destination_entity.id)
            .join(KnowledgeSource, DestinationRoute.source_id == KnowledgeSource.id)
            .where(
                DestinationRoute.status == "published",
                origin_entity.status == "published",
                destination_entity.status == "published",
                KnowledgeSource.status == "active",
            )
        )
    ).all()
    context: dict[str, dict] = {}
    for index in range(len(cities) - 1):
        origin = cities[index]
        destination = cities[index + 1]
        for route, origin_row, destination_row in rows:
            origin_matches = cities_match(origin_row.city, origin) or cities_match(origin_row.name, origin)
            destination_matches = cities_match(destination_row.city, destination) or cities_match(destination_row.name, destination)
            if origin_matches and destination_matches:
                context[f"{canonical_city(origin)}>{canonical_city(destination)}"] = {
                    "mode": route.mode,
                    "distanceKm": route.distance_km,
                    "typicalMinMinutes": route.typical_min_minutes,
                    "typicalMaxMinutes": route.typical_max_minutes,
                    "seasonNotes": route.season_notes,
                    "observedAt": route.observed_at.isoformat(),
                    "refreshAfter": route.refresh_after.isoformat(),
                    "stale": route.refresh_after < date.today(),
                }
                break
    return context


def _plan_out(plan: ItineraryPlan) -> ItineraryPlanOut:
    days = [
        ItineraryDayOut(
            day=int(day["day"]),
            date=day["date"],
            city=str(day["city"]),
            activities=day.get("activities", []),
        )
        for day in plan.days
    ]
    return ItineraryPlanOut(
        id=plan.id,
        tripId=plan.trip_id,
        version=plan.version,
        status=plan.status,
        model=plan.model,
        promptVersion=plan.prompt_version,
        days=days,
        preferencesSnapshot=plan.preferences_snapshot,
        sourceClaimIds=plan.source_claim_ids,
        validation=plan.validation,
        approvedAt=plan.approved_at,
        createdAt=plan.created_at,
    )


def _rule_out(rule: EditorialRule) -> EditorialRuleOut:
    return EditorialRuleOut(
        id=rule.id,
        scope=rule.scope,
        condition=rule.condition,
        action=rule.action,
        priority=rule.priority,
        status=rule.status,
        sourceFeedbackId=rule.source_feedback_id,
        createdAt=rule.created_at,
        updatedAt=rule.updated_at,
    )


def _feedback_out(feedback: ItineraryFeedback) -> ItineraryFeedbackOut:
    return ItineraryFeedbackOut(
        id=feedback.id,
        planId=feedback.plan_id,
        tripId=feedback.trip_id,
        userId=feedback.user_id,
        itemKey=feedback.item_key,
        action=feedback.action,
        reason=feedback.reason,
        replacementPlaceId=feedback.replacement_place_id,
        details=feedback.details,
        actor=feedback.actor,
        createdAt=feedback.created_at,
    )


async def _load_profile(db: AsyncSession, user_id: uuid.UUID) -> TravelerProfile | None:
    return await db.scalar(select(TravelerProfile).where(TravelerProfile.user_id == user_id))


async def _planner_context(
    db: AsyncSession,
    trip: Trip,
    user: User,
    body: AdaptivePlanCreate,
) -> tuple[dict, dict]:
    stored_profile = await _load_profile(db, user.id)
    preferences = {
        **(stored_profile.preferences if stored_profile else {}),
        **(body.profile.model_dump() if body.profile is not None else {}),
    }
    preference_rows = (
        await db.scalars(
            select(UserPreference)
            .where(UserPreference.user_id == user.id, UserPreference.superseded_at.is_(None))
            .order_by(UserPreference.created_at.desc())
            .limit(50)
        )
    ).all()
    statements = [row.statement for row in preference_rows if row.confidence >= 0.5]
    profile = merge_profile(preferences, statements)
    constraints = body.constraints.model_dump()
    constraints["budgetLevel"] = trip.budget_level
    constraints["wakeTime"] = profile.get("wakeTime", "08:00")
    constraints["sleepTime"] = profile.get("sleepTime", "22:30")
    constraints["tripDays"] = (trip.end_date - trip.start_date).days + 1
    constraints["travelMonth"] = trip.start_date.month
    constraints["originCountry"] = trip.origin_country
    constraints["citySequence"] = allocate_city_days(list(trip.cities), constraints["tripDays"])
    constraints["routeContext"] = await _route_context(db, list(trip.cities))

    rules = (
        await db.scalars(
            select(EditorialRule)
            .where(EditorialRule.status == "published")
            .order_by(EditorialRule.priority.desc(), EditorialRule.created_at.desc())
        )
    ).all()
    recent_feedback = (
        await db.scalars(
            select(ItineraryFeedback)
            .where(ItineraryFeedback.user_id == user.id)
            .order_by(ItineraryFeedback.created_at.desc())
            .limit(50)
        )
    ).all()
    wanted_scopes = {city.casefold() for city in trip.cities} | {"india", "all"}
    rule_context = [
        {"scope": rule.scope, "condition": rule.condition, "action": rule.action, "priority": rule.priority}
        for rule in rules
        if rule.scope.casefold() in wanted_scopes
    ]

    context = {
        "profile": profile,
        "constraints": constraints,
        "editorialRules": rule_context,
        "recentFeedback": [
            {"itemKey": item.item_key, "action": item.action, "reason": item.reason}
            for item in recent_feedback
        ],
    }
    return context, constraints


def _dated_days(days: list[dict], trip: Trip) -> list[dict]:
    # Dates are derived from the Trip, never trusted from model output.
    return [
        {
            **raw,
            "date": (trip.start_date + timedelta(days=int(raw["day"]) - 1)).isoformat(),
        }
        for raw in days
    ]


async def _create_adaptive_plan(
    db: AsyncSession,
    trip: Trip,
    user: User,
    body: AdaptivePlanCreate,
) -> ItineraryPlan:
    context, constraints = await _planner_context(db, trip, user, body)
    candidates = await _load_candidate_places(db, trip.cities)
    ranked = rank_candidates(candidates, context["profile"], {**constraints, "recentFeedback": context["recentFeedback"]})
    context["routeSkeleton"] = build_route_skeleton(
        trip,
        ranked,
        {**constraints, "profile": context["profile"]},
    )
    model_name = settings.openrouter_model if settings.llm_provider == "openrouter" else settings.anthropic_model
    fallback_used = False
    run_error: str | None = None

    # A single malformed model response should not immediately degrade to the
    # generic fallback. Give the provider one repair pass with deterministic
    # validator feedback; the fallback remains the final safety net.
    validation = {"passed": False, "errors": ["planner did not return a valid plan"], "warnings": []}
    raw_days: list[dict] = []
    repair_attempts = 0
    for attempt in range(2):
        attempt_context = dict(context)
        if attempt and validation.get("errors"):
            attempt_context["validationFeedback"] = validation["errors"]
        try:
            raw_days = await asyncio.to_thread(generate_itinerary_days, trip, ranked, attempt_context)
            days, validation = validate_generated_days(raw_days, trip, ranked, constraints)
            repair_attempts = attempt
            if validation["passed"]:
                break
            run_error = "; ".join(validation["errors"])[:1000]
        except LLMNotConfiguredError as exc:
            run_error = str(exc)[:1000]
            break
        except LLMProviderError as exc:
            run_error = str(exc)[:1000]
            if attempt == 1:
                break

    if not validation["passed"]:
        fallback_used = True
        model_name = "grounded-deterministic-fallback"
        raw_days = fallback_days(trip, ranked, context["profile"], constraints)
        days, validation = validate_generated_days(raw_days, trip, ranked, constraints)

    days = _dated_days(days, trip)
    used_place_ids = {
        str(activity.get("placeId"))
        for day in days
        for activity in day.get("activities", [])
        if activity.get("placeId")
    }
    validation = {
        **validation,
        "fallbackUsed": fallback_used,
        "candidateCount": len(ranked),
        "model": model_name,
        "promptVersion": "adaptive-v2",
        "repairAttempts": repair_attempts,
    }
    next_version = (await db.scalar(select(func.max(ItineraryPlan.version)).where(ItineraryPlan.trip_id == trip.id)) or 0) + 1
    plan = ItineraryPlan(
        trip_id=trip.id,
        version=next_version,
        status="draft" if validation["passed"] else "needs_staff_review",
        model=model_name,
        prompt_version="adaptive-v2",
        days=days,
        preferences_snapshot={
            **context["profile"],
            "_constraints": constraints,
            "_editorialRules": context["editorialRules"],
        },
        source_claim_ids=[
            str(item["claimId"])
            for item in ranked
            if item.get("claimId") and str(item.get("placeId")) in used_place_ids
        ],
        validation=validation,
    )
    db.add(plan)
    await db.flush()

    db.add(
        PlannerRun(
            trip_id=trip.id,
            plan_id=plan.id,
            model=model_name,
            prompt_version="adaptive-v2",
            retrieval_ids=[str(item["placeId"]) for item in ranked],
            validation_passed=bool(validation["passed"]),
            error=run_error,
        )
    )

    # Keep the existing Journey timeline compatible with the newest adaptive plan.
    await db.execute(delete(ItineraryDay).where(ItineraryDay.trip_id == trip.id))
    for day in days:
        db.add(ItineraryDay(trip_id=trip.id, day=day["day"], date=date.fromisoformat(day["date"]), city=day["city"], activities=day["activities"]))
    trip.status = "planned"
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/profile/traveler", response_model=TravelerProfileOut)
async def get_traveler_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> TravelerProfileOut:
    profile = await _load_profile(db, user.id)
    return _profile_out(profile.preferences if profile else {}, profile.updated_at if profile else datetime.utcnow())


@router.put("/profile/traveler", response_model=TravelerProfileOut)
async def update_traveler_profile(
    body: TravelerProfileInput,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TravelerProfileOut:
    profile = await _load_profile(db, user.id)
    if profile is None:
        profile = TravelerProfile(user_id=user.id, preferences=body.model_dump())
        db.add(profile)
    else:
        profile.preferences = body.model_dump()
        profile.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(profile)
    return _profile_out(profile.preferences, profile.updated_at)


@router.post("/trips/{trip_id}/plans", response_model=ItineraryPlanOut, status_code=status.HTTP_201_CREATED)
async def create_adaptive_plan(
    trip_id: uuid.UUID,
    body: AdaptivePlanCreate | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await _create_adaptive_plan(db, trip, user, body or AdaptivePlanCreate())
    return _plan_out(plan)


@router.get("/trips/{trip_id}/plans", response_model=list[ItineraryPlanOut])
async def list_adaptive_plans(
    trip_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ItineraryPlanOut]:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plans = (await db.scalars(select(ItineraryPlan).where(ItineraryPlan.trip_id == trip.id).order_by(ItineraryPlan.version.desc()))).all()
    return [_plan_out(plan) for plan in plans]


@router.get("/trips/{trip_id}/plans/{plan_id}", response_model=ItineraryPlanOut)
async def get_adaptive_plan(
    trip_id: uuid.UUID,
    plan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await db.scalar(select(ItineraryPlan).where(ItineraryPlan.id == plan_id, ItineraryPlan.trip_id == trip.id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary plan not found")
    return _plan_out(plan)


@router.post("/trips/{trip_id}/plans/{plan_id}/approve", response_model=ItineraryPlanOut)
async def approve_adaptive_plan(
    trip_id: uuid.UUID,
    plan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await db.scalar(select(ItineraryPlan).where(ItineraryPlan.id == plan_id, ItineraryPlan.trip_id == trip.id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary plan not found")
    if not plan.validation.get("passed", False):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This plan needs review before approval")
    plan.status = "approved"
    plan.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(plan)
    return _plan_out(plan)


@router.post("/planner/plans/{plan_id}/override", response_model=ItineraryPlanOut)
async def staff_override_adaptive_plan(
    plan_id: uuid.UUID,
    body: PlanStaffDecision,
    _staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    plan = await db.scalar(select(ItineraryPlan).where(ItineraryPlan.id == plan_id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary plan not found")
    plan.status = body.status
    plan.validation = {**plan.validation, "staffNote": body.note} if body.note else plan.validation
    if body.status == "approved":
        plan.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(plan)
    return _plan_out(plan)


@router.post("/trips/{trip_id}/plans/{plan_id}/reject", response_model=ItineraryPlanOut)
async def reject_adaptive_plan(
    trip_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: ItineraryFeedbackCreate | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await db.scalar(select(ItineraryPlan).where(ItineraryPlan.id == plan_id, ItineraryPlan.trip_id == trip.id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary plan not found")
    plan.status = "rejected"
    if body is not None:
        db.add(ItineraryFeedback(plan_id=plan.id, trip_id=trip.id, user_id=user.id, item_key=body.itemKey, action="reject", reason=body.reason, replacement_place_id=body.replacementPlaceId, details=body.details, actor="user"))
    await db.commit()
    await db.refresh(plan)
    return _plan_out(plan)


@router.post("/trips/{trip_id}/plans/{plan_id}/regenerate", response_model=ItineraryPlanOut, status_code=status.HTTP_201_CREATED)
async def regenerate_adaptive_plan(
    trip_id: uuid.UUID,
    body: AdaptivePlanCreate | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ItineraryPlanOut:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await _create_adaptive_plan(db, trip, user, body or AdaptivePlanCreate())
    return _plan_out(plan)


@router.post("/trips/{trip_id}/plans/{plan_id}/feedback", status_code=status.HTTP_201_CREATED)
async def record_plan_feedback(
    trip_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: ItineraryFeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    trip = await _load_owned_trip(db, trip_id, user.id)
    plan = await db.scalar(select(ItineraryPlan).where(ItineraryPlan.id == plan_id, ItineraryPlan.trip_id == trip.id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary plan not found")
    if body.action == "replace" and not body.replacementPlaceId:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="replacementPlaceId is required for replace feedback")
    feedback = ItineraryFeedback(plan_id=plan.id, trip_id=trip.id, user_id=user.id, item_key=body.itemKey, action=body.action, reason=body.reason, replacement_place_id=body.replacementPlaceId, details=body.details, actor="user")
    db.add(feedback)
    await db.commit()
    response = {"id": str(feedback.id), "status": "recorded"}
    if body.action in {"replace", "reschedule"} and body.details.get("autoReplan") is True:
        snapshot = plan.preferences_snapshot or {}
        replanning_body = AdaptivePlanCreate(
            profile=TravelerProfileInput.model_validate({key: snapshot[key] for key in DEFAULT_PROFILE if key in snapshot}),
            constraints=TripConstraintsInput.model_validate(snapshot.get("_constraints") or {}),
        )
        replanned = await _create_adaptive_plan(db, trip, user, replanning_body)
        response["replannedPlanId"] = str(replanned.id)
        response["status"] = "recorded_and_replanned"
    return response


@router.get("/planner/editorial-rules", response_model=list[EditorialRuleOut])
async def list_editorial_rules(_staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)) -> list[EditorialRuleOut]:
    rules = (await db.scalars(select(EditorialRule).order_by(EditorialRule.priority.desc(), EditorialRule.created_at.desc()))).all()
    return [_rule_out(rule) for rule in rules]


@router.get("/planner/feedback", response_model=list[ItineraryFeedbackOut])
async def list_planner_feedback(
    limit: int = 50,
    _staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> list[ItineraryFeedbackOut]:
    rows = (
        await db.scalars(
            select(ItineraryFeedback)
            .order_by(ItineraryFeedback.created_at.desc())
            .limit(max(1, min(limit, 200)))
        )
    ).all()
    return [_feedback_out(row) for row in rows]


@router.post("/planner/feedback/{feedback_id}/promote", response_model=EditorialRuleOut, status_code=status.HTTP_201_CREATED)
async def promote_planner_feedback(
    feedback_id: uuid.UUID,
    body: EditorialRuleCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> EditorialRuleOut:
    feedback = await db.scalar(select(ItineraryFeedback).where(ItineraryFeedback.id == feedback_id))
    if feedback is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner feedback not found")
    rule = EditorialRule(
        created_by_user_id=staff.id,
        scope=body.scope,
        condition=body.condition,
        action=body.action,
        priority=body.priority,
        status="needs_review",
        source_feedback_id=feedback.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.post("/planner/editorial-rules", response_model=EditorialRuleOut, status_code=status.HTTP_201_CREATED)
async def create_editorial_rule(
    body: EditorialRuleCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> EditorialRuleOut:
    rule = EditorialRule(created_by_user_id=staff.id, scope=body.scope, condition=body.condition, action=body.action, priority=body.priority, status="needs_review", source_feedback_id=body.sourceFeedbackId)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.post("/planner/editorial-rules/{rule_id}", response_model=EditorialRuleOut)
async def review_editorial_rule(
    rule_id: uuid.UUID,
    body: EditorialRuleDecision,
    _staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> EditorialRuleOut:
    rule = await db.scalar(select(EditorialRule).where(EditorialRule.id == rule_id))
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Editorial rule not found")
    rule.status = body.status
    rule.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)
