"""Manifest-driven source refresh adapters.

Sources provide JSON snapshots; this module converts them into the existing
moderation-safe observation contract. It never writes to the database or
publishes content, which keeps provider failures and source changes reviewable.
"""

from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

from app.knowledge_refresh import build_refresh_observation
from app.provider_http import http_session


def _fetch_json_sync(url: str, headers: dict[str, str] | None = None) -> Any:
    response = http_session().get(url, headers=headers or {}, timeout=10)
    if not response.ok:
        raise RuntimeError(f"source returned HTTP {response.status_code}")
    if len(response.content) > 2_000_000:
        raise RuntimeError("source payload exceeds the 2 MB refresh limit")
    return response.json()


async def fetch_json_source(url: str, *, headers: dict[str, str] | None = None) -> Any:
    if not url.lower().startswith("https://"):
        raise ValueError("refresh sources must use HTTPS")
    return await asyncio.to_thread(_fetch_json_sync, url, headers)


async def refresh_manifest_item(spec: dict[str, Any], *, today: date | None = None) -> dict:
    """Fetch one manifest item and return a moderation candidate or an error."""
    today = today or date.today()
    try:
        payload = await fetch_json_source(str(spec["url"]), headers=spec.get("headers"))
        value = payload.get("value", payload) if isinstance(payload, dict) else {"payload": payload}
        if not isinstance(value, dict):
            value = {"value": value}
        return build_refresh_observation(
            entity_id=spec["entityId"],
            source_id=spec["sourceId"],
            kind=str(spec["kind"]),
            conflict_key=str(spec["conflictKey"]),
            value=value,
            source_url=str(spec["url"]),
            observed_on=today,
            previous_value=spec.get("previousValue"),
        )
    except Exception as exc:  # noqa: BLE001 — one broken source must not stop the batch
        return {"url": spec.get("url"), "status": "error", "error": str(exc)[:500]}


async def refresh_manifest(specs: list[dict[str, Any]], *, today: date | None = None) -> dict:
    results = await asyncio.gather(*(refresh_manifest_item(spec, today=today) for spec in specs))
    return {
        "checkedOn": (today or date.today()).isoformat(),
        "sources": len(specs),
        "successful": sum(item.get("status") == "needs_review" for item in results),
        "failed": sum(item.get("status") == "error" for item in results),
        "candidates": results,
    }
