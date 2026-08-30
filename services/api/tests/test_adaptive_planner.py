import unittest
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from app.adaptive_planner import (
    build_route_skeleton,
    fallback_days,
    merge_profile,
    rank_candidates,
    rerank_candidates,
    score_candidate,
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

    def test_negated_interest_is_not_added_as_a_positive_preference(self) -> None:
        profile = merge_profile({}, ["I don't like temples and want to avoid beaches"])
        self.assertNotIn("spiritual", profile["interests"])
        self.assertNotIn("beach", profile["interests"])
        self.assertIn("spiritual", profile["avoidInterests"])
        self.assertIn("beach", profile["avoidInterests"])

    def test_keyword_matching_does_not_turn_seasonal_into_sea_or_beach(self) -> None:
        candidate = {
            "name": "Auli Base",
            "city": "Auli",
            "fact": "A seasonal Himalayan meadow with mountain routes.",
            "experienceProfile": {"tags": ["mountains", "nature"]},
        }
        ranked = rank_candidates([candidate], {"interests": ["beach"]}, {})
        self.assertEqual(ranked[0]["scoreBreakdown"]["interestFit"], 0.35)

    def test_region_language_becomes_a_preference(self) -> None:
        profile = merge_profile({}, ["Suggest nature in Northeast India"])
        self.assertEqual(profile["preferredRegions"], ["North East"])

    def test_hinglish_preferences_are_normalized(self) -> None:
        profile = merge_profile({}, ["mandir aur khana, pahad nahi"])
        self.assertIn("spiritual", profile["interests"])
        self.assertIn("food", profile["interests"])
        self.assertIn("adventure", profile["avoidInterests"])

    def test_common_city_aliases_match_knowledge_city_names(self) -> None:
        candidate = {"placeId": "mumbai-place", "name": "Gateway", "city": "Mumbai", "fact": "harbour", "experienceProfile": {}}
        trip = SimpleNamespace(start_date=date(2026, 10, 1), end_date=date(2026, 10, 1), cities=["Bombay"])
        days = fallback_days(trip, [candidate], {}, {"maxActivitiesPerDay": 1})
        _, validation = validate_generated_days(days, trip, [candidate], {"maxActivitiesPerDay": 1})
        self.assertTrue(validation["passed"])

    def test_route_skeleton_is_contiguous_and_uses_ranked_candidates(self) -> None:
        trip = SimpleNamespace(start_date=date(2026, 10, 1), end_date=date(2026, 10, 4), cities=["Jaipur", "Agra"])
        skeleton = build_route_skeleton(
            trip,
            self.candidates,
            {"maxActivitiesPerDay": 2, "maxDailyTravelMinutes": 180, "profile": {"pace": "balanced"}},
        )
        self.assertEqual([day["city"] for day in skeleton], ["Jaipur", "Jaipur", "Agra", "Agra"])
        self.assertEqual(skeleton[0]["candidatePlaceIds"], [self.candidates[0]["placeId"], self.candidates[1]["placeId"]])
        self.assertEqual(skeleton[2]["candidatePlaceIds"], [self.candidates[2]["placeId"]])

    def test_region_is_hard_when_catalog_can_satisfy_it(self) -> None:
        candidates = [
            {"name": "North place", "city": "Delhi", "fact": "heritage", "experienceProfile": {"destinationProfile": {"region": "North"}}},
            {"name": "South place", "city": "Chennai", "fact": "heritage", "experienceProfile": {"destinationProfile": {"region": "South"}}},
        ]
        ranked = rank_candidates(candidates, {"preferredRegions": ["North"]}, {})
        self.assertEqual([item["name"] for item in ranked], ["North place"])

    def test_region_falls_back_when_catalog_has_no_match(self) -> None:
        candidates = [{"name": "South place", "city": "Chennai", "fact": "heritage", "experienceProfile": {"destinationProfile": {"region": "South"}}}]
        ranked = rank_candidates(candidates, {"preferredRegions": ["North"]}, {})
        self.assertEqual([item["name"] for item in ranked], ["South place"])

    def test_explicit_interest_is_hard_when_catalog_can_satisfy_it(self) -> None:
        candidates = [
            {"name": "Beach", "city": "Goa", "fact": "coastal beach", "experienceProfile": {"tags": ["beach"]}},
            {"name": "Fort", "city": "Delhi", "fact": "historic fort", "experienceProfile": {"tags": ["heritage"]}},
        ]
        ranked = rank_candidates(candidates, {"interests": ["beach"]}, {})
        self.assertEqual([item["name"] for item in ranked], ["Beach"])

    def test_wheelchair_request_prefers_known_accessible_catalog_matches(self) -> None:
        candidates = [
            {"name": "Step-free place", "city": "Delhi", "fact": "heritage", "experienceProfile": {"destinationProfile": {"accessibility": {"wheelchair": "high"}}}},
            {"name": "Unknown access place", "city": "Agra", "fact": "heritage", "experienceProfile": {}},
        ]
        ranked = rank_candidates(candidates, {"accessibility": ["wheelchair"]}, {})
        self.assertEqual([item["name"] for item in ranked], ["Step-free place"])

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

    def test_validation_rejects_city_out_of_requested_route_order(self) -> None:
        days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Agra", "activities": []},
                {"day": 2, "city": "Jaipur", "activities": []},
            ],
            self.trip,
            self.candidates,
            {"maxActivitiesPerDay": 3},
        )
        self.assertFalse(validation["passed"])
        self.assertTrue(any("out of route order" in error for error in validation["errors"]))

    def test_validation_enforces_daily_travel_budget(self) -> None:
        days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Jaipur", "activities": [
                    {"startTime": "09:00", "placeId": self.candidates[0]["placeId"], "durationMinutes": 60, "travelMinutes": 121, "reason": "history", "bookingRequired": False},
                ]},
                {"day": 2, "city": "Agra", "activities": []},
            ],
            self.trip,
            self.candidates,
            {"maxActivitiesPerDay": 3, "maxDailyTravelMinutes": 120},
        )
        self.assertFalse(validation["passed"])
        self.assertIn("day 1 exceeds max daily travel time", validation["errors"])

    def test_validation_enforces_reviewed_hours_and_daily_budget(self) -> None:
        candidate = {
            **self.candidates[0],
            "experienceProfile": {
                **self.candidates[0]["experienceProfile"],
                "estimatedCostINR": 1500,
                "operational": {"hours": {"schedule": "10:00 to 17:00", "weeklyClosure": []}},
            },
        }
        _days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Jaipur", "activities": [{
                    "startTime": "09:00", "placeId": candidate["placeId"], "durationMinutes": 60,
                    "reason": "historic fort",
                }]},
                {"day": 2, "city": "Agra", "activities": []},
            ],
            self.trip,
            [candidate, self.candidates[1], self.candidates[2]],
            {"maxActivitiesPerDay": 3, "dailyBudget": 1000},
        )
        self.assertIn("Amber Fort is outside reviewed opening hours on day 1", validation["errors"])
        self.assertIn("day 1 exceeds daily budget", validation["errors"])

    def test_reranker_preserves_planner_fit_and_adds_query_relevance(self) -> None:
        ranked = rank_candidates(self.candidates, {"interests": ["history"]}, {})
        reranked = rerank_candidates(ranked, "historic fort in Agra")
        self.assertEqual(reranked[0]["name"], "Agra Fort")
        self.assertIn("queryRelevance", reranked[0]["scoreBreakdown"])

    def test_validation_restores_reviewed_booking_requirement(self) -> None:
        candidate = {**self.candidates[0], "experienceProfile": {**self.candidates[0]["experienceProfile"], "bookingRequired": True}}
        days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Jaipur", "activities": [{"startTime": "09:00", "placeId": candidate["placeId"], "durationMinutes": 60, "reason": "history", "bookingRequired": False}]},
                {"day": 2, "city": "Agra", "activities": []},
            ],
            self.trip,
            [candidate, self.candidates[1], self.candidates[2]],
            {"maxActivitiesPerDay": 3},
        )
        self.assertTrue(validation["passed"])
        self.assertTrue(days[0]["activities"][0]["bookingRequired"])

    def test_validation_carries_activity_provenance(self) -> None:
        candidate = {
            **self.candidates[0],
            "claimId": "claim-amber",
            "sourceUrl": "https://example.test/amber",
            "lastVerified": "2026-09-01",
            "confidence": "verified",
        }
        days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Jaipur", "activities": [{
                    "startTime": "09:00",
                    "placeId": candidate["placeId"],
                    "durationMinutes": 60,
                    "reason": "historic fort",
                }]},
                {"day": 2, "city": "Agra", "activities": []},
            ],
            self.trip,
            [candidate, self.candidates[1], self.candidates[2]],
            {"maxActivitiesPerDay": 3},
        )
        self.assertTrue(validation["passed"])
        activity = days[0]["activities"][0]
        self.assertEqual(activity["sourceClaimId"], "claim-amber")
        self.assertEqual(activity["sourceUrl"], "https://example.test/amber")
        self.assertEqual(activity["confidence"], "verified")

    def test_validation_replaces_ungrounded_activity_reason(self) -> None:
        days, validation = validate_generated_days(
            [
                {"day": 1, "city": "Jaipur", "activities": [
                    {
                        "startTime": "09:00", "placeId": self.candidates[0]["placeId"],
                        "durationMinutes": 120,
                        "reason": "This place guarantees a Michelin-starred restaurant and free entry.",
                    },
                ]},
                {"day": 2, "city": "Agra", "activities": []},
            ],
            self.trip,
            self.candidates,
            {"maxActivitiesPerDay": 3},
        )
        self.assertTrue(validation["passed"])
        self.assertEqual(days[0]["activities"][0]["reason"], "Selected from reviewed knowledge for your trip preferences.")
        self.assertTrue(any("not grounded" in warning for warning in validation["warnings"]))

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
        ranked = [score_candidate(candidate, {"interests": ["beach"], "travelParty": "family", "accessibility": ["wheelchair"]}, {"budgetLevel": "mixed", "travelMonth": 7, "tripDays": 4}) for candidate in candidates]
        ranked = sorted(ranked, key=lambda item: -item["plannerScore"])
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

    def test_stale_operational_data_is_a_small_visible_penalty(self) -> None:
        candidate = {
            "placeId": "a",
            "name": "A",
            "city": "Delhi",
            "fact": "heritage",
            "experienceProfile": {
                "operational": {
                    "hours": {"stale": True},
                    "ticketing": {"stale": True},
                }
            },
        }
        result = rank_candidates([candidate], {"interests": ["heritage"]}, {})[0]
        self.assertEqual(result["scoreBreakdown"]["freshnessFit"], 0.6)
        self.assertIn("freshnessFit", result["scoreBreakdown"])


if __name__ == "__main__":
    unittest.main()
