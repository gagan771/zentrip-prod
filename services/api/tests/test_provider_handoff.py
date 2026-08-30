import unittest
from datetime import date
from unittest.mock import patch

from app.comparison_service import SearchInput, StaySearchInput, search_adapters, search_stay_adapters
from app.config import settings
from app.cab_service import CabSearchInput, search_cabs
from app.provider_handoff import cab_handoffs, resolve_city, stay_handoffs, transport_handoffs
from app.translation_service import LiveTranslationNotConfiguredError, translate_with_fallback


class ProviderHandoffTests(unittest.TestCase):
    def test_demo_provider_fixtures_can_be_disabled(self) -> None:
        search = SearchInput("Delhi", "Agra", date(2026, 10, 10), "mixed")
        stay = StaySearchInput("Jaipur", date(2026, 10, 10), date(2026, 10, 12), "mixed")
        with patch.object(settings, "allow_demo_provider_data", False):
            self.assertEqual(search_adapters(search), [])
            self.assertEqual(search_stay_adapters(stay), [])

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

    def test_cab_handoff_includes_coords_and_namma_yatri(self) -> None:
        items = cab_handoffs("Connaught Place", "Taj Mahal", 28.6315, 77.2167, 27.1751, 78.0421)
        keys = {item.key for item in items}
        self.assertIn("uber", keys)
        self.assertIn("namma_yatri", keys)
        uber = next(item for item in items if item.key == "uber")
        self.assertIn("28.6315", uber.url)
        self.assertIn("77.2167", uber.url)
        self.assertIn("27.1751", uber.url)
        self.assertNotIn("₹", uber.note)

    def test_cab_search_never_claims_live_fare(self) -> None:
        payload = search_cabs(CabSearchInput(pickup="Delhi", drop="Agra"))
        self.assertFalse(payload["isLive"])
        self.assertTrue(payload["options"])
        for option in payload["options"]:
            self.assertIsNone(option["fareInr"])
            self.assertEqual(option["provenance"], "handoff")
        self.assertIn("developers.olacabs.com", payload["partners"][0]["applyUrl"])


class TranslationFallbackTests(unittest.TestCase):
    def test_phrasebook_hit_stays_verified(self) -> None:
        text, pronunciation, confidence, mode = translate_with_fallback("Thank you", "hindi")
        self.assertEqual(confidence, "verified")
        self.assertEqual(mode, "offline_phrasebook")
        self.assertTrue(text)
        self.assertTrue(pronunciation)

    @patch("app.translation_service.live_translate_text", side_effect=LiveTranslationNotConfiguredError)
    def test_unknown_phrase_without_llm_does_not_invent(self, _live_translate_text) -> None:
        text, _pronunciation, confidence, mode = translate_with_fallback(
            "Tell the driver to wait at the gate", "hindi"
        )
        self.assertEqual(mode, "offline_phrasebook")
        self.assertEqual(confidence, "estimated")
        self.assertIn("not in the offline phrasebook", text)


if __name__ == "__main__":
    unittest.main()
