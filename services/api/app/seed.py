"""Seed the citation-first Delhi–Agra–Jaipur starter Knowledge Base.

Run after ``alembic upgrade head`` with ``python -m app.seed``. The script is
idempotent: it creates missing entities, sources, claims, and aliases but never
duplicates them. This is deliberately curated seed content, not a web scraper.
"""

import asyncio
from datetime import date

from sqlalchemy import select

from app.db import AsyncSessionLocal, Base, engine
from app.models import KnowledgeAlias, KnowledgeClaim, KnowledgeEntity, KnowledgeSource

CURATED_ON = date(2026, 8, 26)

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
    "rbi_ppi_circular_summary": (
        "AZB & Partners — summary of RBI circular on UPI-linked PPIs for foreign travelers",
        "https://www.azbpartners.com/bank/rbi-directions-on-issuance-of-ppis-to-foreign-nationals-nris-visiting-india/",
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
        entity = KnowledgeEntity(
            name=name, city=city, fact=claim_text, source=source.name, source_url=source.source_url,
            confidence=confidence, last_verified=CURATED_ON, entity_type=entity_type, status="published",
        )
        db.add(entity)
        await db.flush()
        created_entity = True

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

        for name, city, aliases, source_key, claim_text, confidence in PAYMENT_ENTRIES:
            ce, cc = await _upsert_entry(db, PAYMENT_SOURCES, "payment_info", name, city, aliases, source_key, claim_text, confidence)
            created_entities += ce
            created_claims += cc

        await db.commit()

    print(f"Knowledge Base ready: {created_entities} new entities, {created_claims} new cited claims.")


if __name__ == "__main__":
    asyncio.run(main())
