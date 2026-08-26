# Zentrip API (`services/api`)

FastAPI backend for the Zentrip mobile app. Phase 1 scope per `00-engineering-phase-roadmap.md`: auth (email/password + Google), the Agent Gateway skeleton, and AI Trip Planner (itinerary generation grounded in a minimal text-only Knowledge Base).

## Run it locally

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # fill in GOOGLE_CLIENT_IDS / OPENROUTER_API_KEY to enable those features
docker compose up -d          # Postgres + Redis

alembic upgrade head          # create all tables
python -m app.seed            # seed a few Delhi/Agra/Jaipur knowledge entities (corridor MVP cities)

uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok", ...}` (no DB/Redis dependency, so it answers even if those are down — see `00-engineering-phase-roadmap.md`'s reliability tiers).

## What's here

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app, CORS (wide open — dev only), router registration |
| `app/config.py` | Env-driven settings (`pydantic-settings`) |
| `app/db.py` | Async SQLAlchemy engine/session — **Postgres is the single primary DB** (`00-consolidated-tech-stack.md` §1.3) |
| `app/models.py` | Auth, trip/KB, onboarding, and comparison observation/recommendation/outcome models |
| `app/security.py` | Password hashing (bcrypt), JWT access tokens, opaque hashed refresh tokens |
| `app/routers/auth.py` | `/v1/auth/register`, `/login`, `/google`, `/refresh`, `/logout`, `/me` |
| `app/agent_gateway.py` | The Companion's pipeline (Context Builder → Intent Router → Policy Engine → Orchestrator) — see below |
| `app/routers/agent.py` | `/v1/agent/message`, `/v1/agent/session` |
| `app/llm.py` | OpenRouter-free-model/Claude tool-use adapter with Knowledge Base grounding validation |
| `app/routers/trips.py` | `/v1/trips`, `/v1/trips/:id`, `/v1/trips/:id/itinerary`, `/v1/trips/:id/generate-itinerary` |
| `app/twilio_voice.py` | Twilio outbound call adapter and consent/disclosure TwiML flow |
| `app/routers/onboarding.py` | Call initiation, TwiML speech prompts, and provider status webhooks |
| `app/comparison_service.py` | Provider-adapter contract, corridor demo adapters, and deterministic scoring |
| `app/routers/compare.py` | `/v1/compare/search` and recommendation outcome endpoints |
| `app/knowledge_service.py` | Citation-first published-claim retrieval for Guide/Zenny |
| `app/routers/knowledge.py` | `GET /v1/knowledge/search` returns sourced published claims |
| `app/seed.py` | Idempotently seeds cited Delhi/Agra/Jaipur starter knowledge — run with `python -m app.seed` |
| `alembic/` | Migrations (async env, autogenerate-ready) |
| `docker-compose.yml` | Local Postgres 16 + Redis 7 |

## Auth: email/password + Google (not phone/OTP)

This deliberately differs from the phone+OTP direction described in the feature docs' original grocery-app-alignment notes — email/password and Google sign-in were the explicit product decision for this build. Both issue the same JWT access token (15 min TTL) + opaque refresh token (30 days, hashed in DB, rotated on every use) — the mobile app's `lib/api-client.ts` doesn't need to know which method a user signed in with.

**Google sign-in won't work until you set real credentials**: create a "Web application" OAuth client in Google Cloud Console, put its ID in this service's `GOOGLE_CLIENT_IDS` *and* the mobile app's `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` (same value, two places). Until then, `/v1/auth/google` returns `503` with a clear message instead of failing confusingly.

## Agent Gateway skeleton

`app/agent_gateway.py` implements the pipeline from `01-zentrip-companion.md` §6:

```
User → Agent Gateway → Context Builder → Intent Router → Policy Engine → Orchestrator → Response
```

- **Intent Router**: simple keyword classification into `trip_planning` / `compare` / `translation` / `guide` / `services` / `safety` / `community` / `buddy` / `chat`. Deliberately not ML yet — the spec's own ranking philosophy (§47) is rules first, learn later.
- **Policy Engine**: tags each intent as `no_confirmation` / `confirmation` / `strong_verification` per master spec §43.
- **Context Builder**: currently loads user profile fields only. Trip memory (Postgres, per `trip_id`) and long-term preference memory land with the Trip Planner feature (`02-ai-trip-planner.md`) — not built yet.
- **Session memory**: Redis, 2-hour TTL, last 20 turns — the first of the three memory tiers in `01-zentrip-companion.md` §3.
- **Orchestrator**: no real tools (`search_transport`, `open_service`, etc.) are bound yet. Replies acknowledge the classified intent and say so explicitly, so the routing logic is genuinely testable even though nothing real executes yet.

