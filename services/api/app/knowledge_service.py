"""Retrieval for Zentrip's curated, citation-first Knowledge Base.

This first implementation is deliberately lexical and transparent. It only returns
published claims backed by an active source. pgvector can be added as a second recall
stage once the curated corridor corpus is large enough to benefit from embeddings.
"""

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeAlias, KnowledgeClaim, KnowledgeEntity, KnowledgeSource

_QUERY_STOP_WORDS = {
    "a", "about", "am", "an", "and", "are", "at", "can", "could", "did", "do", "does", "for", "give", "here",
    "how", "i", "in", "is", "it", "me", "of", "on", "please", "show", "tell", "the", "there", "this", "to",
    "what", "where", "which", "who", "why", "will", "with", "would", "you",
}


async def search_published_claims(
    db: AsyncSession, *, query: str, city: str | None = None, limit: int = 8
) -> list[tuple[KnowledgeClaim, KnowledgeEntity, KnowledgeSource]]:
    normalized_query = " ".join(query.casefold().split())
    tokens = [
        token for token in normalized_query.split(" ") if len(token) >= 2 and token not in _QUERY_STOP_WORDS
    ]
    if not tokens:
        return []

    alias_entity_ids = select(KnowledgeAlias.entity_id).where(
        KnowledgeAlias.alias.ilike(f"%{normalized_query}%")
    )
    token_filters = []
    for token in tokens:
        pattern = f"%{token}%"
        token_filters.append(
            or_(
                KnowledgeEntity.name.ilike(pattern),
                KnowledgeEntity.city.ilike(pattern),
                KnowledgeClaim.claim.ilike(pattern),
                KnowledgeEntity.id.in_(alias_entity_ids),
            )
        )

    statement = (
        select(KnowledgeClaim, KnowledgeEntity, KnowledgeSource)
        .join(KnowledgeEntity, KnowledgeClaim.entity_id == KnowledgeEntity.id)
        .join(KnowledgeSource, KnowledgeClaim.source_id == KnowledgeSource.id)
        .where(
            KnowledgeEntity.status == "published",
            KnowledgeClaim.verification_status == "published",
            KnowledgeSource.status == "active",
            and_(*token_filters),
        )
        .order_by(KnowledgeClaim.last_verified.desc())
        .limit(max(limit * 3, limit))
    )
    if city:
        statement = statement.where(func.lower(KnowledgeEntity.city) == city.casefold())

    rows = list((await db.execute(statement)).all())

    def score(row: tuple[KnowledgeClaim, KnowledgeEntity, KnowledgeSource]) -> tuple[int, object]:
        claim, entity, _ = row
        name = entity.name.casefold()
        claim_text = claim.claim.casefold()
        value = 0
        if name == normalized_query:
            value += 100
        elif normalized_query in name:
            value += 60
        if normalized_query in claim_text:
            value += 20
        value += sum(5 for token in tokens if token in name)
        return value, claim.last_verified

    return sorted(rows, key=score, reverse=True)[:limit]
