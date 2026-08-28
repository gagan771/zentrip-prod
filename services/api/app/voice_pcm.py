"""Decode phone clips into 16 kHz mono PCM16 for streaming STT."""

from __future__ import annotations

import asyncio
import io
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
    if channels != 1 or bits != 16 or sample_rate != 16000:
        raise AudioDecodeError(f"Need 16-bit 16 kHz mono WAV, got {channels}ch {bits}-bit {sample_rate}Hz")
    return pcm


def looks_like_wav(audio: bytes) -> bool:
    return len(audio) >= 12 and audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"


def looks_like_media_container(audio: bytes) -> bool:
    if looks_like_wav(audio):
        return True
    if len(audio) >= 8 and audio[4:8] == b"ftyp":
        return True
    if audio[:4] == b"OggS":
        return True
    if audio[:4] == b"\x1aE\xdf\xa3":
        return True
    return False


def is_raw_pcm16(audio: bytes, mime: str | None = None) -> bool:
    kind = (mime or "").casefold()
    if "pcm" in kind or kind in {"audio/l16", "audio/linear16", "application/octet-stream"}:
        return True
    if mime:
        return False
    return len(audio) >= 2 and len(audio) % 2 == 0 and not looks_like_media_container(audio)


def _frame_pcm(frame) -> bytes:
    array = frame.to_ndarray()
    return array.tobytes()


def pyav_pcm16(audio: bytes) -> bytes:
    """Decode AAC/M4A/WebM/WAV with PyAV (bundled FFmpeg libs)."""
    import av

    chunks: list[bytes] = []
    try:
        with av.open(io.BytesIO(audio), mode="r") as container:
            stream = next((item for item in container.streams if item.type == "audio"), None)
            if stream is None:
                raise AudioDecodeError("Clip had no audio stream")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
            for frame in container.decode(stream):
                converted = resampler.resample(frame)
                if not converted:
                    continue
                frames = converted if isinstance(converted, (list, tuple)) else [converted]
                for item in frames:
                    chunks.append(_frame_pcm(item))
            leftover = resampler.resample(None)
            if leftover:
                frames = leftover if isinstance(leftover, (list, tuple)) else [leftover]
                for item in frames:
                    chunks.append(_frame_pcm(item))
    except AudioDecodeError:
        raise
    except Exception as exc:
        raise AudioDecodeError(f"Could not decode microphone clip: {exc}") from exc
    pcm = b"".join(chunks)
    if len(pcm) < 320:
        raise AudioDecodeError("Decoded clip was too short")
    return pcm


async def clip_to_pcm16(audio: bytes, mime: str | None = None) -> bytes:
    if not audio:
        raise AudioDecodeError("Empty audio")
    if is_raw_pcm16(audio, mime):
        return audio
    if looks_like_wav(audio):
        try:
            return wav_to_pcm16(audio)
        except AudioDecodeError:
            pass
    return await asyncio.to_thread(pyav_pcm16, audio)
