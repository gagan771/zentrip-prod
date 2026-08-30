import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from app.knowledge_refresh import build_refresh_summary
from scripts.evaluate_recommendations import _candidate_rows, _load_cases, evaluate


class RecommendationEvaluationTests(unittest.TestCase):
    def test_offline_evaluation_dataset_has_cases_and_coverage(self) -> None:
        report = evaluate(_load_cases(Path(__file__).parents[1] / "evals" / "recommendation_cases.jsonl"), _candidate_rows())
        self.assertEqual(report["metrics"]["cases"], 200)
        self.assertEqual(report["metrics"]["catalogCandidates"], 52)
        self.assertGreaterEqual(report["metrics"]["catalogRegions"], 5)
        self.assertEqual(report["metrics"]["profileCompleteness"], 1.0)
        self.assertEqual(report["metrics"]["aliasCoverage"], 1.0)
        self.assertEqual(report["metrics"]["coverageAtK"], 1.0)
        self.assertGreaterEqual(report["metrics"]["avoidanceRateAtK"], 0.9)

    def test_refresh_summary_orders_due_records(self) -> None:
        summary = build_refresh_summary(
            [SimpleNamespace(id="b", entity_id="e2", kind="hours", refresh_after=date(2026, 8, 1), status="approved")],
            [SimpleNamespace(id="a", entity_id="e1", refresh_after=date(2026, 8, 15), status="published")],
            today=date(2026, 8, 29),
        )
        self.assertEqual(summary["totalDue"], 2)
        self.assertEqual([item["id"] for item in summary["items"]], ["b", "a"])


if __name__ == "__main__":
    unittest.main()
