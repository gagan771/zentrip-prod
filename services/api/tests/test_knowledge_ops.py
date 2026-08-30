import unittest
from datetime import date
from types import SimpleNamespace

from app.knowledge_ops import merge_operational_profile, operational_health


class KnowledgeOpsTests(unittest.TestCase):
    def test_health_reports_stale_review_and_conflict(self) -> None:
        rows = [
            SimpleNamespace(kind="hours", conflict_key="opening_hours", value={"schedule": "sunrise"}, status="approved", refresh_after=date(2026, 8, 27)),
            SimpleNamespace(kind="hours", conflict_key="opening_hours", value={"schedule": "21:00"}, status="needs_review", refresh_after=date(2026, 9, 27)),
        ]
        result = operational_health(rows, today=date(2026, 8, 28))
        self.assertEqual(result["stale"], 1)
        self.assertEqual(result["needsReview"], 1)
        self.assertEqual(result["conflicts"], ["opening_hours"])
        self.assertEqual(result["alert"], "critical")

    def test_profile_exposes_only_approved_observation_and_refresh_metadata(self) -> None:
        rows = [
            SimpleNamespace(kind="rating", value={"rating": 4.7}, status="approved", source_url="https://example.test", observed_at=date(2026, 8, 28), refresh_after=date(2026, 9, 4)),
            SimpleNamespace(kind="hours", value={"schedule": "unknown"}, status="needs_review", source_url="https://review.test", observed_at=date(2026, 8, 28), refresh_after=date(2026, 9, 27)),
        ]
        profile = merge_operational_profile({}, rows, today=date(2026, 8, 28))
        self.assertEqual(profile["operational"]["rating"]["rating"], 4.7)
        self.assertEqual(profile["operational"]["rating"]["stale"], False)
        self.assertNotIn("hours", profile["operational"])

    def test_profile_marks_conflicting_approved_observations(self) -> None:
        rows = [
            SimpleNamespace(kind="hours", value={"schedule": "sunrise"}, status="approved", source_url="https://one.test", observed_at=date(2026, 8, 28), refresh_after=date(2026, 9, 4)),
            SimpleNamespace(kind="hours", value={"schedule": "21:00"}, status="approved", source_url="https://two.test", observed_at=date(2026, 8, 27), refresh_after=date(2026, 9, 4)),
        ]
        profile = merge_operational_profile({}, rows, today=date(2026, 8, 28))
        self.assertTrue(profile["operational"]["hours"]["conflict"])
        self.assertEqual(profile["operational"]["hours"]["conflictCount"], 2)


if __name__ == "__main__":
    unittest.main()
