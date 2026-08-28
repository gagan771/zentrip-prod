"""Paid streaming STT: Sarvam realtime first, Deepgram second.

Phone TTS stays on-device. These sockets exist only to get text fast.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

from app.config import settings
from app.sarvam_keys import is_sarvam_rate_limit, key_label, sarvam_pool

logger = logging.getLogger("zentrip.voice")

SttKind = Literal["partial", "final", "speech_start", "speech_end", "error"]
EventHandler = Callable[["SttEvent"], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class SttEvent:
    kind: SttKind
    text: str = ""
    language: str | None = None


def parse_sarvam_event(payload: dict) -> SttEvent | None:
    event = str(payload.get("event") or payload.get("type") or "")
    text = str(payload.get("text") or payload.get("transcript") or "").strip()
    language = payload.get("language")
    if isinstance(language, str):
        language = language or None
    else:
        language = None
    if event in {"transcript.partial", "partial"}:
        return SttEvent("partial", text, language)
    if event in {"transcript.final", "final"}:
        return SttEvent("final", text, language)
    if event in {"vad.speech_start", "START_SPEECH"}:
        return SttEvent("speech_start")
    if event in {"vad.speech_end", "END_SPEECH"}:
        return SttEvent("speech_end")
    if event == "error":
        return SttEvent("error", str(payload.get("message") or "Sarvam STT error"))
    data = payload.get("data")
    if isinstance(data, dict):
        return parse_sarvam_event(data)
    return None


def parse_deepgram_event(payload: dict) -> SttEvent | None:
    if payload.get("type") == "SpeechStarted":
        return SttEvent("speech_start")
    if payload.get("type") == "UtteranceEnd":
        return SttEvent("speech_end")
    channel = payload.get("channel") or {}
    alts = channel.get("alternatives") or []
    transcript = ""
    if alts:
        transcript = str(alts[0].get("transcript") or "").strip()
    if not transcript:
        return None
    if payload.get("is_final") or payload.get("speech_final"):
        return SttEvent("final", transcript)
    return SttEvent("partial", transcript)


class SarvamRateLimited(Exception):
    pass


class SarvamHangup(Exception):
    pass


async def run_streaming_stt(pcm_in: asyncio.Queue[bytes | None], on_event: EventHandler) -> None:
    if settings.sarvam_key_list:
        await _run_sarvam(pcm_in, on_event)
        return
    if settings.deepgram_api_key.strip():
        await _run_deepgram(pcm_in, on_event)
        return
    raise RuntimeError("No streaming STT key configured. Set SARVAM_API_KEYS (or DEEPGRAM_API_KEY).")


def _ws_connect_kwargs(headers: dict[str, str]) -> dict:
    try:
        import inspect

        import websockets

        params = inspect.signature(websockets.connect).parameters
        if "additional_headers" in params:
            return {"additional_headers": headers}
        if "extra_headers" in params:
            return {"extra_headers": headers}
    except Exception:
        pass
    return {"additional_headers": headers}


async def _run_sarvam(pcm_in: asyncio.Queue[bytes | None], on_event: EventHandler) -> None:
    pool = sarvam_pool()
    failures = 0
    while True:
        key = pool.acquire()
        if key is None:
            wait = min(15.0, max(0.5, pool.seconds_until_ready()))
            failures += 1
            if failures >= 3:
                await on_event(
                    SttEvent("error", "All Sarvam accounts are rate-limited. The call will retry automatically.")
                )
                failures = 0
            await asyncio.sleep(wait)
            continue
        try:
            logger.info("zenny.live using Sarvam key %s (%s ready)", key_label(key), pool.ready_count)
            await _sarvam_session(key, pcm_in, on_event)
            return
        except SarvamHangup:
            return
        except SarvamRateLimited:
            pool.mark_limited(key)
            logger.warning("zenny.live Sarvam key %s rate-limited; rotating", key_label(key))
            failures = 0
        except Exception:
            logger.exception("zenny.live Sarvam session failed on key %s; rotating", key_label(key))
            pool.mark_limited(key, seconds=8)
            failures += 1
            if failures >= max(3, len(pool.keys)):
                if settings.deepgram_api_key.strip():
                    await _run_deepgram(pcm_in, on_event)
                    return
                await on_event(SttEvent("error", "Live speech recognition dropped. Try the call again."))
                return


async def _sarvam_session(key: str, pcm_in: asyncio.Queue[bytes | None], on_event: EventHandler) -> None:
    import websockets
    from websockets.exceptions import ConnectionClosed

    query = urlencode(
        {
            "language_code": settings.voice_language_tag,
            "model": "saaras:v3-realtime",
            "stream_type": "fast",
            "mode": "transcribe",
            "endpointing": "vad",
            "encoding": "linear16",
            "sample_rate": "16000",
            "silence_duration_ms": "500",
            "min_speech_duration_ms": "220",
            "threshold": "0.32",
        }
    )
    url = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?{query}"
    headers = {"api-subscription-key": key}
    try:
        async with websockets.connect(
            url, max_size=2**22, ping_interval=20, **_ws_connect_kwargs(headers)
        ) as socket:
            sender = asyncio.create_task(_sarvam_sender(socket, pcm_in))
            try:
                async for raw in socket:
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8", "ignore")
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    event = parse_sarvam_event(payload)
                    if event is None:
                        continue
                    if event.kind == "error" and is_sarvam_rate_limit(event.text):
                        raise SarvamRateLimited(event.text)
                    await on_event(event)
                    if event.kind == "error":
                        break
            finally:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
    except ConnectionClosed as exc:
        code = getattr(exc, "code", None) or getattr(getattr(exc, "rcvd", None), "code", None)
        if is_sarvam_rate_limit(str(exc), code):
            raise SarvamRateLimited(str(exc)) from exc
        raise


async def _sarvam_sender(socket, pcm_in: asyncio.Queue[bytes | None]) -> None:
    while True:
        chunk = await pcm_in.get()
        if chunk is None:
            try:
                await socket.send(json.dumps({"event": "end"}))
            except Exception:
                pass
            return
        if not chunk:
            await socket.send(json.dumps({"event": "ping"}))
            continue
        await socket.send(
            json.dumps(
                {
                    "event": "audio_input",
                    "audio": base64.b64encode(chunk).decode("ascii"),
                }
            )
        )


async def _run_deepgram(pcm_in: asyncio.Queue[bytes | None], on_event: EventHandler) -> None:
    import websockets

    language = settings.voice_language_tag
    if language == "auto":
        language = "en-IN"
    query = urlencode(
        {
            "model": "nova-2",
            "language": language,
            "encoding": "linear16",
            "sample_rate": "16000",
            "channels": "1",
            "interim_results": "true",
            "endpointing": "400",
            "utterance_end_ms": "1000",
            "punctuate": "true",
            "smart_format": "false",
        }
    )
    url = f"wss://api.deepgram.com/v1/listen?{query}"
    headers = {"Authorization": f"Token {settings.deepgram_api_key.strip()}"}
    async with websockets.connect(url, max_size=2**22, ping_interval=15, **_ws_connect_kwargs(headers)) as socket:
        sender = asyncio.create_task(_deepgram_sender(socket, pcm_in))
        try:
            async for raw in socket:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", "ignore")
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                event = parse_deepgram_event(payload)
                if event is not None:
                    await on_event(event)
        finally:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)


async def _deepgram_sender(socket, pcm_in: asyncio.Queue[bytes | None]) -> None:
    while True:
        chunk = await pcm_in.get()
        if chunk is None:
            await socket.send(json.dumps({"type": "CloseStream"}))
            return
        if chunk:
            await socket.send(chunk)
