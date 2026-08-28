"""Purge raw answer-quality telemetry beyond the configured retention window.

Run from services/api:
    python -m scripts.knowledge_privacy_worker --once
"""

from __future__ import annotations

import argparse
import asyncio
import json

from app.config import settings
from app.db import AsyncSessionLocal
from app.privacy import purge_expired_knowledge_interactions


async def run_once() -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        deleted = await purge_expired_knowledge_interactions(db, settings.knowledge_telemetry_retention_days)
    return {"deletedInteractions": deleted, "retentionDays": settings.knowledge_telemetry_retention_days}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Run one retention purge")
    parser.parse_args()
    print(json.dumps(asyncio.run(run_once())))


if __name__ == "__main__":
    main()
