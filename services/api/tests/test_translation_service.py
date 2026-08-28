import unittest

from app.phrasebook import translate_phrase_detail


class TranslationServiceTests(unittest.TestCase):
    def test_known_phrase_returns_native_text_and_pronunciation(self) -> None:
        result = translate_phrase_detail("Thank you", "tamil")

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result[0], "Thank you")
        self.assertEqual(result[2], "nandri")

    def test_unknown_phrase_does_not_guess(self) -> None:
        self.assertIsNone(translate_phrase_detail("Tell the driver to wait", "hindi"))

    def test_travel_phrases_cover_water_station_and_spice(self) -> None:
        water = translate_phrase_detail("I need drinking water", "hindi")
        station = translate_phrase_detail("Where is the railway station?", "tamil")
        spice = translate_phrase_detail("Please make it less spicy", "hindi")
        self.assertIsNotNone(water)
        self.assertIsNotNone(station)
        self.assertIsNotNone(spice)


if __name__ == "__main__":
    unittest.main()
