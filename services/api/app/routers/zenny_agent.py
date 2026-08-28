"""Sarvam Voice Agent live call: JWT ticket in, PCM bridge, no API key on the phone."""

import asyncio
import base64
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.livekit_tokens import livekit_ready, mint_livekit_token
from app.rate_limit import limiter
from app.redis_client import redis
from app.schemas import (
    ZennyAgentSessionRequest,
    ZennyAgentSessionResponse,
    ZennyLivekitTokenRequest,
    ZennyLivekitTokenResponse,
    ZennyVoiceStatusResponse,
)
from app.sarvam_voice_agent import VoiceAgentError, create_call_agent, voice_agent_ready
from app.voice_pcm import AudioDecodeError, clip_to_pcm16

logger = logging.getLogger("zentrip.voice")
router = APIRouter(prefix="/v1/zenny/voice", tags=["zenny-voice-agent"])

_TICKET_TTL = 45
_FLUSH_BYTES = 16000 * 2 // 5  # ~200 ms of 16 kHz PCM16


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        raw = await request.json()
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def _ws_url(ticket: str) -> str:
    base = (settings.public_base_url or "").rstrip("/")
    if base.startswith("https://"):
        root = "wss://" + base[len("https://") :]
    elif base.startswith("http://"):
        root = "ws://" + base[len("http://") :]
    else:
        root = ""
    path = f"/v1/zenny/voice/agent?ticket={ticket}"
    return f"{root}{path}" if root else path


_WEB_CALL_PAGE = Path(__file__).resolve().parents[1] / "static" / "zenny-web-call.html"


@router.get("/call", response_class=HTMLResponse)
@limiter.exempt
async def zenny_web_call() -> FileResponse:
    if settings.app_env == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not _WEB_CALL_PAGE.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Web call page is missing.")
    return FileResponse(_WEB_CALL_PAGE, media_type="text/html; charset=utf-8")


@router.get("/status", response_model=ZennyVoiceStatusResponse)
async def voice_status(user: User = Depends(get_current_user)) -> ZennyVoiceStatusResponse:
    del user
    return ZennyVoiceStatusResponse(
        agentReady=voice_agent_ready(),
        liveSttReady=settings.live_stt_ready,
        deepgramReady=bool(settings.deepgram_api_key.strip()),
        voiceLiveEnabled=settings.voice_live_enabled,
        livekitReady=livekit_ready(),
        knowledgeMode="shared_gateway" if settings.voice_use_shared_gateway else "direct_provider",
    )


@router.post("/token", response_model=ZennyLivekitTokenResponse)
@limiter.limit("12/minute")
async def create_livekit_token(
    request: Request,
    user: User = Depends(get_current_user),
) -> ZennyLivekitTokenResponse:
    if settings.voice_use_shared_gateway:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shared Zenny voice is enabled. Use /v1/zenny/voice/live/session so Deepgram turns use the canonical gateway.",
        )
    if not livekit_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
        )
    body = ZennyLivekitTokenRequest.model_validate(await _json_body(request))
    session_id = body.sessionId or str(uuid.uuid4())
    room = f"zenny-{str(user.id)[:8]}-{session_id.replace('-', '')[:10]}"
    token = mint_livekit_token(identity=str(user.id), name=user.name, room=room)
    return ZennyLivekitTokenResponse(
        url=settings.livekit_url.strip(),
        token=token,
        room=room,
        sessionId=session_id,
    )


@router.post("/agent/session", response_model=ZennyAgentSessionResponse)
@limiter.limit("12/minute")
async def create_agent_session(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZennyAgentSessionResponse:
    del db
    if settings.voice_use_shared_gateway:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shared Zenny voice is enabled. Provider-owned agent sessions are disabled.",
        )
    if not settings.voice_live_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Live voice is disabled.")
    if not voice_agent_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sarvam Voice Agent is not configured. Set SARVAM_VOICE_APP_ID, SARVAM_VOICE_ORG_ID, SARVAM_VOICE_WORKSPACE_ID, and SARVAM_API_KEY.",
        )
    body = ZennyAgentSessionRequest.model_validate(await _json_body(request))
    session_id = body.sessionId or str(uuid.uuid4())
    ticket = uuid.uuid4().hex
    await redis.set(
        f"zentrip:voice-agent:{ticket}",
        json.dumps(
            {
                "userId": str(user.id),
                "userName": user.name,
                "language": user.language,
                "sessionId": session_id,
                "tripId": str(body.tripId) if body.tripId else None,
            }
        ),
        ex=_TICKET_TTL,
    )
    return ZennyAgentSessionResponse(
        sessionId=session_id,
        wsUrl=_ws_url(ticket),
        ticket=ticket,
        sampleRate=16000,
    )


