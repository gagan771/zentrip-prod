# India-wide tourism corpus

This catalog is broader than the Golden Triangle. It seeds destination anchors
and experience metadata for North, South, East, West, Central, Northeast, coastal,
wildlife, spiritual, heritage, and adventure travel.

The normalized expansion currently contains 44 destination anchors, 11 gateway
nodes, and 20 transfer edges spanning six planning regions and 24 states/UTs. It
is a foundation for adding more places without changing the
planner contract.

The current expansion covers:

- Himalayan: Leh, Srinagar, Rishikesh, Gangtok, Great Himalayan National Park,
  Khangchendzonga, Shillong/Meghalaya.
- Spiritual and heritage: Varanasi, Amritsar, Nalanda, Sanchi, Champaner-Pavagadh,
  Dholavira, Ramappa, Belur-Halebidu, Santiniketan, Charaideo.
- South and coast: Goa, Kochi, Munnar, Kerala backwaters, Mysuru, Puducherry,
  Andaman, Hampi.
- Wildlife and desert: Kaziranga, Sundarbans, Ranthambore, Gir, Kutch, Bhimbetka.
- Regional expansion: Mathura–Vrindavan, Lucknow, Ayodhya, Bhubaneswar, Puri,
  Wayanad, Varkala, Udaipur, Mount Abu, Coorg, Shravanabelagola, Dwarka,
  Visakhapatnam–Araku, Ooty, and Tirupati.

Seasonality, duration, altitude, permits, and transfer complexity are stored in
the normalized `destination_profiles` table and mirrored into the planner's
experience profile. Gateway nodes and estimated transfer windows live in
`destination_routes`. Seasonal guidance is labelled estimated; live closures,
permits, safari slots, ferry schedules, and weather must be rechecked before a
booking or final itinerary is shown.

The API exposes the reviewed layer through `GET /v1/knowledge/destinations` with
region/state/kind/tag filters and `GET /v1/knowledge/routes` with origin,
destination, and transport-mode filters. The seed is idempotent and refreshes
profile metadata every 90 days and route estimates every 30 days while preserving
staff review decisions.

The first-time visitor playbook adds searchable, cited guidance for visa and
arrival, customs, money, transport, SIM/connectivity, language, food, health,
religious etiquette, scams, emergency response, permits, insurance, and
responsible travel. Use `GET /v1/knowledge/essentials?topic=arrival` (topics:
`visa`, `arrival`, `safety`, `health`, `transport`, `payments`, `connectivity`,
`culture`, `food`, and `planning`) to load a focused beginner briefing.

The regional batch is grounded in the Ministry of Tourism's destination pages for
[Uttar Pradesh](https://www.incredibleindia.gov.in/en/uttar-pradesh),
[Odisha](https://www.incredibleindia.gov.in/en/odisha),
[Kerala](https://www.incredibleindia.gov.in/en/kerala),
[Rajasthan](https://www.incredibleindia.gov.in/en/rajasthan),
[Karnataka](https://www.incredibleindia.gov.in/en/karnataka), and
[Gujarat](https://www.incredibleindia.gov.in/en/gujarat). The official portal also
provides [airport information](https://www.incredibleindia.gov.in/en/airport-information),
[public holidays](https://www.incredibleindia.gov.in/en/plan-your-trip/public-holidays),
and [travel-partner discovery](https://www.incredibleindia.gov.in/en/plan-your-trip/travel-partners).

Primary references include the [UNESCO India list](https://whc.unesco.org/en/statesparties/in/),
[Incredible India](https://www.incredibleindia.gov.in/en/tourism-information-centre),
and the Ministry of Tourism's [thematic circuits](https://www.tourism.gov.in/buddhist-circuit).
