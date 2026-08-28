import unittest

from app.first_time_india_catalog import ENTRIES, SOURCES


class FirstTimeIndiaCatalogTests(unittest.TestCase):
    def test_beginner_playbook_covers_core_travel_decisions(self) -> None:
        self.assertGreaterEqual(len(ENTRIES), 25)
        categories = {entry[7]["knowledgeCategory"] for entry in ENTRIES}
        self.assertGreaterEqual(
            categories,
            {"visa", "arrival", "safety", "health", "transport", "payments", "connectivity", "culture", "food", "planning"},
        )

    def test_every_claim_is_cited_and_profiled(self) -> None:
        names = [entry[0] for entry in ENTRIES]
        self.assertEqual(len(names), len(set(names)))
        for _name, _city, _aliases, source_key, _entity_type, claim, confidence, profile in ENTRIES:
            self.assertIn(source_key, SOURCES)
            self.assertTrue(claim)
            self.assertIn(confidence, {"verified", "estimated"})
            self.assertIn("travelerStage", profile)
            self.assertIn("priority", profile)


if __name__ == "__main__":
    unittest.main()
