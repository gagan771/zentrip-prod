"""Live translation helpers: phrasebook first, then LLM, plus OCR text extraction."""

from __future__ import annotations

import base64
import json

from app.config import settings
from app.phrasebook import translate_phrase_detail
from app.provider_http import http_session
from app.vision_service import VisionNotConfiguredError, VisionProviderError


class LiveTranslationNotConfiguredError(Exception):
    pass


class LiveTranslationError(Exception):
    pass


_SPEECH_CODES = {
    "hindi": "hi-IN",
    "tamil": "ta-IN",
    "punjabi": "pa-IN",
    "bengali": "bn-IN",
    "malayalam": "ml-IN",
    "telugu": "te-IN",
    "kannada": "kn-IN",
    "marathi": "mr-IN",
    "gujarati": "gu-IN",
    "english": "en-IN",
}

_STT_CODES = {
    "hindi": "hi",
    "tamil": "ta",
    "punjabi": "pa",
    "bengali": "bn",
    "malayalam": "ml",
    "telugu": "te",
    "kannada": "kn",
    "marathi": "mr",
    "gujarati": "gu",
    "english": "en",
    "en": "en",
}


def speech_locale(language: str) -> str:
    return _SPEECH_CODES.get(language.casefold().strip(), "hi-IN")


def stt_language(language: str | None) -> str | None:
    if not language:
        return None
    key = language.casefold().strip()
    return _STT_CODES.get(key, key[:2] if len(key) >= 2 else None)


def _openrouter_headers() -> dict[str, str]:
    if not settings.openrouter_api_key:
        raise LiveTranslationNotConfiguredError(
            "Live translation needs OPENROUTER_API_KEY (or use a curated phrasebook phrase)."
        )
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name
    return headers


def _chat(messages: list[dict], *, model: str, max_tokens: int = 180) -> str:
    response = http_session().post(
        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
        headers=_openrouter_headers(),
        json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0},
        timeout=20,
    )
    if not response.ok:
        raise LiveTranslationError(f"Translation provider returned HTTP {response.status_code}: {response.text[:400]}")
    try:
        return response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise LiveTranslationError("Translation provider returned an empty reply") from exc


def _parse_json_object(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LiveTranslationError("Translation provider did not return JSON") from exc
    if not isinstance(data, dict):
        raise LiveTranslationError("Translation provider JSON was not an object")
    return data


def live_translate_text(text: str, target: str, source: str = "en") -> tuple[str, str | None]:
    target_name = target.strip()
    source_name = source.strip() or "en"
    raw = _chat(
        [
            {
                "role": "system",
                "content": (
                    "You are Zentrip's travel translator for India. Translate for taxi, hotel, "
                    "restaurant, shop, and ticket-counter use. If the input looks like a menu or "
                    "food term, keep the dish name and add a short spice/veg hint in parentheses. "
                    "Return ONLY JSON: {\"translatedText\": string, \"pronunciation\": string|null}."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"sourceLanguage": source_name, "targetLanguage": target_name, "text": text},
                    ensure_ascii=False,
                ),
            },
        ],
        model=settings.openrouter_model or "openrouter/free",
    )
    data = _parse_json_object(raw)
    translated = str(data.get("translatedText") or "").strip()
    if not translated:
        raise LiveTranslationError("Translation provider returned no text")
    pronunciation = data.get("pronunciation")
    return translated, str(pronunciation).strip() if pronunciation else None


def extract_text_from_image(image_bytes: bytes, media_type: str) -> str:
    if not settings.openrouter_api_key:
        raise VisionNotConfiguredError("OPENROUTER_API_KEY is not set")
    model = settings.openrouter_vision_model or settings.openrouter_model
    if not model:
        raise VisionNotConfiguredError("Set OPENROUTER_VISION_MODEL for camera translation")

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    raw = _chat(
        [
            {
                "role": "system",
                "content": (
                    "Extract the visible text from this travel photo (menu, sign, ticket, receipt). "
                    "Preserve line breaks. Do not translate. Return ONLY JSON: {\"text\": string}."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract the readable text."},
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{image_b64}"}},
                ],
            },
        ],
        model=model,
        max_tokens=400,
    )
    data = _parse_json_object(raw)
    text = str(data.get("text") or "").strip()
    if not text:
        raise VisionProviderError("No readable text was found in the photo")
    return text


def translate_with_fallback(text: str, target: str, source: str = "en") -> tuple[str, str | None, str, str]:
    """Return translated text, pronunciation, confidence, mode."""
    detail = translate_phrase_detail(text, target)
    if detail is not None:
        _english, native, pronunciation = detail
        return native, pronunciation, "verified", "offline_phrasebook"
    try:
        native, pronunciation = live_translate_text(text, target, source)
        return native, pronunciation, "estimated", "live_model"
    except (LiveTranslationNotConfiguredError, LiveTranslationError):
        return (
            "This phrase is not in the offline phrasebook yet, and live translation is not configured.",
            None,
            "estimated",
            "offline_phrasebook",
        )
