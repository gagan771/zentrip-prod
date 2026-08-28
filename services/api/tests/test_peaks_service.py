import unittest
from datetime import date
from uuid import uuid4

from app.peaks_service import PeakCandidate, angular_difference, identification_method, rank_peak_candidates


def _peak(name: str, latitude: float, longitude: float) -> PeakCandidate:
    return PeakCandidate(
        id=uuid4(),
        name=name,
        elevation_m=4000,
        latitude=latitude,
        longitude=longitude,
        description="preview",
        source_name="catalog",
        last_verified=date(2026, 8, 1),
        status="published",
    )


class PeaksServiceTests(unittest.TestCase):
    def test_angular_difference_wraps(self) -> None:
        self.assertEqual(angular_difference(350, 10), 20)

    def test_compass_fov_keeps_peak_ahead_and_drops_behind(self) -> None:
        # Observer near Mussoorie; one peak due north, one due south.
        observer = (30.45, 78.08)
        north = _peak("North Peak", 30.70, 78.08)
        south = _peak("South Peak", 30.20, 78.08)
        facing_north = rank_peak_candidates([north, south], *observer, bearing=0, field_of_view=60, radius_km=80)
        self.assertEqual([item.peak.name for item in facing_north], ["North Peak"])
        self.assertEqual(identification_method(0), "compass_fov_catalog")

    def test_without_bearing_sorts_by_distance(self) -> None:
        observer = (30.45, 78.08)
        nearer = _peak("Near", 30.50, 78.08)
        farther = _peak("Far", 30.80, 78.08)
        ranked = rank_peak_candidates([farther, nearer], *observer, bearing=None, radius_km=80)
        self.assertEqual([item.peak.name for item in ranked], ["Near", "Far"])
        self.assertEqual(identification_method(None), "catalog_distance")
        self.assertIsNone(ranked[0].angular_difference_degrees)


if __name__ == "__main__":
    unittest.main()
