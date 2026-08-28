"""Seed the citation-first India Knowledge Base used as Zenny's stable place memory.

Run after ``alembic upgrade head`` with ``python -m app.seed``. The script is
idempotent. Corridor UNESCO starters live in this file; deeper monument claims and
India-wide most-visited places live in ``app.knowledge_corpus``.
"""

import asyncio
from datetime import date

from sqlalchemy import select

from app.db import AsyncSessionLocal, Base, engine
from app.models import (
    ExpertProfile,
    ExplorerMission,
    KnowledgeAlias,
    KnowledgeClaim,
    KnowledgeEntity,
    KnowledgeSource,
    Peak,
    RiskPattern,
    Trail,
    TrailHazard,
    TrailWaypoint,
    User,
)
from app.knowledge_corpus import (
    DEEP_CORRIDOR_CLAIMS,
    INDIA_PLACES,
    LANDMARK_COORDINATES as CORPUS_COORDINATES,
    MONUMENT_FEATURES,
    SOURCES as CORPUS_SOURCES,
)
from app.travel_ops_corpus import MORE_PLACES, TRAVEL_OPS, TRAVEL_SOURCES
from app.security import hash_password

CURATED_ON = date(2026, 8, 26)

# Approximate landmark centroids used only to narrow camera candidates by GPS.
LANDMARK_COORDINATES = {**CORPUS_COORDINATES}

# (name, source_url, source_type, authority_level)
UNESCO_SOURCES = {
    "red_fort": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/231", "official", "primary"),
    "humayun": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/232", "official", "primary"),
    "qutb": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/233", "official", "primary"),
    "agra_fort": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/251", "official", "primary"),
    "taj": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/252", "official", "primary"),
    "fatehpur": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/255", "official", "primary"),
    "hill_forts": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/247", "official", "primary"),
    "jantar": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/1338", "official", "primary"),
    "jaipur": ("UNESCO World Heritage List", "https://whc.unesco.org/en/list/1605", "official", "primary"),
}

# Payment Assistance (18-payment-assistance.md) — "no dedicated payment-service, just a
# content category" served through this same KB/RAG pipeline. city="India" since these
# are country-wide, not tied to one corridor city; entity_type="payment_info" keeps them
# out of itinerary generation's per-city candidate query (app/routers/trips.py), which
# filters by trip.cities — a payment FAQ should never show up as a planned "activity."
PAYMENT_SOURCES = {
    "pib_upi": (
        "Press Information Bureau, Government of India",
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2257087",
        "official",
        "primary",
    ),
    # Secondary on purpose: this is a law firm's summary of an RBI circular, not the
    # primary RBI text itself — hence confidence="estimated" on its claim below, not
    # "verified" like the primary-sourced entries.
    # Payment Assistance (18) sources above; SAFETY_SOURCES below follow the same
    # "content category, not a separate service" pattern (15/16): Guardian + scam
    # awareness ride the same KB/RAG pipeline.
    "rbi_ppi_circular_summary": (
        "AZB & Partners — summary of RBI circular on UPI-linked PPIs for foreign travelers",
        "https://www.azbpartners.com/bank/rbi-directions-on-issuance-of-ppis-to-foreign-nationals-nris-visiting-india/",
        "secondary",
        "secondary",
    ),
    # Official RBI FAQ pages — primary sources for cash/ATM/card traveler guidance.
    "rbi_faqs_banking": (
        "Reserve Bank of India — Frequently Asked Questions (Banking)",
        "https://www.rbi.org.in/Scripts/FAQDisplay.aspx?Id=130",
        "official",
        "primary",
    ),
    "mea_travel_tips": (
        "Ministry of External Affairs / Incredible India visitor guidance",
        "https://www.incredibleindia.gov.in/",
        "official",
        "primary",
    ),
}

