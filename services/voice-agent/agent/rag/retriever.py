from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path

from agent.config.settings import settings

logger = logging.getLogger("zentrip.voice-agent.rag")

_HEADING = re.compile(r"^#{1,3} (.+)$", re.M)


def knowledge_root() -> Path:
    return Path(settings.knowledge_dir)


def chunk_markdown(text: str, document: str) -> list[dict]:
    parts = re.split(r"\n(?=#{1,3} )", text)
    chunks: list[dict] = []
    for part in parts:
        body = part.strip()
        if len(body) < 40:
            continue
        heading_match = _HEADING.search(body)
        heading = heading_match.group(1).strip() if heading_match else document
        for start in range(0, len(body), 1400):
            piece = body[start : start + 1600].strip()
            if len(piece) < 40:
                continue
            chunks.append(
                {
                    "document": document,
                    "section": heading,
                    "text": piece,
                    "id": hashlib.sha1(f"{document}:{start}:{piece[:48]}".encode()).hexdigest(),
                }
            )
    return chunks


def load_file_chunks() -> list[dict]:
    root = knowledge_root()
    if not root.exists():
        return []
    chunks: list[dict] = []
    for path in sorted(root.glob("*.md")):
        chunks.extend(chunk_markdown(path.read_text(encoding="utf-8"), path.name))
    return chunks


def lexical_search(query: str, limit: int) -> list[dict]:
    terms = [word.casefold() for word in re.findall(r"[a-zA-Z0-9']{3,}", query)]
    scored: list[tuple[int, dict]] = []
    for chunk in load_file_chunks():
        hay = chunk["text"].casefold()
        score = sum(hay.count(term) for term in terms)
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def format_results(chunks: list[dict]) -> str:
    if not chunks:
        return json.dumps({"hits": []})
    return json.dumps(
        {
            "hits": [
                {
                    "document": chunk["document"],
                    "section": chunk.get("section"),
                    "text": chunk["text"][:900],
                }
                for chunk in chunks
            ]
        }
    )


async def embed_query(query: str) -> list[float] | None:
    if not settings.embedding_model or not settings.openrouter_api_key:
        return None
    from agent.llm.openrouter import openrouter_client

    client = openrouter_client()
    response = await client.embeddings.create(model=settings.embedding_model, input=query)
    return list(response.data[0].embedding)


async def search_qdrant(query: str, limit: int) -> list[dict]:
    vector = await embed_query(query)
    if vector is None:
        return []
    from qdrant_client import QdrantClient

    client = QdrantClient(url=settings.qdrant_url, timeout=4.0)
    hits = client.query_points(
        collection_name=settings.qdrant_collection,
        query=vector,
        limit=limit,
        with_payload=True,
    )
    out: list[dict] = []
    for point in getattr(hits, "points", hits):
        payload = getattr(point, "payload", None) or {}
        out.append(
            {
                "document": payload.get("document", ""),
                "section": payload.get("section", ""),
                "text": payload.get("text", ""),
            }
        )
    return out


async def retrieve(query: str) -> str:
    limit = max(1, settings.rag_top_k)
    try:
        semantic = await search_qdrant(query, limit)
        if semantic:
            return format_results(semantic)
    except Exception:
        logger.exception("qdrant search failed; using lexical fallback")
    return format_results(lexical_search(query, limit))
