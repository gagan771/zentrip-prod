from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.knowledge_service import search_published_claims
from app.schemas import KnowledgeCitationOut, KnowledgeClaimOut, KnowledgeSearchResponse

router = APIRouter(prefix="/v1/knowledge", tags=["knowledge"])


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
