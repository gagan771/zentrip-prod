"""Offline quality gate for grounded itinerary construction and validation.

This deliberately tests the deterministic planning boundary rather than making
an LLM call. Provider responses are variable; city allocation, grounding,
duplicate prevention, time windows, and travel budgets must remain invariant.

Run from services/api:
    python -m scripts.evaluate_planner
"""

from __future__ import annotations

from datetime import date
import json
from types import SimpleNamespace

from app.adaptive_planner import allocate_city_days, canonical_city, fallback_days, rank_candidates, validate_generated_days
from scripts.evaluate_recommendations import _candidate_rows


def _cases() -> list[dict]:
    return [
        {
            "id": "multi_city_route",
            "trip": SimpleNamespace(start_date=date(2026, 10, 1), end_date=date(2026, 10, 7), cities=["Mumbai", "Goa", "Kochi"]),
            "profile": {"interests": ["heritage"], "pace": "balanced"},
            "constraints": {"maxActivitiesPerDay": 3, "maxDailyTravelMinutes": 240, "budgetLevel": "comfort"},
        },
        {
            "id": "city_alias",
            "trip": SimpleNamespace(start_date=date(2026, 10, 1), end_date=date(2026, 10, 1), cities=["Bombay"]),
            "profile": {"interests": ["heritage", "food"]},
            "constraints": {"maxActivitiesPerDay": 2, "maxDailyTravelMinutes": 240, "budgetLevel": "comfort"},
        },
        {
            "id": "must_include",
            "trip": SimpleNamespace(start_date=date(2026, 12, 1), end_date=date(2026, 12, 3), cities=["Mysuru"]),
            "profile": {"interests": ["heritage", "architecture"]},
            "constraints": {"maxActivitiesPerDay": 3, "maxDailyTravelMinutes": 240, "mustInclude": ["Mysuru Palace"], "budgetLevel": "comfort"},
        },
    ]


def evaluate() -> dict:
    candidates = _candidate_rows()
    reports: list[dict] = []
    for case in _cases():
        trip = case["trip"]
        constraints = case["constraints"]
        ranked = rank_candidates(candidates, case["profile"], constraints)
        days = fallback_days(trip, ranked, case["profile"], constraints)
        validated_days, validation = validate_generated_days(days, trip, ranked, constraints)
        expected_cities = allocate_city_days(trip.cities, len(days))
        route_ok = [canonical_city(day["city"]) == canonical_city(expected) for day, expected in zip(validated_days, expected_cities)]
        covered_cities = {canonical_city(day["city"]) for day in validated_days if day["activities"]}
        requested_cities = {canonical_city(city) for city in trip.cities}
        reports.append(
            {
                "id": case["id"],
                "passed": bool(validation["passed"]),
                "routeOrderPassed": all(route_ok),
                "cityActivityCoveragePassed": requested_cities <= covered_cities,
                "days": len(validated_days),
                "daysWithActivities": sum(bool(day["activities"]) for day in validated_days),
                "errors": validation["errors"],
            }
        )
    metrics = {
        "cases": len(reports),
        "validPlanRate": round(sum(report["passed"] for report in reports) / len(reports), 4),
        "routeOrderRate": round(sum(report["routeOrderPassed"] for report in reports) / len(reports), 4),
        "cityActivityCoverageRate": round(sum(report["cityActivityCoveragePassed"] for report in reports) / len(reports), 4),
        "activityCoverageRate": round(sum(report["daysWithActivities"] > 0 for report in reports) / len(reports), 4),
    }
    return {"metrics": metrics, "cases": reports}


def main() -> None:
    report = evaluate()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if (
        report["metrics"]["validPlanRate"] < 1.0
        or report["metrics"]["routeOrderRate"] < 1.0
        or report["metrics"]["cityActivityCoverageRate"] < 1.0
    ):
        raise SystemExit("planner quality gate failed")


if __name__ == "__main__":
    main()
