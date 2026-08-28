# Indian recommendation data roadmap

Zenny's destination ranker now uses reviewed claims, aliases, destination
profiles, route estimates, accessibility signals, seasonal fit, trip length,
party fit, feedback, and operational freshness. The live research pass on 28
August 2026 confirms that the next quality gains should come from structured
coverage, not from copying larger articles into the model.

## Source-backed expansion priorities

1. **National discovery:** use the Ministry of Tourism's [Incredible India
   destination and attraction directory](https://www.incredibleindia.gov.in/en)
   to add canonical destination pages, local aliases, attraction categories,
   and state/region links.
2. **Seasonality:** normalize the official [India weather
   guide](https://www.incredibleindia.gov.in/en/plan-your-trip/weather) into
   month-level comfort, monsoon, heat, snow, cyclone, and wildlife-season
   signals. Keep this separate from live forecasts.
3. **Responsible travel:** map [Travel for
   LiFE](https://www.incredibleindia.gov.in/en/travel-for-life) into answer
   guidance for public transport, low-impact stays, waste reduction, cultural
   respect, biodiversity, and local businesses.
4. **Operational truth:** collect hours, closures, ticket portals, permits,
   transport disruptions, and local safety notices as expiring observations.
   Never promote these fields from a static destination description.
5. **Inclusive planning:** add explicit family, senior, mobility, solo-woman,
   LGBTQ+, medical-access, and low-walking suitability fields with a source and
   refresh date for each destination.

## Coverage queue from the multi-agent audit

The current curated layer is strongest around Delhi–Agra–Jaipur and has useful
anchors in Uttar Pradesh, Odisha, Kerala, Rajasthan, Karnataka, Gujarat, Andhra
Pradesh, and Tamil Nadu. The next editorial batches should prioritize:

- Maharashtra and Mumbai/Pune/Aurangabad circuits;
- Tamil Nadu temple, coast, and heritage routes beyond the initial Ooty anchor;
- Himachal, Uttarakhand, and Ladakh with altitude, acclimatization, permits, and
  weather-closure fields;
- Central India and Northeast India with wildlife permits, transfer buffers, and
  local-language aliases;
- monthly crowd/festival windows, food specialties, realistic transfer ranges,
  and accommodation bands for every high-demand destination.

## Editorial acceptance rule

Every new destination batch must include a canonical name, aliases, one concise
reviewed claim, a primary source URL, experience tags, typical stay range,
seasonality, access and safety notes, and a refresh owner. Prices, hours,
availability, closures, ratings, and permits require separate observations and
must remain visibly marked for verification when stale.
