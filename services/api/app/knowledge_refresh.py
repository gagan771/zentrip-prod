"""Refresh-queue primitives for expiring travel knowledge.

The worker reports due records; it never silently republishes scraped content.
An editorial or provider-specific adapter must update and approve each record.
"""

from __future__ import annotations

from datetime import date
from typing import Iterable


def build_refresh_summary(
    observations: Iterable[object],
    destination_profiles: Iterable[object],
    *,
    today: date | None = None,
    limit: int = 100,
) -> dict:
    today = today or date.today()
    due_observations = [row for row in observations if row.refresh_after <= today]
    due_profiles = [row for row in destination_profiles if row.refresh_after <= today]
    items = [
        {
            "type": "observation",
            "id": str(row.id),
            "entityId": str(row.entity_id),
            "kind": row.kind,
            "refreshAfter": row.refresh_after.isoformat(),
            "status": row.status,
        }
        for row in due_observations
    ]
    items.extend(
        {
            "type": "destination_profile",
            "id": str(row.id),
            "entityId": str(row.entity_id),
            "kind": "profile",
            "refreshAfter": row.refresh_after.isoformat(),
            "status": row.status,
        }
        for row in due_profiles
    )
    items.sort(key=lambda item: (item["refreshAfter"], item["type"], item["id"]))
    return {
        "checkedOn": today.isoformat(),
        "dueObservations": len(due_observations),
        "dueProfiles": len(due_profiles),
        "totalDue": len(items),
        "items": items[: max(1, min(limit, 500))],
    }
