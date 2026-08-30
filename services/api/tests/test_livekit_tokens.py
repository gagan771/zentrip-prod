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
            token = mint_livekit_token(
                identity="user-1",
                name="Gagan",
                room="zenny-test",
                metadata='{"hasTrip":true,"cities":["Agra"]}',
            )
        payload = jwt.decode(token, "secret", algorithms=["HS256"])
        self.assertEqual(payload["iss"], "devkey")
        self.assertEqual(payload["sub"], "user-1")
        self.assertTrue(payload["video"]["roomJoin"])
        self.assertTrue(payload["video"]["roomCreate"])
        self.assertEqual(payload["video"]["room"], "zenny-test")
        self.assertEqual(payload["roomConfig"]["agents"][0]["agentName"], "zenny")
        self.assertIn("Agra", payload["metadata"])
        self.assertIn("Agra", payload["roomConfig"]["metadata"])
        self.assertIn("Agra", payload["roomConfig"]["agents"][0]["metadata"])

    def test_token_route_source_allows_shared_gateway(self) -> None:
        import inspect

        from app.routers import zenny_agent

        source = inspect.getsource(zenny_agent.create_livekit_token)
        self.assertNotIn("voice_use_shared_gateway", source)
        self.assertIn("livekit_ready", source)


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

    def test_heading_match_ranks_taj_above_nearby_mention(self) -> None:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.rag.retriever import lexical_search

        chunks = [
            {
                "document": "fort.md",
                "section": "Agra Fort (Agra)",
                "text": "Agra Fort sits near the Taj Mahal gardens.",
            },
            {
                "document": "taj.md",
                "section": "Taj Mahal (Agra)",
                "text": "The Taj Mahal is a marble mausoleum in Agra.",
            },
        ]
        with patch("agent.rag.retriever.load_file_chunks", return_value=chunks):
            hits = lexical_search("Taj Mahal", 2)
        self.assertEqual(hits[0]["section"], "Taj Mahal (Agra)")


class PublishedKnowledgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_retrieve_prefers_published_api(self) -> None:
        import sys
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.rag import retriever

        payload = {
            "results": [
                {
                    "entityName": "Taj Mahal",
                    "city": "Agra",
                    "claim": "The Taj Mahal is a marble mausoleum on the Yamuna.",
                    "citation": {"sourceName": "UNESCO", "confidence": "high"},
                }
            ]
        }
        response = SimpleNamespace(
            json=lambda: payload,
            raise_for_status=lambda: None,
        )

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, params=None):
                self.url = url
                self.params = params
                return response

        with (
            patch.object(retriever.settings, "zentrip_api_url", "http://127.0.0.1:8001"),
            patch.object(retriever.settings, "rag_top_k", 4),
            patch("httpx.AsyncClient", return_value=FakeClient()),
            patch.object(retriever, "search_qdrant", new=AsyncMock(return_value=[])),
            patch.object(retriever, "lexical_search", return_value=[]),
        ):
            raw = await retriever.retrieve("Taj Mahal")
        data = __import__("json").loads(raw)
        self.assertEqual(data["source"], "zentrip-published")
        self.assertEqual(data["hits"][0]["sourceName"], "UNESCO")
        self.assertIn("marble mausoleum", data["hits"][0]["text"])

    async def test_retrieve_passes_city_to_published_api(self) -> None:
        import sys
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.rag import retriever

        captured: dict = {}
        response = SimpleNamespace(
            json=lambda: {"results": []},
            raise_for_status=lambda: None,
        )

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, params=None):
                captured["params"] = params
                return response

        with (
            patch.object(retriever.settings, "zentrip_api_url", "http://127.0.0.1:8001"),
            patch.object(retriever.settings, "rag_top_k", 4),
            patch("httpx.AsyncClient", return_value=FakeClient()),
            patch.object(retriever, "search_qdrant", new=AsyncMock(return_value=[])),
            patch.object(retriever, "lexical_search", return_value=[]),
        ):
            await retriever.retrieve("the fort", city="Agra")
        self.assertEqual(captured["params"]["city"], "Agra")
        self.assertEqual(captured["params"]["q"], "the fort")


