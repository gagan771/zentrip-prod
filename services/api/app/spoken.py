"""Shorten long KB concatenations so on-device TTS can start and finish quickly."""

import re

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_CLAUSE_SPLIT = re.compile(r"(?<=[,;:])\s+")


def spoken_preview(text: str, max_chars: int = 360) -> str:
    compact = " ".join(text.split())
    if len(compact) <= max_chars:
        return compact
    window = compact[:max_chars]
    for separator in (". ", "! ", "? "):
        at = window.rfind(separator)
        if at >= 40:
            return window[: at + 1].strip()
    trimmed = window.rsplit(" ", 1)[0].strip()
    return trimmed + "…" if trimmed else compact[:max_chars]


def speak_chunks(text: str, max_chars: int = 240) -> list[str]:
    """Split a reply so the phone can start TTS on the first clause immediately."""
    preview = spoken_preview(text, max_chars=max_chars)
    if not preview:
        return []
    parts = [part.strip() for part in _SENTENCE_SPLIT.split(preview) if part.strip()]
    if not parts:
        parts = [preview]
    first = parts[0]
    if len(first) > 120:
        clause = _CLAUSE_SPLIT.split(first, maxsplit=1)
        if len(clause) == 2 and len(clause[0]) >= 36:
            return [clause[0].strip(), clause[1].strip(), *parts[1:]]
    return parts
