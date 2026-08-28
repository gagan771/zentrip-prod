"""Shorten long KB concatenations so on-device TTS can start and finish quickly."""

import re

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


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


def speak_chunks(text: str, max_chars: int = 280) -> list[str]:
    """Split a reply so the phone can start TTS on the first sentence immediately."""
    preview = spoken_preview(text, max_chars=max_chars)
    parts = [part.strip() for part in _SENTENCE_SPLIT.split(preview) if part.strip()]
    return parts or ([preview] if preview else [])
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
