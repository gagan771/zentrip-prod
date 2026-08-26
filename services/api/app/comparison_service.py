"""Deterministic Phase 2 comparison service and provider-adapter contract.

The first adapters intentionally return only labelled demo observations for the
Delhi–Agra–Jaipur corridor. They exercise normalization, ranking, persistence, and
explanations without pretending a cached or invented fare is a live price.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Protocol


@dataclass(frozen=True)
class SearchInput:
    origin: str
    destination: str
    departure_date: date
    budget_level: str


@dataclass(frozen=True)
class ProviderSearchResult:
    provider: str
    mode: str
    external_id: str
    origin: str
    destination: str
    departure_at: datetime
    arrival_at: datetime
    base_price: int
    fees: int
    duration_minutes: int
    cancellation_score: float
    reliability_score: float
    convenience_score: float
    availability: bool
    source_kind: str = "mock"

    @property
    def total_price(self) -> int:
        return self.base_price + self.fees


class ServiceProviderAdapter(Protocol):
    """Shared interface for transport, stay, and future grocery providers."""

    provider: str
    mode: str

    def search(self, search_input: SearchInput) -> list[ProviderSearchResult]: ...

    def get_details(self, external_id: str) -> ProviderSearchResult | None: ...

    def get_deep_link(self, external_id: str) -> str | None: ...


_LOCATION_ALIASES = {
    "del": "DEL",
    "delhi": "DEL",
    "new delhi": "DEL",
    "agra": "AGR",
    "agr": "AGR",
    "jaipur": "JAI",
    "jai": "JAI",
}

# Deliberately small, stable corridor fixtures. The source_kind is mock and the router
# exposes bookable=false, so these can never masquerade as a provider's live offer.
_ROUTES = {
    frozenset(("DEL", "AGR")): {
        "train": {"minutes": 205, "base_price": 890, "fees": 35, "reliability": 0.90, "convenience": 0.82},
        "bus": {"minutes": 245, "base_price": 620, "fees": 25, "reliability": 0.78, "convenience": 0.70},
    },
    frozenset(("AGR", "JAI")): {
        "train": {"minutes": 250, "base_price": 970, "fees": 35, "reliability": 0.88, "convenience": 0.80},
        "bus": {"minutes": 300, "base_price": 690, "fees": 25, "reliability": 0.76, "convenience": 0.69},
    },
    frozenset(("DEL", "JAI")): {
        "train": {"minutes": 285, "base_price": 1120, "fees": 40, "reliability": 0.89, "convenience": 0.84},
        "bus": {"minutes": 345, "base_price": 760, "fees": 30, "reliability": 0.77, "convenience": 0.71},
    },
}


def normalize_location(location: str) -> str | None:
    return _LOCATION_ALIASES.get(location.strip().casefold())


def find_known_locations(text: str) -> list[str]:
    """Scan free text for corridor city aliases, returning normalized codes (DEL/AGR/JAI)
    deduped and ordered by first appearance. Used by the Agent Gateway to parse a
    conversational compare request like "cheapest way from Delhi to Agra" without a
    full NLU pipeline — the corridor is small and fixed, so alias matching is enough.
    """
    lowered = text.casefold()
    matches: list[tuple[int, str]] = []
    seen: set[str] = set()
    for alias, code in _LOCATION_ALIASES.items():
        if code in seen:
            continue
        match = re.search(rf"\b{re.escape(alias)}\b", lowered)
        if match:
            matches.append((match.start(), code))
            seen.add(code)
    matches.sort(key=lambda item: item[0])
    return [code for _, code in matches]


class _CorridorDemoAdapter:
    provider = ""
    mode = ""
    departure_time = time(7, 0)

    def search(self, search_input: SearchInput) -> list[ProviderSearchResult]:
        origin = normalize_location(search_input.origin)
        destination = normalize_location(search_input.destination)
        if not origin or not destination or origin == destination:
            return []
        route = _ROUTES.get(frozenset((origin, destination)))
        if not route:
            return []

        details = route[self.mode]
        departure = datetime.combine(search_input.departure_date, self.departure_time)
        return [
            ProviderSearchResult(
                provider=self.provider,
                mode=self.mode,
                external_id=f"demo-{self.mode}-{origin.lower()}-{destination.lower()}-{search_input.departure_date.isoformat()}",
                origin=origin,
                destination=destination,
                departure_at=departure,
                arrival_at=departure + timedelta(minutes=details["minutes"]),
                base_price=details["base_price"],
                fees=details["fees"],
                duration_minutes=details["minutes"],
                cancellation_score=0.75 if self.mode == "train" else 0.62,
                reliability_score=details["reliability"],
                convenience_score=details["convenience"],
                availability=True,
            )
        ]

    def get_details(self, external_id: str) -> ProviderSearchResult | None:
        # A real adapter will call the authorized provider API here. Demo fixtures do
        # not support retrieval or booking handoff.
        return None

    def get_deep_link(self, external_id: str) -> str | None:
        return None


class RailDemoAdapter(_CorridorDemoAdapter):
    provider = "Zentrip Rail Demo"
    mode = "train"
    departure_time = time(7, 10)


class CoachDemoAdapter(_CorridorDemoAdapter):
    provider = "Zentrip Coach Demo"
    mode = "bus"
    departure_time = time(8, 0)


ADAPTERS: tuple[ServiceProviderAdapter, ...] = (RailDemoAdapter(), CoachDemoAdapter())


# ─── Stay search (basic — 03-compare-decision-engine.md Phase 2 exit criterion) ────────
#
# A parallel, smaller version of the transport search above. Kept genuinely separate
# rather than generalizing SearchInput/ProviderSearchResult/ServiceProviderAdapter to
# cover both: a stay has no origin/destination/mode, and a transport leg has no
# check-in/check-out/rating — a shared shape would end up mostly-null either way.


@dataclass(frozen=True)
class StaySearchInput:
    city: str
    check_in: date
    check_out: date
    budget_level: str
    guests: int = 1


@dataclass(frozen=True)
class StaySearchResult:
    provider: str
    stay_type: str  # hostel|hotel
    external_id: str
    city: str
    check_in: date
    check_out: date
    price_per_night: int
    rating: float  # 0-5
    distance_to_center_km: float
    cancellation_score: float
    availability: bool
    source_kind: str = "mock"

    @property
    def nights(self) -> int:
        return max(1, (self.check_out - self.check_in).days)

    @property
    def total_price(self) -> int:
        return self.price_per_night * self.nights


# Deliberately small, stable corridor fixtures — same spirit as _ROUTES above: labelled
# demo data only, never presented as a live, bookable price (source_kind="mock").
_STAYS: dict[str, list[dict]] = {
    "DEL": [
        {"provider": "Zentrip Backpacker Hostel Demo", "stay_type": "hostel", "price_per_night": 650, "rating": 4.3, "distance_to_center_km": 1.2, "cancellation": 0.85},
        {"provider": "Zentrip Budget Hotel Demo", "stay_type": "hotel", "price_per_night": 1900, "rating": 4.0, "distance_to_center_km": 2.8, "cancellation": 0.70},
        {"provider": "Zentrip Comfort Hotel Demo", "stay_type": "hotel", "price_per_night": 3400, "rating": 4.5, "distance_to_center_km": 0.8, "cancellation": 0.80},
    ],
    "AGR": [
        {"provider": "Zentrip Backpacker Hostel Demo", "stay_type": "hostel", "price_per_night": 550, "rating": 4.1, "distance_to_center_km": 1.5, "cancellation": 0.85},
        {"provider": "Zentrip Budget Hotel Demo", "stay_type": "hotel", "price_per_night": 1700, "rating": 3.9, "distance_to_center_km": 3.0, "cancellation": 0.70},
        {"provider": "Zentrip Taj-View Hotel Demo", "stay_type": "hotel", "price_per_night": 4200, "rating": 4.6, "distance_to_center_km": 0.5, "cancellation": 0.75},
    ],
    "JAI": [
        {"provider": "Zentrip Backpacker Hostel Demo", "stay_type": "hostel", "price_per_night": 600, "rating": 4.2, "distance_to_center_km": 1.0, "cancellation": 0.85},
        {"provider": "Zentrip Budget Hotel Demo", "stay_type": "hotel", "price_per_night": 1800, "rating": 4.0, "distance_to_center_km": 2.5, "cancellation": 0.70},
        {"provider": "Zentrip Heritage Hotel Demo", "stay_type": "hotel", "price_per_night": 3800, "rating": 4.4, "distance_to_center_km": 1.1, "cancellation": 0.78},
    ],
}


class _CityStayDemoAdapter:
    """One demo adapter per fixture entry in _STAYS — mirrors _CorridorDemoAdapter's
    shape but keyed by city + entry index rather than city-pair + mode, since stays
    don't have an origin/destination."""

    def __init__(self, city: str, index: int, entry: dict):
        self.provider = entry["provider"]
        self.stay_type = entry["stay_type"]
        self._city = city
        self._index = index
        self._entry = entry

    def search(self, search_input: StaySearchInput) -> list[StaySearchResult]:
        city = normalize_location(search_input.city)
        if city != self._city or search_input.check_out <= search_input.check_in:
            return []
        return [
            StaySearchResult(
                provider=self.provider,
                stay_type=self.stay_type,
                external_id=f"demo-stay-{self._city.lower()}-{self._index}-{search_input.check_in.isoformat()}",
                city=self._city,
                check_in=search_input.check_in,
                check_out=search_input.check_out,
                price_per_night=self._entry["price_per_night"],
                rating=self._entry["rating"],
                distance_to_center_km=self._entry["distance_to_center_km"],
                cancellation_score=self._entry["cancellation"],
                availability=True,
            )
        ]

    def get_details(self, external_id: str) -> StaySearchResult | None:
        return None

    def get_deep_link(self, external_id: str) -> str | None:
        return None


