"""Hybrid retrieval for Zentrip's curated, citation-first Knowledge Base.

The first stage combines lexical claim/entity/alias matching with structured
experience-profile matching. Results are cached in Redis when available, but
cache failures are deliberately fail-open. A vector stage can be added later
without changing the citation-safe result contract.
"""

import asyncio
from datetime import date
import hashlib
import json
from types import SimpleNamespace

from sqlalchemy import and_, func, or_, select
from sqlalchemy import Text, cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeAlias, KnowledgeClaim, KnowledgeEntity, KnowledgeSource
from app.redis_client import redis

_CACHE_VERSION = "v1"
_CACHE_TTL_SECONDS = 300
_CACHE_TIMEOUT_SECONDS = 0.08

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


def _cache_key(query: str, city: str | None, limit: int) -> str:
    material = json.dumps(
        {"query": " ".join(query.casefold().split()), "city": city.casefold() if city else None, "limit": limit},
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    return f"zentrip:knowledge:{_CACHE_VERSION}:{digest}"


async def _cache_get(key: str) -> list[tuple[object, object, object]] | None:
    try:
        raw = await asyncio.wait_for(redis.get(key), timeout=_CACHE_TIMEOUT_SECONDS)
        if not raw:
            return None
        payload = json.loads(raw)
        return [_row_from_cache(item) for item in payload]
    except Exception:  # noqa: BLE001 — retrieval must work when Redis is unavailable
        return None


async def _cache_set(key: str, rows: list[tuple[object, object, object]]) -> None:
    try:
        payload = json.dumps([_row_to_cache(row) for row in rows], ensure_ascii=False)
        await asyncio.wait_for(redis.set(key, payload, ex=_CACHE_TTL_SECONDS), timeout=_CACHE_TIMEOUT_SECONDS)
    except Exception:  # noqa: BLE001 — cache is an optimization, never a dependency
        return


def _row_to_cache(row: tuple[object, object, object]) -> dict:
    claim, entity, source = row
    return {
        "claim": {
            "id": str(claim.id),
            "claim": claim.claim,
            "language": claim.language,
            "source_locator": claim.source_locator,
            "confidence": claim.confidence,
            "last_verified": claim.last_verified.isoformat(),
        },
        "entity": {
            "id": str(entity.id),
            "name": entity.name,
            "city": entity.city,
            "entity_type": entity.entity_type,
            "experience_profile": getattr(entity, "experience_profile", None),
        },
        "source": {"id": str(source.id), "name": source.name, "source_url": source.source_url},
    }


def _row_from_cache(item: dict) -> tuple[object, object, object]:
    claim = item["claim"]
    entity = item["entity"]
    source = item["source"]
    return (
        SimpleNamespace(
            id=claim["id"],
            claim=claim["claim"],
            language=claim["language"],
            source_locator=claim.get("source_locator"),
            confidence=claim["confidence"],
            last_verified=date.fromisoformat(claim["last_verified"]),
        ),
        SimpleNamespace(
            id=entity["id"],
            name=entity["name"],
            city=entity["city"],
            entity_type=entity["entity_type"],
            experience_profile=entity.get("experience_profile"),
        ),
        SimpleNamespace(id=source["id"], name=source["name"], source_url=source.get("source_url")),
    )


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
    cache_key = _cache_key(query, city, limit)
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    async def _run(active_tokens: list[str]):
        token_filters = []
        for token in active_tokens:
            pattern = _like_pattern(token)
            alias_entity_ids = select(KnowledgeAlias.entity_id).where(
                KnowledgeAlias.alias.ilike(pattern, escape="\\")
            )
            token_filters.append(
                or_(
                    KnowledgeEntity.name.ilike(pattern, escape="\\"),
                    KnowledgeEntity.city.ilike(pattern, escape="\\"),
                    KnowledgeClaim.claim.ilike(pattern, escape="\\"),
                    # Structured experience tags and planning notes provide a
                    # transparent semantic bridge for queries such as "slow
                    # beach trip" before vector search is introduced.
                    cast(KnowledgeEntity.experience_profile, Text).ilike(pattern, escape="\\"),
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

    ranked = sorted(rows, key=score, reverse=True)[:limit]
    await _cache_set(cache_key, ranked)
    return ranked
