"""Evaluate the deterministic recommendation ranker against curated query cases.

This is intentionally offline: it reads the reviewed catalog modules directly,
so ranking changes can be measured in CI without Postgres, Redis, or an LLM.
The dataset is a quality gate and editorial feedback instrument, not a claim
that these labels represent every valid Indian itinerary.

Run from services/api:
    python -m scripts.evaluate_recommendations
    python -m scripts.evaluate_recommendations --output ./data/recommendation-eval.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.adaptive_planner import rank_candidates, rerank_candidates
from app.india_regional_expansion import ENTRIES as REGIONAL_ENTRIES
from app.india_regional_expansion import PROFILES as REGIONAL_PROFILES
from app.india_tourism_catalog import ENTRIES as TOURISM_ENTRIES
from app.india_tourism_catalog import PROFILES as TOURISM_PROFILES


DEFAULT_CASES = Path(__file__).resolve().parents[1] / "evals" / "recommendation_cases.jsonl"


def _profile_map(rows: list[tuple]) -> dict[str, tuple]:
    return {row[0]: row for row in rows}


def _candidate_rows() -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    profiles = _profile_map(TOURISM_PROFILES + REGIONAL_PROFILES)
    for entry in TOURISM_ENTRIES + REGIONAL_ENTRIES:
        if len(entry) == 7:
            name, city, aliases, source_key, entity_type, fact, experience = entry
        else:
            name, city, aliases, source_key, fact, experience = entry
            entity_type = "activity"
        profile = profiles[name]
        candidates.append(
            {
                "placeId": name.casefold().replace(" ", "-"),
                "name": name,
                "city": city,
                "aliases": aliases,
                "fact": fact,
                "source": source_key,
                "sourceUrl": None,
                "lastVerified": None,
                "confidence": "estimated",
                "experienceProfile": {
                    **experience,
                    "destinationProfile": {
                        "state": profile[1],
                        "region": profile[2],
                        "destinationKind": profile[3],
                        "tags": profile[4],
                        "bestSeasons": profile[5],
                        "typicalStayMinDays": profile[6],
                        "typicalStayMaxDays": profile[7],
                        "altitudeM": profile[8],
                        "gatewayCity": profile[9],
                        "gatewayAirports": profile[10],
                        "accessNotes": profile[11],
                        "safetyNotes": profile[12],
                        "accessibility": profile[13],
                    },
                },
            }
        )
    return candidates


def _load_cases(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


_QUERY_VARIANTS = (
    "{query}",
    "please suggest {query}",
    "{query} for my family",
    "{query} for a relaxed trip",
    "{query}, budget friendly",
    "{query} in Hindi",
    "Hinglish: {query}",
    "I want {query}",
    "{query} with less walking",
    "{query} without unsafe or invented details",
)


def _expanded_cases(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn curated templates into a 200-case multilingual/adversarial smoke set."""
    expanded: list[dict[str, Any]] = []
    for case in cases:
        for index, variant in enumerate(_QUERY_VARIANTS, start=1):
            expanded.append({
                **case,
                "id": f"{case['id']}:v{index}",
                "query": variant.format(query=case.get("query", "")),
                "baseCaseId": case["id"],
            })
    return expanded


def _tags(candidate: dict[str, Any]) -> set[str]:
    experience = candidate.get("experienceProfile") or {}
    destination = experience.get("destinationProfile") or {}
    return {str(value).casefold() for value in [*experience.get("tags", []), *destination.get("tags", [])]}


def _relevant(candidate: dict[str, Any], case: dict[str, Any]) -> bool:
    tags = _tags(candidate)
    required = {str(value).casefold() for value in case.get("requiredTags", [])}
    if required and not required.issubset(tags):
        return False
    destination = ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
    if case.get("expectedRegion") and destination.get("region") != case["expectedRegion"]:
        return False
    if case.get("expectedKind") and destination.get("destinationKind") != case["expectedKind"]:
        return False
    return True


