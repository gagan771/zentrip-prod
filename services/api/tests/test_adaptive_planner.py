import unittest
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from app.adaptive_planner import (
    fallback_days,
    merge_profile,
    rank_candidates,
    select_diverse_recommendations,
    validate_generated_days,
)


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

    def test_world_class_fit_considers_season_accessibility_and_trip_length(self) -> None:
        candidates = [
            {
                "placeId": "summer",
                "name": "Summer Coast",
                "city": "Goa",
                "fact": "A coastal beach escape.",
                "experienceProfile": {
                    "tags": ["beach"], "seasonality": "November–February", "durationMinutes": 240,
                    "destinationProfile": {
                        "destinationKind": "coastal", "bestSeasons": ["November–February"],
                        "typicalStayMinDays": 3, "typicalStayMaxDays": 6,
                        "accessibility": {"wheelchair": "medium", "family": "medium"},
                    },
                },
            },
            {
                "placeId": "heritage",
                "name": "Heritage City",
                "city": "Delhi",
                "fact": "A heritage city with museums.",
                "experienceProfile": {
                    "tags": ["history"], "seasonality": "April–October", "durationMinutes": 120,
                    "destinationProfile": {
                        "destinationKind": "heritage_city", "bestSeasons": ["April–October"],
                        "typicalStayMinDays": 1, "typicalStayMaxDays": 3,
                        "accessibility": {"wheelchair": "high", "family": "high"},
                    },
                },
            },
        ]
        ranked = rank_candidates(
            candidates,
            {"interests": ["beach"], "travelParty": "family", "accessibility": ["wheelchair"]},
            {"budgetLevel": "mixed", "travelMonth": 7, "tripDays": 4},
        )
        coast = next(item for item in ranked if item["placeId"] == "summer")
        self.assertEqual(coast["scoreBreakdown"]["seasonFit"], 0.45)
        self.assertEqual(coast["scoreBreakdown"]["accessibilityFit"], 0.65)
        self.assertLess(coast["scoreBreakdown"]["seasonFit"], next(item for item in ranked if item["placeId"] == "heritage")["scoreBreakdown"]["seasonFit"])

    def test_diverse_recommendations_do_not_fill_with_one_city(self) -> None:
        ranked = [
            {"name": "A", "city": "Delhi", "experienceProfile": {"destinationProfile": {"destinationKind": "city"}}},
            {"name": "B", "city": "Delhi", "experienceProfile": {"destinationProfile": {"destinationKind": "city"}}},
            {"name": "C", "city": "Goa", "experienceProfile": {"destinationProfile": {"destinationKind": "coastal"}}},
        ]
        selected = select_diverse_recommendations(ranked, 2)
        self.assertEqual([item["name"] for item in selected], ["A", "C"])


if __name__ == "__main__":
    unittest.main()
