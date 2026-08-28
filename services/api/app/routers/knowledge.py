import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.knowledge_service import search_published_claims
from app.knowledge_learning import record_knowledge_feedback
from app.models import (
    DestinationProfile,
    DestinationRoute,
    KnowledgeEntity,
    KnowledgeInteraction,
    KnowledgeObservation,
    KnowledgeSource,
    User,
)
from app.deps import get_current_user
from app.schemas import (
    DestinationProfileOut,
    DestinationRouteOut,
    KnowledgeCitationOut,
    KnowledgeClaimOut,
    KnowledgeInteractionFeedback,
    KnowledgeInteractionOut,
    KnowledgeObservationOut,
    KnowledgeSearchResponse,
)

router = APIRouter(prefix="/v1/knowledge", tags=["knowledge"])

_ESSENTIAL_TOPICS = {
    "visa": "visa_info",
    "arrival": "arrival_info",
    "safety": "safety_info",
    "health": "health_info",
    "transport": "transport_info",
    "payments": "payment_info",
    "connectivity": "connectivity_info",
    "culture": "culture_info",
    "food": "food_info",
    "planning": "planning_info",
}


@router.post("/interactions/{interaction_id}/feedback", response_model=KnowledgeInteractionOut)
async def feedback_on_knowledge_interaction(
    interaction_id: uuid.UUID,
    body: KnowledgeInteractionFeedback,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeInteractionOut:
    """Collect explicit helpful/not-helpful feedback for a prior Zenny answer."""
    interaction = await db.scalar(
        select(KnowledgeInteraction).where(
            KnowledgeInteraction.id == interaction_id,
            KnowledgeInteraction.user_id == user.id,
        )
    )
    if interaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge interaction not found")
    await record_knowledge_feedback(db, interaction, helpful=body.helpful, note=body.note)
    await db.commit()
    return KnowledgeInteractionOut(id=interaction.id, feedback=interaction.feedback, outcome=interaction.outcome)


@router.get("/destinations", response_model=list[DestinationProfileOut])
async def destination_profiles(
    region: str | None = Query(default=None, min_length=2, max_length=50),
    state: str | None = Query(default=None, min_length=2, max_length=100),
    kind: str | None = Query(default=None, min_length=2, max_length=40),
    tag: str | None = Query(default=None, min_length=2, max_length=40),
    limit: int = Query(default=100, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
) -> list[DestinationProfileOut]:
    """Return published, citation-backed destination planning profiles."""
    statement = (
        select(DestinationProfile, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, DestinationProfile.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, DestinationProfile.source_id == KnowledgeSource.id)
        .where(
            DestinationProfile.status == "published",
            KnowledgeEntity.status == "published",
            KnowledgeSource.status == "active",
        )
        .order_by(DestinationProfile.region, KnowledgeEntity.name)
        .limit(limit)
    )
    if region:
        statement = statement.where(DestinationProfile.region.ilike(region))
    if state:
        statement = statement.where(DestinationProfile.state.ilike(state))
    if kind:
        statement = statement.where(DestinationProfile.destination_kind == kind)
    if tag:
        statement = statement.where(DestinationProfile.tags.contains([tag]))
    rows = (await db.execute(statement)).all()
    return [
        DestinationProfileOut(
            entityId=entity.id,
            name=entity.name,
            city=entity.city,
            state=profile.state,
            region=profile.region,
            destinationKind=profile.destination_kind,
            tags=profile.tags,
            bestSeasons=profile.best_seasons,
            typicalStayMinDays=profile.typical_stay_min_days,
            typicalStayMaxDays=profile.typical_stay_max_days,
            altitudeM=profile.altitude_m,
            gatewayCity=profile.gateway_city,
            gatewayAirports=profile.gateway_airports,
            accessNotes=profile.access_notes,
            safetyNotes=profile.safety_notes,
            accessibility=profile.accessibility,
            sourceUrl=source.source_url,
            lastVerified=profile.last_verified,
            refreshAfter=profile.refresh_after,
            status=profile.status,
        )
        for profile, entity, source in rows
    ]


@router.get("/routes", response_model=list[DestinationRouteOut])
async def destination_routes(
    origin: str | None = Query(default=None, min_length=2, max_length=100),
    destination: str | None = Query(default=None, min_length=2, max_length=100),
    mode: str | None = Query(default=None, min_length=2, max_length=30),
    limit: int = Query(default=100, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
) -> list[DestinationRouteOut]:
    """Return published transfer estimates for route-aware itinerary planning."""
    origin_entity = aliased(KnowledgeEntity)
    destination_entity = aliased(KnowledgeEntity)
    statement = (
        select(DestinationRoute, origin_entity, destination_entity, KnowledgeSource)
        .join(origin_entity, DestinationRoute.origin_entity_id == origin_entity.id)
        .join(destination_entity, DestinationRoute.destination_entity_id == destination_entity.id)
        .join(KnowledgeSource, DestinationRoute.source_id == KnowledgeSource.id)
        .where(
            DestinationRoute.status == "published",
            origin_entity.status == "published",
            destination_entity.status == "published",
            KnowledgeSource.status == "active",
        )
        .order_by(origin_entity.name, destination_entity.name)
        .limit(limit)
    )
    if origin:
        statement = statement.where(origin_entity.name.ilike(origin))
    if destination:
        statement = statement.where(destination_entity.name.ilike(destination))
    if mode:
        statement = statement.where(DestinationRoute.mode == mode)
    rows = (await db.execute(statement)).all()
    return [
        DestinationRouteOut(
            origin=origin_entity_row.name,
            destination=destination_entity_row.name,
            originCity=origin_entity_row.city,
            destinationCity=destination_entity_row.city,
            mode=route.mode,
            distanceKm=route.distance_km,
            typicalMinMinutes=route.typical_min_minutes,
            typicalMaxMinutes=route.typical_max_minutes,
            seasonNotes=route.season_notes,
            sourceUrl=source.source_url,
            observedAt=route.observed_at,
            refreshAfter=route.refresh_after,
            status=route.status,
        )
        for route, origin_entity_row, destination_entity_row, source in rows
    ]


@router.get("/essentials", response_model=KnowledgeSearchResponse)
async def first_time_essentials(
    topic: str = Query(default="arrival", pattern="^(visa|arrival|safety|health|transport|payments|connectivity|culture|food|planning)$"),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeSearchResponse:
    """Return the first-time visitor playbook by topic, with citations."""
    statement = (
        select(KnowledgeClaim, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeClaim.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeClaim.source_id == KnowledgeSource.id)
        .where(
            KnowledgeEntity.entity_type == _ESSENTIAL_TOPICS[topic],
            KnowledgeEntity.status == "published",
            KnowledgeClaim.verification_status == "published",
            KnowledgeSource.status == "active",
        )
        .order_by(desc(KnowledgeClaim.last_verified), KnowledgeEntity.name)
        .limit(limit)
    )
    rows = (await db.execute(statement)).all()
    return KnowledgeSearchResponse(
        query=f"India first-time visitor {topic}",
        city="India",
        results=[
            KnowledgeClaimOut(
                claimId=claim.id,
                entityId=entity.id,
                entityName=entity.name,
                entityType=entity.entity_type,
                city=entity.city,
                claim=claim.claim,
                language=claim.language,
                citation=KnowledgeCitationOut(
                    sourceName=source.name,
                    sourceUrl=source.source_url,
                    sourceLocator=claim.source_locator,
                    lastVerified=claim.last_verified,
                    confidence=claim.confidence,
                ),
            )
            for claim, entity, source in rows
        ],
    )


@router.get("/operational", response_model=list[KnowledgeObservationOut])
async def operational_knowledge(
    city: str | None = Query(default=None, min_length=2, max_length=100),
    kind: str | None = Query(default=None, pattern="^(hours|ticketing|rating|activity)$"),
    db: AsyncSession = Depends(get_db),
) -> list[KnowledgeObservationOut]:
    """Return only approved current-ish hours, ticket links, ratings, and activities."""
    statement = (
        select(KnowledgeObservation, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeObservation.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeObservation.source_id == KnowledgeSource.id)
        .where(
            KnowledgeEntity.status == "published",
            KnowledgeObservation.status == "approved",
            KnowledgeSource.status == "active",
        )
        .order_by(desc(KnowledgeObservation.observed_at))
        .limit(200)
    )
    if city:
        statement = statement.where(KnowledgeEntity.city.ilike(city))
    if kind:
        statement = statement.where(KnowledgeObservation.kind == kind)
    rows = (await db.execute(statement)).all()
    return [
        KnowledgeObservationOut(
            id=observation.id,
            entityId=entity.id,
            entityName=entity.name,
            city=entity.city,
            sourceId=source.id,
            sourceName=source.name,
            sourceUrl=observation.source_url or source.source_url,
            kind=observation.kind,
            conflictKey=observation.conflict_key,
            value=observation.value,
            observedAt=observation.observed_at,
            refreshAfter=observation.refresh_after,
            status=observation.status,
            reviewerId=observation.reviewer_id,
            reviewerNote=observation.reviewer_note,
        )
        for observation, entity, source in rows
    ]


@router.get("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    q: str = Query(min_length=2, max_length=200),
    city: str | None = Query(default=None, min_length=2, max_length=100),
    limit: int = Query(default=8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeSearchResponse:
    """Return only published facts and their citations for Guide/Zenny clients."""
    rows = await search_published_claims(db, query=q, city=city, limit=limit)
    return KnowledgeSearchResponse(
        query=q,
        city=city,
        results=[
            KnowledgeClaimOut(
                claimId=claim.id,
                entityId=entity.id,
                entityName=entity.name,
                entityType=entity.entity_type,
                city=entity.city,
                claim=claim.claim,
                language=claim.language,
                citation=KnowledgeCitationOut(
                    sourceName=source.name,
                    sourceUrl=source.source_url,
                    sourceLocator=claim.source_locator,
                    lastVerified=claim.last_verified,
                    confidence=claim.confidence,
                ),
            )
            for claim, entity, source in rows
        ],
    )
