"""Export privacy-safe approved itinerary examples for evaluation or later tuning.

OpenRouter is an inference gateway, not a fine-tuning host. This exporter keeps
the training/evaluation boundary explicit: only approved plans are exported by
default, user identity is omitted, and feedback is attached as a learning signal.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models import ItineraryFeedback, ItineraryPlan, Trip


async def _collect(include_drafts: bool) -> list[dict]:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(ItineraryPlan, Trip)
                .join(Trip, Trip.id == ItineraryPlan.trip_id)
                .order_by(ItineraryPlan.created_at.asc())
            )
        ).all()
        feedback_rows = (await db.scalars(select(ItineraryFeedback).order_by(ItineraryFeedback.created_at.asc()))).all()

    feedback_by_plan: dict[str, list[dict]] = {}
    for feedback in feedback_rows:
        feedback_by_plan.setdefault(str(feedback.plan_id), []).append(
            {
                "itemKey": feedback.item_key,
                "action": feedback.action,
                "reason": feedback.reason,
                "replacementPlaceId": feedback.replacement_place_id,
                "details": feedback.details,
            }
        )

    records: list[dict] = []
    for plan, trip in rows:
        if not include_drafts and plan.status != "approved":
            continue
        if not plan.validation.get("passed", False):
            continue
        snapshot = plan.preferences_snapshot or {}
        records.append(
            {
                "planId": str(plan.id),
                "version": plan.version,
                "status": plan.status,
                "model": plan.model,
                "promptVersion": plan.prompt_version,
                "trip": {
                    "cities": trip.cities,
                    "startDate": trip.start_date.isoformat(),
                    "endDate": trip.end_date.isoformat(),
                    "budgetLevel": trip.budget_level,
                },
                "profile": {key: value for key, value in snapshot.items() if not key.startswith("_")},
                "constraints": snapshot.get("_constraints", {}),
                "days": plan.days,
                "feedback": feedback_by_plan.get(str(plan.id), []),
                "sourceClaimIds": plan.source_claim_ids,
            }
        )
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Destination JSONL file")
    parser.add_argument("--include-drafts", action="store_true", help="Include validated draft plans, not only approved plans")
    args = parser.parse_args()
    records = asyncio.run(_collect(args.include_drafts))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    print(f"wrote {len(records)} planner examples to {args.output}")


if __name__ == "__main__":
    main()
