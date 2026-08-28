"""Live Zenny companion: streaming STT in, native phone TTS out."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_gateway import handle_voice_turn
from app.config import settings
from app.db import AsyncSessionLocal, get_db
from app.deps import get_current_user
from app.models import User
from app.redis_client import redis
from app.schemas import KnowledgeCitationOut, ZennyLiveSessionRequest, ZennyLiveSessionResponse
from app.spoken import speak_chunks
from app.stt_live import SttEvent, run_streaming_stt
from app.voice_pcm import AudioDecodeError, clip_to_pcm16

logger = logging.getLogger("zentrip.voice")
router = APIRouter(prefix="/v1/zenny/voice", tags=["zenny-voice-live"])

_TICKET_TTL = 45
_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w+\b")
_PHONE = re.compile(r"\b(?:\+91[\s-]?)?[6-9]\d{9}\b")


def _redact(text: str) -> str:
    text = _EMAIL.sub("[email]", text)
    return _PHONE.sub("[phone]", text)


def _stt_provider_name() -> str:
    if settings.sarvam_key_list:
        return "sarvam"
    if settings.deepgram_api_key.strip():
        return "deepgram"
    return "none"


def _ws_url(ticket: str) -> str:
    base = (settings.public_base_url or "").rstrip("/")
    if base.startswith("https://"):
        root = "wss://" + base[len("https://") :]
    elif base.startswith("http://"):
        root = "ws://" + base[len("http://") :]
    else:
        root = ""
    path = f"/v1/zenny/voice/live?ticket={ticket}"
    return f"{root}{path}" if root else path


@router.post("/live/session", response_model=ZennyLiveSessionResponse)
async def create_live_session(
    body: ZennyLiveSessionRequest = Body(default_factory=ZennyLiveSessionRequest),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZennyLiveSessionResponse:
    del db
    if not settings.voice_live_enabled or not settings.live_stt_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Live voice is not configured. Set SARVAM_API_KEYS (or DEEPGRAM_API_KEY) on the API.",
        )
    payload = body
    session_id = payload.sessionId or str(uuid.uuid4())
    ticket = uuid.uuid4().hex
    await redis.set(
        f"zentrip:voice-live:{ticket}",
        json.dumps(
            {
                "userId": str(user.id),
                "sessionId": session_id,
                "tripId": str(payload.tripId) if payload.tripId else None,
            }
        ),
        ex=_TICKET_TTL,
    )
    return ZennyLiveSessionResponse(
        sessionId=session_id,
        wsUrl=_ws_url(ticket),
        ticket=ticket,
        sttProvider=_stt_provider_name(),
    )


@router.websocket("/live")
async def live_voice(websocket: WebSocket, ticket: str = Query(...)) -> None:
    raw = await redis.get(f"zentrip:voice-live:{ticket}")
    if not raw:
        await websocket.close(code=4401)
        return
    await redis.delete(f"zentrip:voice-live:{ticket}")
    claim = json.loads(raw)
    await websocket.accept()
    await websocket.send_json(
        {"type": "status", "phase": "listening", "sttProvider": _stt_provider_name()}
    )

    pcm_in: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=96)
    agent_task: asyncio.Task | None = None
    generation = 0
    last_final = ""
    decode_failures = 0
    pcm_mode = True

    async def emit(message: dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def cancel_agent() -> None:
        nonlocal agent_task, generation
        generation += 1
        if agent_task and not agent_task.done():
            agent_task.cancel()
            await asyncio.gather(agent_task, return_exceptions=True)
        agent_task = None

    async def run_agent(transcript: str, gen: int, started: float) -> None:
        text = " ".join(transcript.split()).strip()
        if not text:
            return
        await emit({"type": "status", "phase": "thinking"})
        trip_id = None
        if claim.get("tripId"):
            try:
                trip_id = uuid.UUID(claim["tripId"])
            except ValueError:
                trip_id = None
        try:
            async with AsyncSessionLocal() as db:
                user = await db.get(User, uuid.UUID(claim["userId"]))
                if user is None:
                    raise RuntimeError("User not found")
                result = await handle_voice_turn(
                    user, text, db, session_id=claim["sessionId"], trip_id=trip_id
                )
            if gen != generation:
                return
            if result is None:
                await emit({"type": "status", "phase": "listening"})
                return
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "zenny.live turn transcript=%s intent=%s latency_ms=%s",
                _redact(text)[:180],
                result.intent,
                latency_ms,
            )
            chunks = speak_chunks(result.reply)
            if chunks:
                await emit({"type": "status", "phase": "speaking"})
                await emit({"type": "speak", "text": chunks[0]})
            for chunk in chunks[1:]:
                if gen != generation:
                    return
                await emit({"type": "speak", "text": chunk})
            await emit(
                {
                    "type": "reply",
                    "sessionId": claim["sessionId"],
                    "interactionId": str(result.interaction_id) if result.interaction_id else None,
                    "transcript": text,
                    "spokenText": result.reply,
                    "intent": result.intent,
                    "policyTier": result.policy_tier,
                    "confidence": result.confidence,
                    "citations": [KnowledgeCitationOut(**citation).model_dump(mode="json") for citation in result.citations],
                    "items": result.items,
                }
            )
            await emit({"type": "status", "phase": "listening"})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("zenny.live agent failed")
            if gen == generation:
                await emit({"type": "error", "message": str(exc)})
                await emit({"type": "status", "phase": "listening"})

    async def on_stt(event: SttEvent) -> None:
        nonlocal agent_task, last_final
        if event.kind == "partial" and event.text:
            await emit({"type": "partial", "text": event.text})
        elif event.kind == "speech_start":
            if agent_task and not agent_task.done():
                await cancel_agent()
                await emit({"type": "status", "phase": "listening"})
        elif event.kind == "final":
            text = event.text.strip()
            if not text or text.casefold() == last_final.casefold():
                return
            last_final = text
            await emit({"type": "final", "text": text})
            await cancel_agent()
            gen = generation
            agent_task = asyncio.create_task(run_agent(text, gen, time.perf_counter()))
        elif event.kind == "error":
            await emit({"type": "error", "message": event.text or "Speech recognition failed"})

    stt_task = asyncio.create_task(run_streaming_stt(pcm_in, on_stt))

    try:
        while True:
            incoming = await websocket.receive()
            if incoming.get("type") == "websocket.disconnect":
                break
            if incoming.get("bytes"):
                mime = "audio/l16" if pcm_mode else None
                decode_failures = await _enqueue_pcm(pcm_in, incoming["bytes"], mime, emit, decode_failures)
                continue
            text = incoming.get("text")
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                continue
            kind = message.get("type")
            if kind == "hangup":
                break
            if kind == "start":
                encoding = str(message.get("encoding") or "linear16").casefold()
                pcm_mode = encoding in {"linear16", "pcm", "l16", "audio/l16"}
                continue
            if kind == "barge_in":
                await cancel_agent()
                await emit({"type": "status", "phase": "listening"})
                continue
            if kind == "ping":
                await emit({"type": "pong"})
                continue
            if kind == "audio":
                raw_audio = message.get("data") or message.get("audio") or ""
                try:
                    audio_bytes = base64.b64decode(raw_audio)
                except Exception:
                    continue
                decode_failures = await _enqueue_pcm(pcm_in, audio_bytes, message.get("mime"), emit, decode_failures)
    except WebSocketDisconnect:
        pass
    finally:
        await cancel_agent()
        try:
            pcm_in.put_nowait(None)
        except asyncio.QueueFull:
            pass
        stt_task.cancel()
        await asyncio.gather(stt_task, return_exceptions=True)


async def _enqueue_pcm(
    pcm_in: asyncio.Queue[bytes | None],
    audio: bytes,
    mime: str | None,
    emit,
    decode_failures: int,
) -> int:
    if not audio:
        return decode_failures
    try:
        pcm = await clip_to_pcm16(audio, mime)
    except AudioDecodeError as exc:
        logger.warning("zenny.live decode failed: %s", exc)
        decode_failures += 1
        if decode_failures in {6, 18}:
            await emit(
                {
                    "type": "error",
                    "message": "Zenny could not hear the microphone yet. Keep talking — Android clips need a moment to decode.",
                }
            )
        return decode_failures
    decode_failures = 0
    try:
        pcm_in.put_nowait(pcm)
    except asyncio.QueueFull:
        try:
            pcm_in.get_nowait()
        except asyncio.QueueEmpty:
            pass
        try:
            pcm_in.put_nowait(pcm)
        except asyncio.QueueFull:
            pass
    return decode_failures
