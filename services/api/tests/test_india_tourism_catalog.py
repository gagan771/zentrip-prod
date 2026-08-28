import unittest

from app.india_tourism_catalog import ENTRIES, GATEWAY_ENTRIES, PROFILES, ROUTES, SOURCES


class IndiaTourismCatalogTests(unittest.TestCase):
    def test_catalog_has_broad_regional_coverage(self) -> None:
        self.assertGreaterEqual(len(ENTRIES), 25)
        self.assertGreaterEqual(len(PROFILES), len(ENTRIES))
        regions = {profile[2] for profile in PROFILES}
        self.assertGreaterEqual(regions, {"North", "South", "East", "West", "Central", "North East"})
        self.assertGreaterEqual(len(GATEWAY_ENTRIES), 8)

    def test_profiles_are_normalized_and_match_experiences(self) -> None:
        entry_names = {entry[0] for entry in ENTRIES}
        profile_names = [profile[0] for profile in PROFILES]
        self.assertEqual(len(profile_names), len(set(profile_names)))
        self.assertTrue(entry_names.issubset(profile_names))
        for profile in PROFILES:
            self.assertLessEqual(profile[6], profile[7])
            self.assertGreaterEqual(profile[6], 1)
            self.assertTrue(profile[4])
            self.assertTrue(profile[14] in SOURCES)

    def test_routes_are_valid_transfer_edges(self) -> None:
        gateway_names = {entry[0] for entry in GATEWAY_ENTRIES}
        destination_names = {entry[0] for entry in ENTRIES}
        for origin, destination, mode, distance, minimum, maximum, notes, source_key in ROUTES:
            self.assertNotEqual(origin, destination)
            self.assertIn(origin, gateway_names)
            self.assertIn(destination, gateway_names | destination_names)
            self.assertIn(mode, {"road", "rail", "air", "ferry", "mixed"})
            self.assertGreater(distance, 0)
            self.assertLessEqual(minimum, maximum)
            self.assertTrue(notes)
            self.assertIn(source_key, SOURCES)


if __name__ == "__main__":
    unittest.main()
