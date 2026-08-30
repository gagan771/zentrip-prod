"""Optional OpenAI-compatible embedding reranker for the citation-safe KB.

The local lexical ranker remains the default. Deployments can point these
settings at an embedding service without changing the retrieval contract; a
provider timeout or malformed response never removes verified results.
"""

from __future__ import annotations

import asyncio
import math
from typing import Any

from app.config import settings
from app.provider_http import http_session


def embedding_ready() -> bool:
    return bool(settings.embedding_api_url.strip() and settings.embedding_api_key.strip())


def _embed_sync(texts: list[str]) -> list[list[float]]:
    response = http_session().post(
        settings.embedding_api_url.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.embedding_api_key.strip()}", "Content-Type": "application/json"},
        json={"model": settings.embedding_model, "input": texts},
        timeout=max(1.0, float(settings.embedding_timeout_seconds)),
    )
    if not response.ok:
        raise RuntimeError(f"embedding service returned HTTP {response.status_code}")
    data = response.json().get("data")
    if not isinstance(data, list) or len(data) != len(texts):
        raise RuntimeError("embedding service returned an invalid vector count")
    vectors = [item.get("embedding") for item in data if isinstance(item, dict)]
    if len(vectors) != len(texts) or not all(isinstance(vector, list) and vector for vector in vectors):
        raise RuntimeError("embedding service returned invalid vectors")
    return [[float(value) for value in vector] for vector in vectors]


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 0.0
    product = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left) * sum(b * b for b in right))
    return product / norm if norm else 0.0


async def rerank_rows(rows: list[tuple[Any, Any, Any]], query: str) -> list[tuple[Any, Any, Any]]:
    if not rows or not embedding_ready():
        return rows
    documents = [
        f"{entity.name}. {entity.city}. {claim.claim}. "
        f"{getattr(entity, 'experience_profile', None) or {}}"
        for claim, entity, _source in rows
    ]
    try:
        vectors = await asyncio.to_thread(_embed_sync, [query, *documents])
        query_vector = vectors[0]
        scored = [(_cosine(query_vector, vector), index, row) for index, (vector, row) in enumerate(zip(vectors[1:], rows))]
        return [row for _score, _index, row in sorted(scored, key=lambda item: (-item[0], item[1]))]
    except Exception:  # noqa: BLE001 — semantic retrieval is an optional enhancement
        return rows
