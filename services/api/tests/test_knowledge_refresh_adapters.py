import asyncio
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

from app.knowledge_refresh_adapters import refresh_manifest_item


class KnowledgeRefreshAdapterTests(unittest.TestCase):
    def test_manifest_item_becomes_review_candidate(self) -> None:
        with patch(
            "app.knowledge_refresh_adapters.fetch_json_source",
            new_callable=AsyncMock,
        ) as fetch:
            fetch.return_value = {"value": {"schedule": "09:00 to 17:00"}}
            result = asyncio.run(refresh_manifest_item({
                "url": "https://official.example/hours.json",
                "entityId": "entity-1",
                "sourceId": "source-1",
                "kind": "hours",
                "conflictKey": "opening_hours",
            }, today=date(2026, 8, 29)))
        self.assertEqual(result["status"], "needs_review")
        self.assertTrue(result["change"]["requiresReview"])

    def test_manifest_rejects_non_https_source(self) -> None:
        result = asyncio.run(refresh_manifest_item({
            "url": "http://untrusted.example/hours.json",
            "entityId": "entity-1",
            "sourceId": "source-1",
            "kind": "hours",
            "conflictKey": "opening_hours",
        }))
        self.assertEqual(result["status"], "error")
        self.assertIn("HTTPS", result["error"])


if __name__ == "__main__":
    unittest.main()
