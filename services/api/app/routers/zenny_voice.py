"""Voice-first Zenny turn API.

This is intentionally an audio endpoint, not a user-facing chat API: it accepts a
short push-to-talk recording, transcribes it on the backend, invokes the agent, and
returns the text that the phone's native TTS speaks aloud.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_gateway import handle_voice_turn
from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import KnowledgeCitationOut, ZennyVoiceTurnResponse
from app.voice_service import VoiceServiceNotConfiguredError, VoiceTranscriptionError, transcribe_audio

router = APIRouter(prefix="/v1/zenny/voice", tags=["zenny-voice"])


@router.post("/turn", response_model=ZennyVoiceTurnResponse)
async def voice_turn(
    audio: UploadFile = File(...),
    trip_id: str | None = Form(default=None),  # reserved for upcoming trip-context retrieval
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZennyVoiceTurnResponse:
    del trip_id
    audio_bytes = await audio.read(settings.voice_max_upload_bytes + 1)
    if len(audio_bytes) > settings.voice_max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Voice recording is too large")

    try:
        transcript = await transcribe_audio(audio_bytes, audio.content_type, audio.filename)
    except VoiceServiceNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except VoiceTranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    result = await handle_voice_turn(user, transcript, db)
    return ZennyVoiceTurnResponse(
        transcript=transcript,
        spokenText=result.reply,
        intent=result.intent,
        policyTier=result.policy_tier,
        confidence=result.confidence,
        citations=[KnowledgeCitationOut(**citation) for citation in result.citations],
        items=result.items,
    )