# Safety (15-zentrip-guardian-safety.md, 16-scam-traveler-risk-intelligence.md).
# Same KB category approach as payments: no dedicated safety-service; the Agent
# Gateway's `safety` intent routes through the same citation-first retrieval.
SAFETY_SOURCES = {
    # Primary/official: India's single nationwide emergency number.
    "erss_112": (
        "Emergency Response Support System (ERSS), Ministry of Home Affairs",
        "https://112.gov.in/",
        "official",
        "primary",
    ),
    # Primary/official: multilingual tourist helpline run by the Ministry of Tourism.
    "tourist_helpline": (
        "Ministry of Tourism, Government of India — Tourist Infoline",
        "https://tourism.gov.in/",
        "official",
        "primary",
    ),
    # Secondary on purpose: a police advisory summary of common scam patterns, not a
    # statute or circular — hence confidence="estimated" on its claim.
    "delhi_police_advisory": (
        "Delhi Police — public safety advisories for visitors",
        "https://delhipolice.nic.in/",
        "secondary",
        "secondary",
    ),
}

ENTRIES = [
    ("Red Fort", "Delhi", ["Lal Qila"], "red_fort", "The Red Fort Complex was built as the palace fort of Shahjahanabad, the new capital of the Mughal emperor Shah Jahan."),
    ("Humayun's Tomb", "Delhi", ["Humayun Tomb"], "humayun", "Humayun's Tomb in Delhi was the first garden-tomb on the Indian subcontinent and became a landmark in the development of Mughal architecture."),
    ("Qutb Minar", "Delhi", ["Qutub Minar", "Qutb Complex"], "qutb", "Qutb Minar and its Monuments in Delhi are a UNESCO World Heritage property."),
    ("Taj Mahal", "Agra", ["Taj"], "taj", "The Taj Mahal was built by the Mughal emperor Shah Jahan in memory of his wife Mumtaz Mahal."),
    ("Agra Fort", "Agra", ["Lal Qila Agra"], "agra_fort", "Agra Fort is a 16th-century Mughal fortress and was inscribed on the UNESCO World Heritage List in 1983."),
    ("Fatehpur Sikri", "Agra", ["Fatehpur"], "fatehpur", "Fatehpur Sikri was built during the second half of the 16th century by Emperor Akbar and served as the capital of the Mughal Empire for a short period."),
    ("Amber Fort", "Jaipur", ["Amer Fort", "Amber Palace"], "hill_forts", "Amber Fort is part of the Hill Forts of Rajasthan, a serial UNESCO World Heritage property."),
    ("Jantar Mantar, Jaipur", "Jaipur", ["Jantar Mantar"], "jantar", "Jantar Mantar at Jaipur is an early 18th-century astronomical observation site built by Maharaja Sawai Jai Singh II."),
    ("Walled City of Jaipur", "Jaipur", ["Jaipur City", "Pink City"], "jaipur", "The walled city of Jaipur was founded in 1727 by Sawai Jai Singh II and was inscribed on the UNESCO World Heritage List in 2019."),
]

# (name, city, aliases, source_key, claim_text, confidence)
PAYMENT_ENTRIES = [
    (
        "UPI (Unified Payments Interface)",
        "India",
        ["UPI", "Unified Payments Interface"],
        "pib_upi",
        "UPI is an instant, interoperable bank-to-bank payment system developed by the National "
        "Payments Corporation of India (NPCI) under Reserve Bank of India (RBI) oversight; it "
        "launched on 11 April 2016.",
        "verified",
    ),
    (
        "UPI for Foreign Travelers",
        "India",
        ["UPI for tourists", "UPI for foreigners", "UPI for NRIs"],
        "rbi_ppi_circular_summary",
        "Per a Reserve Bank of India circular dated 10 February 2023, eligible foreign travelers "
        "(initially from G20 countries) can get a Prepaid Payment Instrument (PPI) wallet linked to "
        "UPI at select international airports (Bengaluru, Mumbai, New Delhi) for merchant payments, "
        "with an outstanding balance cap of Rs 200,000.",
        "estimated",
    ),
    (
        "Cash in India",
        "India",
        ["cash", "cash payments", "rupees cash", "notes"],
        "mea_travel_tips",
        "Cash (Indian rupee banknotes) remains widely used for small purchases, tips, and places "
        "without card or UPI acceptance; travelers should carry modest daily cash from ATMs or "
        "authorized exchangers and avoid displaying large amounts in public.",
        "estimated",
    ),
    (
        "ATM withdrawals",
        "India",
        ["ATM", "cash machine", "withdraw cash", "bank ATM"],
        "rbi_faqs_banking",
        "ATMs of banks regulated by the Reserve Bank of India dispense Indian rupees; international "
        "cardholders should use bank-branded machines, expect issuer and network fees, and treat "
        "any machine that asks for a PIN more than once or redirects to an unofficial site as unsafe.",
        "estimated",
    ),
    (
        "Card payments",
        "India",
        ["credit card", "debit card", "card payment", "Visa", "Mastercard"],
        "rbi_faqs_banking",
        "Major credit and debit cards are accepted at hotels, larger restaurants, and many urban "
        "merchants, but smaller vendors may be cash- or UPI-only; travelers should enable "
        "international usage with their issuer and keep a backup payment method.",
        "estimated",
    ),
]