STAY_ADAPTERS: tuple[_CityStayDemoAdapter, ...] = tuple(
    _CityStayDemoAdapter(city, index, entry) for city, entries in _STAYS.items() for index, entry in enumerate(entries)
)


@dataclass(frozen=True)
class ScoredStayResult:
    result: StaySearchResult
    score: float
    rank: int
    badges: list[str]
    reasons: list[str]


_STAY_WEIGHTS = {
    "backpacker": {"price": 0.45, "rating": 0.20, "distance": 0.20, "cancellation": 0.15},
    "comfort": {"price": 0.22, "rating": 0.30, "distance": 0.28, "cancellation": 0.20},
    "luxury": {"price": 0.10, "rating": 0.42, "distance": 0.28, "cancellation": 0.20},
    "mixed": {"price": 0.30, "rating": 0.28, "distance": 0.22, "cancellation": 0.20},
}


def search_stay_adapters(search_input: StaySearchInput) -> list[StaySearchResult]:
    return [result for adapter in STAY_ADAPTERS for result in adapter.search(search_input)]


def rank_stay_results(results: list[StaySearchResult], budget_level: str) -> list[ScoredStayResult]:
    available = [result for result in results if result.availability]
    if not available:
        return []

    weights = _STAY_WEIGHTS[budget_level]
    prices = [result.total_price for result in available]
    distances = [result.distance_to_center_km for result in available]
    raw_scores: list[tuple[StaySearchResult, float]] = []
    for result in available:
        score = (
            weights["price"] * _lower_is_better(result.total_price, min(prices), max(prices))
            + weights["rating"] * (result.rating / 5.0)
            + weights["distance"] * _lower_is_better(result.distance_to_center_km, min(distances), max(distances))
            + weights["cancellation"] * result.cancellation_score
        )
        raw_scores.append((result, score))

    raw_scores.sort(key=lambda item: item[1], reverse=True)
    cheapest = min(available, key=lambda result: result.total_price)
    best_rated = max(available, key=lambda result: result.rating)
    most_central = min(available, key=lambda result: result.distance_to_center_km)
    ranked: list[ScoredStayResult] = []
    for index, (result, score) in enumerate(raw_scores, start=1):
        badges = ["RECOMMENDED"] if index == 1 else []
        if result == cheapest:
            badges.append("CHEAPEST")
        if result == best_rated:
            badges.append("BEST RATED")
        if result == most_central:
            badges.append("MOST CENTRAL")
        reasons = [
            f"₹{result.total_price} total demo price for {result.nights} night(s)",
            f"{result.rating}/5 demo rating",
            f"{result.distance_to_center_km} km from city center (demo)",
            "Demo data only — a live provider check is required before booking.",
        ]
        ranked.append(ScoredStayResult(result=result, score=round(score, 4), rank=index, badges=badges, reasons=reasons))
    return ranked


