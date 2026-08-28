import unittest

from app.india_regional_expansion import ENTRIES, PROFILES, ROUTES, SOURCES


class RegionalExpansionTests(unittest.TestCase):
    def test_expansion_adds_regional_destinations(self) -> None:
        self.assertGreaterEqual(len(ENTRIES), 15)
        self.assertEqual({entry[0] for entry in ENTRIES}, {profile[0] for profile in PROFILES})
        self.assertGreaterEqual({profile[1] for profile in PROFILES}, {"Andhra Pradesh", "Odisha", "Tamil Nadu", "Uttar Pradesh"})

    def test_expansion_routes_have_known_sources(self) -> None:
        for origin, destination, mode, distance, minimum, maximum, notes, source_key in ROUTES:
            self.assertTrue(origin and destination and notes)
            self.assertIn(mode, {"road", "rail", "air", "ferry", "mixed"})
            self.assertGreater(distance, 0)
            self.assertLessEqual(minimum, maximum)
            self.assertIn(source_key, SOURCES)


if __name__ == "__main__":
    unittest.main()
