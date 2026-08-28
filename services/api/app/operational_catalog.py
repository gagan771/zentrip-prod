"""Direct-web researched Golden Triangle operational catalog.

The entries intentionally keep short facts and URLs, not copied page bodies. Ratings
are snapshots and are never treated as permanent truth; refresh_after is seven days.
"""

from datetime import date, timedelta

CAPTURED_ON = date(2026, 8, 28)

SOURCES = {
    "taj_official": ("Taj Mahal official visitor information", "https://tajmahal.gov.in/travel-information.aspx", "official", "primary"),
    "taj_ticketing": ("ASI official e-ticket portal", "https://asi.paygov.org.in/asi-webapp/", "official", "primary"),
    "agra_fort_official": ("ASI Agra Fort", "https://asi.nic.in/pages/WorldHeritageAgraFort", "official", "primary"),
    "fatehpur_official": ("ASI Fatehpur Sikri", "https://asi.nic.in/pages/WorldHeritageFatehpurSikri", "official", "primary"),
    "qutb_official": ("Delhi Tourism Qutb Minar", "https://www.delhitourism.gov.in/tourist_place/qutab_minar.html", "official", "primary"),
    "delhi_humayun": ("Delhi Tourism Humayun's Tomb", "https://delhitourism.gov.in/tourist_place/humayun_tomb.html", "official", "primary"),
    "delhi_lotus": ("Delhi Tourism Lotus Temple", "https://delhitourism.gov.in/tourist_place/bahai_temple.html", "official", "primary"),
    "delhi_jama": ("Delhi Tourism Jama Masjid", "https://delhitourism.gov.in/tourist_place/jama_masjid.html", "official", "primary"),
    "delhi_red_fort": ("Delhi Tourism Red Fort", "https://delhitourism.gov.in/tourist_place/red_fort.html", "official", "primary"),
    "sunder_official": ("Sunder Nursery official", "https://www.sundernursery.org/timing.php", "official", "primary"),
    "rajasthan_jantar": ("Rajasthan Tourism Jantar Mantar", "https://www.tourism.rajasthan.gov.in/jantar-mantar.html", "official", "primary"),
    "amber_obms": ("Rajasthan Tourism OBMS Amber Fort", "https://obms-tourist.rajasthan.gov.in/place-details/Amber-Fort", "official", "primary"),
    "hawa_obms": ("Rajasthan Tourism OBMS Hawa Mahal", "https://obms-tourist.rajasthan.gov.in/place-details/Hawa-mahal", "official", "primary"),
    "nahargarh_obms": ("Rajasthan Tourism OBMS Nahargarh Fort", "https://obms-tourist.rajasthan.gov.in/place-details/Nahagarh-Fort", "official", "primary"),
    "city_palace": ("City Palace Jaipur visitor information", "https://citypalace.org/visit", "official", "primary"),
    "rajasthan_tourism": ("Rajasthan Tourism Jaipur", "https://www.tourism.rajasthan.gov.in/jaipur.html", "official", "primary"),
    "agra_district": ("District Agra Government tourist places", "https://agra.nic.in/tourist-places/", "official", "primary"),
    "agra_akbar": ("District Agra Government Akbar's Tomb", "https://agra.nic.in/tourist-place/akbars-tomb-sikandra/", "official", "primary"),
    "agra_mehtab": ("District Agra Government Mehtab Bagh", "https://agra.nic.in/tourist-place/mehtab-bagh/", "official", "primary"),
    "delhi_purana": ("Delhi Tourism Purana Qila", "https://delhitourism.gov.in/tourist_place/purana_quila.html", "official", "primary"),
    "delhi_garden_senses": ("Delhi Tourism Garden of Five Senses", "https://delhitourism.gov.in/tourist_place/garden_of_five_senses.html", "official", "primary"),
    "delhi_lodhi": ("Delhi Tourism Lodhi Garden", "https://delhitourism.gov.in/entertainment/lodhi_garden.html", "official", "primary"),
    "tripadvisor_delhi": ("Tripadvisor Delhi restaurant listings", "https://www.tripadvisor.in/Restaurants-g304551-c8-New_Delhi_National_Capital_Territory_of_Delhi.html", "review_platform", "secondary"),
    "tripadvisor_agra": ("Tripadvisor Agra café listings", "https://www.tripadvisor.in/Restaurants-g297683-c8-Agra_Agra_District_Uttar_Pradesh.html", "review_platform", "secondary"),
    "tripadvisor_jaipur": ("Tripadvisor Jaipur restaurant listings", "https://www.tripadvisor.in/Restaurants-g304555-c8-Jaipur_Jaipur_District_Rajasthan.html", "review_platform", "secondary"),
}

