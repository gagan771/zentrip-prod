import unittest
from unittest.mock import patch

from app.livekit_tokens import livekit_ready, mint_livekit_token


class LivekitTokenTests(unittest.TestCase):
    def test_not_ready_without_config(self) -> None:
        with patch("app.livekit_tokens.settings") as mocked:
            mocked.livekit_api_key = ""
            mocked.livekit_api_secret = ""
            mocked.livekit_url = ""
            self.assertFalse(livekit_ready())

    def test_mints_hs256_jwt(self) -> None:
        import jwt

        with patch("app.livekit_tokens.settings") as mocked:
            mocked.livekit_api_key = "devkey"
            mocked.livekit_api_secret = "secret"
            mocked.livekit_url = "ws://127.0.0.1:7880"
            token = mint_livekit_token(identity="user-1", name="Gagan", room="zenny-test")
        payload = jwt.decode(token, "secret", algorithms=["HS256"])
        self.assertEqual(payload["iss"], "devkey")
        self.assertEqual(payload["sub"], "user-1")
        self.assertTrue(payload["video"]["roomJoin"])
        self.assertEqual(payload["video"]["room"], "zenny-test")
        self.assertEqual(payload["roomConfig"]["agents"][0]["agentName"], "zenny")


class LexicalRagTests(unittest.TestCase):
    def test_chunks_split_on_headings(self) -> None:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.rag.retriever import chunk_markdown, lexical_search

        chunks = chunk_markdown(
            "# Taj Mahal\n\nThe Taj Mahal is a marble mausoleum in Agra on the Yamuna.\n\n# UPI\n\nUPI is India's bank-to-bank pay system.",
            "destinations.md",
        )
        self.assertGreaterEqual(len(chunks), 2)
        with patch("agent.rag.retriever.load_file_chunks", return_value=chunks):
            hits = lexical_search("Taj Mahal Agra", 2)
        self.assertTrue(any("Taj" in hit["text"] for hit in hits))
