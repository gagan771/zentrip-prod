import unittest
from datetime import date

from app.provider_handoff import resolve_city, stay_handoffs, transport_handoffs
from app.translation_service import translate_with_fallback


class ProviderHandoffTests(unittest.TestCase):
    def test_delhi_agra_includes_irctc_redbus_abhibus_and_flight_otas(self) -> None:
        items = transport_handoffs("Delhi", "Agra", date(2026, 10, 10))
        keys = {item.key for item in items}
        self.assertIn("irctc", keys)
        self.assertIn("redbus", keys)
        self.assertIn("abhibus", keys)
        self.assertIn("goibibo_flights", keys)
        self.assertIn("makemytrip_flights", keys)
        self.assertIn("ixigo_flights", keys)
        self.assertIn("airindia", keys)
        self.assertIn("indigo", keys)
        redbus = next(item for item in items if item.key == "redbus")
        self.assertIn("delhi-to-agra", redbus.url)

    def test_stay_handoffs_include_mmt_goibibo_booking(self) -> None:
        items = stay_handoffs("Jaipur", date(2026, 10, 10), date(2026, 10, 12))
        keys = {item.key for item in items}
        self.assertIn("makemytrip_hotels", keys)
        self.assertIn("goibibo_hotels", keys)
        self.assertIn("booking_com", keys)

    def test_unknown_city_still_builds_urls(self) -> None:
        city = resolve_city("Pushkar")
        self.assertEqual(city.bus_slug, "pushkar")
        items = transport_handoffs("Pushkar", "Jaipur", date(2026, 11, 1))
        self.assertTrue(items)


class TranslationFallbackTests(unittest.TestCase):
    def test_phrasebook_hit_stays_verified(self) -> None:
        text, pronunciation, confidence, mode = translate_with_fallback("Thank you", "hindi")
        self.assertEqual(confidence, "verified")
        self.assertEqual(mode, "offline_phrasebook")
        self.assertTrue(text)
        self.assertTrue(pronunciation)

    def test_unknown_phrase_without_llm_does_not_invent(self) -> None:
        text, _pronunciation, confidence, mode = translate_with_fallback(
            "Tell the driver to wait at the gate", "hindi"
        )
        self.assertEqual(mode, "offline_phrasebook")
        self.assertEqual(confidence, "estimated")
        self.assertIn("not in the offline phrasebook", text)


if __name__ == "__main__":
    unittest.main()