# (name, city, aliases, source_key, claim_text, confidence)
SAFETY_ENTRIES = [
    (
        "Emergency Number 112",
        "India",
        ["112", "emergency number", "national emergency number"],
        "erss_112",
        "112 is India's single all-in-one emergency number for police, fire, and ambulance; it "
        "works from any mobile phone (even with a zero balance or without a SIM in some states) "
        "and offers support in multiple languages via the Emergency Response Support System.",
        "verified",
    ),
    (
        "Tourist Helpline 1363",
        "India",
        ["tourist helpline", "1363"],
        "tourist_helpline",
        "1363 is the Ministry of Tourism's multilingual tourist helpline, offering help and "
        "information in twelve languages including English, Hindi, French, German, Japanese, "
        "Chinese, and Arabic.",
        "verified",
    ),
    (
        "Common Tourist Scams",
        "Delhi",
        ["scams", "scam awareness", "tourist scams"],
        "delhi_police_advisory",
        "Common scam patterns reported around major visitor areas include unsolicited 'free' "
        "guides or offers of extremely cheap full-day tours that end at commission-paying shops, "
        "taxi/tuk-tuk drivers claiming your hotel is 'closed' to divert you elsewhere, and "
        "overcharging on un-metered rides — police advisories recommend insisting on the meter "
        "or ride-hailing apps and booking through official counters.",
        "estimated",
    ),
]

# These are deliberately marked preview: they exercise the offline package and
# geometry APIs without pretending that an illustrative line is a field-verified
# navigation track. Replace them with licensed/verified GPX or GeoJSON before launch.
TRAIL_SEEDS = [
    {
        "slug": "kedarnath-base-to-shrine-preview",
        "name": "Kedarnath Base to Shrine — Preview",
        "region": "Uttarakhand",
        "summary": "Illustrative route package for the Gaurikund–Kedarnath corridor; not for navigation.",
        "distance_km": 16.0,
        "elevation_gain_m": 1300,
        "min_altitude_m": 1980,
        "max_altitude_m": 3580,
        "difficulty": "hard",
        "seasonality": "May–October, subject to official conditions",
        "permit_notes": "Check current Kedarnath access, weather, closures, and local authority guidance.",
        "route_geojson": {"type": "LineString", "coordinates": [[79.066, 30.635], [79.070, 30.645], [79.066, 30.690], [79.066, 30.735]]},
        "waypoints": [
            ("Gaurikund", "trailhead", 30.635, 79.066, 1980, "Illustrative trailhead marker; verify locally.", "estimated"),
            ("Jungle Chatti", "rest_point", 30.671, 79.064, 2670, "Illustrative rest-point marker; verify locally.", "estimated"),
            ("Kedarnath area", "destination", 30.735, 79.066, 3580, "Illustrative destination marker; verify locally.", "estimated"),
        ],
    },
    {
        "slug": "kuari-pass-approach-preview",
        "name": "Kuari Pass Approach — Preview",
        "region": "Uttarakhand",
        "summary": "Illustrative approach package for a Kuari Pass corridor; not for navigation.",
        "distance_km": 12.0,
        "elevation_gain_m": 1000,
        "min_altitude_m": 1900,
        "max_altitude_m": 3650,
        "difficulty": "hard",
        "seasonality": "April–June and September–November, subject to official conditions",
        "permit_notes": "Check forest permits, weather, route closures, and use a qualified local guide.",
        "route_geojson": {"type": "LineString", "coordinates": [[79.563, 30.601], [79.582, 30.625], [79.610, 30.658], [79.637, 30.693]]},
        "waypoints": [
            ("Auli approach", "trailhead", 30.601, 79.563, 1900, "Illustrative approach marker; verify locally.", "estimated"),
            ("Gorson meadow", "water", 30.655, 79.611, 3050, "Illustrative waypoint; water availability is not guaranteed.", "estimated"),
            ("Kuari Pass area", "destination", 30.693, 79.637, 3650, "Illustrative destination marker; verify locally.", "estimated"),
        ],
    },
]

