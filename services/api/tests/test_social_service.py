import unittest
from datetime import datetime

from app.social_service import find_buddy_matches, find_tonight_events, parse_buddy_request


class SocialServiceTests(unittest.TestCase):
    def test_stale_events_are_hidden(self) -> None:
        events = find_tonight_events("Jaipur", now=datetime(2026, 8, 26, 12, 0, 0))
        self.assertTrue(events)
        self.assertTrue(all(event["city"] == "Jaipur" for event in events))
        self.assertTrue(all(datetime.fromisoformat(event["endTime"]) > datetime(2026, 8, 26, 12, 0, 0) for event in events))

    def test_buddy_parser_and_weighted_match(self) -> None:
        request = parse_buddy_request("Find buddies for Spiti in October, trekking and photography, budget 20k")
        matches = find_buddy_matches(request)
        self.assertEqual(request["destination"], "spiti")
        self.assertEqual(matches[0]["name"], "Spiti Circuit October")
        self.assertGreaterEqual(matches[0]["compatibility"], 40)


if __name__ == "__main__":
    unittest.main()
