"""Last-mile cab compare: official-app handoff now, partner quotes later.

Zentrip never scrapes Uber/Ola/Rapido, never stores ride passwords, and never
persists a mock ₹ as a live observation. A future authorized adapter (Namma Yatri /
Beckn / ONDC, then Ola) can implement CabAdapter.search without changing the API.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.config import settings
from app.provider_handoff import cab_handoffs, city_coords, handoff_to_dict


SMART_PICKUP_HINT = (
    "If the live map shows a high-demand pin, walking 80–200 m can sometimes leave "
    "a surge zone. Check the official app — Zentrip does not compute a fare save."
)

CAB_MESSAGE = (
    "These open Uber, Ola, Rapido, Namma Yatri, or Maps with your pickup and drop. "
    "Fares and ETAs are live only on those apps. Zentrip does not take payment and "
    "will not book a ride from a spoken yes."
)


@dataclass(frozen=True)
class CabSearchInput:
    pickup: str
    drop: str
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    drop_lat: float | None = None
    drop_lng: float | None = None


@dataclass(frozen=True)
class CabQuote:
    provider: str
    product: str
    source_kind: str  # handoff | live
    url: str
    fare_inr: int | None = None
    eta_minutes: int | None = None
    note: str = ""


class CabAdapter(Protocol):
    """Drop-in contract for an authorized last-mile partner."""

    provider: str

    def configured(self) -> bool: ...

    def search(self, search_input: CabSearchInput) -> list[CabQuote]: ...

    def book_allowed(self) -> bool: ...


class HandoffCabAdapter:
    """Opens official apps. Never invents a live fare."""

    provider = "handoff"

    def configured(self) -> bool:
        return True

    def search(self, search_input: CabSearchInput) -> list[CabQuote]:
        quotes: list[CabQuote] = []
        for item in cab_handoffs(
            search_input.pickup,
            search_input.drop,
            search_input.pickup_lat,
            search_input.pickup_lng,
            search_input.drop_lat,
            search_input.drop_lng,
        ):
            quotes.append(
                CabQuote(
                    provider=item.key,
                    product=_product_hint(item.key),
                    source_kind="handoff",
                    url=item.url,
                    fare_inr=None,
                    eta_minutes=None,
                    note=item.note,
                )
            )
        return quotes

    def book_allowed(self) -> bool:
        return False


class NammaYatriCabAdapter:
    """Placeholder for a signed Namma Yatri / Beckn session.

    A key in env is not enough to mint quotes. Until the Beckn client is wired,
    search() stays empty so we never fake a live ₹.
    """

    provider = "namma_yatri"

    def configured(self) -> bool:
        return bool(settings.namma_yatri_api_key.strip())

    def search(self, search_input: CabSearchInput) -> list[CabQuote]:
        del search_input
        return []

    def book_allowed(self) -> bool:
        return False


CAB_ADAPTERS: tuple[CabAdapter, ...] = (NammaYatriCabAdapter(), HandoffCabAdapter())


def _product_hint(key: str) -> str:
    return {
        "uber": "Ride",
        "ola": "Cab / auto",
        "rapido": "Bike / auto",
        "namma_yatri": "Open mobility",
        "google_maps": "Directions",
    }.get(key, "Ride")


def partnership_programs() -> list[dict]:
    brief = (
        "Company: Zentrip (Zenny), an India travel companion. "
        "Use case: last-mile handoff for travelers — official deep links now, "
        "authorized quote + book APIs later. We do not scrape, do not store rider "
        "passwords, and do not take payment. Markets: India. Ask: rider quotes, "
        "deep-link booking, later in-app tracking."
    )
    return [
        {
            "key": "ola",
            "name": "Ola Developers",
            "status": "apply_to_enable_quotes",
            "applyUrl": "https://developers.olacabs.com/",
            "docsUrl": "https://developers.olacabs.com/",
            "why": "First realistic commercial partner API after open mobility.",
            "whatToSend": brief,
        },
        {
            "key": "uber",
            "name": "Uber Developers",
            "status": "apply_to_enable_quotes",
            "applyUrl": "https://developer.uber.com/",
            "docsUrl": "https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction",
            "why": "Deep links work today. Ride Request API is invite-only and last.",
            "whatToSend": brief,
        },
        {
            "key": "ondc",
            "name": "ONDC Network",
            "status": "apply_to_enable_quotes",
            "applyUrl": "https://ondc.org/",
            "docsUrl": "https://resources.ondc.org/",
            "why": "Register as a buyer app for mobility once the network path is ready.",
            "whatToSend": brief,
        },
        {
            "key": "namma_yatri",
            "name": "Namma Yatri",
            "status": "apply_to_enable_quotes",
            "applyUrl": "https://nammayatri.in/",
            "docsUrl": "https://github.com/nammayatri/nammayatri",
            "why": "Most realistic first live quotes via open mobility / Beckn.",
            "whatToSend": brief,
        },
        {
            "key": "beckn",
            "name": "Beckn Protocol",
            "status": "apply_to_enable_quotes",
            "applyUrl": "https://becknprotocol.io/",
            "docsUrl": "https://becknprotocol.io/",
            "why": "Protocol Namma Yatri and ONDC mobility speak.",
            "whatToSend": brief,
        },
        {
            "key": "rapido",
            "name": "Rapido",
            "status": "handoff_only",
            "applyUrl": "https://www.rapido.bike/",
            "docsUrl": "https://www.rapido.bike/",
            "why": "No public partner API. Use official app handoff until they publish one.",
            "whatToSend": brief,
        },
    ]


def search_cabs(search_input: CabSearchInput) -> dict:
    live_quotes: list[CabQuote] = []
    for adapter in CAB_ADAPTERS:
        if adapter.provider == "handoff":
            continue
        if adapter.configured():
            live_quotes.extend(adapter.search(search_input))

    handoff_quotes = HandoffCabAdapter().search(search_input)
    quotes = live_quotes or handoff_quotes
    handoffs = [
        handoff_to_dict(item)
        for item in cab_handoffs(
            search_input.pickup,
            search_input.drop,
            search_input.pickup_lat,
            search_input.pickup_lng,
            search_input.drop_lat,
            search_input.drop_lng,
        )
    ]
    options = []
    for index, quote in enumerate(quotes):
        options.append(
            {
                "provider": quote.provider,
                "productHint": quote.product,
                "provenance": "live" if quote.source_kind == "live" and quote.fare_inr is not None else "handoff",
                "fareInr": quote.fare_inr,
                "etaMinutes": quote.eta_minutes,
                "url": quote.url,
                "note": quote.note,
                "smartPickupHint": SMART_PICKUP_HINT if index == 0 else None,
            }
        )

    pickup_pin = _coord_pair_for(search_input.pickup, search_input.pickup_lat, search_input.pickup_lng)
    drop_pin = _coord_pair_for(search_input.drop, search_input.drop_lat, search_input.drop_lng)
    return {
        "pickup": search_input.pickup,
        "drop": search_input.drop,
        "pickupLat": pickup_pin[0] if pickup_pin else None,
        "pickupLng": pickup_pin[1] if pickup_pin else None,
        "dropLat": drop_pin[0] if drop_pin else None,
        "dropLng": drop_pin[1] if drop_pin else None,
        "isLive": any(item["provenance"] == "live" for item in options),
        "message": CAB_MESSAGE,
        "smartPickupHint": SMART_PICKUP_HINT,
        "options": options,
        "handoffs": handoffs,
        "partners": partnership_programs(),
    }


def _coord_pair_for(
    name: str,
    lat: float | None,
    lng: float | None,
) -> tuple[float, float] | None:
    if lat is not None and lng is not None:
        return (lat, lng)
    return city_coords(name)
