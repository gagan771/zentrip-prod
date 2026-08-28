"""Camera-based Guide identification — 07-historical-cultural-guide.md, full version.

See app.vision_service's module docstring for the retrieve-then-generate guardrail
this endpoint follows: the vision call only classifies against a fixed candidate
list drawn from the Knowledge Base; every fact in the response comes from a
published KnowledgeClaim row for the matched entity, never from the vision model.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import KnowledgeClaim, KnowledgeEntity, KnowledgeSource, User
from app.schemas import GuideIdentifyResponse, KnowledgeCitationOut
from app.vision_service import VisionNotConfiguredError, VisionProviderError, identify_landmark

router = APIRouter(prefix="/v1/guide", tags=["guide"])

_MAX_UPLOAD_BYTES = 8_000_000
_CONTENT_TYPE_MEDIA = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
}

_LOW_CONFIDENCE_REPLY = (
    "I'm not confident enough to identify this. Try moving closer, pointing at an entrance "
    "plaque or sign, or ask me by name instead — I currently know Delhi, Agra, and Jaipur "
    "corridor landmarks."
)
_CONTENT_MODES = {
    "overview": "A quick guide",
    "deep_history": "Deep history",
    "architecture": "Architecture lens",
    "kids": "Kid-friendly guide",
    "academic": "Academic context",
    "tourists_miss": "What most tourists miss",
}


def _distance_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    """Small-circle approximation is sufficient for corridor candidate narrowing."""
    from math import cos, radians, sqrt

    lat_delta = (latitude_b - latitude_a) * 111.0
    lon_delta = (longitude_b - longitude_a) * 111.0 * cos(radians(latitude_a))
    return sqrt(lat_delta * lat_delta + lon_delta * lon_delta)


@router.post("/identify", response_model=GuideIdentifyResponse)
async def identify(
    photo: UploadFile = File(...),
    city: str | None = Form(default=None),
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    mode: str = Form(default="overview"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuideIdentifyResponse:
    del user  # auth boundary only — identification isn't personalized

    if mode not in _CONTENT_MODES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported guide content mode")

    media_type = _CONTENT_TYPE_MEDIA.get((photo.content_type or "").casefold())
    if media_type is None:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Use a JPEG, PNG, or WebP photo")

    image_bytes = await photo.read(_MAX_UPLOAD_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty photo upload")
    if len(image_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo is too large")

    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Latitude and longitude must be provided together")

    # Step 1 (spec §17.4): a location/city hint narrows candidates before any vision call —
    # cheaper and less error-prone than asking the model to pick from every KB entity.
    candidate_query = select(KnowledgeEntity).where(
        KnowledgeEntity.status == "published", KnowledgeEntity.entity_type != "payment_info"
    )
    if city:
        candidate_query = candidate_query.where(KnowledgeEntity.city.ilike(city))
    candidates = list((await db.execute(candidate_query)).scalars().all())
    if latitude is not None and longitude is not None:
        located = [
            entity for entity in candidates
            if entity.latitude is not None and entity.longitude is not None
        ]
        nearby = [
            entity for entity in located
            if _distance_km(latitude, longitude, entity.latitude, entity.longitude) <= 75
        ]
        # Keep the city/entity fallback if no seeded centroid is close enough; a GPS
        # reading can be noisy and a false empty candidate list is worse than a wider
        # vision shortlist.
        if nearby:
            candidates = nearby
    candidate_names = [entity.name for entity in candidates]

    try:
        result = identify_landmark(image_bytes, media_type, candidate_names)
    except VisionNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except VisionProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Step 3 (spec §17.4) + Guardrail §5: confidence gates the UX. Low/none confidence must
    # ask the user to help disambiguate, never present a guess as fact.
    if result.entity_name is None or result.confidence in ("low", "none"):
        return GuideIdentifyResponse(
            matched=False, entityName=None, confidence=result.confidence, reply=_LOW_CONFIDENCE_REPLY, citations=[], contentMode=mode
        )

    matched_entity = next((entity for entity in candidates if entity.name == result.entity_name), None)
    if matched_entity is None:
        # Should be unreachable — identify_landmark() already validates against
        # candidate_names — but fail safe rather than crash if it ever happens.
        return GuideIdentifyResponse(
            matched=False, entityName=None, confidence="none", reply=_LOW_CONFIDENCE_REPLY, citations=[], contentMode=mode
        )

    # Step 4-5 (spec §17.4): retrieve-then-generate. Query by the matched entity's own id
    # rather than re-running the free-text KB search — the vision step already did the
    # matching, a fuzzy text re-search over the same name is redundant and less precise.
    rows = (
        await db.execute(
            select(KnowledgeClaim, KnowledgeSource)
            .join(KnowledgeSource, KnowledgeSource.id == KnowledgeClaim.source_id)
            .where(
                KnowledgeClaim.entity_id == matched_entity.id,
                KnowledgeClaim.verification_status == "published",
                KnowledgeSource.status == "active",
            )
            .order_by(KnowledgeClaim.last_verified.desc())
            .limit(3)
        )
    ).all()

    if not rows:
        # Identified an entity, but it has no published claims — shouldn't happen given
        # candidates are drawn from published entities with seeded claims, but don't invent
        # facts if it ever does.
        return GuideIdentifyResponse(
            matched=True,
            entityName=matched_entity.name,
            confidence=result.confidence,
            reply=f"That looks like {matched_entity.name}, but I don't have a reviewed source for it yet.",
            citations=[],
            contentMode=mode,
        )

    spoken_facts = [claim.claim for claim, _source in rows]
    citations = [
        KnowledgeCitationOut(
            sourceName=source.name,
            sourceUrl=source.source_url,
            sourceLocator=claim.source_locator,
            lastVerified=claim.last_verified,
            confidence=claim.confidence,
        )
        for claim, source in rows
    ]
    return GuideIdentifyResponse(
        matched=True,
        entityName=matched_entity.name,
        confidence=result.confidence,
        reply=f"{_CONTENT_MODES[mode]} — {matched_entity.name}: " + " ".join(spoken_facts),
        citations=citations,
        contentMode=mode,
    )
