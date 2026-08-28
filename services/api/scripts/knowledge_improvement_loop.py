"""Run the Zenny knowledge coverage report.

Run once from services/api:

    python -m scripts.knowledge_improvement_loop

For a lightweight worker, use ``--watch`` under a process supervisor. The worker
does not publish content; it reports the review queue created by live questions.
"""

from __future__ import annotations

import argparse
import asyncio
import json

from sqlalchemy import desc, select

from app.db import AsyncSessionLocal
from app.knowledge_learning import knowledge_improvement_report
from app.models import KnowledgeGap, KnowledgeInteraction


async def run_once() -> dict:
    async with AsyncSessionLocal() as db:
        interactions = (
            await db.scalars(select(KnowledgeInteraction).order_by(desc(KnowledgeInteraction.created_at)).limit(5000))
        ).all()
        gaps = (await db.scalars(select(KnowledgeGap).limit(1000))).all()
    return knowledge_improvement_report(interactions, gaps)


async def run(*, watch: bool, interval_seconds: int) -> None:
    while True:
        print(json.dumps(await run_once(), default=str))
        if not watch:
            return
        await asyncio.sleep(max(10, interval_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(description="Report Zenny knowledge coverage gaps")
    parser.add_argument("--watch", action="store_true", help="repeat until stopped")
    parser.add_argument("--interval-seconds", type=int, default=900)
    args = parser.parse_args()
    asyncio.run(run(watch=args.watch, interval_seconds=args.interval_seconds))


if __name__ == "__main__":
    main()
