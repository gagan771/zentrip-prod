import unittest
import uuid
from datetime import datetime
from types import SimpleNamespace

from app.knowledge_learning import knowledge_improvement_report, normalize_query, sanitize_query
from app.privacy import telemetry_cutoff
from app.config import Settings


class KnowledgeLearningTests(unittest.TestCase):
    def test_query_telemetry_redacts_contact_details_and_normalizes(self) -> None:
        raw = "  Where is my booking? Email me@example.com or call +91 98765 43210! "
        self.assertNotIn("me@example.com", sanitize_query(raw))
        self.assertNotIn("98765 43210", sanitize_query(raw))
        self.assertIn("2026-08-29", sanitize_query("travel on 2026-08-29"))
        self.assertEqual(normalize_query("  Taj Mahal?  Sunset! "), "taj mahal sunset")

    def test_report_prioritizes_open_gaps_and_counts_answer_quality(self) -> None:
        now = datetime(2026, 8, 29)
        gaps = [
            SimpleNamespace(
                id=uuid.uuid4(), example_query="unknown monument", intent="guide", occurrence_count=4,
                no_match_count=4, negative_feedback_count=1, priority=90, status="open", last_seen_at=now,
            ),
            SimpleNamespace(
                id=uuid.uuid4(), example_query="old gap", intent="guide", occurrence_count=1,
                no_match_count=1, negative_feedback_count=0, priority=50, status="resolved", last_seen_at=now,
            ),
        ]
        interactions = [
            SimpleNamespace(outcome="no_match", feedback="not_helpful"),
            SimpleNamespace(outcome="low_confidence", feedback=None),
            SimpleNamespace(outcome="answered", feedback="helpful"),
        ]
        report = knowledge_improvement_report(interactions, gaps)
        self.assertEqual(report["totalInteractions"], 3)
        self.assertEqual(report["noMatch"], 1)
        self.assertEqual(report["lowConfidence"], 1)
        self.assertEqual(report["negativeFeedback"], 1)
        self.assertEqual(report["openGaps"], 1)
        self.assertEqual(report["topGaps"][0]["query"], "unknown monument")

    def test_telemetry_cutoff_has_a_safe_positive_window(self) -> None:
        now = datetime(2026, 8, 29)
        self.assertEqual(telemetry_cutoff(90, now), datetime(2026, 5, 31))
        self.assertEqual(telemetry_cutoff(0, now), datetime(2026, 8, 28))

    def test_production_configuration_rejects_unsafe_defaults(self) -> None:
        # Keep the assertion independent of a developer's local services/api/.env.
        settings = Settings(_env_file=None, app_env="production")
        errors = settings.production_configuration_errors()
        self.assertIn("JWT_SECRET must be a random value of at least 32 characters", errors)
        self.assertIn("CORS_ORIGINS must explicitly list trusted production origins", errors)
        self.assertIn("RATE_LIMIT_STORAGE_URI must point to shared Redis in production", errors)

    def test_production_configuration_accepts_complete_provider_setup(self) -> None:
        settings = Settings(
            app_env="production",
            jwt_secret="x" * 48,
            cors_origins="https://zentrip.example",
            rate_limit_storage_uri="redis://redis:6379/1",
            openrouter_api_key="router-key",
            allow_demo_provider_data=False,
        )
        self.assertEqual(settings.production_configuration_errors(), [])


if __name__ == "__main__":
    unittest.main()
