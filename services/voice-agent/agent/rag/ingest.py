from __future__ import annotations

import asyncio
import logging
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, PointStruct, VectorParams

from agent.config.settings import settings
from agent.rag.retriever import load_file_chunks

logger = logging.getLogger("zentrip.voice-agent.ingest")


async def _embed_texts(texts: list[str]) -> list[list[float]]:
    from agent.llm.openrouter import openrouter_client

    client = openrouter_client()
    response = await client.embeddings.create(model=settings.embedding_model, input=texts)
    return [item.embedding for item in response.data]


async def ingest() -> int:
    chunks = load_file_chunks()
    if not chunks:
        logger.warning("no knowledge chunks under %s", settings.knowledge_dir)
        return 0
    if not settings.embedding_model:
        logger.warning("EMBEDDING_MODEL is empty; lexical search still works without ingest")
        return 0

    client = QdrantClient(url=settings.qdrant_url)
    sample = (await _embed_texts([chunks[0]["text"][:400]]))[0]
    dim = len(sample)
    collections = {item.name for item in client.get_collections().collections}
    if settings.qdrant_collection not in collections:
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )

    points: list[PointStruct] = []
    batch: list[dict] = []
    for chunk in chunks:
        batch.append(chunk)
        if len(batch) < 16 and chunk is not chunks[-1]:
            continue
        vectors = await _embed_texts([item["text"][:4000] for item in batch])
        for item, vector in zip(batch, vectors, strict=True):
            points.append(
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, item["id"])),
                    vector=vector,
                    payload={
                        "document": item["document"],
                        "section": item["section"],
                        "text": item["text"],
                    },
                )
            )
        batch = []
    client.upsert(collection_name=settings.qdrant_collection, points=points)
    logger.info("ingested %s chunks into %s", len(points), settings.qdrant_collection)
    return len(points)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(ingest())


if __name__ == "__main__":
    main()
