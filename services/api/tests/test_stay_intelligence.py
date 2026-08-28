from datetime import date
import unittest

from app.comparison_service import StaySearchInput, rank_stay_results, search_stay_adapters
from app.social_service import stay_context


class StayIntelligenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.check_in = date(2026, 10, 10)
        self.check_out = date(2026, 10, 12)
        self.results = search_stay_adapters(
            StaySearchInput(
                city="Jaipur",
                check_in=self.check_in,
                check_out=self.check_out,
                budget_level="backpacker",
                traveler_style="social",
            )
        )

    def test_social_style_ranks_social_hostel_first_and_explains_score(self) -> None:
        ranked = rank_stay_results(self.results, "backpacker", "social")

        self.assertEqual(ranked[0].result.stay_type, "hostel")
        self.assertGreaterEqual(len(ranked[0].score_breakdown), 5)
        self.assertTrue(any(item["key"] == "social" for item in ranked[0].score_breakdown))
        self.assertIn("Stay Score", ranked[0].reasons[0])

    def test_context_is_aggregate_and_only_attaches_to_hostels(self) -> None:
        context = stay_context("Jaipur", self.check_in, self.check_out, "hostel")

        self.assertTrue(context)
        self.assertTrue(any("community event" in signal or "group" in signal for signal in context))
        self.assertEqual(stay_context("Jaipur", self.check_in, self.check_out, "hotel"), [])
        self.assertFalse(any("traveller" in signal.lower() for signal in context))


if __name__ == "__main__":
    unittest.main()
