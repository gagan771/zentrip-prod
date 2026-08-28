import unittest
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from app.adaptive_planner import fallback_days, merge_profile, rank_candidates, validate_generated_days


class AdaptivePlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.trip = SimpleNamespace(
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 2),
            cities=["Jaipur", "Agra"],
        )
        self.candidates = [
            {
                "placeId": str(uuid4()),
                "name": "Amber Fort",
                "city": "Jaipur",
                "fact": "A historic palace fort with architecture and cultural significance.",
                "experienceProfile": {"tags": ["history", "architecture"], "energy": "medium", "walkingLevel": "medium", "budgetLevel": "medium", "durationMinutes": 120},
            },
            {
                "placeId": str(uuid4()),
                "name": "Jaipur Food Market",
                "city": "Jaipur",
                "fact": "A local market with regional food and crafts.",
                "experienceProfile": {"tags": ["food", "shopping"], "energy": "low", "walkingLevel": "medium", "budgetLevel": "low", "durationMinutes": 90},
            },
            {
                "placeId": str(uuid4()),
                "name": "Agra Fort",
                "city": "Agra",
                "fact": "A major Mughal monument and historic fortress.",
                "experienceProfile": {"tags": ["history", "architecture"], "energy": "medium", "walkingLevel": "medium", "budgetLevel": "medium", "durationMinutes": 120},
            },
        ]

    def test_explicit_preferences_and_statements_merge_without_duplicates(self) -> None:
        profile = merge_profile({"interests": ["food"], "pace": "balanced"}, ["I prefer relaxed history trips and trains"])
        self.assertEqual(profile["pace"], "relaxed")
        self.assertIn("history", profile["interests"])
        self.assertEqual(profile["interests"].count("food"), 1)
        self.assertIn("train", profile["transportPreferences"])

    def test_matching_experience_ranks_first(self) -> None:
        ranked = rank_candidates(self.candidates, {"interests": ["food"], "pace": "relaxed", "walkingTolerance": "medium"}, {"budgetLevel": "mixed"})
        self.assertEqual(ranked[0]["name"], "Jaipur Food Market")
        self.assertIn("interestFit", ranked[0]["scoreBreakdown"])

    def test_feedback_and_avoidance_change_ranking(self) -> None:
        ranked = rank_candidates(
            self.candidates,
            {"interests": ["history"]},
            {"budgetLevel": "mixed", "avoid": ["market"], "recentFeedback": [{"itemKey": f"day:1:{self.candidates[0]['placeId']}", "action": "accept"}]},
        )
        self.assertNotIn("Jaipur Food Market", {item["name"] for item in ranked})
        amber = next(item for item in ranked if item["placeId"] == self.candidates[0]["placeId"])
        self.assertGreater(amber["scoreBreakdown"]["feedbackBoost"], 0)

    def test_validation_rejects_unknown_place_and_overlapping_times(self) -> None:
        days, validation = validate_generated_days(
            [{"day": 1, "city": "Jaipur", "activities": [
                {"startTime": "09:00", "placeId": self.candidates[0]["placeId"], "durationMinutes": 120, "reason": "x", "bookingRequired": False},
                {"startTime": "10:00", "placeId": "not-known", "durationMinutes": 60, "reason": "x", "bookingRequired": False},
            ]}],
            self.trip,
            self.candidates,
            {"maxActivitiesPerDay": 3},
        )
        self.assertFalse(validation["passed"])
        self.assertTrue(any("unknown place" in error for error in validation["errors"]))
        self.assertTrue(days)

    def test_fallback_is_grounded_and_covers_trip_days(self) -> None:
        days = fallback_days(self.trip, rank_candidates(self.candidates, {}, {"budgetLevel": "mixed"}), {}, {"maxActivitiesPerDay": 2})
        self.assertEqual(len(days), 2)
        self.assertEqual(days[0]["date"], "2026-10-01")
        self.assertEqual(days[1]["date"], "2026-10-02")
        known = {item["placeId"] for item in self.candidates}
        self.assertTrue(all(activity["placeId"] in known for day in days for activity in day["activities"]))

    def test_empty_candidates_require_review(self) -> None:
        days, validation = validate_generated_days(
            [{"day": 1, "city": "Jaipur", "activities": []}, {"day": 2, "city": "Agra", "activities": []}],
            self.trip,
            [],
            {"maxActivitiesPerDay": 2},
        )
        self.assertEqual([day["day"] for day in days], [1, 2])
        self.assertFalse(validation["passed"])
        self.assertIn("no grounded knowledge candidates available", validation["errors"])

    def test_fallback_balances_candidates_across_city_days(self) -> None:
        trip = SimpleNamespace(start_date=date(2026, 10, 1), end_date=date(2026, 10, 7), cities=["Delhi", "Agra", "Jaipur"])
        candidates = [
            {"placeId": str(index), "name": f"{city} place {index}", "city": city, "fact": "historic place", "experienceProfile": {}}
            for index, city in enumerate(["Delhi", "Delhi", "Delhi", "Agra", "Agra", "Agra", "Jaipur", "Jaipur", "Jaipur"], start=1)
        ]
        days = fallback_days(trip, candidates, {}, {"maxActivitiesPerDay": 3})
        self.assertEqual([len(day["activities"]) for day in days], [1, 1, 1, 2, 1, 2, 1])


if __name__ == "__main__":
    unittest.main()
