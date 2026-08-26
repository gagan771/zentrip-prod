# Zentrip Project Memory

Updated: 2026-08-26 (third same-day pass — parallel multi-agent push: search_stays wired into
Companion, services→grocery hand-off, Payment Assistance, Journey/Booking Hub timeline, grocery
ServiceProviderAdapter refactor, and the voice pipeline's first successful end-to-end run)

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
    live-verified working now. **Known remaining limitation**: this is a stopword patch, not a fix
    to the underlying AND-across-all-tokens fragility — a differently-phrased query ("can foreign
    travelers use UPI") still fails because "use" isn't a stopword and doesn't appear in the seeded
    claim text. A real fix would relax matching to "most tokens" rather than "all tokens," which
    wasn't done this pass (bigger behavioral change to a shared, already-relied-on function; out of
    scope for a payment-content pass).
  - Live-verified: "how do I pay with UPI here" → correct grounded answer with 2 citations; "tell
    me about the Taj Mahal" still works unchanged (regression check on the stopword-list change).
- `services` intent now does real (heuristic, not LLM) item extraction instead of returning skeleton
  text — closes the backend half of "grocery hand-off triggered by natural language":
  - `app/agent_gateway.py`: `_extract_service_items()` strips a known lead-in phrase ("I need ", "can
    you get me ", etc.) then splits on and/,/&. `AgentReply` gained an `items: list[str]` field
    (empty for every intent except `services`), threaded through `AgentMessageResponse`
    (`routers/agent.py`) and `ZennyVoiceTurnResponse` (`schemas.py`/`routers/zenny_voice.py`) so both
    the text-chat and voice paths expose it.
  - Live-verified: "I need toothpaste and a USB-C charger" → `items: ["toothpaste", "usb-c
    charger"]` with a reply naming all 4 ported grocery providers. Known heuristic limitation (by
    design, documented in the function's docstring): "I need to buy something" extracts `["something"]`
    — it's pattern-matching, not real NLU, same "start with rules" philosophy as `find_known_locations`.
  - **Not done**: the mobile Companion screen doesn't consume `items` yet — no deep-link from a
    services-intent reply into `app/services/grocery/index.tsx` pre-filled with the parsed items.
    Deliberately scoped out of this pass to avoid a mobile-file conflict with the concurrent grocery
    adapter refactor (see Mobile section below) — natural next step once picked back up.

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
  list) wired to all 4 buttons. Added `lib/theme.ts`, `lib/webview-geolocation.ts`, `lib/analytics.ts`
  (stub — no analytics SDK wired yet), `lib/grocery-api.ts` (session-save calls against
  `/v1/grocery/<provider>/sessions`, which does not exist on this backend yet — every call site
  already treats save-session as fire-and-forget, so this fails silently until that route exists).
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

`POST /v1/zenny/voice/turn` (upload → transcribe → Agent Gateway → grounded reply) has now been
verified working end to end **on the backend, from a synthesized WAV, for the first time in this
project** — see "Voice STT — now working" below for exactly what was and wasn't tested. The
remaining gap is specifically the **phone side**: mic permission, recording capture, upload from a
real device, and native TTS playback have never been exercised. Everything upstream of that (the
backend pipeline itself) is confirmed functional.

The Agent Gateway now has real tools for `guide`, `payment`, `compare` (transport + stays),
`trip_planning`, and `services` (item extraction). Still skeleton: `safety`, `translation`,
`community`, `buddy`. OpenRouter remains required (and its API key still unset in this local `.env`)
for itinerary generation specifically — everything else works without it.

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
  - **Still not done**: mic permission, real recording capture, and upload from an actual phone;
    native TTS playback of the response on-device. The backend pipeline itself is now confirmed
    working — what's left is specifically the client-device half.
  - `VOICE_STT_DEVICE=cpu` is only in the local `.env` on this machine — whoever sets up a fresh
    environment needs to add it too (or deploy to a machine with working CUDA), or they'll hit the
    same `cublas64_12.dll` error.
- Replace skeleton responses with real tool orchestration:
  - Compare (transport + stays), Trip, Guide, Payment, Services (item extraction) — **done**, see
    "Backend foundation" above.
  - Safety, translation, community, buddy — still skeleton, no tool bound.
- Add voice interruption/barge-in and a persistent voice session ID after push-to-talk
  is stable.

## Still open / not attempted this pass

- **Services → grocery mobile wiring**: backend parses items and returns them (`AgentReply.items`),
  but no mobile screen consumes that yet — no deep-link from a Companion reply into
  `app/services/grocery/index.tsx` pre-filled with the parsed items.
- **Payment content depth**: only UPI is seeded (2 entities). Cash norms, ATM guidance, and card
  acceptance were researched but not seeded — the ATM/card figures found (e.g. ~₹10,000–20,000
  foreign-card withdrawal caps) came from travel-blog aggregators, not authoritative enough to cite
  as KB claims; would need a better primary source (an actual RBI FAQ page, not a blog) before
  adding those.
- **The app's "endless loading on register" connectivity issue** (physical device / emulator
  reaching the LAN backend) — raised earlier, explicitly deferred by the user, not touched this pass.
  Likely a Windows Firewall inbound-rule issue for port 8001 (unconfirmed — investigation was
  interrupted before reaching a conclusion).
- Grocery `ServiceProviderAdapter` interface covers 4 of 12 original kmkb-mobile-app providers; the
  remaining 8 (DMart, JioMart, BigBasket, Milkbasket, Nature's Basket, Spencer's, Healthy Buddha,
  Licious, FreshToHome) were never ported.
- The AND-across-all-search-tokens fragility in `knowledge_service.py` (see Payment Assistance
  above) — patched for the one phrasing that mattered, not fixed structurally.

## Later roadmap

- Expand the curated KB to 30–40 corridor places, with editorial review and source URLs.
- Add hybrid keyword + pgvector retrieval once the corpus is larger.
- Build a small admin/editor workflow for claims, sources, review, publish, and rollback.
- Add live provider adapters for transport and opening hours; never treat them as static KB facts.
- Add camera-based landmark identification in Phase 3.
- Add full Twilio real-time voice bridge after the push-to-talk voice loop works.
- Add Guardian safety workflows, offline itinerary, community, trails, and expert verification
  according to the roadmap.

## Verification already performed

- Backend Python compilation/import checks.
- Offline Alembic migration SQL check through the new KB migration.
- SQLite smoke tests for Knowledge Base search and published-claim itinerary grounding.
- Mobile TypeScript check.
- Direct Babel transform checks after the Expo dependency fix.
- Live smoke test against a real (local, fresh) Postgres+Redis: register → login → `/v1/agent/message`
  for `compare` (real ranked demo fare), `guide` (regression check, unchanged), and `trip_planning`
  (no-trip case, then post-create-trip case hitting the expected `LLMNotConfiguredError` fallback).
- `tsc --noEmit` and `expo-doctor` clean on `apps/mobile` after the grocery provider port.
- This pass's parallel push, all against the same local Postgres/Redis: `compare` intent → stay
  search ("cheap hostel in Jaipur", "tell me about Agra hotels") and transport regression check;
  `services` intent item extraction (clean and edge-case inputs); `payment` intent (working phrasing
  + regression check on `guide` after the stopword-list change); `POST /v1/compare/stays/search`
  (normal, budget-level re-ranking, unsupported city, invalid dates); `GET /v1/trips/{id}/timeline`
  (fresh trip → empty days, correct shape); full voice round trip via synthesized speech (10.2s,
  correct transcript + grounded reply). `tsc --noEmit` clean on `apps/mobile` after merging two
  concurrently-edited feature branches' worth of changes (grocery adapter refactor + booking-hub
  timeline) into one working tree.
