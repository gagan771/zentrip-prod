"""Phase 3 translation: curated phrasebook, live model fallback, speech, and camera OCR."""

import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.knowledge_service import search_published_claims
from app.models import User
from app.phrasebook import SUPPORTED_LANGUAGES
from app.schemas import TranslationRequest, TranslationResponse
from app.translation_service import (
    LiveTranslationError,
    extract_text_from_image,
    speech_locale,
    stt_language,
    translate_with_fallback,
)
from app.vision_service import VisionNotConfiguredError, VisionProviderError
from app.voice_service import VoiceServiceNotConfiguredError, VoiceTranscriptionError, transcribe_audio

router = APIRouter(prefix="/v1/translation", tags=["translation"])

_MAX_UPLOAD_BYTES = 8_000_000

_IMAGE_TYPES = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
}


async def _context(db: AsyncSession, query: str) -> list[dict]:
    try:
        claims = await search_published_claims(db, query=query, limit=2)
        return [
            {
                "sourceName": source.name,
                "sourceUrl": source.source_url,
                "sourceLocator": claim.source_locator,
                "lastVerified": claim.last_verified,
                "confidence": claim.confidence,
                "claim": claim.claim,
            }
            for claim, _entity, source in claims
        ]
    except Exception:
        return []


def _language_or_422(target: str) -> str:
    target = target.casefold().strip()
    if target not in SUPPORTED_LANGUAGES and target not in {"english", "en"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Supported languages: {', '.join(SUPPORTED_LANGUAGES)}",
        )
    return target


async def _translate_payload(
    db: AsyncSession, text: str, target: str, source: str, *, include_context: bool = False
) -> TranslationResponse:
    native, pronunciation, confidence, mode = await asyncio.to_thread(
        translate_with_fallback, text, target, source
    )
    return TranslationResponse(
        sourceText=text,
        targetLanguage=target,
        translatedText=native,
        pronunciation=pronunciation,
        confidence=confidence,
        mode=mode,
        context=await _context(db, text) if include_context else [],
    )


@router.post("/translate", response_model=TranslationResponse)
async def translate(
    body: TranslationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TranslationResponse:
    del user
    target = _language_or_422(body.targetLanguage)
    return await _translate_payload(db, body.text, target, body.sourceLanguage)


@router.post("/speech", response_model=TranslationResponse)
async def translate_speech(
    audio: UploadFile = File(...),
    targetLanguage: str = Form(default="hindi"),
    sourceLanguage: str = Form(default="en"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TranslationResponse:
    del user
    target = _language_or_422(targetLanguage)
    audio_bytes = await audio.read(settings.voice_max_upload_bytes + 1)
    if len(audio_bytes) > settings.voice_max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Voice recording is too large")
    try:
        transcript = await transcribe_audio(
            audio_bytes,
            audio.content_type,
            audio.filename,
            language=stt_language(sourceLanguage),
        )
    except VoiceServiceNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except VoiceTranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    result = await _translate_payload(db, transcript, target, sourceLanguage)
    result.sourceText = transcript
    return result


@router.post("/ocr", response_model=TranslationResponse)
async def translate_ocr(
    photo: UploadFile = File(...),
    targetLanguage: str = Form(default="hindi"),
    sourceLanguage: str = Form(default="auto"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TranslationResponse:
    del user
    target = _language_or_422(targetLanguage)
    media_type = _IMAGE_TYPES.get((photo.content_type or "").casefold())
    if media_type is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Use a JPEG, PNG, or WebP photo")
    image_bytes = await photo.read(_MAX_UPLOAD_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The photo was empty")
    if len(image_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo is too large")
    try:
        extracted = await asyncio.to_thread(extract_text_from_image, image_bytes, media_type)
    except VisionNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except VisionProviderError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except LiveTranslationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return await _translate_payload(db, extracted, target, sourceLanguage)


@router.get("/speech-locale")
async def translation_speech_locale(language: str = "hindi") -> dict:
    return {"language": language, "locale": speech_locale(language)}
