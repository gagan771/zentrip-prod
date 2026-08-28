"""Voice-first Zenny turn API.

This is intentionally an audio endpoint, not a user-facing chat API: it accepts a
short push-to-talk recording, transcribes it on the backend, invokes the agent, and
returns the text that the phone's native TTS speaks aloud.
"""

import uuid

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
    trip_id: str | None = Form(default=None),  # used for trip-memory context when the traveller has an active trip
    session_id: str | None = Form(default=None, alias="sessionId"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZennyVoiceTurnResponse:
    parsed_trip: uuid.UUID | None = None
    if trip_id:
        try:
            parsed_trip = uuid.UUID(trip_id)
        except ValueError:
            parsed_trip = None
    audio_bytes = await audio.read(settings.voice_max_upload_bytes + 1)
    if len(audio_bytes) > settings.voice_max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Voice recording is too large")

    try:
        transcript = await transcribe_audio(
            audio_bytes, audio.content_type, audio.filename, language=settings.voice_stt_language
        )
    except VoiceServiceNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except VoiceTranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    session_id = session_id or str(uuid.uuid4())
    result = await handle_voice_turn(
        user, transcript, db, session_id=session_id, trip_id=parsed_trip
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="I couldn't hear a question in that.")
    return ZennyVoiceTurnResponse(
        sessionId=session_id,
        transcript=transcript,
        spokenText=result.reply,
        intent=result.intent,
        policyTier=result.policy_tier,
        confidence=result.confidence,
        citations=[KnowledgeCitationOut(**citation) for citation in result.citations],
        items=result.items,
    )
