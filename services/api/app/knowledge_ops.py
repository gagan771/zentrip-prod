"""Freshness, conflict, and planner-facing helpers for operational travel data."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from typing import Iterable


ACTIVE_STATUSES = {"approved", "needs_review"}


def is_stale(refresh_after: date, *, today: date | None = None) -> bool:
    return refresh_after < (today or date.today())


def operational_health(rows: Iterable[object], *, today: date | None = None) -> dict:
    """Return a small, metric-friendly summary without requiring a DB session."""
    today = today or date.today()
    rows = list(rows)
    stale = sum(is_stale(row.refresh_after, today=today) for row in rows)
    needs_review = sum(row.status == "needs_review" for row in rows)
    groups: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row.status in ACTIVE_STATUSES:
            groups[row.conflict_key].add(json.dumps(row.value, sort_keys=True, separators=(",", ":")))
    conflicts = sorted(key for key, values in groups.items() if len(values) > 1)
    alert = "critical" if needs_review or conflicts else ("warning" if stale else "ok")
    return {
        "total": len(rows),
        "stale": stale,
        "needsReview": needs_review,
        "conflicts": conflicts,
        "alert": alert,
        "checkedOn": today.isoformat(),
    }


def merge_operational_profile(base: dict | None, rows: Iterable[object], *, today: date | None = None) -> dict:
    """Expose approved operational observations to the itinerary model with freshness labels."""
    today = today or date.today()
    profile = dict(base or {})
    operational = dict(profile.get("operational", {}))
    for row in sorted(rows, key=lambda item: (item.kind, item.observed_at), reverse=True):
        if row.status != "approved":
            continue
        operational.setdefault(row.kind, {
            **row.value,
            "sourceUrl": row.source_url,
            "observedAt": row.observed_at.isoformat(),
            "refreshAfter": row.refresh_after.isoformat(),
            "stale": is_stale(row.refresh_after, today=today),
        })
    if operational:
        profile["operational"] = operational
    return profile