def evaluate(cases: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> dict[str, Any]:
    cases = _expanded_cases(cases)
    case_reports: list[dict[str, Any]] = []
    tag_precision: list[float] = []
    coverage: list[float] = []
    avoidance: list[float] = []
    season_fit: list[float] = []
    accessibility_fit: list[float] = []
    city_diversity: list[float] = []
    kind_diversity: list[float] = []

    for case in cases:
        profile = case.get("profile") or {}
        constraints = case.get("constraints") or {}
        limit = int(case.get("limit", 5))
        ranked = rerank_candidates(rank_candidates(candidates, profile, constraints), case.get("query", ""), limit=limit)
        relevant = [_relevant(item, case) for item in ranked]
        forbidden = {str(value).casefold() for value in case.get("avoidTags", [])}
        safe = [not (forbidden & _tags(item)) for item in ranked]
        tag_precision.append(sum(relevant) / len(relevant) if relevant else 0.0)
        coverage.append(1.0 if any(relevant) else 0.0)
        avoidance.append(sum(safe) / len(safe) if safe else 1.0)
        season_fit.extend(float(item["scoreBreakdown"]["seasonFit"]) for item in ranked)
        accessibility_fit.extend(float(item["scoreBreakdown"]["accessibilityFit"]) for item in ranked)
        city_diversity.append(len({str(item.get("city")) for item in ranked}) / len(ranked) if ranked else 0.0)
        kind_diversity.append(
            len({str(((item.get("experienceProfile") or {}).get("destinationProfile") or {}).get("destinationKind")) for item in ranked})
            / len(ranked)
            if ranked
            else 0.0
        )
        case_reports.append(
            {
                "id": case["id"],
                "top": [item["name"] for item in ranked],
                "relevantAtK": sum(relevant),
                "safeAtK": sum(safe),
            }
        )

    def mean(values: list[float]) -> float:
        return round(sum(values) / len(values), 4) if values else 0.0

    profiles = [
        ((candidate.get("experienceProfile") or {}).get("destinationProfile") or {})
        for candidate in candidates
    ]
    complete_profiles = [
        profile for profile in profiles
        if profile.get("state") and profile.get("region") and profile.get("destinationKind")
        and profile.get("tags") and profile.get("bestSeasons")
        and profile.get("accessNotes") and profile.get("safetyNotes")
        and isinstance(profile.get("accessibility"), dict)
    ]
    alias_covered = sum(1 for candidate in candidates if candidate.get("aliases"))
    metrics = {
        "cases": len(cases),
        "catalogCandidates": len(candidates),
        "catalogRegions": len({profile.get("region") for profile in profiles if profile.get("region")}),
        "catalogStates": len({profile.get("state") for profile in profiles if profile.get("state")}),
        "profileCompleteness": round(len(complete_profiles) / len(profiles), 4) if profiles else 0.0,
        "aliasCoverage": round(alias_covered / len(candidates), 4) if candidates else 0.0,
        "tagPrecisionAtK": mean(tag_precision),
        "coverageAtK": mean(coverage),
        "avoidanceRateAtK": mean(avoidance),
        "seasonFitMean": mean(season_fit),
        "accessibilityFitMean": mean(accessibility_fit),
        "cityDiversityAtK": mean(city_diversity),
        "kindDiversityAtK": mean(kind_diversity),
    }
    return {"metrics": metrics, "cases": case_reports}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--min-coverage", type=float, default=0.95)
    parser.add_argument("--min-avoidance", type=float, default=0.90)
    parser.add_argument("--min-tag-precision", type=float, default=0.50)
    parser.add_argument("--min-season-fit", type=float, default=0.85)
    parser.add_argument("--min-accessibility-fit", type=float, default=0.75)
    parser.add_argument("--min-profile-completeness", type=float, default=0.95)
    args = parser.parse_args()
    report = evaluate(_load_cases(args.cases), _candidate_rows())
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    metrics = report["metrics"]
    if metrics["coverageAtK"] < args.min_coverage:
        raise SystemExit(f"coverageAtK {metrics['coverageAtK']} is below {args.min_coverage}")
    if metrics["avoidanceRateAtK"] < args.min_avoidance:
        raise SystemExit(f"avoidanceRateAtK {metrics['avoidanceRateAtK']} is below {args.min_avoidance}")
    if metrics["tagPrecisionAtK"] < args.min_tag_precision:
        raise SystemExit(f"tagPrecisionAtK {metrics['tagPrecisionAtK']} is below {args.min_tag_precision}")
    if metrics["seasonFitMean"] < args.min_season_fit:
        raise SystemExit(f"seasonFitMean {metrics['seasonFitMean']} is below {args.min_season_fit}")
    if metrics["accessibilityFitMean"] < args.min_accessibility_fit:
        raise SystemExit(f"accessibilityFitMean {metrics['accessibilityFitMean']} is below {args.min_accessibility_fit}")
    if metrics["profileCompleteness"] < args.min_profile_completeness:
        raise SystemExit(f"profileCompleteness {metrics['profileCompleteness']} is below {args.min_profile_completeness}")


if __name__ == "__main__":
    main()