@dataclass(frozen=True)
class ScoredResult:
    result: ProviderSearchResult
    score: float
    rank: int
    badges: list[str]
    reasons: list[str]


_WEIGHTS = {
    "backpacker": {"price": 0.45, "duration": 0.18, "reliability": 0.14, "cancellation": 0.10, "convenience": 0.13},
    "comfort": {"price": 0.22, "duration": 0.28, "reliability": 0.22, "cancellation": 0.12, "convenience": 0.16},
    "luxury": {"price": 0.12, "duration": 0.25, "reliability": 0.28, "cancellation": 0.15, "convenience": 0.20},
    "mixed": {"price": 0.30, "duration": 0.24, "reliability": 0.20, "cancellation": 0.12, "convenience": 0.14},
}


def search_adapters(search_input: SearchInput) -> list[ProviderSearchResult]:
    return [result for adapter in ADAPTERS for result in adapter.search(search_input)]


def _lower_is_better(value: int, lowest: int, highest: int) -> float:
    if lowest == highest:
        return 1.0
    return 1 - (value - lowest) / (highest - lowest)


def rank_results(results: list[ProviderSearchResult], budget_level: str) -> list[ScoredResult]:
    available = [result for result in results if result.availability]
    if not available:
        return []

    weights = _WEIGHTS[budget_level]
    prices = [result.total_price for result in available]
    durations = [result.duration_minutes for result in available]
    raw_scores: list[tuple[ProviderSearchResult, float]] = []
    for result in available:
        score = (
            weights["price"] * _lower_is_better(result.total_price, min(prices), max(prices))
            + weights["duration"] * _lower_is_better(result.duration_minutes, min(durations), max(durations))
            + weights["reliability"] * result.reliability_score
            + weights["cancellation"] * result.cancellation_score
            + weights["convenience"] * result.convenience_score
        )
        raw_scores.append((result, score))

    raw_scores.sort(key=lambda item: item[1], reverse=True)
    cheapest = min(available, key=lambda result: result.total_price)
    fastest = min(available, key=lambda result: result.duration_minutes)
    most_convenient = max(available, key=lambda result: result.convenience_score)
    ranked: list[ScoredResult] = []
    for index, (result, score) in enumerate(raw_scores, start=1):
        badges = ["RECOMMENDED"] if index == 1 else []
        if result == cheapest:
            badges.append("CHEAPEST")
        if result == fastest:
            badges.append("FASTEST")
        if result == most_convenient:
            badges.append("MOST CONVENIENT")
        reasons = [
            f"₹{result.total_price} total demo fare",
            f"{result.duration_minutes} minutes estimated duration",
            f"{round(result.reliability_score * 100)}% demo reliability score",
            "Demo data only — a live provider check is required before booking.",
        ]
        ranked.append(ScoredResult(result=result, score=round(score, 4), rank=index, badges=badges, reasons=reasons))
    return ranked