TRAIL_SEEDS.extend(
    [
        {
            "slug": "delhi-northern-ridge-preview",
            "name": "Northern Ridge Forest Walk — Preview",
            "region": "Delhi",
            "summary": "Illustrative walking corridor on Delhi's Northern Ridge; not a navigation track.",
            "distance_km": 4.2,
            "elevation_gain_m": 40,
            "min_altitude_m": 216,
            "max_altitude_m": 250,
            "difficulty": "easy",
            "seasonality": "October–March mornings; confirm park hours locally",
            "permit_notes": "City forest paths may close after dusk. This preview is not a licensed map product.",
            "route_geojson": {
                "type": "LineString",
                "coordinates": [[77.185, 28.679], [77.189, 28.686], [77.195, 28.693], [77.201, 28.699]],
            },
            "waypoints": [
                ("Ridge trailhead", "trailhead", 28.679, 77.185, 220, "Illustrative start near the Northern Ridge; verify locally.", "estimated"),
                ("Flagstaff viewpoint", "viewpoint", 28.693, 77.195, 245, "Illustrative viewpoint; access depends on local hours.", "estimated"),
                ("Kamla Nehru ridge edge", "destination", 28.699, 77.201, 240, "Illustrative end marker; not a turn-by-turn route.", "estimated"),
            ],
        },
        {
            "slug": "agra-yamuna-ghat-preview",
            "name": "Yamuna Ghat Walk — Preview",
            "region": "Agra",
            "summary": "Illustrative riverside walk near the Taj Mahal corridor; not for navigation.",
            "distance_km": 3.1,
            "elevation_gain_m": 12,
            "min_altitude_m": 168,
            "max_altitude_m": 178,
            "difficulty": "easy",
            "seasonality": "October–March; heat and monsoon flooding can close sections",
            "permit_notes": "Stay on public paths. Monument security zones are restricted.",
            "route_geojson": {
                "type": "LineString",
                "coordinates": [[78.042, 27.175], [78.038, 27.179], [78.032, 27.183], [78.026, 27.186]],
            },
            "waypoints": [
                ("East gate approach", "trailhead", 27.175, 78.042, 170, "Illustrative public-path start; not an entry ticket.", "estimated"),
                ("River viewpoint", "viewpoint", 27.183, 78.032, 172, "Illustrative Yamuna viewpoint; water levels vary.", "estimated"),
                ("Mehtab Bagh side", "destination", 27.186, 78.026, 171, "Illustrative opposite-bank marker; confirm access hours.", "estimated"),
            ],
        },
        {
            "slug": "jaipur-nahargarh-ridge-preview",
            "name": "Nahargarh Ridge Walk — Preview",
            "region": "Jaipur",
            "summary": "Illustrative ridge walk above Jaipur; not a verified trek GPS track.",
            "distance_km": 5.4,
            "elevation_gain_m": 180,
            "min_altitude_m": 430,
            "max_altitude_m": 610,
            "difficulty": "moderate",
            "seasonality": "October–March; avoid midday heat and monsoon rockfall risk",
            "permit_notes": "Fort entry is separate from this walking preview. Follow local authority access rules.",
            "route_geojson": {
                "type": "LineString",
                "coordinates": [[75.815, 26.933], [75.821, 26.937], [75.828, 26.941], [75.836, 26.946]],
            },
            "waypoints": [
                ("City palace side approach", "trailhead", 26.933, 75.815, 440, "Illustrative approach; confirm vehicle parking locally.", "estimated"),
                ("Ridge saddle", "rest_point", 26.941, 75.828, 540, "Illustrative rest marker; carry water.", "estimated"),
                ("Nahargarh rampart view", "destination", 26.946, 75.836, 600, "Illustrative fort-view marker; not a climbing route.", "estimated"),
            ],
        },
    ]
)

