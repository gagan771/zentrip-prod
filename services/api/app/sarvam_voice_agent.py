"""Sarvam Voice Agent: signed CALL/CHAT sessions. API key never leaves this process."""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any, Awaitable, Callable

from pydantic import SecretStr

from app.config import settings
from app.sarvam_keys import key_label, sarvam_pool

logger = logging.getLogger("zentrip.voice")

_LANGUAGE = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "ml": "Malayalam",
    "mr": "Marathi",
    "gu": "Gujarati",
    "kn": "Kannada",
    "pa": "Punjabi",
    "or": "Odia",
    "od": "Odia",
}


class VoiceAgentError(Exception):
    pass


def voice_agent_ready() -> bool:
    return settings.voice_agent_ready


def map_language_name(code: str | None) -> str | None:
    configured = (settings.sarvam_voice_language or "").strip()
    if configured:
        return configured
    raw = (code or "en").strip().casefold()
    if "-" in raw:
        raw = raw.split("-", 1)[0]
    return _LANGUAGE.get(raw, "English")


def _pcm_from_agent_audio(raw: bytes) -> bytes:
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WAVE":
        from app.voice_pcm import wav_to_pcm16

        try:
            return wav_to_pcm16(raw)
        except Exception:
            return raw[44:] if len(raw) > 44 else raw
    return raw


def _api_key() -> str:
    key = sarvam_pool().acquire()
    if not key:
        raise VoiceAgentError("No Sarvam API key is ready. Set SARVAM_API_KEY.")
    return key


def build_interaction_config(
    *,
    user_id: str,
    call: bool,
    user_name: str | None = None,
    language: str | None = None,
    trip_id: str | None = None,
):
    from sarvam_conv_ai_sdk import InteractionConfig, InteractionType, SarvamToolLanguageName
    from sarvam_conv_ai_sdk.messages.types import UserIdentifierType

    variables: dict[str, Any] = {}
    if user_name:
        variables["traveler_name"] = user_name
    if trip_id:
        variables["trip_id"] = trip_id
    lang_name = map_language_name(language)
    kwargs: dict[str, Any] = {
        "user_identifier_type": UserIdentifierType.CUSTOM,
        "user_identifier": user_id[:120],
        "org_id": settings.sarvam_voice_org_id.strip(),
        "workspace_id": settings.sarvam_voice_workspace_id.strip(),
        "app_id": settings.sarvam_voice_app_id.strip(),
        "interaction_type": InteractionType.CALL if call else InteractionType.CHAT,
        "sample_rate": 16000,
        "speech_hotwords": settings.voice_agent_hotword_list or None,
        "agent_variables": variables or None,
    }
    if settings.sarvam_voice_app_version > 0:
        kwargs["version"] = settings.sarvam_voice_app_version
    if lang_name:
        try:
            kwargs["initial_language_name"] = SarvamToolLanguageName(lang_name)
        except ValueError:
            pass
    return InteractionConfig(**kwargs)


