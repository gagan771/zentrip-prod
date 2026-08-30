"""Report expiring knowledge records for a scheduler or editorial queue.

This is intentionally a safe worker foundation: it identifies due records but
does not auto-publish refreshed facts. A source-specific adapter can later use
the queue and submit reviewed updates through the moderation API.

Run from services/api:
    python -m scripts.knowledge_refresh_worker --once
    python -m scripts.knowledge_refresh_worker --watch --interval-seconds 900
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.knowledge_refresh import build_refresh_summary
from app.knowledge_refresh_adapters import refresh_manifest
from app.models import DestinationProfile, KnowledgeObservation


async def run_once() -> dict:
    async with AsyncSessionLocal() as db:
        observations = (
            await db.scalars(
                select(KnowledgeObservation).where(
                    KnowledgeObservation.status.in_(("approved", "needs_review"))
                )
            )
        ).all()
        profiles = (
            await db.scalars(
                select(DestinationProfile).where(
                    DestinationProfile.status.in_(("published", "needs_review"))
                )
            )
        ).all()
    return build_refresh_summary(observations, profiles)


async def watch(interval_seconds: int) -> None:
    while True:
        print(json.dumps(await run_once(), ensure_ascii=False))
        await asyncio.sleep(max(30, interval_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Run one refresh scan")
    parser.add_argument("--watch", action="store_true", help="Run repeatedly")
    parser.add_argument("--interval-seconds", type=int, default=900)
    parser.add_argument("--manifest", type=Path, help="HTTPS source manifest; emit moderation candidates")
    args = parser.parse_args()
    if args.manifest:
        specs = json.loads(args.manifest.read_text(encoding="utf-8"))
        if not isinstance(specs, list):
            raise SystemExit("refresh manifest must contain a JSON list")
        print(json.dumps(asyncio.run(refresh_manifest(specs)), ensure_ascii=False, indent=2))
        return
    if args.watch:
        asyncio.run(watch(args.interval_seconds))
    else:
        print(json.dumps(asyncio.run(run_once()), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