RISK_SEEDS = [
    {
        "city": "Delhi",
        "location_label": "New Delhi railway station / Paharganj edge",
        "category": "transport",
        "pattern": "Unmetered taxi and 'hotel is closed' diversions are a repeatedly reported pattern around the station exits, especially late evening.",
        "recommendation": "Use the official prepaid taxi booth or a ride-hailing pin dropped inside the station; do not follow unsolicited porters to a vehicle.",
        "confidence": "estimated",
        "source_name": "Delhi Police — public safety advisories for visitors",
        "source_url": "https://delhipolice.nic.in/",
    },
    {
        "city": "Agra",
        "location_label": "Taj Mahal ticket approaches",
        "category": "scam",
        "pattern": "Unofficial 'skip the queue' helpers and photographers demanding a post-photo fee are a common pattern on the public approaches, not a named-person accusation.",
        "recommendation": "Buy tickets only from ASI / official digital channels. Decline street 'helpers' and keep a copy of the official ticket.",
        "confidence": "estimated",
        "source_name": "Archaeological Survey of India visitor guidance (pattern summary)",
        "source_url": "https://www.asi.nic.in/",
    },
    {
        "city": "Jaipur",
        "location_label": "Johari Bazaar / Hawa Mahal shopping lanes",
        "category": "scam",
        "pattern": "Commissioned shopping detours and gemstone 'investment' pitches are a reported pattern in tourist bazaar lanes.",
        "recommendation": "Compare independently, avoid unsolicited escorts, and never treat a street quote as a live verified price.",
        "confidence": "estimated",
        "source_name": "Rajasthan Tourism visitor caution notes (pattern summary)",
        "source_url": "https://tourism.rajasthan.gov.in/",
    },
]

EXPLORER_MISSION_SEEDS = [
    {
        "title": "Red Fort opening-hours check",
        "category": "place_verification",
        "city": "Delhi",
        "description": "Confirm posted opening hours and ticket-counter location at Red Fort without entering restricted areas.",
        "safety_note": "Stay on public sidewalks. Do not climb walls or photograph security installations.",
        "required_evidence": ["gps", "text_note"],
    },
    {
        "title": "Taj East Gate queue observation",
        "category": "place_verification",
        "city": "Agra",
        "description": "Record whether the East Gate ticket line is open and any official signage about closures.",
        "safety_note": "Do not skip official queues or follow unofficial ticket sellers.",
        "required_evidence": ["gps", "text_note"],
    },
    {
        "title": "Amber Fort evening access note",
        "category": "event_verification",
        "city": "Jaipur",
        "description": "Note whether evening illumination / sound-and-light access is operating tonight from public signage only.",
        "safety_note": "Do not hike unofficial hillside paths after dark.",
        "required_evidence": ["gps", "text_note"],
    },
]

EXPERT_SEEDS = [
    {
        "email": "ananya.delhi@zentrip.seed",
        "name": "Ananya Sharma",
        "city": "Delhi",
        "specialties": ["heritage walks", "metro navigation", "vegetarian food"],
        "rating": 4.8,
    },
    {
        "email": "kabir.agra@zentrip.seed",
        "name": "Kabir Khan",
        "city": "Agra",
        "specialties": ["monument tickets", "Yamuna viewpoints", "day-trip pacing"],
        "rating": 4.6,
    },
    {
        "email": "meera.jaipur@zentrip.seed",
        "name": "Meera Rathore",
        "city": "Jaipur",
        "specialties": ["bazaar etiquette", "fort access", "local festivals"],
        "rating": 4.9,
    },
]

PEAK_SEEDS = [
    ("Kedarnath Peak", 6940, 30.75, 79.06, "Preview peak record near the Kedarnath corridor; not an ascent or route recommendation."),
    ("Chaukhamba", 7138, 30.735, 79.13, "Preview peak record; exact visible alignment requires DEM and field validation."),
    ("Nanda Devi", 7816, 30.375, 79.970, "Preview peak record; exact visible alignment requires DEM and field validation."),
    ("Hathi Parbat", 6727, 30.70, 79.60, "Preview peak record near the Kuari Pass corridor; exact alignment requires validation."),
]


async def _source(db, sources: dict, source_key: str) -> KnowledgeSource:
    name, source_url, source_type, authority_level = sources[source_key]
    source = (
        await db.execute(select(KnowledgeSource).where(KnowledgeSource.name == name, KnowledgeSource.source_url == source_url))
    ).scalar_one_or_none()
    if source is None:
        source = KnowledgeSource(name=name, source_url=source_url, source_type=source_type, authority_level=authority_level, status="active")
        db.add(source)
        await db.flush()
    return source