class TripContextTests(unittest.TestCase):
    def test_format_omits_ids_and_keeps_cities(self) -> None:
        from datetime import date
        from types import SimpleNamespace

        from app.trip_context import format_trip_context, trip_context_json

        trip = SimpleNamespace(
            cities=["Delhi", "Agra", "Jaipur"],
            start_date=date(2026, 9, 10),
            end_date=date(2026, 9, 16),
            budget_level="backpacker",
            status="planned",
            origin_country="US",
        )
        payload = format_trip_context(trip)
        self.assertTrue(payload["hasTrip"])
        self.assertEqual(payload["cities"], ["Delhi", "Agra", "Jaipur"])
        self.assertEqual(payload["startDate"], "2026-09-10")
        self.assertNotIn("email", trip_context_json(trip))
        self.assertFalse(format_trip_context(None)["hasTrip"])

    def test_voice_context_schema_accepts_today_brief(self) -> None:
        from datetime import date
        from types import SimpleNamespace

        from app.schemas import ZennyVoiceContextResponse
        from app.trip_context import format_trip_context

        trip = SimpleNamespace(
            cities=["Agra"],
            start_date=date(2026, 9, 10),
            end_date=date(2026, 9, 12),
            budget_level="backpacker",
            status="active",
            origin_country="US",
        )
        days = [
            SimpleNamespace(
                date=date(2026, 9, 11),
                city="Agra",
                activities=[{"place_name": "Taj Mahal"}],
            )
        ]
        payload = format_trip_context(trip, days=days, today=date(2026, 9, 11))
        payload["livekitReady"] = True
        parsed = ZennyVoiceContextResponse.model_validate(payload)
        self.assertEqual(parsed.focusCity, "Agra")
        self.assertEqual(parsed.focusStops, ["Taj Mahal"])

    def test_spoken_today_plan_uses_stops(self) -> None:
        from app.trip_context import spoken_today_plan

        text = spoken_today_plan(
            {"hasTrip": True, "focusKind": "today", "focusCity": "Agra", "focusStops": ["Taj Mahal"]}
        )
        self.assertIn("Agra", text)
        self.assertIn("Taj Mahal", text)
        self.assertIn("won't invent", spoken_today_plan({"hasTrip": False}))

    def test_spoken_instructions_use_cities(self) -> None:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.trip_brief import spoken_trip_instructions

        text = spoken_trip_instructions(
            '{"hasTrip":true,"cities":["Agra"],"startDate":"2026-09-10","endDate":"2026-09-12","status":"active","budget":"mid"}'
        )
        self.assertIn("Agra", text)
        self.assertIn("get_trip_context", text)
        self.assertIn("no saved trip", spoken_trip_instructions('{"hasTrip":false}'))

    def test_today_itinerary_picks_matching_day(self) -> None:
        from datetime import date
        from types import SimpleNamespace

        from app.trip_context import today_itinerary_brief

        days = [
            SimpleNamespace(
                date=date(2026, 9, 10),
                city="Delhi",
                activities=[{"place_name": "Humayun's Tomb"}],
            ),
            SimpleNamespace(
                date=date(2026, 9, 11),
                city="Agra",
                activities=[{"place_name": "Taj Mahal"}, {"place_name": "Agra Fort"}],
            ),
        ]
        brief = today_itinerary_brief(days, today=date(2026, 9, 11))
        self.assertEqual(brief["focusKind"], "today")
        self.assertEqual(brief["focusCity"], "Agra")
        self.assertEqual(brief["focusStops"], ["Taj Mahal", "Agra Fort"])
        upcoming = today_itinerary_brief(days, today=date(2026, 9, 1))
        self.assertEqual(upcoming["focusKind"], "upcoming")
        self.assertEqual(upcoming["focusCity"], "Delhi")

    def test_spoken_instructions_include_today_stops(self) -> None:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.trip_brief import spoken_trip_instructions

        text = spoken_trip_instructions(
            '{"hasTrip":true,"cities":["Agra"],"startDate":"2026-09-10","endDate":"2026-09-12",'
            '"status":"active","budget":"mid","focusKind":"today","focusCity":"Agra",'
            '"focusDate":"2026-09-11","focusStops":["Taj Mahal"]}'
        )
        self.assertIn("Today they are in Agra", text)
        self.assertIn("Taj Mahal", text)

    def test_greeting_mentions_today_city(self) -> None:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[2] / "voice-agent"
        sys.path.insert(0, str(root))
        from agent.trip_brief import greeting_instructions

        today = greeting_instructions(
            '{"hasTrip":true,"focusKind":"today","focusCity":"Agra"}'
        )
        self.assertIn("Agra today", today)
        self.assertIn("wait", greeting_instructions('{"hasTrip":false}'))
