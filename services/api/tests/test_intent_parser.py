import unittest

from app.agent_intent import parse_travel_slots


class TravelSlotParserTests(unittest.TestCase):
    def test_extracts_budget_duration_transport_and_accessibility(self) -> None:
        parsed = parse_travel_slots("5 days in Kerala, ₹20k, vegetarian, train, wheelchair")
        self.assertEqual(parsed["constraints"]["tripDays"], 5)
        self.assertEqual(parsed["constraints"]["dailyBudget"], 20000)
        self.assertIn("train", parsed["profile"]["transportPreferences"])
        self.assertIn("vegetarian", parsed["profile"]["foodPreferences"])
        self.assertIn("wheelchair", parsed["profile"]["accessibility"])

    def test_understands_indian_budget_and_weather_language(self) -> None:
        parsed = parse_travel_slots("3 din ka budget ₹1 lakh, monsoon trip")
        self.assertEqual(parsed["constraints"]["tripDays"], 3)
        self.assertEqual(parsed["constraints"]["dailyBudget"], 100000)
        self.assertEqual(parsed["constraints"]["weatherPreference"], "monsoon")


if __name__ == "__main__":
    unittest.main()