async def create_call_agent(
    *,
    user_id: str,
    user_name: str | None,
    language: str | None,
    trip_id: str | None,
    on_audio: Callable[[bytes, int], Awaitable[None]],
    on_transcript: Callable[[str, str], Awaitable[None]],
    on_event: Callable[[str], Awaitable[None]],
):
    from sarvam_conv_ai_sdk import AsyncSamvaadAgent, Role, ServerAudioChunkMsg, ServerEventBase, ServerTranscriptMsg

    key = _api_key()
    config = build_interaction_config(
        user_id=user_id, call=True, user_name=user_name, language=language, trip_id=trip_id
    )

    async def audio_cb(msg: ServerAudioChunkMsg) -> None:
        if not msg.audio_base64:
            return
        try:
            raw = base64.b64decode(msg.audio_base64)
        except Exception:
            return
        pcm = _pcm_from_agent_audio(raw)
        if not pcm:
            return
        await on_audio(pcm, int(msg.sample_rate or 16000))

    async def transcript_cb(msg: ServerTranscriptMsg) -> None:
        text = (msg.content or "").strip()
        if not text:
            return
        role = "bot" if msg.role == Role.BOT else "user"
        await on_transcript(role, text)

    async def event_cb(event: ServerEventBase) -> None:
        kind = str(getattr(event, "type", "") or "")
        await on_event(kind)

    agent = AsyncSamvaadAgent(
        api_key=SecretStr(key),
        config=config,
        audio_callback=audio_cb,
        transcript_callback=transcript_cb,
        event_callback=event_cb,
    )
    try:
        await agent.start()
        connected = await agent.wait_for_connect(timeout=8.0)
        if not connected:
            await agent.stop()
            sarvam_pool().mark_limited(key)
            raise VoiceAgentError("Sarvam Voice Agent did not connect. Check app id, org, workspace, and a committed version.")
    except VoiceAgentError:
        raise
    except Exception as exc:
        logger.exception("sarvam.agent start failed key=%s", key_label(key))
        try:
            await agent.stop()
        except Exception:
            pass
        raise VoiceAgentError(str(exc) or "Sarvam Voice Agent failed to start") from exc
    logger.info(
        "sarvam.agent connected key=%s interaction=%s",
        key_label(key),
        agent.get_interaction_id(),
    )
    return agent


async def ask_text(
    *,
    user_id: str,
    user_name: str | None,
    language: str | None,
    trip_id: str | None,
    text: str,
    history: list[dict] | None = None,
) -> str:
    """One CHAT turn against the same Voice Agent (Expo Go / tap-to-talk)."""
    from sarvam_conv_ai_sdk import (
        AsyncSamvaadAgent,
        MsgStatus,
        Role,
        ServerTextChunkMsg,
        ServerTextMsg,
        ServerTranscriptMsg,
    )

    prompt = text.strip()
    if history:
        lines = []
        for turn in history[-8:]:
            role = "Traveller" if turn.get("role") == "user" else "Zenny"
            body = (turn.get("text") or "").strip()
            if body:
                lines.append(f"{role}: {body}")
        if lines:
            prompt = "Earlier in this call:\n" + "\n".join(lines) + "\nTraveller: " + prompt

    key = _api_key()
    config = build_interaction_config(
        user_id=user_id, call=False, user_name=user_name, language=language, trip_id=trip_id
    )
    chunks: list[str] = []
    done = asyncio.Event()

    async def on_text(msg: Any) -> None:
        piece = (getattr(msg, "text", None) or "").strip()
        if not piece:
            return
        chunks.append(piece)
        if isinstance(msg, ServerTextMsg):
            done.set()
        elif isinstance(msg, ServerTextChunkMsg) and msg.status == MsgStatus.COMPLETED:
            done.set()

    async def on_transcript(msg: ServerTranscriptMsg) -> None:
        if msg.role != Role.BOT:
            return
        piece = (msg.content or "").strip()
        if not piece:
            return
        chunks.append(piece)
        done.set()

    agent = AsyncSamvaadAgent(
        api_key=SecretStr(key),
        config=config,
        text_callback=on_text,
        transcript_callback=on_transcript,
    )
    try:
        await agent.start()
        connected = await agent.wait_for_connect(timeout=8.0)
        if not connected:
            raise VoiceAgentError("Sarvam Voice Agent chat did not connect.")
        await agent.send_text(prompt)
        try:
            await asyncio.wait_for(done.wait(), timeout=settings.sarvam_voice_text_timeout_seconds)
        except TimeoutError as exc:
            if not chunks:
                raise VoiceAgentError("Zenny did not answer in time.") from exc
        reply = " ".join(part for part in chunks if part).strip()
        if not reply:
            raise VoiceAgentError("Zenny returned an empty answer.")
        return reply
    finally:
        try:
            await agent.stop()
        except Exception:
            pass
