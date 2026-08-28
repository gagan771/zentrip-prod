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

# Stray punctuation ("delhi?", "scams.") must not make a token unmatchable.
_TOKEN_STRIP = ",.!?;:'\"()-"


def _escape_like(value: str) -> str:
    """Escape LIKE metacharacters so user input cannot widen the match pattern."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _like_pattern(value: str) -> str:
    return f"%{_escape_like(value)}%"


def _query_tokens(query: str) -> list[str]:
    normalized_query = " ".join(query.casefold().split())
    return [
        token.strip(_TOKEN_STRIP)
        for token in normalized_query.split(" ")
        if len(token.strip(_TOKEN_STRIP)) >= 2 and token.strip(_TOKEN_STRIP) not in _QUERY_STOP_WORDS
    ]


async def search_published_claims(
    db: AsyncSession, *, query: str, city: str | None = None, limit: int = 8
) -> list[tuple[KnowledgeClaim, KnowledgeEntity, KnowledgeSource]]:
    """Citation-first lexical retrieval over published claims.

    Matching is progressive rather than strict AND-across-all-tokens: if requiring every
    token returns nothing (one stray or phrasing-only word — e.g. "can foreign travelers
    use UPI" where "use" appears nowhere in the claim text), the least-selective token is
    dropped one at a time until something matches. This fixes the known AND-fragility
    (see PROJECT_MEMORY) structurally instead of patching one stopword at a time, while
    still preferring rows that match *more* tokens via the score function below.
    """
    normalized_query = " ".join(query.casefold().split())
    tokens = [token for token in _query_tokens(query)]
    if not tokens:
        return []

    alias_entity_ids = select(KnowledgeAlias.entity_id).where(
        KnowledgeAlias.alias.ilike(_like_pattern(normalized_query), escape="\\")
    )

    async def _run(active_tokens: list[str]):
        token_filters = []
        for token in active_tokens:
            pattern = _like_pattern(token)
            token_filters.append(
                or_(
                    KnowledgeEntity.name.ilike(pattern, escape="\\"),
                    KnowledgeEntity.city.ilike(pattern, escape="\\"),
                    KnowledgeClaim.claim.ilike(pattern, escape="\\"),
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
        return list((await db.execute(statement)).all())

    # Progressive relaxation: all tokens first, then drop one at a time (widest first —
    # dropping any single token keeps the others' constraint, so order only affects how
    # quickly we converge, not correctness; scoring re-ranks whatever matches).
    rows = await _run(tokens)
    if not rows:
        for skip in range(len(tokens)):
            reduced = [token for i, token in enumerate(tokens) if i != skip]
            if not reduced:
                break
            rows = await _run(reduced)
            if rows:
                break

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
