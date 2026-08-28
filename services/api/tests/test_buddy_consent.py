import unittest
import uuid
from datetime import datetime
from types import SimpleNamespace

from app.buddy_consent import (
    apply_consent,
    first_name_only,
    ordered_user_ids,
    peer_public_card,
    user_has_consented,
)


class BuddyConsentTests(unittest.TestCase):
    def test_ordered_ids_are_stable(self) -> None:
        low = uuid.UUID("00000000-0000-0000-0000-000000000001")
        high = uuid.UUID("00000000-0000-0000-0000-000000000002")
        self.assertEqual(ordered_user_ids(high, low), (low, high))
        self.assertEqual(ordered_user_ids(low, high), (low, high))

    def test_first_name_only_strips_surname(self) -> None:
        self.assertEqual(first_name_only("Priya Sharma"), "Priya")
        self.assertEqual(first_name_only("  "), "Traveler")

    def test_peer_card_hides_identity_until_mutual_consent(self) -> None:
        hidden = peer_public_card(other_name="Priya Sharma", you_consented=True, they_consented=False)
        self.assertFalse(hidden["chatUnlocked"])
        self.assertIsNone(hidden["displayName"])
        self.assertEqual(hidden["label"], "Queued traveler")
        self.assertNotIn("Priya", hidden["label"])
        self.assertNotIn("Sharma", str(hidden))

        opened = peer_public_card(other_name="Priya Sharma", you_consented=True, they_consented=True)
        self.assertTrue(opened["chatUnlocked"])
        self.assertEqual(opened["displayName"], "Priya")
        self.assertNotIn("Sharma", opened["displayName"])

    def test_apply_consent_is_idempotent_per_side(self) -> None:
        low = uuid.UUID("00000000-0000-0000-0000-000000000001")
        high = uuid.UUID("00000000-0000-0000-0000-000000000002")
        pair = SimpleNamespace(user_low_id=low, user_high_id=high, low_consented_at=None, high_consented_at=None)
        first = datetime(2026, 8, 28, 12, 0, 0)
        second = datetime(2026, 8, 28, 13, 0, 0)
        apply_consent(pair, low, first)
        apply_consent(pair, low, second)
        self.assertEqual(pair.low_consented_at, first)
        self.assertTrue(user_has_consented(pair, low))
        self.assertFalse(user_has_consented(pair, high))


if __name__ == "__main__":
    unittest.main()
