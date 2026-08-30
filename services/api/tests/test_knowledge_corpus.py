import unittest

from app.agent_intent import classify_intent
from app.knowledge_corpus import DEEP_CORRIDOR_CLAIMS, INDIA_PLACES, MONUMENT_FEATURES, SOURCES
from app.provider_handoff import transport_handoffs
from app.travel_ops_corpus import MORE_PLACES, TRAVEL_OPS, TRAVEL_SOURCES
from datetime import date


class KnowledgeCorpusTests(unittest.TestCase):
    def test_corpus_covers_most_visited_india_and_deep_taj_agra_fort(self) -> None:
        place_names = {row[0] for row in INDIA_PLACES}
        self.assertIn("Golden Temple", place_names)
        self.assertIn("Ajanta Caves", place_names)
        self.assertIn("Group of Monuments at Hampi", place_names)
        self.assertIn("Sun Temple, Konark", place_names)
        self.assertIn("Elephanta Caves", place_names)
        self.assertTrue(any("Diwan-i-Khas" in row[4] for row in DEEP_CORRIDOR_CLAIMS))
        self.assertTrue(any(row[0].startswith("Taj Mahal") for row in MONUMENT_FEATURES))
        self.assertIn("taj", SOURCES)
        self.assertIn("sgpc", SOURCES)

    def test_every_corpus_source_key_exists(self) -> None:
        for row in DEEP_CORRIDOR_CLAIMS:
            self.assertIn(row[3], SOURCES)
        for row in INDIA_PLACES:
            self.assertIn(row[3], SOURCES)
        for row in MONUMENT_FEATURES:
            self.assertIn(row[3], SOURCES)


class TravelOpsCorpusTests(unittest.TestCase):
    def test_every_travel_ops_source_key_exists(self) -> None:
        for row in TRAVEL_OPS:
            self.assertEqual(len(row), 7, row[0])
            self.assertIn(row[3], TRAVEL_SOURCES, row[0])
        for row in MORE_PLACES:
            self.assertEqual(len(row), 6, row[0])
            self.assertIn(row[3], TRAVEL_SOURCES, row[0])

    def test_travel_ops_covers_routes_seasons_and_food_districts(self) -> None:
        names = {row[0] for row in TRAVEL_OPS}
        self.assertIn("Delhi to Agra corridor", names)
        self.assertIn("Mehtab Bagh sunset", names)
        self.assertIn("North India plains season", names)
        self.assertIn("Amritsar temple langar", names)
        self.assertTrue(any(row[4] == "food_district" for row in TRAVEL_OPS))
        self.assertTrue(any("Bengaluru to Mysuru" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Manali to Leh" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Sam dunes" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Kolkata to Sundarbans" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Puri visitor primer" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Indore visitor primer" in row[0] for row in TRAVEL_OPS))
        self.assertTrue(any("Safdarjung" in row[0] for row in TRAVEL_OPS))


class AgentIntentTests(unittest.TestCase):
    def test_when_to_visit_routes_to_guide_not_trip_planning(self) -> None:
        self.assertEqual(classify_intent("when to visit Hampi"), "guide")
        self.assertEqual(classify_intent("best sunset at the Taj"), "guide")
        self.assertEqual(classify_intent("how far is Agra from Delhi"), "guide")

    def test_itinerary_language_still_trip_planning(self) -> None:
        self.assertEqual(classify_intent("plan 3 days in Jaipur"), "trip_planning")
        self.assertEqual(classify_intent("what should I do today"), "trip_planning")
        self.assertEqual(classify_intent("is the Taj open today"), "chat")

    def test_destination_request_routes_to_recommendation_engine(self) -> None:
        self.assertEqual(classify_intent("suggest a quiet beach destination in India"), "recommendation")

    def test_going_to_jaipur_is_not_buddy_matching(self) -> None:
        self.assertNotEqual(classify_intent("I'm going to Jaipur"), "buddy")
        self.assertEqual(classify_intent("find travel buddies for Spiti"), "buddy")


class AirlineHandoffTests(unittest.TestCase):
    def test_air_india_and_indigo_are_live_flight_handoffs(self) -> None:
        items = transport_handoffs("Delhi", "Mumbai", date(2026, 10, 10))
        by_key = {item.key: item for item in items}
        self.assertEqual(by_key["airindia"].category, "flight")
        self.assertEqual(by_key["indigo"].category, "flight")
        self.assertIn("DEL", by_key["airindia"].url)
        self.assertIn("BOM", by_key["indigo"].url)


if __name__ == "__main__":
    unittest.main()
