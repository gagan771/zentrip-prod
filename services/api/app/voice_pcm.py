"""Decode phone clips into 16 kHz mono PCM16 for streaming STT."""

from __future__ import annotations

import asyncio
import struct


class AudioDecodeError(Exception):
    pass


def wav_to_pcm16(audio: bytes) -> bytes:
    if len(audio) < 44 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise AudioDecodeError("Not a WAV clip")
    offset = 12
    channels = 1
    sample_rate = 16000
    bits = 16
    pcm = b""
    while offset + 8 <= len(audio):
        chunk_id = audio[offset : offset + 4]
        chunk_size = int.from_bytes(audio[offset + 4 : offset + 8], "little")
        start = offset + 8
        end = start + chunk_size
        if chunk_id == b"fmt " and chunk_size >= 16:
            channels = struct.unpack_from("<H", audio, start + 2)[0]
            sample_rate = struct.unpack_from("<I", audio, start + 4)[0]
            bits = struct.unpack_from("<H", audio, start + 14)[0]
        elif chunk_id == b"data":
            pcm = audio[start:end]
            break
        offset = end + (chunk_size % 2)
    if not pcm:
        raise AudioDecodeError("WAV had no data chunk")
    if channels != 1 or bits != 16:
        raise AudioDecodeError(f"Need 16-bit mono WAV, got {channels}ch {bits}-bit")
    if sample_rate != 16000:
        raise AudioDecodeError(f"Need 16 kHz WAV, got {sample_rate}")
    return pcm


def looks_like_wav(audio: bytes) -> bool:
    return len(audio) >= 12 and audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"


async def clip_to_pcm16(audio: bytes, mime: str | None = None) -> bytes:
    kind = (mime or "").casefold()
    if "pcm" in kind or kind in {"audio/l16", "audio/linear16"}:
        return audio
    if looks_like_wav(audio) or "wav" in kind:
        return wav_to_pcm16(audio)
    return await _ffmpeg_pcm16(audio)


def _ffmpeg_binary() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


async def _ffmpeg_pcm16(audio: bytes) -> bytes:
    ffmpeg_bin = _ffmpeg_binary()
    try:
        process = await asyncio.create_subprocess_exec(
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-ac",
            "1",
            "-ar",
            "16000",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise AudioDecodeError("ffmpeg is required to decode AAC/M4A clips to PCM") from exc
    stdout, stderr = await asyncio.wait_for(process.communicate(audio), timeout=4)
    if process.returncode != 0 or not stdout:
        detail = (stderr or b"").decode("utf-8", "ignore")[:240]
        raise AudioDecodeError(detail or "ffmpeg could not decode that clip")
    return stdout
