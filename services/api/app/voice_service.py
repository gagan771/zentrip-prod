"""Optional, self-hosted speech-to-text for Zenny voice turns.

Models run on the backend only. Importing this module never loads a model; that
happens lazily on the first valid audio request so normal API development remains
fast and model-free.
"""

import asyncio
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from app.config import settings


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
}


@lru_cache(maxsize=1)
def _transcriber():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise VoiceServiceNotConfiguredError(
            "Voice transcription is not installed on this backend. Install requirements-voice.txt first."
        ) from exc

    try:
        return WhisperModel(
            settings.voice_stt_model,
            device=settings.voice_stt_device,
            compute_type=settings.voice_stt_compute_type,
        )
    except Exception as exc:  # model download / hardware errors have useful provider detail
        raise VoiceServiceNotConfiguredError(f"Unable to load the Zenny speech model: {exc}") from exc


def _transcribe_sync(audio_bytes: bytes, content_type: str | None, filename: str | None) -> str:
    if not audio_bytes:
        raise VoiceTranscriptionError("The recording was empty")
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
        segments, _ = _transcriber().transcribe(path, language="en", vad_filter=True, beam_size=3)
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


async def transcribe_audio(audio_bytes: bytes, content_type: str | None, filename: str | None) -> str:
    return await asyncio.to_thread(_transcribe_sync, audio_bytes, content_type, filename)
