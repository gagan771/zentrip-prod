"""Optional, self-hosted speech-to-text for Zenny voice turns.

Models run on the backend only. Importing this module never loads a model; that
happens lazily on the first valid audio request so normal API development remains
fast and model-free. CPU + tiny + greedy decode is the default latency path.
"""

import asyncio
import io
import os
import tempfile
import wave
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.provider_http import http_session


class VoiceServiceNotConfiguredError(Exception):
    pass


class VoiceTranscriptionError(Exception):
    pass


_CONTENT_TYPE_SUFFIXES = {
    "audio/aac": ".aac",
    "audio/m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/3gpp": ".3gp",
    "audio/amr": ".amr",
}


def _load_whisper(device: str, compute_type: str):
    from faster_whisper import WhisperModel

    return WhisperModel(
        settings.voice_stt_model,
        device=device,
        compute_type=compute_type,
    )


@lru_cache(maxsize=1)
def _transcriber():
    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError as exc:
        raise VoiceServiceNotConfiguredError(
            "Voice transcription is not installed on this backend. Install requirements-voice.txt first."
        ) from exc

    device = settings.voice_stt_device
    compute = settings.voice_stt_compute_type
    try:
        return _load_whisper(device, compute)
    except Exception as first:
        if device.casefold() != "cpu":
            try:
                return _load_whisper("cpu", "int8")
            except Exception as exc:
                raise VoiceServiceNotConfiguredError(
                    f"Unable to load the Zenny speech model: {exc}"
                ) from exc
        raise VoiceServiceNotConfiguredError(f"Unable to load the Zenny speech model: {first}") from first


def _resolve_language(language: str | None) -> str | None:
    chosen = (language or settings.voice_stt_language or "").strip()
    if not chosen or chosen.casefold() == "auto":
        return None
    return chosen


def _silent_wav(duration_ms: int = 250, sample_rate: int = 16000) -> bytes:
    frames = int(sample_rate * duration_ms / 1000)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * frames)
    return buffer.getvalue()


def _whisper_decode(path: str, language: str | None):
    beam = max(1, int(settings.voice_stt_beam_size))
    return _transcriber().transcribe(
        path,
        language=language,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 200},
        beam_size=beam,
        temperature=0.0,
        condition_on_previous_text=False,
        without_timestamps=True,
    )


def warmup_transcriber() -> None:
    """Load weights and run one dummy decode so the first real turn is not a cold start."""
    try:
        _transcriber()
    except VoiceServiceNotConfiguredError:
        return
    path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="zenny-warmup-", suffix=".wav", delete=False) as audio_file:
            audio_file.write(_silent_wav())
            path = audio_file.name
        segments, _info = _whisper_decode(path, "en")
        # Drain the generator so CTranslate2 actually compiles the decoder graph.
        for _ in segments:
            break
    except Exception:
        return
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


def _transcribe_with_deepgram(audio_bytes: bytes, content_type: str | None, language: str | None) -> str:
    params: dict[str, str] = {
        "model": "nova-2",
        "smart_format": "false",
        "punctuate": "true",
        "utterances": "false",
    }
    resolved = _resolve_language(language)
    if resolved:
        params["language"] = resolved
    else:
        params["detect_language"] = "true"
    response = http_session().post(
        "https://api.deepgram.com/v1/listen",
        headers={
            "Authorization": f"Token {settings.deepgram_api_key}",
            "Content-Type": content_type or "audio/m4a",
        },
        params=params,
        data=audio_bytes,
        timeout=12,
    )
    if not response.ok:
        raise VoiceTranscriptionError(f"Deepgram returned HTTP {response.status_code}: {response.text[:300]}")
    try:
        transcript = response.json()["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise VoiceTranscriptionError("Deepgram did not return a transcript") from exc
    if not transcript:
        raise VoiceTranscriptionError("I couldn't hear any speech. Please hold the button and try again.")
    return transcript


def _transcribe_sync(
    audio_bytes: bytes,
    content_type: str | None,
    filename: str | None,
    language: str | None = None,
) -> str:
    if not audio_bytes:
        raise VoiceTranscriptionError("The recording was empty")
    if settings.deepgram_api_key:
        return _transcribe_with_deepgram(audio_bytes, content_type, language)
    suffix = _CONTENT_TYPE_SUFFIXES.get((content_type or "").casefold())
    if suffix is None and filename:
        suffix = Path(filename).suffix.casefold()
    if suffix not in set(_CONTENT_TYPE_SUFFIXES.values()):
        raise VoiceTranscriptionError("Use an AAC, M4A, MP3, OGG, WAV, or WebM recording")

    path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="zenny-voice-", suffix=suffix, delete=False) as audio_file:
            audio_file.write(audio_bytes)
            path = audio_file.name
        segments, _ = _whisper_decode(path, _resolve_language(language))
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        if not transcript:
            raise VoiceTranscriptionError("I couldn't hear any speech. Please hold the button and try again.")
        return transcript
    except VoiceServiceNotConfiguredError:
        raise
    except VoiceTranscriptionError:
        raise
    except Exception as exc:
        raise VoiceTranscriptionError(f"Zenny couldn't transcribe that recording: {exc}") from exc
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


async def transcribe_audio(
    audio_bytes: bytes,
    content_type: str | None,
    filename: str | None,
    language: str | None = None,
) -> str:
    return await asyncio.to_thread(_transcribe_sync, audio_bytes, content_type, filename, language)
