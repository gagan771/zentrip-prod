import unittest

from app.routers.peaks import _direction, _distance_bearing
from app.seed import TRAIL_SEEDS


class TrailGeometryTests(unittest.TestCase):
    def test_bearing_and_distance_are_deterministic(self) -> None:
        distance, bearing = _distance_bearing(30.0, 79.0, 30.0, 80.0)
        self.assertAlmostEqual(distance, 96.3, delta=1.0)
        self.assertAlmostEqual(bearing, 89.7, delta=1.0)
        self.assertEqual(_direction(bearing), "E")

    def test_seeded_routes_are_explicit_previews(self) -> None:
        self.assertGreaterEqual(len(TRAIL_SEEDS), 2)
        self.assertTrue(all("preview" in trail["slug"] for trail in TRAIL_SEEDS))
        self.assertTrue(all(trail["route_geojson"]["type"] == "LineString" for trail in TRAIL_SEEDS))
        corridor = {trail["region"] for trail in TRAIL_SEEDS}
        self.assertTrue({"Delhi", "Agra", "Jaipur"}.issubset(corridor))


if __name__ == "__main__":
    unittest.main()
