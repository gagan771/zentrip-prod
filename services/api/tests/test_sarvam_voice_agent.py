import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.sarvam_voice_agent import VoiceAgentError, _pcm_from_agent_audio, map_language_name, voice_agent_ready
from app.voice_service import _silent_wav


class VoiceAgentConfigTests(unittest.TestCase):
    def test_maps_user_language_when_env_is_blank(self) -> None:
        with patch("app.sarvam_voice_agent.settings") as mocked:
            mocked.sarvam_voice_language = ""
            self.assertEqual(map_language_name("hi"), "Hindi")
            self.assertEqual(map_language_name("en-IN"), "English")
            self.assertEqual(map_language_name("xx"), "English")

    def test_env_language_wins(self) -> None:
        with patch("app.sarvam_voice_agent.settings") as mocked:
            mocked.sarvam_voice_language = "Hindi"
            self.assertEqual(map_language_name("en"), "Hindi")

    def test_not_ready_without_ids(self) -> None:
        self.assertFalse(voice_agent_ready())

    def test_strips_wav_header(self) -> None:
        wav = _silent_wav()
        pcm = _pcm_from_agent_audio(wav)
        self.assertGreater(len(pcm), 0)
        self.assertEqual(len(pcm) % 2, 0)
        self.assertNotEqual(pcm[:4], b"RIFF")

    def test_raw_pcm_passes_through(self) -> None:
        raw = b"\x00\x01" * 80
        self.assertEqual(_pcm_from_agent_audio(raw), raw)


class VoiceAgentAskTextTests(unittest.IsolatedAsyncioTestCase):
    async def test_ask_text_returns_bot_reply(self) -> None:
        from app import sarvam_voice_agent as module

        class FakeAgent:
            def __init__(self, **kwargs):
                self._text_cb = kwargs.get("text_callback")

            async def start(self) -> None:
                return None

            async def wait_for_connect(self, timeout: float | None = 5.0) -> bool:
                return True

            async def send_text(self, text: str) -> None:
                class Msg:
                    text = "The Taj Mahal is in Agra."

                await self._text_cb(Msg())

            async def stop(self) -> None:
                return None

        with (
            patch.object(module, "_api_key", return_value="sk_test"),
            patch.object(module, "build_interaction_config", return_value=object()),
            patch("sarvam_conv_ai_sdk.AsyncSamvaadAgent", FakeAgent),
            patch("sarvam_conv_ai_sdk.ServerTextMsg", object),
            patch("sarvam_conv_ai_sdk.ServerTextChunkMsg", tuple),
            patch("sarvam_conv_ai_sdk.Role"),
            patch("sarvam_conv_ai_sdk.MsgStatus"),
            patch("sarvam_conv_ai_sdk.ServerTranscriptMsg", object),
        ):
            reply = await module.ask_text(
                user_id="user-1",
                user_name="Gagan",
                language="en",
                trip_id=None,
                text="Tell me about the Taj.",
            )
        self.assertIn("Taj", reply)

    async def test_ask_text_times_out_without_chunks(self) -> None:
        from app import sarvam_voice_agent as module

        class SilentAgent:
            def __init__(self, **kwargs):
                del kwargs

            async def start(self) -> None:
                return None

            async def wait_for_connect(self, timeout: float | None = 5.0) -> bool:
                return True

            async def send_text(self, text: str) -> None:
                del text

            async def stop(self) -> None:
                return None

        with (
            patch.object(module, "_api_key", return_value="sk_test"),
            patch.object(module, "build_interaction_config", return_value=object()),
            patch("sarvam_conv_ai_sdk.AsyncSamvaadAgent", SilentAgent),
            patch("sarvam_conv_ai_sdk.ServerTextMsg", object),
            patch("sarvam_conv_ai_sdk.ServerTextChunkMsg", tuple),
            patch("sarvam_conv_ai_sdk.Role"),
            patch("sarvam_conv_ai_sdk.MsgStatus"),
            patch("sarvam_conv_ai_sdk.ServerTranscriptMsg", object),
            patch.object(module.settings, "sarvam_voice_text_timeout_seconds", 0.05),
        ):
            with self.assertRaises(VoiceAgentError):
                await module.ask_text(
                    user_id="user-1",
                    user_name=None,
                    language="en",
                    trip_id=None,
                    text="hello",
                )


class AgentSocketUrlTests(unittest.TestCase):
    def test_ws_url_uses_public_https(self) -> None:
        from app.routers import zenny_agent

        with patch.object(zenny_agent.settings, "public_base_url", "https://api.zentrip.example"):
            url = zenny_agent._ws_url("abc")
        self.assertTrue(url.startswith("wss://api.zentrip.example/v1/zenny/voice/agent"))
        self.assertIn("ticket=abc", url)


if __name__ == "__main__":
    unittest.main()
