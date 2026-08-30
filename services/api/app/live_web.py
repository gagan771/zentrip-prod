"""Read-only live lookup for time-sensitive place questions.

The agent never accepts an arbitrary URL from a traveler. It resolves a known
place to an allowlisted official source, fetches a bounded HTML document, and
returns only a short hours-related excerpt with a fetch timestamp. The result is
an observation for this answer, not an automatic KB publication.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from html import unescape
import re
from typing import Any

import requests

from app.knowledge_corpus import DEEP_CORRIDOR_CLAIMS as CORPUS_ENTRIES, SOURCES as CORPUS_SOURCES
from app.operational_catalog import ENTITIES, OBSERVATIONS, SOURCES


_MAX_BYTES = 1_500_000
_TIMEOUT_SECONDS = 8
_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")
_SCRIPT_RE = re.compile(r"<(script|style|noscript)\b[^>]*>.*?</\1>", re.I | re.S)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
_HOURS_RE = re.compile(
    r"(?i)(?:\bopen\s+(?:from|daily|on)\b|\b(?:is|are)\s+closed\s+(?:on|for|from|during)\b|"
    r"\bticket\s+windows?\b|\bvisiting\s+hours?\b|\blast\s+entry\b).{0,240}"
)


def _normalise(value: str) -> str:
    return " ".join(value.casefold().split())


def _place_sources() -> list[tuple[str, str, str]]:
    by_name: dict[str, tuple[str, str, str]] = {}
    catalogs = [
        (ENTITIES, SOURCES),
        ([(item["entity"], item["city"], [], item["sourceKey"], "place", "") for item in OBSERVATIONS], SOURCES),
        ([(name, city, aliases, source_key, "monument", claim) for name, city, aliases, source_key, claim, _confidence in CORPUS_ENTRIES], CORPUS_SOURCES),
    ]
    for entries, sources in catalogs:
        for name, city, aliases, source_key, _entity_type, _fact in entries:
            source = sources.get(source_key)
            if not source or source[2] != "official" or not source[1]:
                continue
            url = str(source[1])
            for label in [name, *aliases]:
                by_name.setdefault(_normalise(label), (name, city, url))
    return sorted(by_name.values(), key=lambda item: len(item[0]), reverse=True)


def _resolve_place(query: str) -> tuple[str, str, str] | None:
    lowered = _normalise(query)
    for name, city, url in _place_sources():
        if _normalise(name) in lowered:
            return name, city, url
        for candidate in (item for item in lowered.split(" ") if len(item) > 2):
            # Alias resolution is handled by the catalog below; this branch is
            # intentionally conservative and only helps punctuation variants.
            if _normalise(name).replace("'", "") == candidate.replace("'", ""):
                return name, city, url
    catalogs = [
        (ENTITIES, SOURCES),
        ([(item["entity"], item["city"], [], item["sourceKey"], "place", "") for item in OBSERVATIONS], SOURCES),
        ([(name, city, aliases, source_key, "monument", claim) for name, city, aliases, source_key, claim, _confidence in CORPUS_ENTRIES], CORPUS_SOURCES),
    ]
    for entries, sources in catalogs:
        for name, city, aliases, source_key, _entity_type, _fact in entries:
            source = sources.get(source_key)
            if source and source[2] == "official" and source[1] and any(_normalise(alias) in lowered for alias in aliases):
                return name, city, str(source[1])
    return None


def _fetch_html(url: str) -> tuple[str, int]:
    # The shared provider session may inherit a local development proxy. Live
    # place pages should use the direct network path unless deployment explicitly
    # supplies its own egress proxy.
    session = requests.Session()
    session.trust_env = False
    response = session.get(
        url,
        headers={"User-Agent": "Zentrip/0.1 live-hours-check"},
        timeout=_TIMEOUT_SECONDS,
    )
    if not response.ok:
        raise RuntimeError(f"official source returned HTTP {response.status_code}")
    if len(response.content) > _MAX_BYTES:
        raise RuntimeError("official source exceeded the live lookup size limit")
    return response.text, response.status_code


def _hours_excerpt(html: str) -> str | None:
    text = _COMMENT_RE.sub(" ", _SCRIPT_RE.sub(" ", html))
    text = unescape(_TAG_RE.sub(" ", text))
    text = _SPACE_RE.sub(" ", text).strip()
    matches = [match.group(0).strip(" -:;") for match in _HOURS_RE.finditer(text)]
    if not matches:
        return None
    matches.sort(
        key=lambda value: (
            4 * bool(re.search(r"(?i)sunrise|sunset|\d{1,2}(?::\d{2})?\s*(?:am|pm)?", value)),
            3 * bool(re.search(r"(?i)closed\s+(?:on|for|from|during)", value)),
            -len(value),
        ),
        reverse=True,
    )
    # Keep the answer short enough for voice while retaining the source wording.
    excerpt = matches[0]
    for marker in (" Entrance Fee:", " Travel Tools", " Tickets can also", " Drone camera"):
        excerpt = excerpt.split(marker, 1)[0]
    return excerpt[:420].rstrip(" .;") + "."


def _lookup_sync(query: str) -> dict[str, Any] | None:
    resolved = _resolve_place(query)
    if resolved is None:
        return None
    place, city, url = resolved
    html, status_code = _fetch_html(url)
    excerpt = _hours_excerpt(html)
    if not excerpt:
        return None
    if excerpt.casefold().startswith("is closed"):
        excerpt = f"{place} {excerpt}"
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "place": place,
        "city": city,
        "sourceUrl": url,
        "excerpt": excerpt,
        "fetchedAt": fetched_at,
        "httpStatus": status_code,
    }


async def lookup_live_place_hours(query: str) -> dict[str, Any] | None:
    """Fetch one known official page without blocking the event loop."""
    try:
        return await asyncio.to_thread(_lookup_sync, query)
    except Exception:  # noqa: BLE001 — live sources are optional and fail open to KB
        return None