@router.websocket("/agent")
async def agent_voice(websocket: WebSocket, ticket: str = Query(...)) -> None:
    raw = await redis.get(f"zentrip:voice-agent:{ticket}")
    if not raw:
        await websocket.close(code=4401)
        return
    await redis.delete(f"zentrip:voice-agent:{ticket}")
    claim = json.loads(raw)
    await websocket.accept()

    pcm_out = bytearray()
    out_rate = 16000
    started = time.monotonic()
    max_seconds = max(30, int(settings.sarvam_voice_max_seconds))
    last_user = ""
    last_bot = ""
    agent = None

    async def emit(message: dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def flush_audio(force: bool = False) -> None:
        nonlocal pcm_out
        if not pcm_out:
            return
        if not force and len(pcm_out) < _FLUSH_BYTES:
            return
        payload = bytes(pcm_out)
        pcm_out.clear()
        await emit(
            {
                "type": "audio",
                "data": base64.b64encode(payload).decode("ascii"),
                "sampleRate": out_rate,
            }
        )

    async def on_audio(pcm: bytes, sample_rate: int) -> None:
        nonlocal out_rate
        if sample_rate:
            out_rate = sample_rate
        pcm_out.extend(pcm)
        await flush_audio()

    async def on_transcript(role: str, text: str) -> None:
        nonlocal last_user, last_bot
        if role == "user":
            last_user = text
            await emit({"type": "partial", "text": text})
            await emit({"type": "status", "phase": "listening"})
            return
        last_bot = text
        await emit({"type": "status", "phase": "speaking"})
        await emit({"type": "speak", "text": text})
        await emit(
            {
                "type": "reply",
                "sessionId": claim["sessionId"],
                "transcript": last_user,
                "spokenText": text,
                "intent": "chat",
                "policyTier": "no_confirmation",
                "confidence": "verified",
                "citations": [],
                "items": [],
                "brain": "sarvam-voice-agent",
            }
        )

    async def on_event(kind: str) -> None:
        if "user_interrupt" in kind:
            pcm_out.clear()
            await emit({"type": "interrupt"})
            await emit({"type": "status", "phase": "listening"})
        elif "user_speech_start" in kind:
            await emit({"type": "status", "phase": "listening"})
        elif "interaction_end" in kind:
            await flush_audio(force=True)
            await emit({"type": "status", "phase": "idle"})

    await emit({"type": "status", "phase": "connecting", "provider": "sarvam-voice-agent"})
    try:
        agent = await create_call_agent(
            user_id=claim["userId"],
            user_name=claim.get("userName"),
            language=claim.get("language"),
            trip_id=claim.get("tripId"),
            on_audio=on_audio,
            on_transcript=on_transcript,
            on_event=on_event,
        )
    except VoiceAgentError as exc:
        await emit({"type": "error", "message": str(exc)})
        await websocket.close(code=4403)
        return

    await emit({"type": "status", "phase": "listening"})
    logger.info("sarvam.agent call open user=%s session=%s", claim["userId"][:8], claim["sessionId"][:8])

    try:
        while True:
            if time.monotonic() - started > max_seconds:
                await emit({"type": "error", "message": "Call time limit reached."})
                break
            try:
                incoming = await asyncio.wait_for(websocket.receive(), timeout=15.0)
            except TimeoutError:
                continue
            if incoming.get("type") == "websocket.disconnect":
                break
            if incoming.get("bytes"):
                try:
                    pcm = await clip_to_pcm16(incoming["bytes"], "audio/l16")
                    await agent.send_audio(pcm)
                except AudioDecodeError:
                    pass
                except Exception:
                    break
                continue
            text = incoming.get("text")
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                continue
            kind = message.get("type")
            if kind in {"hangup", "end"}:
                break
            if kind == "ping":
                await emit({"type": "pong"})
                continue
            if kind == "audio":
                try:
                    audio_bytes = base64.b64decode(message.get("data") or message.get("audio") or "")
                    pcm = await clip_to_pcm16(audio_bytes, message.get("mime") or "audio/l16")
                    await agent.send_audio(pcm)
                except Exception:
                    continue
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("sarvam.agent socket failed")
        await emit({"type": "error", "message": "The live call dropped."})
    finally:
        await flush_audio(force=True)
        if agent is not None:
            try:
                await agent.stop()
            except Exception:
                pass
        logger.info("sarvam.agent call closed user=%s", claim["userId"][:8])
