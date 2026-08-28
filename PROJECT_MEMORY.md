# Zentrip Project Memory

Updated: 2026-08-26 (completion pass — native trail route rendering added; licensed trail
data remains external): all 8 agent intents now have real tools:
safety via KB + emergency fast-path, translation via offline phrasebook, community
demo events with stale-hiding, buddy deterministic V1 scoring; plus the structural
fix of knowledge_service's AND-across-tokens fragility and the mobile services→grocery
deep-link)

## Product direction

Zentrip is a voice-first travel companion for India. Zenny is the single assistant
surface; Trip Planner, Compare, Guide, Profile, safety, and future booking features
are tools behind it. The mobile app should not run an LLM locally.

Current model decision:

- OpenRouter free-model routing for LLM calls.
- FastAPI + Pydantic models on the backend.
- PydanticAI is the preferred agent layer when the real model/tool loop is expanded.
- LangGraph can be added later for durable multi-step workflows and approvals.
- Backend-only speech processing. No local LLM on the phone.

## Completed

### Backend foundation

- Email/password and Google authentication routes.
- JWT access tokens and rotated refresh tokens.
- Agent Gateway skeleton with intent classification, policy tiers, and Redis session memory.
- Trip, itinerary-day, and KnowledgeEntity models and migrations.
- OpenRouter itinerary generation with forced structured tool output.
- Itinerary grounding validation: generated places must match retrieved knowledge candidates.
- Delhi/Agra/Jaipur corridor seed data.
- Twilio outbound onboarding call transport with consent and signed callbacks.
- Compare/Decision Engine with normalized demo rail/coach adapters, deterministic ranking, and outcomes.
- Agent Gateway now calls the real Compare and Trip tools instead of returning skeleton text:
  - `app/comparison_service.py` gained `find_known_locations(text)` — regex alias matching against
    the Delhi/Agra/Jaipur corridor, no full NLU needed for a 3-city fixed set.
  - `app/routers/compare.py` and `app/routers/trips.py` each had their route body's core logic
    extracted into a reusable function (`run_compare`, `regenerate_itinerary`) so the REST endpoint
    and the Agent Gateway persist identical `ProviderObservation`/`Recommendation`/`ItineraryDay`
    rows instead of two implementations drifting apart.
  - `handle_message()` in `app/agent_gateway.py` now branches on `compare` and `trip_planning`
    intents into `_compare_reply` / `_trip_reply`, which call those shared functions and speak a
    real summary (top demo fare; or "create a trip first" / itinerary day-1 summary).
  - Verified live end to end against a real Postgres+Redis (local `docker compose up`, migrated,
    seeded): "cheapest way from Delhi to Agra" → real ranked demo fare; "tell me about the Taj
    Mahal" → unchanged grounded KB citation (regression-checked); "plan my trip" → correctly says
    no trip exists yet, then after creating one, correctly reports `OPENROUTER_API_KEY` isn't set
    (graceful `LLMNotConfiguredError` fallback, no crash) rather than actually generating days.
  - Still skeleton: `safety`, `services`, `translation`, `community`, `buddy` intents — no tool
    exists yet for any of them.
