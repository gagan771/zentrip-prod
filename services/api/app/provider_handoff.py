"""Live provider handoff URLs for trains, buses, flights, stays, and cabs.

Zentrip does not scrape IRCTC/RedBus/OTA APIs. Production booking is the same
pattern as Blinkit/Zepto/Swiggy: open the provider's own website with the search
pre-filled so the traveler completes checkout on the official site.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from urllib.parse import quote_plus


@dataclass(frozen=True)
class CityCodes:
    name: str
    iata: str
    train: str
    bus_slug: str


@dataclass(frozen=True)
class ProviderHandoff:
    key: str
    display_name: str
    category: str  # train | bus | flight | stay | cab
    url: str
    live: bool = True
    note: str = "Checkout happens on the provider site. Zentrip does not take payment."


_CITIES: dict[str, CityCodes] = {
    "delhi": CityCodes("Delhi", "DEL", "NDLS", "delhi"),
    "new delhi": CityCodes("New Delhi", "DEL", "NDLS", "delhi"),
    "agra": CityCodes("Agra", "AGR", "AGC", "agra"),
    "jaipur": CityCodes("Jaipur", "JAI", "JP", "jaipur"),
    "mumbai": CityCodes("Mumbai", "BOM", "CSTM", "mumbai"),
    "bombay": CityCodes("Mumbai", "BOM", "CSTM", "mumbai"),
    "bengaluru": CityCodes("Bengaluru", "BLR", "SBC", "bangalore"),
    "bangalore": CityCodes("Bengaluru", "BLR", "SBC", "bangalore"),
    "chennai": CityCodes("Chennai", "MAA", "MAS", "chennai"),
    "madras": CityCodes("Chennai", "MAA", "MAS", "chennai"),
    "kolkata": CityCodes("Kolkata", "CCU", "HWH", "kolkata"),
    "calcutta": CityCodes("Kolkata", "CCU", "HWH", "kolkata"),
    "hyderabad": CityCodes("Hyderabad", "HYD", "HYB", "hyderabad"),
    "pune": CityCodes("Pune", "PNQ", "PUNE", "pune"),
    "ahmedabad": CityCodes("Ahmedabad", "AMD", "ADI", "ahmedabad"),
    "goa": CityCodes("Goa", "GOI", "MAO", "goa"),
    "varanasi": CityCodes("Varanasi", "VNS", "BSB", "varanasi"),
    "rishikesh": CityCodes("Rishikesh", "DED", "RKSH", "rishikesh"),
    "haridwar": CityCodes("Haridwar", "DED", "HW", "haridwar"),
    "udaipur": CityCodes("Udaipur", "UDR", "UDZ", "udaipur"),
    "jodhpur": CityCodes("Jodhpur", "JDH", "JU", "jodhpur"),
    "amritsar": CityCodes("Amritsar", "ATQ", "ASR", "amritsar"),
    "kochi": CityCodes("Kochi", "COK", "ERS", "kochi"),
    "cochin": CityCodes("Kochi", "COK", "ERS", "kochi"),
    "thiruvananthapuram": CityCodes("Thiruvananthapuram", "TRV", "TVC", "trivandrum"),
    "lucknow": CityCodes("Lucknow", "LKO", "LKO", "lucknow"),
    "chandigarh": CityCodes("Chandigarh", "IXC", "CDG", "chandigarh"),
    "indore": CityCodes("Indore", "IDR", "INDB", "indore"),
    "bhopal": CityCodes("Bhopal", "BHO", "BPL", "bhopal"),
    "nagpur": CityCodes("Nagpur", "NAG", "NGP", "nagpur"),
    "surat": CityCodes("Surat", "STV", "ST", "surat"),
    "vadodara": CityCodes("Vadodara", "BDQ", "BRC", "vadodara"),
    "coimbatore": CityCodes("Coimbatore", "CJB", "CBE", "coimbatore"),
    "madurai": CityCodes("Madurai", "IXM", "MDU", "madurai"),
    "mysuru": CityCodes("Mysuru", "MYQ", "MYS", "mysore"),
    "mysore": CityCodes("Mysuru", "MYQ", "MYS", "mysore"),
    "manali": CityCodes("Manali", "KUU", "SML", "manali"),
    "shimla": CityCodes("Shimla", "SLV", "SML", "shimla"),
    "leh": CityCodes("Leh", "IXL", "IXL", "leh"),
    "srinagar": CityCodes("Srinagar", "SXR", "SINA", "srinagar"),
    "guwahati": CityCodes("Guwahati", "GAU", "GHY", "guwahati"),
    "patna": CityCodes("Patna", "PAT", "PNBE", "patna"),
    "ranchi": CityCodes("Ranchi", "IXR", "RNC", "ranchi"),
    "bhubaneswar": CityCodes("Bhubaneswar", "BBI", "BBS", "bhubaneswar"),
    "visakhapatnam": CityCodes("Visakhapatnam", "VTZ", "VSKP", "visakhapatnam"),
    "vijayawada": CityCodes("Vijayawada", "VGA", "BZA", "vijayawada"),
}


def resolve_city(raw: str) -> CityCodes:
    key = " ".join(raw.strip().casefold().split())
    if key in _CITIES:
        return _CITIES[key]
    slug = key.replace(" ", "-")
    code = slug[:3].upper() if len(slug) >= 3 else slug.upper()
    return CityCodes(raw.strip().title() or "India", code, code, slug)


def _slug(value: str) -> str:
    return "-".join(value.strip().casefold().split())


def _dd_mmm_yyyy(day: date) -> str:
    return day.strftime("%d-%b-%Y")


def _ddmmyyyy(day: date) -> str:
    return day.strftime("%d%m%Y")


def _dd_mm_yyyy(day: date) -> str:
    return day.strftime("%d-%m-%Y")


def _slash_date(day: date) -> str:
    return day.strftime("%d/%m/%Y")


# City-centre pins so a name-only last-mile search can prefill maps.
# These are public landmarks, not a traveler's live GPS.
_CITY_COORDS: dict[str, tuple[float, float]] = {
    "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "agra": (27.1767, 78.0081),
    "jaipur": (26.9124, 75.7873),
    "mumbai": (19.0760, 72.8777),
    "bombay": (19.0760, 72.8777),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "chennai": (13.0827, 80.2707),
    "madras": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639),
    "calcutta": (22.5726, 88.3639),
    "hyderabad": (17.3850, 78.4867),
    "pune": (18.5204, 73.8567),
    "ahmedabad": (23.0225, 72.5714),
    "goa": (15.4909, 73.8278),
    "varanasi": (25.3176, 82.9739),
    "rishikesh": (30.0869, 78.2676),
    "haridwar": (29.9457, 78.1642),
    "udaipur": (24.5854, 73.7125),
    "jodhpur": (26.2389, 73.0243),
    "amritsar": (31.6340, 74.8723),
    "kochi": (9.9312, 76.2673),
    "cochin": (9.9312, 76.2673),
    "thiruvananthapuram": (8.5241, 76.9366),
    "lucknow": (26.8467, 80.9462),
    "chandigarh": (30.7333, 76.7794),
    "indore": (22.7196, 75.8577),
    "bhopal": (23.2599, 77.4126),
    "nagpur": (21.1458, 79.0882),
    "surat": (21.1702, 72.8311),
    "vadodara": (22.3072, 73.1812),
    "coimbatore": (11.0168, 76.9558),
    "madurai": (9.9252, 78.1198),
    "mysuru": (12.2958, 76.6394),
    "mysore": (12.2958, 76.6394),
    "manali": (32.2396, 77.1887),
    "shimla": (31.1048, 77.1734),
    "leh": (34.1526, 77.5771),
    "srinagar": (34.0837, 74.7973),
    "guwahati": (26.1445, 91.7362),
    "patna": (25.5941, 85.1376),
    "ranchi": (23.3441, 85.3096),
    "bhubaneswar": (20.2961, 85.8245),
    "visakhapatnam": (17.6868, 83.2185),
    "vijayawada": (16.5062, 80.6480),
}


def city_coords(raw: str) -> tuple[float, float] | None:
    key = " ".join(raw.strip().casefold().split())
    return _CITY_COORDS.get(key)


def _coord_pair(
    lat: float | None,
    lng: float | None,
    name: str,
) -> tuple[float, float] | None:
    if lat is not None and lng is not None:
        return (lat, lng)
    return city_coords(name)


def cab_handoffs(
    pickup: str,
    drop: str,
    pickup_lat: float | None = None,
    pickup_lng: float | None = None,
    drop_lat: float | None = None,
    drop_lng: float | None = None,
) -> list[ProviderHandoff]:
    """Official last-mile apps with pickup/drop prefilled. Never a live fare."""
    src_name = pickup.strip() or "Current location"
    dst_name = drop.strip() or "Drop"
    origin = _coord_pair(pickup_lat, pickup_lng, src_name)
    dest = _coord_pair(drop_lat, drop_lng, dst_name)
    dest_q = quote_plus(dst_name)
    pickup_q = quote_plus(src_name)

    if dest:
        dlat, dlng = dest
        if origin:
            plat, plng = origin
            uber_url = (
                "https://m.uber.com/ul/?action=setPickup"
                f"&pickup[latitude]={plat}&pickup[longitude]={plng}"
                f"&dropoff[latitude]={dlat}&dropoff[longitude]={dlng}"
                f"&dropoff[nickname]={dest_q}"
            )
            ola_url = (
                "https://book.olacabs.com/"
                f"?lat={plat}&lng={plng}&drop_lat={dlat}&drop_lng={dlng}"
            )
            maps_url = (
                "https://www.google.com/maps/dir/?api=1"
                f"&origin={plat},{plng}&destination={dlat},{dlng}&travelmode=driving"
            )
        else:
            uber_url = (
                "https://m.uber.com/ul/?action=setPickup&pickup=my_location"
                f"&dropoff[latitude]={dlat}&dropoff[longitude]={dlng}"
                f"&dropoff[nickname]={dest_q}"
            )
            ola_url = f"https://book.olacabs.com/?drop_lat={dlat}&drop_lng={dlng}"
            maps_url = (
                "https://www.google.com/maps/dir/?api=1"
                f"&origin=Current+Location&destination={dlat},{dlng}&travelmode=driving"
            )
    else:
        uber_url = f"https://m.uber.com/go/product-selection?drop[nickname]={dest_q}"
        ola_url = "https://book.olacabs.com/"
        maps_origin = f"{origin[0]},{origin[1]}" if origin else pickup_q
        maps_url = (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={maps_origin}&destination={dest_q}&travelmode=driving"
        )

    return [
        ProviderHandoff(
            key="uber",
            display_name="Uber",
            category="cab",
            url=uber_url,
            note=f"Confirm pickup and drop for {dst_name} on Uber. Zentrip does not take payment.",
        ),
        ProviderHandoff(
            key="ola",
            display_name="Ola",
            category="cab",
            url=ola_url,
            note=f"Set the pin for {dst_name} on Ola. Live fare is only on their app.",
        ),
        ProviderHandoff(
            key="rapido",
            display_name="Rapido",
            category="cab",
            url="https://www.rapido.bike/",
            note=f"Open Rapido and set drop to {dst_name}. Bike and auto quotes are only live in their app.",
        ),
        ProviderHandoff(
            key="namma_yatri",
            display_name="Namma Yatri",
            category="cab",
            url="https://nammayatri.in/",
            note=(
                f"Open Namma Yatri toward {dst_name}. This is an open-mobility network — "
                "live quotes need a signed partner integration."
            ),
        ),
        ProviderHandoff(
            key="google_maps",
            display_name="Google Maps",
            category="cab",
            url=maps_url,
            note=f"Directions from {src_name} to {dst_name}. Use this if a ride app will not prefill.",
        ),
    ]


def transport_handoffs(origin: str, destination: str, departure_date: date) -> list[ProviderHandoff]:
    src = resolve_city(origin)
    dst = resolve_city(destination)
    if src.bus_slug == dst.bus_slug and src.iata == dst.iata:
        return []

    date_iso = departure_date.isoformat()
    redbus_date = _dd_mmm_yyyy(departure_date)
    confirm_date = _dd_mm_yyyy(departure_date)
    mmt_flight = f"{src.iata}-{dst.iata}-{_slash_date(departure_date)}"
    goibibo_flight = _ddmmyyyy(departure_date)
    ixigo_date = _ddmmyyyy(departure_date)

    return [
        ProviderHandoff(
            key="irctc",
            display_name="IRCTC",
            category="train",
            url="https://www.irctc.co.in/nget/train-search",
            note=f"Search {src.train} → {dst.train} on {date_iso} on IRCTC. Login and pay on the official site.",
        ),
        ProviderHandoff(
            key="confirmtkt",
            display_name="ConfirmTkt",
            category="train",
            url=f"https://www.confirmtkt.com/train-list/{src.train}-{dst.train}/{confirm_date}",
        ),
        ProviderHandoff(
            key="ixigo_trains",
            display_name="Ixigo Trains",
            category="train",
            url=(
                f"https://www.ixigo.com/search/result/train/{src.train}/{dst.train}"
                f"?class=ALL&quota=GN&date={date_iso}"
            ),
        ),
        ProviderHandoff(
            key="makemytrip_trains",
            display_name="MakeMyTrip Trains",
            category="train",
            url=(
                "https://www.makemytrip.com/railways/listing/"
                f"?srcStn={src.train}&destStn={dst.train}&date={_ddmmyyyy(departure_date)}"
            ),
        ),
        ProviderHandoff(
            key="goibibo_trains",
            display_name="Goibibo Trains",
            category="train",
            url=(
                "https://www.goibibo.com/trains/"
                f"{_slug(src.name)}-{src.train}-to-{_slug(dst.name)}-{dst.train}-trains/"
            ),
        ),
        ProviderHandoff(
            key="redbus",
            display_name="RedBus",
            category="bus",
            url=(
                f"https://www.redbus.in/bus-tickets/{src.bus_slug}-to-{dst.bus_slug}"
                f"?fromCityName={quote_plus(src.name)}&toCityName={quote_plus(dst.name)}"
                f"&onward={redbus_date}&srcCountry=IND&destCountry=IND"
            ),
        ),
        ProviderHandoff(
            key="abhibus",
            display_name="AbhiBus",
            category="bus",
            url=f"https://www.abhibus.com/buses/{src.bus_slug}-to-{dst.bus_slug}?date={date_iso}",
        ),
        ProviderHandoff(
            key="makemytrip_flights",
            display_name="MakeMyTrip Flights",
            category="flight",
            url=(
                "https://www.makemytrip.com/flight/search"
                f"?itinerary={mmt_flight}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E"
            ),
        ),
        ProviderHandoff(
            key="goibibo_flights",
            display_name="Goibibo Flights",
            category="flight",
            url=(
                f"https://www.goibibo.com/flights/air-{src.iata}-{dst.iata}-{goibibo_flight}-1-0-0-E-D/"
            ),
        ),
        ProviderHandoff(
            key="ixigo_flights",
            display_name="Ixigo Flights",
            category="flight",
            url=(
                "https://www.ixigo.com/search/result/flight"
                f"?from={src.iata}&to={dst.iata}&date={ixigo_date}&adults=1&children=0&infants=0&class=e"
            ),
        ),
        ProviderHandoff(
            key="cleartrip_flights",
            display_name="Cleartrip",
            category="flight",
            url=(
                "https://www.cleartrip.com/flights/results"
                f"?from={src.iata}&to={dst.iata}&depart_date={_slash_date(departure_date)}"
                "&adults=1&childs=0&infants=0&class=Economy&intl=n"
            ),
        ),
        ProviderHandoff(
            key="easemytrip_flights",
            display_name="EaseMyTrip",
            category="flight",
            url=(
                "https://flight.easemytrip.com/FlightList/Index"
                f"?orgn={src.iata}&dstn={dst.iata}&deptDt={_slash_date(departure_date)}"
                "&adult=1&child=0&infant=0&cabin=0"
            ),
        ),
        ProviderHandoff(
            key="yatra_flights",
            display_name="Yatra",
            category="flight",
            url=(
                "https://flight.yatra.com/air-search-ui/dom2/trigger?type=O&viewName=normal&flexi=0"
                f"&noOfSegments=1&origin={src.iata}&originCountry=IN&destination={dst.iata}"
                f"&destinationCountry=IN&flight_depart_date={_slash_date(departure_date)}"
                "&ADT=1&CHD=0&INF=0&class=Economy"
            ),
        ),
        ProviderHandoff(
            key="airindia",
            display_name="Air India",
            category="flight",
            url=(
                "https://www.airindia.com/in/en"
                f"?origin={src.iata}&destination={dst.iata}&tripType=O"
                f"&departDate={date_iso}&adults=1"
            ),
            note=f"Search {src.iata} → {dst.iata} on {date_iso} on Air India. Pay on the airline site.",
        ),
        ProviderHandoff(
            key="indigo",
            display_name="IndiGo",
            category="flight",
            url=(
                "https://www.goindigo.in/"
                f"?origin={src.iata}&destination={dst.iata}&tripType=O"
                f"&departDate={_slash_date(departure_date)}&adults=1"
            ),
            note=f"Search {src.iata} → {dst.iata} on IndiGo. Pay on the airline site.",
        ),
        ProviderHandoff(
            key="spicejet",
            display_name="SpiceJet",
            category="flight",
            url="https://www.spicejet.com/",
            note=f"Search {src.iata} → {dst.iata} on {date_iso} on SpiceJet. Pay on the airline site.",
        ),
        ProviderHandoff(
            key="akasa",
            display_name="Akasa Air",
            category="flight",
            url="https://www.akasaair.com/",
            note=f"Search {src.iata} → {dst.iata} on {date_iso} on Akasa Air. Pay on the airline site.",
        ),
        *cab_handoffs(src.name, dst.name),
    ]


def stay_handoffs(city: str, check_in: date, check_out: date, guests: int = 1) -> list[ProviderHandoff]:
    place = resolve_city(city)
    checkin = check_in.isoformat()
    checkout = check_out.isoformat()
    city_q = quote_plus(place.name)
    slug = _slug(place.name)
    guests = max(1, guests)
    return [
        ProviderHandoff(
            key="makemytrip_hotels",
            display_name="MakeMyTrip Hotels",
            category="stay",
            url=(
                "https://www.makemytrip.com/hotels/"
                f"{slug}-hotels.html?checkin={_ddmmyyyy(check_in)}&checkout={_ddmmyyyy(check_out)}"
            ),
        ),
        ProviderHandoff(
            key="goibibo_hotels",
            display_name="Goibibo Hotels",
            category="stay",
            url=f"https://www.goibibo.com/hotels/hotels-in-{slug}-ct/",
        ),
        ProviderHandoff(
            key="booking_com",
            display_name="Booking.com",
            category="stay",
            url=(
                "https://www.booking.com/searchresults.html"
                f"?ss={city_q}&checkin={checkin}&checkout={checkout}&group_adults={guests}&no_rooms=1"
            ),
        ),
        ProviderHandoff(
            key="agoda",
            display_name="Agoda",
            category="stay",
            url=(
                "https://www.agoda.com/search"
                f"?textToSearch={city_q}&checkIn={checkin}&checkOut={checkout}&rooms=1&adults={guests}"
            ),
        ),
        ProviderHandoff(
            key="airbnb",
            display_name="Airbnb",
            category="stay",
            url=(
                f"https://www.airbnb.co.in/s/{city_q}/homes"
                f"?checkin={checkin}&checkout={checkout}&adults={guests}"
            ),
        ),
        ProviderHandoff(
            key="hostelworld",
            display_name="Hostelworld",
            category="stay",
            url=(
                f"https://www.hostelworld.com/st/hostels/india/{slug}/"
                f"?dateFrom={checkin}&dateTo={checkout}&numberOfGuests={guests}"
            ),
        ),
    ]


def handoff_to_dict(item: ProviderHandoff) -> dict:
    return {
        "key": item.key,
        "displayName": item.display_name,
        "category": item.category,
        "url": item.url,
        "live": item.live,
        "note": item.note,
    }