# (name, city, aliases, source_key, entity_type, display fact)
ENTITIES = [
    ("Jama Masjid", "Delhi", ["Jama Mosque"], "delhi_jama", "monument", "Historic mosque beside Red Fort; tourist access follows prayer and dress rules."),
    ("Lotus Temple", "Delhi", ["Bahai Temple"], "delhi_lotus", "monument", "Baháʼí House of Worship in South Delhi; entry is free and Monday is the weekly closure."),
    ("Sunder Nursery", "Delhi", ["Sunder Nursery Park"], "sunder_official", "activity", "Heritage park beside Humayun's Tomb with gardens, monuments, and biodiversity."),
    ("Mehtab Bagh", "Agra", ["Taj sunset garden"], "taj_official", "activity", "ASI garden across the Yamuna from the Taj Mahal, suited to a sunset river view."),
    ("Itimad-ud-Daulah", "Agra", ["Baby Taj"], "taj_official", "monument", "Mughal garden tomb on the Yamuna visitor circuit, commonly called the Baby Taj."),
    ("Ram Bagh", "Agra", ["Aram Bagh"], "taj_official", "activity", "Historic Mughal garden listed in the official Agra visitor ticket information."),
    ("Panna Meena ka Kund", "Jaipur", ["Panna Meena Stepwell"], "rajasthan_tourism", "activity", "Geometric stepwell near the Amber Fort circuit; combine with Amber and Jaigarh in daylight."),
    ("Jaigarh Fort", "Jaipur", ["Jaivana cannon fort"], "rajasthan_tourism", "activity", "Hill fort above Amber with rampart and city views; treat as a separate ticket and drive."),
    ("Albert Hall Museum", "Jaipur", ["Government Central Museum"], "rajasthan_tourism", "activity", "Central museum in Ram Niwas Garden; a useful indoor addition to the old-city day."),
    ("Jhalana Leopard Reserve", "Jaipur", ["Jhalana safari"], "rajasthan_tourism", "activity", "Urban wildlife reserve; safari slots must be booked separately and depend on availability."),
    ("Masala Chowk", "Jaipur", ["Jaipur food court"], "rajasthan_tourism", "activity", "Casual evening food stop in Ram Niwas Garden; opening and vendor availability can change."),
    ("Purana Qila", "Delhi", ["Old Fort Delhi", "Dinpanah", "Shergarh"], "delhi_purana", "activity", "Old Fort near Delhi Zoo with a roughly two-kilometre rampart circuit and a museum; combine with the central Delhi museum cluster."),
    ("Garden of Five Senses", "Delhi", ["Said-ul-Ajaib garden", "Delhi sensory garden"], "delhi_garden_senses", "activity", "Twenty-acre leisure garden near the Qutb heritage zone with nature walks, public art, food, and shopping areas."),
    ("Lodhi Garden", "Delhi", ["Lodi Garden", "Lodhi tombs"], "delhi_lodhi", "activity", "Free garden walk with Sayyid and Lodhi-period tombs, mosques, bridges, and popular early-morning paths."),
    ("Akbar's Tomb, Sikandra", "Agra", ["Sikandra", "Akbar Tomb"], "agra_akbar", "monument", "ASI-protected garden tomb begun by Akbar and completed by Jahangir, about 10 km from Agra city."),
    ("Chini ka Rauza", "Agra", ["Chini Ka Rauza", "Afzal Khan tomb"], "agra_district", "monument", "ASI-protected riverside tomb of poet-scholar and Shah Jahan's minister Afzal Khan, known for glazed tile decoration."),
    ("Tomb of Mariam-uz-Zamani", "Agra", ["Mariam Tomb", "Jodha Bai Tomb Sikandra"], "agra_district", "monument", "ASI-protected tomb of Mariam-uz-Zamani near Sikandra, useful as a quieter add-on to Akbar's Tomb."),
    ("Olive Bar & Kitchen", "Delhi", ["Olive Qutub"], "tripadvisor_delhi", "cafe", "Mehrauli restaurant near Qutb Minar; Italian and Mediterranean menu."),
    ("Qla", "Delhi", ["Qla Mehrauli"], "tripadvisor_delhi", "cafe", "Mehrauli restaurant near Qutb Minar; reserve ahead for a sit-down meal."),
    ("Cafe Lota", "Delhi", ["Lota cafe"], "tripadvisor_delhi", "cafe", "Indian café at the National Crafts Museum; pair with a museum visit."),
    ("Chia Taj View Cafe", "Agra", ["Chia Taj"], "tripadvisor_agra", "cafe", "Tajganj rooftop café chosen for a Taj Mahal view; verify hours before going."),
    ("Taj Cafe", "Agra", ["Taj rooftop cafe"], "tripadvisor_agra", "cafe", "Tajganj rooftop café close to the Taj Mahal visitor area."),
    ("Hawk View Restaurant & Bar", "Jaipur", ["Hawk View Jaipur"], "tripadvisor_jaipur", "cafe", "Old-city restaurant near Hawa Mahal and City Palace with rooftop-style views."),
    ("The Tattoo Cafe & Lounge", "Jaipur", ["Tattoo Cafe Hawa Mahal"], "tripadvisor_jaipur", "cafe", "Rooftop café near Hawa Mahal; popular for the facade view."),
]


