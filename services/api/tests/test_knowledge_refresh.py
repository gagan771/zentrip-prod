import unittest
from datetime import date

from app.knowledge_refresh import build_refresh_observation, compare_source_payload, source_fingerprint


class KnowledgeRefreshTests(unittest.TestCase):
    def test_fingerprint_ignores_dictionary_order_and_whitespace(self) -> None:
        first = {"schedule": " 09:00  to 17:00 ", "weeklyClosure": []}
        second = {"weeklyClosure": [], "schedule": "09:00 to 17:00"}
        self.assertEqual(source_fingerprint(first), source_fingerprint(second))
        self.assertFalse(compare_source_payload(first, second)["changed"])

    def test_changed_provider_payload_always_requires_review(self) -> None:
        diff = compare_source_payload({"price": 100}, {"price": 120})
        self.assertTrue(diff["changed"])
        self.assertEqual(diff["changedKeys"], ["price"])
        self.assertTrue(diff["requiresReview"])

    def test_refresh_observation_uses_kind_expiry_and_needs_review(self) -> None:
        observation = build_refresh_observation(
            entity_id="entity-1",
            source_id="source-1",
            kind="hours",
            conflict_key="opening_hours",
            value={"schedule": "09:00 to 17:00"},
            source_url="https://example.test/hours",
            observed_on=date(2026, 8, 29),
        )
        self.assertEqual(observation["refreshAfter"], "2026-09-05")
        self.assertEqual(observation["status"], "needs_review")
        self.assertEqual(len(observation["fingerprint"]), 64)


if __name__ == "__main__":
    unittest.main()
