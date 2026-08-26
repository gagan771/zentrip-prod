# Zentrip — Mobile (Expo Go starter)

This is the starting point for Zentrip's single Android+iOS app. It's a working Expo Router shell with the app-wide dependencies from `00-consolidated-tech-stack.md` installed and wired — no feature logic yet. Full context: `D:\A16Z\zentrip-feature-specs\`.

## Run it

```bash
npm install       # already done if you just cloned this from the scaffold step
npx expo start
```

To call the local FastAPI backend, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` for your target:

- Android emulator: `http://10.0.2.2:8000`
- Physical phone: `http://<your-computer-LAN-IP>:8000`, with the backend started using `--host 0.0.0.0`
- Web: `http://localhost:8000`

Scan the QR code with **Expo Go** (iOS/Android) or press `a`/`i` for a simulator. Everything installed so far runs in plain Expo Go — no dev client / custom native build required yet (see "What's deliberately not here yet" below for when that changes).

## Why Expo SDK 54, not the latest SDK

This project is pinned to **Expo SDK 54** (`expo ~54.0.33`, `react-native 0.81.5`, `react 19.1.0`) to exactly match `D:\namak-fnfinal\kmkb-mobile-app` — the existing grocery app this project absorbs in Phase 2 (`05-india-services-layer-grocery-integration.md`). Do not run `expo upgrade` without updating that plan first; see `AGENTS.md`.

## What's installed and why

Full rationale for every dependency lives in `00-consolidated-tech-stack.md` §1.1. Summary:

| Package | Purpose |
|---|---|
| `expo-router` | File-based navigation — see "Routing" below |
| `zustand` (+ AsyncStorage persist) | Client/session state — `store/useStore.ts` |
| `@tanstack/react-query` | All server data fetching/caching — wired in `app/_layout.tsx` |
| `expo-secure-store` | Encrypted JWT storage (not AsyncStorage — tokens need the keychain/keystore) |
| `expo-audio` | Voice capture for the Companion, Translator, onboarding call playback |
| `expo-camera` | Landmark ID (Guide), peak ID |
| `expo-location`, `expo-sensors` | GPS + orientation for Guide/Trails/Guardian |
| `expo-sqlite` | Offline-first storage for itinerary/trail/emergency data |
| `expo-notifications` | Push (local notifications work in Expo Go; remote push needs a dev client — see below) |
| `expo-web-browser` | System-browser hand-off for bookings, grocery checkout, payment auth |
| `expo-apple-authentication` | Sign in with Apple |
| `react-native-reanimated` + `react-native-worklets` + `react-native-gesture-handler` | Onboarding swipe cards, general animation |

`lib/api-client.ts` is the one fetch wrapper every feature should use — it already implements JWT access/refresh with tokens in SecureStore, mirroring the pattern in `kmkb-mobile-app/frontend/utils/api.ts` so Phase 2's absorption doesn't mean maintaining two auth systems.

## What's deliberately not here yet

- **MapLibre + PMTiles** (Trails, Phase 5) and **WatermelonDB** — both need custom native code, which means `expo-dev-client`, not plain Expo Go. Don't add these until Phase 5 actually starts, or the whole app stops running in Expo Go for everyone on the team.
- **Sentry / Amplitude** — both need real project keys and a setup wizard; wiring them with placeholder keys would be worse than not wiring them. Add during Phase 0's remaining infra work once real keys exist.
- **Twilio / Deepgram / ElevenLabs SDKs** — these are backend-only (the onboarding call and STT/TTS run server-side in `voice-service`; see `01-zentrip-companion.md` and `02-ai-trip-planner.md`). Nothing to install client-side beyond the audio capture/playback already here.
- **A backend** — this repo is the mobile app only. `EXPO_PUBLIC_API_BASE_URL` in `.env` should point at whatever BFF/Agent Gateway you run locally (see `00-app-shell-and-integration-architecture.md`).

## Routing

```
app/
├── _layout.tsx              # root: providers (Query, gesture handler, safe area) + Stack
├── (tabs)/                  # primary surfaces — an actual tab bar
│   ├── _layout.tsx
│   ├── index.tsx             # 01 Companion
│   ├── trip.tsx               # 02 Trip Planner / 04 Booking Hub
│   ├── compare.tsx            # 03 Compare
│   ├── guide.tsx               # 06 Translator / 07 Cultural Guide
│   ├── guardian.tsx            # 15 Guardian — real tel: actions, not a placeholder
│   └── more.tsx                 # links to the V2/V3 features below
├── services/grocery/index.tsx  # 05 Services layer (grocery absorption)
├── community/index.tsx          # 08 Destination Community
├── buddy/index.tsx               # 10 Travel Buddy
└── trails/index.tsx               # 11 Trails
```

One deliberate deviation from `00-app-shell-and-integration-architecture.md`'s illustrative folder diagram: that doc shows all nine feature areas as sibling `(parenthesized)` route groups. Taken literally, Expo Router would resolve every one of those groups' `index.tsx` to the same top-level path and collide. The real pattern used here: **`(tabs)` is the only route group**, holding the primary tab bar; the four not-yet-tabbed features (V2/V3 per the roadmap) are plain nested routes pushed from "More." Same intent (route groups per feature area, tabs for the top-level surfaces from the stack table), valid Expo Router structure.

Each feature screen currently renders `<FeaturePlaceholder />` (`components/FeaturePlaceholder.tsx`) except Guardian, which ships its two real emergency-dialer actions immediately — per `15-zentrip-guardian-safety.md`, safety actions must never be buried behind placeholder or loading UI, even in a starter.

## Next steps

Build order is not "whatever's convenient" — follow `00-engineering-phase-roadmap.md`. Phase 1 (next) replaces the Companion and Trip placeholders with the real Agent Gateway wiring and onboarding flow.
