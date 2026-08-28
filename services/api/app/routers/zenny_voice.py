"""Voice-first Zenny turn API.

This is intentionally an audio endpoint, not a user-facing chat API: it accepts a
short push-to-talk recording, transcribes it on the backend, invokes the agent, and
returns the text that the phone's native TTS speaks aloud.
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_gateway import handle_voice_turn, load_session_messages, append_session_message
from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.knowledge_learning import record_knowledge_interaction
from app.models import User
from app.schemas import KnowledgeCitationOut, ZennyVoiceTurnResponse
from app.sarvam_voice_agent import VoiceAgentError, ask_text, voice_agent_ready
from app.spoken import spoken_preview
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
    if voice_agent_ready() and not settings.voice_use_shared_gateway:
        try:
            history = await load_session_messages(user.id, session_id)
            reply = await ask_text(
                user_id=str(user.id),
                user_name=user.name,
                language=user.language,
                trip_id=str(parsed_trip) if parsed_trip else None,
                text=transcript,
                history=history,
            )
            spoken = spoken_preview(reply)
            await append_session_message(user.id, "user", transcript, session_id)
            await append_session_message(user.id, "assistant", spoken, session_id)
            interaction_id = None
            try:
                interaction = await record_knowledge_interaction(
                    db,
                    user,
                    query=transcript,
                    intent="chat",
                    result_count=0,
                    citation_count=0,
                    confidence="verified",
                    session_id=session_id,
                )
                await db.commit()
                interaction_id = interaction.id
            except Exception:  # noqa: BLE001 — telemetry must not break the voice turn
                await db.rollback()
            return ZennyVoiceTurnResponse(
                sessionId=session_id,
                interactionId=interaction_id,
                transcript=transcript,
                spokenText=spoken,
                intent="chat",
                policyTier="no_confirmation",
                confidence="verified",
                citations=[],
                items=[],
                brain="sarvam-voice-agent",
            )
        except VoiceAgentError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    result = await handle_voice_turn(
        user, transcript, db, session_id=session_id, trip_id=parsed_trip
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="I couldn't hear a question in that.")
    return ZennyVoiceTurnResponse(
        sessionId=session_id,
        interactionId=result.interaction_id,
        transcript=transcript,
        spokenText=result.reply,
        intent=result.intent,
        policyTier=result.policy_tier,
        confidence=result.confidence,
        citations=[KnowledgeCitationOut(**citation) for citation in result.citations],
        items=result.items,
        brain="zentrip-shared-knowledge-gateway",
    )