def _hours(schedule: str, source_key: str, *, closure: list[str] | None = None, refresh_days: int = 30, status: str = "approved") -> dict:
    return {"kind": "hours", "conflictKey": "opening_hours", "sourceKey": source_key, "value": {"schedule": schedule, "weeklyClosure": closure or []}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=refresh_days), "status": status}


def _ticket(url: str, source_key: str, *, note: str = "Use the official portal; availability and prices can change.") -> dict:
    return {"kind": "ticketing", "conflictKey": "ticket_link", "sourceKey": source_key, "value": {"bookingUrl": url, "note": note}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=30), "status": "approved"}


def _rating(rating: float, reviews: int, source_key: str, url: str, area: str) -> dict:
    return {"kind": "rating", "conflictKey": "platform_rating", "sourceKey": source_key, "sourceUrl": url, "value": {"platform": "Tripadvisor", "rating": rating, "reviewCount": reviews, "area": area}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=7), "status": "approved"}


OBSERVATIONS = [
    {"entity": "Taj Mahal", "city": "Agra", **_hours("30 minutes before sunrise to 30 minutes after sunset", "taj_official", closure=["Friday"])},
    {"entity": "Taj Mahal", "city": "Agra", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Agra Fort", "city": "Agra", **_hours("Sunrise to sunset", "agra_fort_official")},
    {"entity": "Agra Fort", "city": "Agra", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Fatehpur Sikri", "city": "Agra", **_hours("Sunrise to sunset; on-site museum 09:00 to 17:00", "fatehpur_official", closure=["Friday for museum section"])},
    {"entity": "Fatehpur Sikri", "city": "Agra", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Qutb Minar", "city": "Delhi", **_hours("Sunrise to 20:00", "qutb_official")},
    {"entity": "Qutb Minar", "city": "Delhi", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Humayun's Tomb", "city": "Delhi", **_hours("Sunrise to 21:00", "delhi_humayun")},
    {"entity": "Humayun's Tomb", "city": "Delhi", "kind": "hours", "conflictKey": "opening_hours", "sourceKey": "delhi_humayun", "value": {"schedule": "Sunrise to 19:30", "weeklyClosure": [], "note": "Delhi Tourism page differs from the ASI listing; keep this observation in review."}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=30), "status": "needs_review"},
    {"entity": "Humayun's Tomb", "city": "Delhi", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Red Fort", "city": "Delhi", **_hours("Sunrise to sunset", "delhi_red_fort", closure=["Monday"])},
    {"entity": "Red Fort", "city": "Delhi", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Jama Masjid", "city": "Delhi", **_hours("Tourist access 08:00 to sunset for foreign visitors; 11:00 to sunset for Indian visitors", "delhi_jama")},
    {"entity": "Lotus Temple", "city": "Delhi", **_hours("09:00 to 17:30", "delhi_lotus", closure=["Monday"])},
    {"entity": "Sunder Nursery", "city": "Delhi", **_hours("07:00 to 22:00; last entry 21:00", "sunder_official")},
    {"entity": "Purana Qila", "city": "Delhi", **_hours("Open daily; exact access hours and sound-and-light show slots vary", "delhi_purana")},
    {"entity": "Purana Qila", "city": "Delhi", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing", note="Delhi Tourism lists an ASI online-ticket link; confirm the current Purana Qila listing before payment.")},
    {"entity": "Garden of Five Senses", "city": "Delhi", **_hours("Open daily; verify same-day venue hours", "delhi_garden_senses")},
    {"entity": "Lodhi Garden", "city": "Delhi", **_hours("Morning to evening", "delhi_lodhi")},
    {"entity": "Lodhi Garden", "city": "Delhi", "kind": "ticketing", "conflictKey": "ticket_link", "sourceKey": "delhi_lodhi", "value": {"bookingUrl": None, "note": "Delhi Tourism lists entry as free; no ticket booking is required."}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=30), "status": "approved"},
    {"entity": "Amber Fort", "city": "Jaipur", **_hours("07:00 to 20:00", "amber_obms", closure=["Dhulandi"])},
    {"entity": "Amber Fort", "city": "Jaipur", **_ticket("https://obms-tourist.rajasthan.gov.in/place-details/Amber-Fort", "amber_obms")},
    {"entity": "Hawa Mahal", "city": "Jaipur", **_hours("09:00 to 18:30", "hawa_obms", closure=["Dhulandi"])},
    {"entity": "Hawa Mahal", "city": "Jaipur", **_ticket("https://obms-tourist.rajasthan.gov.in/place-details/Hawa-mahal", "hawa_obms")},
    {"entity": "Jantar Mantar, Jaipur", "city": "Jaipur", **_hours("09:00 to 19:00; last ticket 18:30", "rajasthan_jantar")},
    {"entity": "Jantar Mantar, Jaipur", "city": "Jaipur", **_ticket("https://obms-tourist.rajasthan.gov.in/place-details/Jantar-Mantar", "rajasthan_jantar")},
    {"entity": "Nahargarh Fort", "city": "Jaipur", **_hours("10:00 to 22:00", "nahargarh_obms")},
    {"entity": "Nahargarh Fort", "city": "Jaipur", **_ticket("https://obms-tourist.rajasthan.gov.in/place-details/Nahagarh-Fort", "nahargarh_obms")},
    {"entity": "City Palace Jaipur", "city": "Jaipur", **_hours("Museum/Royal Tour 09:30 to 18:30; last day ticket 18:00; night museum 19:00 to 19:30", "city_palace", closure=["Dhulandi"])},
    {"entity": "City Palace Jaipur", "city": "Jaipur", **_ticket("https://citypalace.org/visit", "city_palace", note="Royal Tour tickets are sold at the City Palace counter; confirm current package before payment.")},
    {"entity": "Akbar's Tomb, Sikandra", "city": "Agra", **_hours("Sunrise to sunset", "agra_akbar")},
    {"entity": "Akbar's Tomb, Sikandra", "city": "Agra", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing")},
    {"entity": "Mehtab Bagh", "city": "Agra", **_hours("Sunrise to sunset", "agra_mehtab")},
    {"entity": "Mehtab Bagh", "city": "Agra", **_ticket("https://asi.paygov.org.in/asi-webapp/", "taj_ticketing", note="The District Agra page lists current entry and online ASI tickets; rates may change.")},
    {"entity": "Mehtab Bagh", "city": "Agra", "kind": "activity", "conflictKey": "visit_tip", "sourceKey": "agra_mehtab", "value": {"bestLight": "16:30 to 18:00", "parking": "limited at gate", "insideFood": False, "tip": "Carry water; use the river-facing garden for a Taj sunset view."}, "observedAt": CAPTURED_ON, "refreshAfter": CAPTURED_ON + timedelta(days=30), "status": "approved"},
    {"entity": "Olive Bar & Kitchen", "city": "Delhi", **_rating(4.2, 534, "tripadvisor_delhi", "https://www.tripadvisor.in/Restaurant_Review-g304551-d945697-Reviews-Olive_Bar_Kitchen-New_Delhi_National_Capital_Territory_of_Delhi.html", "Mehrauli/Qutub Minar")},
    {"entity": "Qla", "city": "Delhi", **_rating(4.2, 169, "tripadvisor_delhi", "https://www.tripadvisor.in/Restaurant_Review-g304551-d8141096-Reviews-Qla-New_Delhi_National_Capital_Territory_of_Delhi.html", "Mehrauli/Qutub Minar")},
    {"entity": "Cafe Lota", "city": "Delhi", **_rating(4.4, 678, "tripadvisor_delhi", "https://www.tripadvisor.in/Restaurant_Review-g304551-d5001898-Reviews-Cafe_Lota-New_Delhi_National_Capital_Territory_of_Delhi.html", "National Crafts Museum")},
    {"entity": "Chia Taj View Cafe", "city": "Agra", **_rating(4.7, 96, "tripadvisor_agra", "https://www.tripadvisor.in/Restaurant_Review-g297683-d25019534-Reviews-Chia_Taj_View_Cafe-Agra_Agra_District_Uttar_Pradesh.html", "Tajganj/Taj view")},
    {"entity": "Taj Cafe", "city": "Agra", **_rating(4.6, 113, "tripadvisor_agra", "https://www.tripadvisor.in/Restaurant_Review-g297683-d7970659-Reviews-Taj_Cafe-Agra_Agra_District_Uttar_Pradesh.html", "Tajganj")},
    {"entity": "Hawk View Restaurant & Bar", "city": "Jaipur", **_rating(4.8, 3066, "tripadvisor_jaipur", "https://www.tripadvisor.in/Restaurant_Review-g304555-d13403413-Reviews-Govindam_Retreat-Jaipur_Jaipur_District_Rajasthan.html", "Hawa Mahal/old city")},
    {"entity": "The Tattoo Cafe & Lounge", "city": "Jaipur", **_rating(4.4, 549, "tripadvisor_jaipur", "https://www.tripadvisor.in/RestaurantsNear-g304555-d317345-Hawa_Mahal_The_Palace_of_Breeze-Jaipur_Jaipur_District_Rajasthan.html", "Hawa Mahal")},
]

# Extra factual prompts improve answers about what a traveler is actually looking
# at, while remaining short and citation-first. These attach to existing entities
# where possible, so they do not create duplicate itinerary candidates.
ADDITIONAL_CLAIMS = [
    ("Qutb Minar", "Delhi", ["72.5 metre Qutb", "Iron Pillar history"], "qutb_official", "UNESCO describes Qutb Minar as a 72.5-metre red-sandstone tower surrounded by the Quwwatu'l-Islam mosque, Alai Darwaza, Iltutmish's tomb, and the Iron Pillar.", "verified"),
    ("Humayun's Tomb", "Delhi", ["Arab Serai", "Mughal family tombs"], "delhi_humayun", "UNESCO records a 27.04-hectare Humayun's Tomb property containing a wider group of Mughal garden-tombs including Isa Khan, Bu Halima, Afsarwala, Barber's Tomb, and Arab Serai.", "verified"),
    ("Red Fort", "Delhi", ["Nahr-i-Behisht", "Stream of Paradise"], "delhi_red_fort", "UNESCO describes the Red Fort's private apartments as pavilions linked by the Nahr-i-Behisht, a water channel through the palace sequence.", "verified"),
    ("Purana Qila", "Delhi", ["Purana Qila sound and light"], "delhi_purana", "Delhi Tourism describes Purana Qila as a roughly two-kilometre rectangular fort circuit near Delhi Zoo and lists an evening sound-and-light show.", "verified"),
    ("Garden of Five Senses", "Delhi", ["Qila Rai Pithora", "Saket garden"], "delhi_garden_senses", "Delhi Tourism describes the Garden of Five Senses as a 20-acre leisure space near the Qutb heritage zone with nature walks, public art, and food and shopping terraces.", "verified"),
    ("Lodhi Garden", "Delhi", ["Muhammad Shah tomb", "Sikandar Lodi tomb"], "delhi_lodhi", "Delhi Tourism describes Lodhi Garden as a free public garden containing Sayyid- and Lodhi-period tombs, mosques, and bridges, popular with early-morning walkers.", "verified"),
    ("Taj Mahal", "Agra", ["Taj night viewing", "full moon Taj"], "taj_official", "The official Agra visitor page lists separate night viewing on the full-moon night and the two nights before and after, subject to exclusions, permits, and ASI availability.", "verified"),
    ("Mehtab Bagh", "Agra", ["Moonlight Garden", "Taj sunset viewpoint"], "agra_mehtab", "The District Agra page describes Mehtab Bagh as a Mughal garden aligned across the Yamuna with the Taj Mahal and recommends the 16:30–18:00 light window for photography.", "verified"),
    ("Akbar's Tomb, Sikandra", "Agra", ["119-acre charbagh", "Sikandra blackbuck"], "agra_akbar", "The District Agra page describes Akbar's Tomb as a five-storey sandstone-and-marble mausoleum in a 119-acre charbagh, with blackbuck often seen in the gardens.", "verified"),
    ("Itimad-ud-Daulah", "Agra", ["Baby Taj inlay"], "agra_district", "The Agra district visitor list places Itimad-ud-Daulah on the same riverside monument circuit as the Taj, Agra Fort, and Mehtab Bagh; use the ASI portal for current access information.", "estimated"),
    ("Amber Fort", "Jaipur", ["Amer palace circuit", "Maota Lake"], "amber_obms", "Amber should be planned as a hill-fort circuit with Ganesh Pol, Sheesh Mahal, palace courtyards, and views toward Maota Lake; allow more time than a short photo stop.", "estimated"),
    ("Jantar Mantar, Jaipur", "Jaipur", ["Samrat Yantra sundial", "astronomy Jaipur"], "rajasthan_jantar", "Rajasthan Tourism lists Jantar Mantar entry from 09:00 to 19:00 with the last ticket at 18:30; the monumental instruments are best understood with a guide or audio explanation.", "verified"),
]