async def _upsert_entry(
    db, sources: dict, entity_type: str, name: str, city: str, aliases: list[str],
    source_key: str, claim_text: str, confidence: str,
) -> tuple[bool, bool]:
    """Shared by the landmark and payment-guidance entry loops in main() below —
    same idempotent create-if-missing entity/claim/alias logic, only entity_type and
    confidence vary per caller. Returns (created_entity, created_claim)."""
    entity = (
        await db.execute(select(KnowledgeEntity).where(KnowledgeEntity.name == name, KnowledgeEntity.city == city))
    ).scalar_one_or_none()
    source = await _source(db, sources, source_key)
    created_entity = False
    if entity is None:
        latitude, longitude = LANDMARK_COORDINATES.get(name, (None, None))
        entity = KnowledgeEntity(
            name=name, city=city, fact=claim_text, source=source.name, source_url=source.source_url,
            confidence=confidence, last_verified=CURATED_ON, entity_type=entity_type, status="published",
            latitude=latitude, longitude=longitude,
        )
        db.add(entity)
        await db.flush()
        created_entity = True
    elif entity.latitude is None and name in LANDMARK_COORDINATES:
        entity.latitude, entity.longitude = LANDMARK_COORDINATES[name]

    created_claim = False
    existing_claim = (
        await db.execute(select(KnowledgeClaim).where(
            KnowledgeClaim.entity_id == entity.id, KnowledgeClaim.source_id == source.id, KnowledgeClaim.claim == claim_text
        ))
    ).scalar_one_or_none()
    if existing_claim is None:
        db.add(KnowledgeClaim(
            entity_id=entity.id, source_id=source.id, claim=claim_text, language="en", confidence=confidence,
            verification_status="published", last_verified=CURATED_ON,
        ))
        created_claim = True

    for alias in aliases:
        existing_alias = (
            await db.execute(select(KnowledgeAlias).where(
                KnowledgeAlias.entity_id == entity.id, KnowledgeAlias.alias == alias, KnowledgeAlias.language == "en"
            ))
        ).scalar_one_or_none()
        if existing_alias is None:
            db.add(KnowledgeAlias(entity_id=entity.id, alias=alias, language="en"))

    return created_entity, created_claim


