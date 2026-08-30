"""Refresh-queue primitives for expiring travel knowledge.

The worker reports due records; it never silently republishes scraped content.
An editorial or provider-specific adapter must update and approve each record.
"""

from __future__ import annotations

from datetime import date
import hashlib
import json
from typing import Iterable


REFRESH_WINDOWS_DAYS = {
    "hours": 7,
    "ticketing": 3,
    "rating": 7,
    "activity": 1,
    "route": 30,
    "profile": 30,
}


def canonical_source_payload(payload: object) -> object:
    """Normalize provider JSON before comparing it for meaningful changes."""
    if isinstance(payload, dict):
        return {str(key): canonical_source_payload(payload[key]) for key in sorted(payload)}
    if isinstance(payload, list):
        return [canonical_source_payload(item) for item in payload]
    if isinstance(payload, str):
        return " ".join(payload.split())
    return payload


def source_fingerprint(payload: object) -> str:
    canonical = json.dumps(canonical_source_payload(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compare_source_payload(previous: object, current: object) -> dict:
    """Return a publication-safe diff summary; never silently overwrite data."""
    previous_fingerprint = source_fingerprint(previous)
    current_fingerprint = source_fingerprint(current)
    changed_keys: list[str] = []
    if isinstance(previous, dict) and isinstance(current, dict):
        changed_keys = sorted({*previous.keys(), *current.keys()} - {
            key for key in set(previous.keys()) & set(current.keys())
            if canonical_source_payload(previous[key]) == canonical_source_payload(current[key])
        })
    return {
        "changed": previous_fingerprint != current_fingerprint,
        "previousFingerprint": previous_fingerprint,
        "currentFingerprint": current_fingerprint,
        "changedKeys": [str(key) for key in changed_keys],
        "requiresReview": previous_fingerprint != current_fingerprint,
    }


def build_refresh_observation(
    *,
    entity_id: object,
    source_id: object,
    kind: str,
    conflict_key: str,
    value: dict,
    source_url: str | None,
    observed_on: date,
    refresh_after: date | None = None,
    previous_value: object | None = None,
) -> dict:
    """Build an observation candidate for staff approval.

    Provider adapters can submit this shape to the moderation API. New or changed
    provider data is always ``needs_review``; the worker never auto-publishes it.
    """
    comparison = compare_source_payload(previous_value, value) if previous_value is not None else {
        "changed": True,
        "previousFingerprint": None,
        "currentFingerprint": source_fingerprint(value),
        "changedKeys": sorted(value),
        "requiresReview": True,
    }
    days = refresh_after or observed_on.fromordinal(observed_on.toordinal() + REFRESH_WINDOWS_DAYS.get(kind, 30))
    return {
        "entityId": str(entity_id),
        "sourceId": str(source_id),
        "kind": kind,
        "conflictKey": conflict_key,
        "value": value,
        "sourceUrl": source_url,
        "observedAt": observed_on.isoformat(),
        "refreshAfter": days.isoformat(),
        "status": "needs_review",
        "fingerprint": comparison["currentFingerprint"],
        "change": comparison,
    }


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
            "fingerprint": getattr(row, "fingerprint", None),
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
