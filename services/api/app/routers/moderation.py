"""Staff-only review endpoints for editorial and trust workflows."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_staff
from app.knowledge_learning import knowledge_improvement_report
from app.knowledge_ops import operational_health
from app.models import (
    ExpertProfile,
    ExplorerProfile,
    ExplorerSubmission,
    KnowledgeClaim,
    KnowledgeEntity,
    KnowledgeGap,
    KnowledgeInteraction,
    KnowledgeModerationAudit,
    KnowledgeObservation,
    KnowledgeSource,
    Peak,
    RiskPattern,
    Trail,
    TrailHazard,
    User,
)
from app.schemas import (
    KnowledgeClaimCreate,
    KnowledgeEditorialClaimOut,
    KnowledgeEditorialQueueResponse,
    KnowledgeGapDecision,
    KnowledgeGapOut,
    KnowledgeImprovementReport,
    KnowledgeEntityCreate,
    KnowledgeModerationAuditOut,
    KnowledgeModerationDecision,
    KnowledgeObservationCreate,
    KnowledgeObservationDecision,
    KnowledgeObservationOut,
    KnowledgeOperationalHealthOut,
    KnowledgeSourceCreate,
    ModerationDecision,
    TrailHazardCreate,
    TrailModerationDecision,
)

router = APIRouter(prefix="/v1/moderation", tags=["moderation"])


async def _audit(
    db: AsyncSession,
    reviewer: User,
    target_type: str,
    target_id: uuid.UUID,
    previous_status: str | None,
    new_status: str,
    note: str | None,
) -> None:
    db.add(
        KnowledgeModerationAudit(
            reviewer_id=reviewer.id,
            target_type=target_type,
            target_id=target_id,
            previous_status=previous_status,
            new_status=new_status,
            note=note,
        )
    )


def _claim_out(row: tuple[KnowledgeClaim, KnowledgeEntity, KnowledgeSource]) -> KnowledgeEditorialClaimOut:
    claim, entity, source = row
    return KnowledgeEditorialClaimOut(
        id=claim.id,
        entityId=entity.id,
        entityName=entity.name,
        city=entity.city,
        sourceId=source.id,
        sourceName=source.name,
        sourceUrl=source.source_url,
        claim=claim.claim,
        language=claim.language,
        confidence=claim.confidence,
        verificationStatus=claim.verification_status,
        lastVerified=claim.last_verified,
        updatedAt=claim.updated_at,
    )


def _observation_out(row: tuple[KnowledgeObservation, KnowledgeEntity, KnowledgeSource]) -> KnowledgeObservationOut:
    observation, entity, source = row
    return KnowledgeObservationOut(
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


@router.get("/knowledge/operational-health", response_model=KnowledgeOperationalHealthOut)
async def operational_knowledge_health(
    _staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
) -> KnowledgeOperationalHealthOut:
    rows = (await db.scalars(select(KnowledgeObservation))).all()
    return KnowledgeOperationalHealthOut(**operational_health(rows))


def _gap_out(gap: KnowledgeGap) -> KnowledgeGapOut:
    return KnowledgeGapOut(
        id=gap.id,
        query=gap.example_query,
        intent=gap.intent,
        occurrenceCount=gap.occurrence_count,
        noMatchCount=gap.no_match_count,
        negativeFeedbackCount=gap.negative_feedback_count,
        priority=gap.priority,
        status=gap.status,
        lastSeenAt=gap.last_seen_at,
        resolutionNote=gap.resolution_note,
    )


@router.get("/knowledge/improvement-report", response_model=KnowledgeImprovementReport)
async def knowledge_improvement_health(
    _staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
) -> KnowledgeImprovementReport:
    """Show whether real questions are improving coverage over time."""
    interactions = (
        await db.scalars(select(KnowledgeInteraction).order_by(desc(KnowledgeInteraction.created_at)).limit(5000))
    ).all()
    gaps = (await db.scalars(select(KnowledgeGap).limit(1000))).all()
    return KnowledgeImprovementReport(**knowledge_improvement_report(interactions, gaps))


@router.get("/knowledge/gaps", response_model=list[KnowledgeGapOut])
async def knowledge_gap_queue(
    status_filter: str | None = Query(default="open", alias="status", pattern="^(open|in_progress|resolved|dismissed)$"),
    limit: int = Query(default=100, ge=1, le=500),
    _staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db),
) -> list[KnowledgeGapOut]:
    statement = select(KnowledgeGap).order_by(desc(KnowledgeGap.priority), desc(KnowledgeGap.last_seen_at)).limit(limit)
    if status_filter:
        statement = statement.where(KnowledgeGap.status == status_filter)
    return [_gap_out(gap) for gap in (await db.scalars(statement)).all()]


@router.post("/knowledge/gaps/{gap_id}", response_model=KnowledgeGapOut)
async def review_knowledge_gap(
    gap_id: uuid.UUID,
    body: KnowledgeGapDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeGapOut:
    gap = await db.scalar(select(KnowledgeGap).where(KnowledgeGap.id == gap_id))
    if gap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge gap not found")
    previous = gap.status
    gap.status = body.status
    gap.resolution_note = body.resolutionNote
    await _audit(db, staff, "gap", gap.id, previous, gap.status, body.resolutionNote)
    await db.commit()
    return _gap_out(gap)


@router.get("/knowledge/observations", response_model=list[KnowledgeObservationOut])
async def knowledge_observation_queue(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(approved|needs_review|rejected|retired)$"),
    _staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db),
) -> list[KnowledgeObservationOut]:
    statement = (
        select(KnowledgeObservation, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeObservation.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeObservation.source_id == KnowledgeSource.id)
        .order_by(desc(KnowledgeObservation.updated_at))
        .limit(200)
    )
    if status_filter:
        statement = statement.where(KnowledgeObservation.status == status_filter)
    return [_observation_out(row) for row in (await db.execute(statement)).all()]


@router.post("/knowledge/observations", response_model=KnowledgeObservationOut, status_code=status.HTTP_201_CREATED)
async def create_knowledge_observation(
    body: KnowledgeObservationCreate, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
) -> KnowledgeObservationOut:
    entity = await db.scalar(select(KnowledgeEntity).where(KnowledgeEntity.id == body.entityId))
    source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.id == body.sourceId))
    if not entity or not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity or source not found")
    if body.refreshAfter < body.observedAt:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="refreshAfter must not precede observedAt")
    observation = KnowledgeObservation(
        entity_id=entity.id, source_id=source.id, kind=body.kind, conflict_key=body.conflictKey,
        value=body.value, source_url=body.sourceUrl or source.source_url, observed_at=body.observedAt,
        refresh_after=body.refreshAfter, status="needs_review",
    )
    db.add(observation)
    await db.flush()
    await _audit(db, staff, "observation", observation.id, None, observation.status, "Created for operational-data review")
    await db.commit()
    return _observation_out((observation, entity, source))


@router.post("/knowledge/observations/{observation_id}", response_model=KnowledgeObservationOut)
async def review_knowledge_observation(
    observation_id: uuid.UUID, body: KnowledgeObservationDecision, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)
) -> KnowledgeObservationOut:
    row = (await db.execute(
        select(KnowledgeObservation, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeObservation.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeObservation.source_id == KnowledgeSource.id)
        .where(KnowledgeObservation.id == observation_id)
    )).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge observation not found")
    observation, entity, source = row
    previous = observation.status
    observation.status = body.status
    observation.reviewer_id = staff.id
    observation.reviewer_note = body.reviewerNote
    await _audit(db, staff, "observation", observation.id, previous, observation.status, body.reviewerNote)
    await db.commit()
    return _observation_out((observation, entity, source))


@router.get("/knowledge/queue", response_model=KnowledgeEditorialQueueResponse)
async def knowledge_queue(
    status_filter: str | None = Query(default="needs_review", alias="status", pattern="^(published|needs_review|rejected)$"),
    _staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeEditorialQueueResponse:
    statement = (
        select(KnowledgeClaim, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeClaim.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeClaim.source_id == KnowledgeSource.id)
        .order_by(desc(KnowledgeClaim.updated_at))
        .limit(100)
    )
    if status_filter:
        statement = statement.where(KnowledgeClaim.verification_status == status_filter)
    rows = (await db.execute(statement)).all()
    return KnowledgeEditorialQueueResponse(results=[_claim_out(row) for row in rows], status=status_filter)


@router.get("/knowledge/audits/{target_id}", response_model=list[KnowledgeModerationAuditOut])
async def knowledge_audits(
    target_id: uuid.UUID,
    _staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> list[KnowledgeModerationAuditOut]:
    rows = (
        await db.execute(
            select(KnowledgeModerationAudit)
            .where(KnowledgeModerationAudit.target_id == target_id)
            .order_by(desc(KnowledgeModerationAudit.created_at))
        )
    ).scalars().all()
    return [
        KnowledgeModerationAuditOut(
            id=row.id,
            reviewerId=row.reviewer_id,
            targetType=row.target_type,
            targetId=row.target_id,
            previousStatus=row.previous_status,
            newStatus=row.new_status,
            note=row.note,
            createdAt=row.created_at,
        )
        for row in rows
    ]


@router.post("/knowledge/sources")
async def create_knowledge_source(
    body: KnowledgeSourceCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    source = KnowledgeSource(
        name=body.name,
        source_url=body.sourceUrl,
        source_type=body.sourceType,
        authority_level=body.authorityLevel,
        license_note=body.licenseNote,
        status="needs_review",
    )
    db.add(source)
    await db.flush()
    await _audit(db, staff, "source", source.id, None, source.status, "Created for editorial review")
    await db.commit()
    return {"id": str(source.id), "status": source.status}


@router.post("/knowledge/entities")
async def create_knowledge_entity(
    body: KnowledgeEntityCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    entity = KnowledgeEntity(
        name=body.name,
        city=body.city,
        fact=body.fact,
        source="Editorial submission",
        source_url=None,
        confidence="estimated",
        last_verified=date.today(),
        entity_type=body.entityType,
        status="needs_review",
    )
    db.add(entity)
    await db.flush()
    await _audit(db, staff, "entity", entity.id, None, entity.status, "Created for editorial review")
    await db.commit()
    return {"id": str(entity.id), "status": entity.status}


@router.post("/knowledge/claims")
async def create_knowledge_claim(
    body: KnowledgeClaimCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    entity = await db.scalar(select(KnowledgeEntity).where(KnowledgeEntity.id == body.entityId))
    source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.id == body.sourceId))
    if not entity or not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity or source not found")
    claim = KnowledgeClaim(
        entity_id=entity.id,
        source_id=source.id,
        claim=body.claim,
        language=body.language,
        source_locator=body.sourceLocator,
        confidence=body.confidence,
        verification_status="needs_review",
        last_verified=body.lastVerified,
    )
    db.add(claim)
    await db.flush()
    await _audit(db, staff, "claim", claim.id, None, claim.verification_status, "Created for editorial review")
    await db.commit()
    return {"id": str(claim.id), "status": claim.verification_status}


@router.post("/knowledge/claims/{claim_id}")
async def review_knowledge_claim(
    claim_id: uuid.UUID,
    body: KnowledgeModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    claim = await db.scalar(select(KnowledgeClaim).where(KnowledgeClaim.id == claim_id))
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge claim not found")
    if body.status == "published":
        entity = await db.scalar(select(KnowledgeEntity).where(KnowledgeEntity.id == claim.entity_id))
        source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.id == claim.source_id))
        if not entity or entity.status != "published" or not source or source.status != "active":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Publish the entity and activate the source first")
    previous = claim.verification_status
    claim.verification_status = body.status
    await _audit(db, staff, "claim", claim.id, previous, claim.verification_status, body.reviewerNote)
    await db.commit()
    return {"id": str(claim.id), "status": claim.verification_status}


@router.post("/knowledge/claims/{claim_id}/rollback")
async def rollback_knowledge_claim(
    claim_id: uuid.UUID,
    body: KnowledgeModerationDecision | None = None,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    claim = await db.scalar(select(KnowledgeClaim).where(KnowledgeClaim.id == claim_id))
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge claim not found")
    previous = claim.verification_status
    claim.verification_status = "needs_review"
    await _audit(db, staff, "claim", claim.id, previous, claim.verification_status, (body.reviewerNote if body else None) or "Rolled back from publication")
    await db.commit()
    return {"id": str(claim.id), "status": claim.verification_status}


@router.post("/knowledge/entities/{entity_id}")
async def review_knowledge_entity(
    entity_id: uuid.UUID,
    body: KnowledgeModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    entity = await db.scalar(select(KnowledgeEntity).where(KnowledgeEntity.id == entity_id))
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge entity not found")
    if body.status not in ("published", "needs_review", "rejected"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use published, needs_review, or rejected")
    previous = entity.status
    entity.status = body.status
    await _audit(db, staff, "entity", entity.id, previous, entity.status, body.reviewerNote)
    await db.commit()
    return {"id": str(entity.id), "status": entity.status}


@router.post("/knowledge/sources/{source_id}")
async def review_knowledge_source(
    source_id: uuid.UUID,
    body: KnowledgeModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge source not found")
    if body.status not in ("active", "retired", "needs_review"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use active, retired, or needs_review")
    previous = source.status
    source.status = body.status
    await _audit(db, staff, "source", source.id, previous, source.status, body.reviewerNote)
    await db.commit()
    return {"id": str(source.id), "status": source.status}


@router.post("/explorer-profiles/{profile_id}")
async def review_explorer_profile(profile_id: uuid.UUID, body: ModerationDecision, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)) -> dict:
    del staff
    row = await db.scalar(select(ExplorerProfile).where(ExplorerProfile.id == profile_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Explorer profile not found")
    if body.status not in ("active", "rejected"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use active or rejected for Explorer profiles")
    row.status = body.status
    await db.commit()
    return {"id": str(row.id), "status": row.status}


@router.post("/explorer-submissions/{submission_id}")
async def review_explorer_submission(submission_id: uuid.UUID, body: ModerationDecision, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)) -> dict:
    del staff
    row = await db.scalar(select(ExplorerSubmission).where(ExplorerSubmission.id == submission_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Explorer submission not found")
    if body.status not in ("approved", "rejected", "needs_review"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use approved, rejected, or needs_review")
    row.status = body.status
    row.reviewer_note = body.reviewerNote
    await db.commit()
    return {"id": str(row.id), "status": row.status}


@router.post("/risk-patterns/{pattern_id}")
async def review_risk_pattern(pattern_id: uuid.UUID, body: ModerationDecision, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)) -> dict:
    del staff
    row = await db.scalar(select(RiskPattern).where(RiskPattern.id == pattern_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk pattern not found")
    if body.status not in ("published", "needs_review", "rejected"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use published, needs_review, or rejected")
    row.status = body.status
    await db.commit()
    return {"id": str(row.id), "status": row.status}


@router.post("/experts/{profile_id}")
async def review_expert_profile(profile_id: uuid.UUID, body: ModerationDecision, staff: User = Depends(get_current_staff), db: AsyncSession = Depends(get_db)) -> dict:
    del staff
    row = await db.scalar(select(ExpertProfile).where(ExpertProfile.id == profile_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expert profile not found")
    if body.status not in ("active", "suspended"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use active or suspended for Expert profiles")
    row.status = body.status
    await db.commit()
    return {"id": str(row.id), "status": row.status}


@router.post("/trails/{trail_id}")
async def review_trail(
    trail_id: uuid.UUID,
    body: TrailModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    trail = await db.scalar(select(Trail).where(Trail.id == trail_id))
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")
    if body.status not in ("verified", "preview", "rejected", "needs_review"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use verified, preview, rejected, or needs_review")
    previous = trail.verification_status
    trail.verification_status = body.status
    await _audit(db, staff, "trail", trail.id, previous, trail.verification_status, body.reviewerNote)
    await db.commit()
    return {"id": str(trail.id), "status": trail.verification_status, "navigationReady": trail.verification_status == "verified"}


@router.post("/peaks/{peak_id}")
async def review_peak(
    peak_id: uuid.UUID,
    body: TrailModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    peak = await db.scalar(select(Peak).where(Peak.id == peak_id))
    if not peak:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peak not found")
    if body.status not in ("published", "preview", "rejected", "needs_review"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use published, preview, rejected, or needs_review")
    previous = peak.status
    peak.status = body.status
    await _audit(db, staff, "peak", peak.id, previous, peak.status, body.reviewerNote)
    await db.commit()
    return {"id": str(peak.id), "status": peak.status}


@router.post("/trails/{trail_id}/hazards")
async def create_trail_hazard(
    trail_id: uuid.UUID,
    body: TrailHazardCreate,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    trail = await db.scalar(select(Trail).where(Trail.id == trail_id))
    if not trail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found")
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Latitude and longitude must be provided together")
    hazard = TrailHazard(
        trail_id=trail.id,
        category=body.category,
        description=body.description,
        latitude=body.latitude,
        longitude=body.longitude,
        source_kind=body.sourceKind,
        confidence=body.confidence,
        status="needs_review",
        expires_at=body.expiresAt,
    )
    db.add(hazard)
    await db.flush()
    await _audit(db, staff, "trail_hazard", hazard.id, None, hazard.status, "Created for review")
    await db.commit()
    return {"id": str(hazard.id), "status": hazard.status}


@router.post("/trail-hazards/{hazard_id}")
async def review_trail_hazard(
    hazard_id: uuid.UUID,
    body: TrailModerationDecision,
    staff: User = Depends(get_current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    hazard = await db.scalar(select(TrailHazard).where(TrailHazard.id == hazard_id))
    if not hazard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trail hazard not found")
    if body.status not in ("active", "retired", "needs_review"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use active, retired, or needs_review")
    previous = hazard.status
    hazard.status = body.status
    await _audit(db, staff, "trail_hazard", hazard.id, previous, hazard.status, body.reviewerNote)
    await db.commit()
    return {"id": str(hazard.id), "status": hazard.status}