async def main() -> None:
    # Helpful for a brand-new local database. Existing developer databases should
    # still be upgraded with Alembic before running this seed.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    created_entities = 0
    created_claims = 0
    async with AsyncSessionLocal() as db:
        for name, city, aliases, source_key, claim_text in ENTRIES:
            ce, cc = await _upsert_entry(db, UNESCO_SOURCES, "monument", name, city, aliases, source_key, claim_text, "verified")
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, claim_text, confidence in DEEP_CORRIDOR_CLAIMS:
            ce, cc = await _upsert_entry(db, CORPUS_SOURCES, "monument", name, city, aliases, source_key, claim_text, confidence)
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, entity_type, claim_text in INDIA_PLACES:
            ce, cc = await _upsert_entry(db, CORPUS_SOURCES, entity_type, name, city, aliases, source_key, claim_text, "verified")
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, claim_text in MONUMENT_FEATURES:
            ce, cc = await _upsert_entry(db, CORPUS_SOURCES, "monument_feature", name, city, aliases, source_key, claim_text, "verified")
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, entity_type, claim_text, confidence in TRAVEL_OPS:
            ce, cc = await _upsert_entry(db, TRAVEL_SOURCES, entity_type, name, city, aliases, source_key, claim_text, confidence)
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, entity_type, claim_text in MORE_PLACES:
            ce, cc = await _upsert_entry(db, TRAVEL_SOURCES, entity_type, name, city, aliases, source_key, claim_text, "estimated")
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, claim_text, confidence in PAYMENT_ENTRIES:
            ce, cc = await _upsert_entry(db, PAYMENT_SOURCES, "payment_info", name, city, aliases, source_key, claim_text, confidence)
            created_entities += ce
            created_claims += cc

        for name, city, aliases, source_key, claim_text, confidence in SAFETY_ENTRIES:
            ce, cc = await _upsert_entry(db, SAFETY_SOURCES, "safety_info", name, city, aliases, source_key, claim_text, confidence)
            created_entities += ce
            created_claims += cc

        for trail_seed in TRAIL_SEEDS:
            trail = (await db.execute(select(Trail).where(Trail.slug == trail_seed["slug"]))).scalar_one_or_none()
            if trail is None:
                trail = Trail(
                    slug=trail_seed["slug"],
                    name=trail_seed["name"],
                    region=trail_seed["region"],
                    summary=trail_seed["summary"],
                    distance_km=trail_seed["distance_km"],
                    elevation_gain_m=trail_seed["elevation_gain_m"],
                    min_altitude_m=trail_seed["min_altitude_m"],
                    max_altitude_m=trail_seed["max_altitude_m"],
                    difficulty=trail_seed["difficulty"],
                    seasonality=trail_seed["seasonality"],
                    permit_notes=trail_seed["permit_notes"],
                    route_geojson=trail_seed["route_geojson"],
                    source_name="Zentrip illustrative route preview",
                    source_url=None,
                    verification_status="preview",
                    last_verified=CURATED_ON,
                    package_version="1-preview",
                )
                db.add(trail)
                await db.flush()
                for name, kind, latitude, longitude, elevation_m, description, confidence in trail_seed["waypoints"]:
                    db.add(TrailWaypoint(
                        trail_id=trail.id,
                        name=name,
                        kind=kind,
                        latitude=latitude,
                        longitude=longitude,
                        elevation_m=elevation_m,
                        description=description,
                        source_confidence=confidence,
                    ))
                if trail_seed["region"] in {"Delhi", "Agra", "Jaipur"}:
                    db.add(TrailHazard(
                        trail_id=trail.id,
                        category="heat",
                        description="Midday heat and limited shade are common on this corridor walk. Carry water; this is not a clearance report.",
                        source_kind="preview",
                        confidence="estimated",
                        status="active",
                    ))

        for risk in RISK_SEEDS:
            existing_risk = (
                await db.execute(
                    select(RiskPattern).where(
                        RiskPattern.city == risk["city"],
                        RiskPattern.location_label == risk["location_label"],
                    )
                )
            ).scalar_one_or_none()
            if existing_risk is None:
                db.add(RiskPattern(
                    city=risk["city"],
                    location_label=risk["location_label"],
                    category=risk["category"],
                    pattern=risk["pattern"],
                    recommendation=risk["recommendation"],
                    confidence=risk["confidence"],
                    source_name=risk["source_name"],
                    source_url=risk["source_url"],
                    last_verified=CURATED_ON,
                    status="published",
                ))

        for mission in EXPLORER_MISSION_SEEDS:
            existing_mission = (
                await db.execute(
                    select(ExplorerMission).where(
                        ExplorerMission.title == mission["title"],
                        ExplorerMission.city == mission["city"],
                    )
                )
            ).scalar_one_or_none()
            if existing_mission is None:
                db.add(ExplorerMission(**mission, status="published"))

        for expert in EXPERT_SEEDS:
            user = (await db.execute(select(User).where(User.email == expert["email"]))).scalar_one_or_none()
            if user is None:
                user = User(
                    email=expert["email"],
                    name=expert["name"],
                    password_hash=hash_password("seed-expert-not-for-login"),
                    language="en",
                    country="IN",
                    role="expert",
                )
                db.add(user)
                await db.flush()
            profile = (await db.execute(select(ExpertProfile).where(ExpertProfile.user_id == user.id))).scalar_one_or_none()
            if profile is None:
                db.add(ExpertProfile(
                    user_id=user.id,
                    display_name=expert["name"],
                    city=expert["city"],
                    specialties=expert["specialties"],
                    status="active",
                    rating=expert["rating"],
                ))

        for name, elevation_m, latitude, longitude, description in PEAK_SEEDS:
            peak = (await db.execute(select(Peak).where(Peak.name == name))).scalar_one_or_none()
            if peak is None:
                db.add(Peak(
                    name=name,
                    elevation_m=elevation_m,
                    latitude=latitude,
                    longitude=longitude,
                    description=description,
                    source_name="Zentrip illustrative peak preview",
                    source_url=None,
                    status="preview",
                    last_verified=CURATED_ON,
                ))

        await db.commit()

    print(f"Knowledge Base ready: {created_entities} new entities, {created_claims} new cited claims.")


if __name__ == "__main__":
    asyncio.run(main())