- Three-tier memory model (01-zentrip-companion.md §3) is now real, not just session memory:
  - New `TripMemoryNote` and `UserPreference` models (migration `eed6303d2ab9`) — trip memory is
    an append-only note log scoped to `trip_id` (`source="system"` for deterministic bookkeeping
    vs `source="user"` for explicit notes); long-term preference memory is versioned via
    `superseded_at` soft-delete, never hard-deleted, per privacy §50.
  - New `app/routers/memory.py`: `GET/POST /v1/trips/{id}/memory`, `GET/POST /v1/preferences`,
    `DELETE /v1/preferences/{id}`. Preference writes are a deliberate explicit-opt-in-only path —
    there is no endpoint that turns free-form chat text into a persisted preference automatically,
    matching the spec's "written only after explicit opt-in, never inferred silently" line.
  - `build_context()` in `app/agent_gateway.py` is now async and actually loads the user's latest
    trip's recent memory notes + active preferences (previously returned profile fields only, with
    a `# noqa: F841` admitting it was unused). Still not consumed by any reply's *text* — there's no
    real LLM tool-use loop yet to hand it to (see "Later roadmap") — but the read path is real, not
    stubbed.
  - `_trip_reply()` now writes a deterministic `source="system"` trip-memory note ("Itinerary
    regenerated for Delhi, Agra (3 days).") after a successful itinerary regeneration. Verified this
    fires only on genuine success, not on the `LLMNotConfiguredError` fallback path (smoke-tested:
    triggered the fallback, confirmed via `GET /v1/trips/{id}/memory` that no system note appeared).
  - Live smoke-tested: explicit preference create/list, explicit trip-memory note create, and the
    negative case above, all against the same local Postgres from the Compare/Trip pass.
- Basic stay/hotel search — closes the "basic stay search" half of 03's Phase 2 exit criterion
  (transport compare already existed). Deliberately **not** shoehorned into the transport-shaped
  `ProviderObservation`/`Recommendation` tables (no origin/destination/duration on a stay) — added
  parallel `StayObservation`/`StayRecommendation` models instead (migration `133970d04c84`; no
  `Outcome`-equivalent for stays yet, out of scope for "basic").
  - `app/comparison_service.py`: `StaySearchInput`/`StaySearchResult`, 3 demo stays per corridor
    city (hostel + 2 hotel tiers, Delhi/Agra/Jaipur), `rank_stay_results()` weighted on
    price/rating/distance-to-center/cancellation (budget-level-dependent weights, same pattern as
    transport's `_WEIGHTS`). Badges: RECOMMENDED/CHEAPEST/BEST RATED/MOST CENTRAL.
  - `app/routers/compare.py`: `POST /v1/compare/stays/search` (`run_stay_search`, mirrors
    `run_compare`'s shared-function shape for a future Companion "search_stays" tool call).
  - Live smoke-tested: Jaipur backpacker-budget search (hostel wins RECOMMENDED/CHEAPEST/MOST
    CENTRAL), same search at luxury budget (re-ranks, confirms weights actually shift things),
    unsupported city (Mumbai — graceful empty result, not an error), invalid dates
    (checkOut ≤ checkIn — 400).
  - **Now wired into the Companion** (this pass): `_compare_reply` detects stay keywords
    (hostel/hotel/stay/accommodation) plus a known city and routes to `_stay_reply` → `run_stay_search`
    instead of transport. Live-tested: "cheap hostel in Jaipur" and "tell me about Agra hotels" both
    correctly return a stay recommendation; "cheapest train from Delhi to Jaipur" still correctly
    returns transport (regression-checked, not broken by the new branch).
- Payment Assistance (18) is done — reuses the Guide/RAG pipeline exactly as the spec says ("no
  dedicated payment-service, just a content category"), not a separate tool:
  - `app/seed.py`: added `PAYMENT_SOURCES`/`PAYMENT_ENTRIES` (UPI overview — primary PIB source,
    `confidence="verified"`; UPI-for-foreign-travelers — secondary AZB&Partners summary of an RBI
    circular, `confidence="estimated"`, `authority_level="secondary"`), `entity_type="payment_info"`,
    `city="India"` (country-wide, deliberately outside any corridor city so it never leaks into
    itinerary generation's per-city candidate query). Refactored the seed script's per-entry
    upsert logic into a shared `_upsert_entry()` used by both the landmark and payment loops
    (`_source()` also generalized to take a `sources` dict instead of hardcoding UNESCO_SOURCES).
  - `app/agent_gateway.py`: new `payment` intent (keywords: pay/upi/atm/cash/credit card/debit
    card/rupees/wallet), routed through the *same* `_guide_reply()` function as `guide` — not a new
    function — since the retrieval mechanism is identical.
  - **Found and fixed a real bug while testing this**: `app/knowledge_service.py`'s
    `_QUERY_STOP_WORDS` was missing "how"/"here"/"does"/"did"/"will"/"would"/"there"/"it"/"which" —
    fine for landmark queries ("tell me about the Taj Mahal" has almost no filler once "tell/me/
    about/the" are stripped) but broken for natural payment phrasing: "how do I pay with UPI here"
    left `["how", "pay", "upi", "here"]` as search tokens, and the search is a strict AND across all
    tokens — "how" and "here" matched nothing in the seeded content, so genuine content silently
    returned zero results. Expanded the stopword list to fix the specific case, which is
    live-verified working now. **Resolved (fourth pass)**: the underlying AND-across-all-tokens
    fragility is now fixed structurally in knowledge_service.py (progressive token relaxation +
    punctuation stripping) — see Backend foundation. The "can foreign travelers use UPI" case
    verifiably works now.
   - Live-verified: "how do I pay with UPI here" → correct grounded answer with 2 citations; "tell
    me about the Taj Mahal" still works unchanged (regression check on the stopword-list change).
- `services` intent now does real (heuristic, not LLM) item extraction instead of returning skeleton
  text — closes the backend half of "grocery hand-off triggered by natural language":
  - `app/agent_gateway.py`: `_extract_service_items()` strips a known lead-in phrase ("I need ",
    "can you get me ", etc.) then splits on and/,/&. `AgentReply` gained an `items: list[str]` field
    (empty for every intent except `services`), threaded through `AgentMessageResponse`
    (`routers/agent.py`) and `ZennyVoiceTurnResponse` (`schemas.py`/`routers/zenny_voice.py`) so both
    the text-chat and voice paths expose it.
  - Live-verified: "I need toothpaste and a USB-C charger" → `items: ["toothpaste", "usb-c
    charger"]` with a reply naming all 4 ported grocery providers. Known heuristic limitation (by
    design, documented in the function's docstring): "I need to buy something" extracts `["something"]`
    — it's pattern-matching, not real NLU, same "start with rules" philosophy as `find_known_locations`.
  - **Now done (fourth pass): the mobile Companion consumes `items`.** `lib/zenny-voice.ts`'s
    `ZennyVoiceTurn` gained the `items: string[]` field; when a services reply arrives, companion.tsx
    renders an "Open grocery hand-off" button that pushes `/services/grocery` with the items
    '|'-joined as a param; `app/services/grocery/index.tsx` reads `useLocalSearchParams().items` in a
    lazy `useState` initializer to pre-fill the draft list ('|' chosen because item names can contain
    commas). `tsc --noEmit` clean.
- **Safety intent (15/16) is real** — KB-backed content + deterministic emergency fast path:
  - `app/seed.py`: `SAFETY_SOURCES`/`SAFETY_ENTRIES` seeded via the same `_upsert_entry()` pipeline,
    `entity_type="safety_info"`: Emergency Number 112 (112.gov.in, primary/verified), Tourist
    Helpline 1363 (tourism.gov.in, primary/verified), Common Tourist Scams (Delhi Police advisory,
    secondary/estimated). Re-ran seed: 3 new entities, 3 new cited claims.
  - `handle_message()` routes `safety` through the same `_guide_reply()` KB retrieval as guide/payment,
    but first checks `_is_emergency(text)` — if matched, a deterministic no-retrieval answer ("call
    112 now… tourist help 1363") with verified citations leads the reply. Emergency answers never
    depend on search matching or even the KB being seeded.
  - Intent classifier fix found while testing: safety was listed after `services` in INTENT_KEYWORDS,
    so "I need help, I feel unsafe…" matched services' "need" keyword first. Safety now listed FIRST
    with tighter keywords ("help me", "help, i", "unsafe", "in danger", …) — an emergency must never
    lose routing to dict ordering.
- **Translation intent (06) is real** — offline curated phrasebook, `app/phrasebook.py`:
  - ~6 essential phrases × 9 languages (Hindi, Punjabi, Gujarati, Marathi, Bengali, Tamil, Telugu,
    Kannada, Malayalam), each entry (native script, romanized pronunciation). Deterministic, no LLM,
  no network — deliberately offline-first per the spec's fallback layer before Phase 3 live
  translation. Honest miss on unknown phrases (lists what IS covered) rather than guessing.
  - Classifier: literal "say in"/"translate" keywords plus a fallback rule — mentions of a supported
    language + a phrase hint ("thank you", "how much", "toilet", …) also route here, so "how do I say
  thank you in Tamil" works without containing "say in".
- **Community (08) and Buddy (10) intents have minimal real tools**, `app/social_service.py`:
  - Community: curated demo event list for the corridor with end_times computed relative to now;
    stale events are filtered at query time — spec 08 §21's explicit "stale posters do not remain
  visible". Freshness label (verified vs community-reported) spoken per event. Live-tested: "what's
  happening tonight in Jaipur?" → correct event, stale entries absent.
  - Buddy: parse_buddy_request() extracts destination/month/style/interests/budget/accommodation by
  rules; find_buddy_matches() scores demo groups with exactly the V1 weights from spec 10 §23.3
  (dates 25% + destination 20% + budget 15% + style 15% + interests-jaccard 10% + start location 5%
  + accommodation 5%). Aggregated cards only — no personal details pre-consent (§23.4). Live-tested:
  "find travel buddies for spiti in october, trekking and photography, budget 20k" → Spiti Circuit
  October at 47%, 2 more groups matched. Classifier keywords widened ("buddies", "going to",
  "join for").
- **knowledge_service AND-across-tokens fragility fixed structurally** (was patched stopword-by-
  stopword before):
  - Tokens are punctuation-stripped now ("delhi?" previously failed to match "Delhi" — this was
  silently zeroing real queries like "common tourist scams in Delhi?").
  - Matching is progressive: all tokens first, then drop one token at a time until something matches;
  scoring still prefers rows matching more tokens. This fixes the whole class ("can foreign travelers
  use UPI" now returns UPI-for-Foreign-Travelers) instead of each phrasing individually.
  - Regression-checked live: Taj Mahal guide query unchanged, UPI payment query unchanged, nonsense
  query still returns empty honestly.

- Journey/Booking Hub (04) minimal timeline — built by a background subagent this pass, verified
  live by me afterward:
  - New `GET /v1/trips/{trip_id}/timeline` (`app/routers/trips.py`, `TripTimelineResponse` in
    `app/schemas.py`) returns `{trip, days}` in one payload instead of two separate calls
    (`GET /{id}` + `GET /{id}/itinerary`) — the spec's literal "assembling the timeline server-side
    ... as one payload" ask. Existing separate endpoints left untouched (additive, not a replacement).
  - **Deliberately excludes** `Recommendation`/`StayRecommendation` (Compare/Stay Search results):
    neither table has a `trip_id` FK today, only `user_id` — there's no real join, and guessing one
    (e.g. by date overlap) would silently misattribute data. Documented honestly in the endpoint's
    docstring as future work (those tables need a `trip_id` column, and a concept of "booked/selected"
    vs. just "searched," before they're genuine bookings that belong on a timeline).
  - Mobile: `lib/trips.ts` gained `getTripTimeline()`; `app/(tabs)/trip.tsx`'s `ItineraryView` now
    does one `useQuery` instead of two. Live-verified the endpoint directly (fresh trip, empty
    itinerary → correct `{trip, days: []}`, 200). `tsc --noEmit` clean.

### Knowledge Base

- Added KnowledgeSource, KnowledgeClaim, and KnowledgeAlias models.
- Added migration `3b7f2c9d6e14`.
- Added citation-first search: `GET /v1/knowledge/search`.
- Added UNESCO-backed starter claims and aliases for 9 corridor landmarks.
- Uncited legacy facts are marked `needs_review` and are hidden from retrieval.
- Itinerary generation now reads published, sourced claims instead of the old raw fact field.

### Mobile

- Home, Explore, Trip, Profile, Compare, Guide/More navigation surfaces.
- TanStack Query and Zustand persistence.
- Guest continuation flow to let users explore without network/auth setup.
- Fixed missing `babel-preset-expo` bundling dependency.
- Fixed Expo Router root-layout navigation race using protected routing.
- Added Expo Audio microphone package/configuration.
- Added `expo-speech` for free native phone speech playback.
- Replaced the old Companion text composer with a hold-to-talk voice-first screen.
- Added multipart upload client for `/v1/zenny/voice/turn`.
- Mobile TypeScript check passes.
- Ported 4 of the 12 grocery cart-button components from `D:\namak-fnfinal\kmkb-mobile-app`
  (Blinkit, Flipkart Minutes, Zepto, Swiggy Instamart) into `apps/mobile/components/grocery/`,
  per `05-india-services-layer-grocery-integration.md`. Raw copy, not yet behind the spec's
  `ServiceProviderAdapter` interface — that refactor and the remaining 8 providers are still open.
  Added `apps/mobile/app/services/grocery/index.tsx`, an ad-hoc item-list screen (matches the
  spec's traveler persona — "I need toothpaste and a USB-C charger" — not kmkb's meal-plan-derived
  list) wired to all 4 buttons. Added `lib/theme.ts`, `lib/webview-geolocation.ts`, and
  `lib/analytics.ts` (now a bounded local-first event queue), plus `lib/grocery-api.ts` wired to
  the implemented `/v1/grocery/<provider>/sessions` routes.
  Added `react-native-webview`, `@expo/vector-icons` (promoted to a direct dep), `expo-font` (its
  peer dep) via `expo install`. `tsc --noEmit` clean, `expo-doctor` 18/18. **Never run on a device or
  simulator** — the WebView search/add-to-cart flows are unverified against live Blinkit/Flipkart/
  Zepto/Swiggy pages.
- Grocery `ServiceProviderAdapter` refactor (05) — built by a background subagent this pass. New
  `lib/grocery-adapters.ts`: `GroceryProviderAdapter` interface (`key`, `displayName`, `Component`,
  `logo`) + `GROCERY_ADAPTERS` array registering all 4 ported providers; `app/services/grocery/index.tsx`
  now maps over that array instead of hardcoding 4 JSX blocks. Deliberately a component-registry, not
  a literal `search()`/`getDetails()` adapter — these are WebView-UI-driven flows with no server-side
  catalog to query independently of rendering the actual screen, so "which component owns this
  provider's flow" is the honest equivalent integration point, not a faked async search. The 4
  CartButton component files themselves were left untouched (no inconsistency found blocking the
  shared-type unification). `tsc --noEmit` clean, `expo-doctor` 18/18.

## Partially complete / current limitation

All 8 Agent Gateway intents (guide, payment, compare, trip_planning, services, safety,
translation, community, buddy) now have real tools bound — none return the skeleton
"tool isn't connected yet" reply for their own intent anymore. `chat` remains a
graceful fallback by design. OpenRouter is still only needed for itinerary generation
(key unset in local `.env`; graceful `LLMNotConfiguredError` fallback verified).

`POST /v1/zenny/voice/turn` (upload → transcribe → Agent Gateway → grounded reply) has now been
verified working end to end **on the backend, from a synthesized WAV, for the first time in this
project** — see "Voice STT — now working" below for exactly what was and wasn't tested. The mobile
flow now requests mic permission, records/uploads the turn, plays native TTS, persists a voice
session UUID, and supports barge-in; physical-device QA remains before release.

The Agent Gateway now has real tools for `guide`, `payment`, `compare` (transport + stays),
`trip_planning`, `services`, `safety`, `translation`, `community`, and `buddy`. OpenRouter remains
required (and its API key may be unset in local environments) for itinerary generation specifically;
everything else works without it.

### Completion pass — Journey, Services, and Social surfaces

- Community and Buddy now have authenticated REST endpoints (`GET /v1/community/events` and
  `POST /v1/buddy/matches`) in addition to voice-tool access. The mobile Community and Travel Buddy
  routes now use those endpoints instead of rendering `FeaturePlaceholder`.
- Basic stay search is now reachable from the mobile Compare screen, not only from the backend API.
  It remains explicitly demo-only and requires a live check before booking.
- Grocery hand-off sessions now persist in `grocery_sessions` through the four supported provider
  routes. The mobile fire-and-forget save calls no longer target a missing endpoint.
- Journey timeline now includes explicit `TripBooking` records. `POST /v1/trips/{id}/bookings`
  saves a confirmed/pending/cancelled hand-off, and the mobile Trip screen can create and display
  those records. Search results are still not silently treated as bookings.
- Guardian now has a trusted-contact phone action and a location-link action in addition to the
  official 112 and 1363 buttons. The phone still needs device permission/testing before release.
- Trip offline pack is now implemented on mobile: `lib/offline-trip.ts` stores the latest trip
  timeline in `expo-sqlite`, the Trip screen refreshes the cache after an online load, falls back to
  the last saved copy when the API is unavailable, and displays a locally available emergency card
  with 112 and 1363. This is an itinerary/booking cache, not an offline map package.
- Hostel & Social Stay Intelligence (09) is now a real extension of stay search:
  - `comparison_service.py` stores structured demo attributes for cleanliness, safety, social
    atmosphere, quietness, remote-work fit, staff, community activity, trek accessibility, solo
    fit, and nightlife, then combines them with value/location/cancellation into a traveler-style
    Stay Score.
  - `POST /v1/compare/stays/search` accepts `travelerStyle` (`balanced`, `social`, `quiet`,
    `remote_work`, `trek`, `solo`) and returns weighted `scoreBreakdown` components plus
    `contextSignals`.
  - Social context is privacy-safe and aggregate-only: current community event titles and the
    number of members in overlapping demo hostel groups. No traveler identities are exposed.
  - The mobile Compare screen now lets travelers choose a stay preference and see the score,
    top weighted factors, and context signals. Results remain clearly demo-only and non-bookable.
- Trails/OSM research is now represented by a safe preview data layer. OSM may contain path
  segments or route relations for Kedarnath/Kuari Pass, but coverage and continuity must be
  checked per route before publishing; preview lines are never represented as verified or safe
  offline trekking routes. The mobile Trails screen now supports manifests and SQLite package
  caching; the native MapLibre route layer now renders the stored GeoJSON geometry, while
  licensed base tiles/PMTiles, DEM/compass alignment, and field/official validation remain
  required for navigation-ready output.

### Phase 3 implementation pass — During-Trip Corridor MVP

- Guide 07-full is implemented in the corridor: camera upload → constrained landmark candidate
  matching → confidence gate → cited Knowledge Base response. It now supports content modes for
  overview, deep history, architecture, kids, academic context, and hidden details, with native
  speech playback on mobile. GPS coordinates now narrow the candidate list using seeded landmark
  centroids when location permission is available. It still requires a configured vision provider
  for real identification.
- Translator 06 now has a dedicated `/translation` mobile flow and `POST /v1/translation/translate`.
  It supports the curated offline phrasebook, pronunciation, native speech playback, confidence
  labels, and optional KB context for menu/cultural terms. Unknown phrases fail honestly instead of
  hallucinating. Cloud streaming STT/translation/TTS remains an external provider integration.
- Guardian 15-minimal now has a deterministic incident state machine backed by
  `guardian_incidents`: create → check in → share coordinates → resolve. New endpoints are
  `POST /v1/guardian/incidents`, `GET /v1/guardian/incidents/active`, and the check-in/share/resolve
  action routes. The mobile SOS screen now exposes category selection and incident controls while
  retaining native 112/1363/1091 dialing and location actions. No authority dispatch or automatic
  escalation is claimed.
- Offline itinerary hardening remains implemented through SQLite timeline caching and the local
  emergency card. Trail packages now use a separate SQLite cache with explicit preview warnings.
- The Phase 3 code pass is complete for the corridor MVP. Before calling it production-ready, run
  migration `c4e8f2a1b6d0`, configure the vision/cloud voice providers, and perform physical-device
  QA for camera, microphone, location, dialing, speech, and zero-connectivity behavior.

### Phase 5–6 implementation pass — Verification and Risk workflows

- Risk Intelligence (16) is implemented with `risk_patterns`, published city/location patterns,
  confidence/freshness/source metadata, `GET /v1/risks`, a Guardian Scam lookup link, and a
  Companion safety reply path. Seed entries are clearly estimated editorial demo data; they do not
  name or accuse businesses or individuals.
- Explorer Program (13) is implemented with `explorer_profiles`, safety-gated activation,
  `explorer_missions`, GPS-capable `explorer_submissions`, and review-pending statuses. Mobile has
  application, safety activation, mission, and submission flows. Submissions are not marked verified
  automatically.
- Destination Experts (14) is implemented with expert profiles, city matching, human-in-the-loop
  cases, assignment, response, and traveler case history. UI copy explicitly says experts are not
  emergency responders. Admin/editorial approval and real staffing remain operational prerequisites.
- Staff-only moderation endpoints now review Explorer profiles/submissions, Risk patterns, and
  Expert profiles. Access uses `role=staff` or the configured `STAFF_EMAILS` allowlist; this is an
  API moderation surface, not a finished admin web console.
- Knowledge editorial workflow is now complete: staff can create sources/entities/claims, inspect
  the review queue, publish or reject content, retire sources, and roll claims back to
  `needs_review`; every transition is recorded in `knowledge_moderation_audits`.
- Phase 0 analytics now has a bounded AsyncStorage-backed local event queue in `lib/analytics.ts`;
  remote Sentry/Amplitude export still requires real project credentials and privacy review.
- Trails/Peak foundation is now implemented: `trails`, `trail_waypoints`, `trail_hazards`, and
  `peaks` tables; public preview/published catalog endpoints; staff review for routes, peaks, and
  hazards; offline package manifests cached in SQLite; and geometry-first nearby-peak lookup.
  Seeded Kedarnath and Kuari Pass route lines are explicitly illustrative and not navigation-ready.

## Remaining work in the immediate voice milestone

- ~~Install `services/api/requirements-voice.txt` successfully.~~ Done — `faster-whisper` is
  present in `.venv` (this note was stale; the earlier "installation was interrupted" caveat
  above no longer applies as of this pass).
- ~~Run `alembic upgrade head` and `python -m app.seed` on the actual backend database.~~ Done
  against a local `docker compose up` Postgres/Redis (services/api/docker-compose.yml) — all 5
  migrations applied, KB seeded (9 entities/claims). Note: this was a **fresh local dev DB**, not
  a persistent shared one — whoever runs this next needs `docker compose up -d` first (Docker
  Desktop must already be running) and the containers/volume are only on this machine.
- ~~Start/restart the backend on a LAN-accessible address.~~ Done for this session —
  `uvicorn app.main:app --host 0.0.0.0 --port 8001`, matching `apps/mobile/.env`'s
  `EXPO_PUBLIC_API_BASE_URL=http://192.168.137.1:8001`. Not process-managed — it dies with this
  shell session; needs a real start command (or the run/dev-server skill) for anyone continuing.
- Created `services/api/.env` from `.env.example` for local dev (all defaults except empty
  `OPENROUTER_API_KEY`/`GOOGLE_CLIENT_IDS`/Twilio creds — itinerary generation and Google sign-in
  won't actually produce output until those are set, but nothing crashes without them).
- Confirm the phone's `EXPO_PUBLIC_API_BASE_URL` points to that address — already correct in
  `apps/mobile/.env`, not re-verified against a physical device this pass.
- **Voice STT — now working, root cause of the earlier "hang" found and fixed.** A background
  subagent investigated what earlier looked like a slow first-call model download and found the
  real cause: `services/api/app/config.py`'s `voice_stt_device` defaults to `"auto"`, which makes
  faster-whisper/ctranslate2 try CUDA first — on this machine that fails hard (`Library
  cublas64_12.dll is not found or cannot be loaded`, HTTP 422) instead of falling back to CPU, and
  it fails *after* the model has already downloaded, so it looked identical to a stuck download.
  Fix: added `VOICE_STT_DEVICE=cpu` to `services/api/.env`. After the fix, using `ffmpeg`'s built-in
  `flite` filter to synthesize real speech locally with no phone needed
  (`ffmpeg -f lavfi -i "flite=text='...':voice=kal" -ar 16000 -ac 1 out.wav`), a full round trip
  through `POST /v1/zenny/voice/turn` succeeded in 10.2s: transcript `"Tell me about the Taj
  Mahal."` (faster-whisper "base.en" transcribed it correctly), routed to the `guide` intent,
  returned the correct grounded KB reply with citation. This is a real, repeatable success, not a
  lucky one-off — confirmed at least twice across the investigation.
  - Mic permission, real recording capture, upload, and native TTS playback are implemented in the
    mobile flow; physical-device QA remains before pilot release.
  - `VOICE_STT_DEVICE=cpu` is only in the local `.env` on this machine — whoever sets up a fresh
    environment needs to add it too (or deploy to a machine with working CUDA), or they'll hit the
    same `cublas64_12.dll` error.
- Replace skeleton responses with real tool orchestration:
  - **All done** — compare (transport + stays), trip, guide, payment, services, safety,
    translation, community, buddy all have real tools (see "Backend foundation"). Only
    `chat` remains a graceful fallback by design.
  - ~~Safety, translation, community, buddy — still skeleton, no tool bound.~~ Done in the
    fourth pass; see Backend foundation for details and live tests.
- ~~Add voice interruption/barge-in and a persistent voice session ID after push-to-talk is stable.~~
  Done: the mobile client persists a voice session UUID, the API scopes Redis memory to it, and
  pressing the orb while Zenny speaks stops playback and starts a new turn.

## Still open / not attempted this pass

- ~~**Services → grocery mobile wiring**~~ Done (fourth pass) — see Backend foundation.
- ~~The AND-across-all-search-tokens fragility in `knowledge_service.py`~~ Fixed structurally
  (progressive token relaxation + punctuation stripping) — see Backend foundation.
- **Payment content depth**: only UPI is seeded (2 entities). Cash norms, ATM guidance, and card
  acceptance were researched but not seeded — the ATM/card figures found (e.g. ~₹10,000–20,000
  foreign-card withdrawal caps) came from travel-blog aggregators, not authoritative enough to cite
  as KB claims; would need a better primary source (an actual RBI FAQ page, not a blog) before
  adding those.
- **The app's "endless loading on register" connectivity issue** (physical device / emulator
  reaching the LAN backend) — raised earlier, explicitly deferred by the user, not touched this pass.
  Likely a Windows Firewall inbound-rule issue for port 8001 (unconfirmed — investigation was
  interrupted before reaching a conclusion).
- Grocery `ServiceProviderAdapter` interface still covers 4 of the original provider components;
  porting the remaining external WebView flows requires a separate migration/QA pass.
- Live transport, hotel, grocery-catalog, and payment-provider integrations remain external work;
  current comparison and stay results are deliberately labelled demo-only.

## Remaining external or deliberately held work

- Expand the curated KB to 30–40 corridor places, with editorial review and source URLs.
- Add hybrid keyword + pgvector retrieval once the corpus is larger.
- ~~Build a small admin/editor workflow for claims, sources, review, publish, and rollback.~~
  Done as staff-only API tooling under `/v1/moderation/knowledge`, including immutable audit
  records and explicit claim rollback to `needs_review`; a separate web console is optional.
- Add live provider adapters for transport and opening hours; never treat them as static KB facts.
- Phase 3 camera guide, translator fallback, Guardian incident state, and offline itinerary work are
  implemented; provider configuration and physical-device QA remain before pilot release.
- Configure authorized transport/hotel/grocery/payment providers and require live checks before any
  booking handoff.
- Add full Twilio/Deepgram/ElevenLabs streaming voice bridge after provider credentials and device
  testing are available.
- Add remote Sentry/Amplitude export after project keys and privacy review.
- Trail/Peak preview data and the native MapLibre GeoJSON route layer now exist; licensed map
  tiles/PMTiles, DEM/compass alignment, and field verification remain before navigation-ready
  publishing.
- Feature 17 Carry/Crowdshipping remains intentionally deferred because it requires legal, insurance,
  and partner review.

## Verification already performed

- Backend Python compilation/import checks.
- Offline Alembic migration SQL check through the current migration head, including editorial audit
  records and GPS landmark centroids.
- SQLite smoke tests for Knowledge Base search and published-claim itinerary grounding.
- Mobile TypeScript check.
- Direct Babel transform checks after the Expo dependency fix.
- Live smoke test against a real (local, fresh) Postgres+Redis: register → login → `/v1/agent/message`
  for `compare` (real ranked demo fare), `guide` (regression check, unchanged), and `trip_planning`
  (no-trip case, then post-create-trip case hitting the expected `LLMNotConfiguredError` fallback).
- `tsc --noEmit` and `expo-doctor` clean on `apps/mobile` after the grocery provider port.
- Python `compileall` and mobile `npm run typecheck` clean after the Journey/Social completion pass.
- Added pure unit coverage for stale-event filtering and buddy-score ordering in
  `services/api/tests/test_social_service.py`.
- This pass's parallel push, all against the same local Postgres/Redis: `compare` intent → stay
  search ("cheap hostel in Jaipur", "tell me about Agra hotels") and transport regression check;
  `services` intent item extraction (clean and edge-case inputs); `payment` intent (working phrasing
  + regression check on `guide` after the stopword-list change); `POST /v1/compare/stays/search`
  (normal, budget-level re-ranking, unsupported city, invalid dates); `GET /v1/trips/{id}/timeline`
  (fresh trip → empty days, correct shape); full voice round trip via synthesized speech (10.2s,
  correct transcript + grounded reply). `tsc --noEmit` clean on `apps/mobile` after merging two
  concurrently-edited feature branches' worth of changes (grocery adapter refactor + booking-hub
  timeline) into one working tree.