Every response carries a `confidence` field (`"estimated"` for now) — the app-wide provenance-labeling convention from `00-consolidated-tech-stack.md` §4 that the mobile UI already renders.

## AI Trip Planner: itinerary generation

`POST /v1/trips` creates a trip (cities, dates, budget level). `POST /v1/trips/:id/generate-itinerary` then:

1. Loads `KnowledgeEntity` rows matching the trip's cities as candidate places.
2. Calls OpenRouter's `openrouter/free` model router by default (`app/llm.py`) with those candidates and a system prompt that explicitly forbids inventing places/facts not in the candidate list — per master spec §107 ("AI can predict/rank/explain, but live systems must verify").
3. Forces the response through a `return_itinerary` tool call (fixed JSON schema), not free text — nothing to parse-and-hope-for.
4. Replaces any existing `ItineraryDay` rows for the trip and returns them.

**Won't generate anything until you set a key**: create an OpenRouter key and set `OPENROUTER_API_KEY`. Until then this returns `503` with a clear message, same pattern as Google sign-in. Run `python -m app.seed` first so there's grounding data to retrieve — without it, the model is told to produce fewer activities rather than invent any. Direct Claude remains available with `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.

## Knowledge Base: claims and citations

The original `KnowledgeEntity` fact remains as a concise legacy summary. Guide/Zenny retrieval **and itinerary candidates** now use `KnowledgeClaim` rows: each is one publishable fact linked to a `KnowledgeSource`, a source URL, verification state, language, and last-verified date. `GET /v1/knowledge/search?q=Amber%20Fort&city=Jaipur` returns only `published` claims from `active` sources and includes the citation the mobile UI should render.

The seed is editorial content, not a crawler. It currently has a deliberately narrow UNESCO-backed corridor corpus and alternate names such as `Amer Fort`/`Amber Fort`. Facts with no usable source URL are retained as `needs_review` during the migration and cannot be returned by the endpoint. The next data increment is adding reviewed claims—not letting an LLM scrape or invent them. Semantic pgvector retrieval is intentionally deferred until the corpus is larger; exact-name and claim search is easier to audit at this stage.

## Twilio outbound onboarding

`POST /v1/onboarding/calls` accepts an E.164 `phoneNumber` and requires explicit `callConsent: true`. It creates a call only after Twilio and `PUBLIC_BASE_URL` are configured, opens with an AI disclosure, and walks through the Phase 1 onboarding questions using Twilio speech Gather. Status and answer fragments are persisted in `OnboardingCall`; recording is not enabled and `recordingConsent` defaults to false. Once `TWILIO_AUTH_TOKEN` is set, callbacks require Twilio's `X-Twilio-Signature`.

For local testing, expose the API through an HTTPS tunnel and set `PUBLIC_BASE_URL` to that URL. The current Gather flow is the provider seam; Deepgram/ElevenLabs Media Streams or ConversationRelay can replace it in the next voice increment without changing the outbound-call endpoint.

## Compare / Decision Engine (Phase 2 start)

`POST /v1/compare/search` accepts `origin`, `destination`, `departureDate`, and `budgetLevel`. It normalizes provider results, stores a `ProviderObservation` per result, applies deterministic traveler-segment weights, and returns ranked, explainable `Recommendation` rows. `POST /v1/compare/recommendations/:id/outcomes` records `opened`, `selected`, `booked`, or `dismissed` feedback for later evaluation.

The first adapters are intentionally limited to Delhi–Agra–Jaipur **demo** rail and coach results. Every response is marked `isDemoData: true`, `freshness: "estimated"`, `bookable: false`, and `liveCheckRequired: true`; no fare or availability is represented as live until an authorized provider adapter is connected.

## Next steps (Phase 1/2, not done here)

- Bind the Compare endpoint and other real tools to the Companion's Orchestrator (`app/agent_gateway.py`) instead of only classifying the intent.
- Replace demo comparison adapters with authorized provider/partner adapters and require a fresh live check before every booking handoff.
- `DestinationStay` / booking tables land with `04-journey-booking-hub.md` — not built yet.
- Swap the CORS wildcard and `JWT_SECRET` dev default before this touches anything but localhost.
