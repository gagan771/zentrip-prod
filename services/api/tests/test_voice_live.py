import asyncio
import unittest

from app.stt_live import parse_deepgram_event, parse_sarvam_event
from app.voice_pcm import looks_like_wav, wav_to_pcm16
from app.voice_service import _silent_wav


class SttEventParseTests(unittest.TestCase):
    def test_sarvam_partial_and_final(self) -> None:
        partial = parse_sarvam_event({"event": "transcript.partial", "text": "tell me about"})
        final = parse_sarvam_event({"event": "transcript.final", "text": "Tell me about the Taj."})
        assert partial is not None
        assert final is not None
        self.assertEqual(partial.kind, "partial")
        self.assertEqual(final.kind, "final")
        self.assertEqual(final.text, "Tell me about the Taj.")

    def test_sarvam_vad_and_error(self) -> None:
        start = parse_sarvam_event({"event": "vad.speech_start"})
        error = parse_sarvam_event({"event": "error", "message": "quota", "code": "rate_limited", "status_code": 429})
        assert start is not None
        assert error is not None
        self.assertEqual(start.kind, "speech_start")
        self.assertEqual(error.kind, "error")
        self.assertIn("429", error.text)

    def test_deepgram_interim_and_final(self) -> None:
        interim = parse_deepgram_event(
            {
                "is_final": False,
                "channel": {"alternatives": [{"transcript": "taj"}]},
            }
        )
        final = parse_deepgram_event(
            {
                "is_final": True,
                "channel": {"alternatives": [{"transcript": "Taj Mahal"}]},
            }
        )
        assert interim is not None
        assert final is not None
        self.assertEqual(interim.kind, "partial")
        self.assertEqual(final.kind, "final")


class PcmDecodeTests(unittest.TestCase):
    def test_silent_wav_round_trips(self) -> None:
        wav = _silent_wav()
        self.assertTrue(looks_like_wav(wav))
        pcm = wav_to_pcm16(wav)
        self.assertGreater(len(pcm), 0)
        self.assertEqual(len(pcm) % 2, 0)

    def test_raw_pcm_skips_container_decode(self) -> None:
        from app.voice_pcm import clip_to_pcm16, is_raw_pcm16

        pcm = b"\x00\x01" * 160
        self.assertTrue(is_raw_pcm16(pcm, "audio/l16"))
        self.assertEqual(asyncio.run(clip_to_pcm16(pcm, "audio/l16")), pcm)

    def test_pyav_decodes_wav(self) -> None:
        from app.voice_pcm import pyav_pcm16

        wav = _silent_wav()
        pcm = pyav_pcm16(wav)
        self.assertGreater(len(pcm), 0)
        self.assertEqual(len(pcm) % 2, 0)


class BackchannelTests(unittest.TestCase):
    def test_brief_acknowledgments_are_ignored(self) -> None:
        from app.agent_intent import is_backchannel

        self.assertTrue(is_backchannel("okay"))
        self.assertTrue(is_backchannel("uh-huh"))
        self.assertFalse(is_backchannel("okay how far is Agra"))


class SarvamKeyPoolTests(unittest.TestCase):
    def test_parses_and_dedupes_keys(self) -> None:
        from app.sarvam_keys import parse_sarvam_keys

        keys = parse_sarvam_keys("aaa", "aaa, bbb;ccc\nddd")
        self.assertEqual(keys, ["aaa", "bbb", "ccc", "ddd"])

    def test_skips_rate_limited_keys_then_recovers(self) -> None:
        from app.sarvam_keys import SarvamKeyPool, is_sarvam_rate_limit

        pool = SarvamKeyPool(keys=["one", "two", "three"], cooldown_seconds=30)
        first = pool.acquire(now=100)
        pool.mark_limited(first, now=100)
        second = pool.acquire(now=100)
        self.assertNotEqual(second, first)
        self.assertTrue(is_sarvam_rate_limit("quota exceeded", 1003))
        recovered = {pool.acquire(now=140) for _ in range(3)}
        self.assertIn(first, recovered)
