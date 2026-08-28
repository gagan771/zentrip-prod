# Zenny on Sarvam Voice Agents

Yes: we can run Zenny as a **Sarvam Voice Agent** with this repo’s knowledge uploaded as a knowledge base, and a live search tool for anything that must stay in Postgres.

## Architecture

```
Phone (Expo Go, expo-audio) → Zentrip API proxy → Sarvam Voice Agent
Sarvam STT → LLM + KB search (+ optional HTTPS tool to /v1/knowledge/search) → Sarvam TTS → phone
```

Sarvam owns listen / think / speak. Our files own the facts.

## 1. Create the agent (you, in the browser)

1. Open [indus.sarvam.ai/samvaad](https://indus.sarvam.ai/samvaad) → **Voice Agents**.
2. Create an agent named **Zenny**.
3. Paste `AGENT_PROMPT.md` into the agent instructions / persona.
4. **Knowledge base** → New KB:
   - Name: `Zenny India knowledge`
   - Description: `Sourced facts on Indian monuments (especially Delhi, Agra, Jaipur), travel seasons, typical routes, food districts, UPI and cash. Use this for any place, history, or payment question.`
   - Upload every file in the `kb/` folder (after you generate them).
5. Wait until ingestion shows ready, then attach the KB in the agent **Settings**.
6. Optional **API tool** (keeps answers in sync with the database):
   - Method `GET`
   - URL `https://YOUR_PUBLIC_API/v1/knowledge/search?q={{query}}`
   - Description: `Search Zentrip published claims when the traveller names a place or asks a factual India travel question.`
   The API must be on the public internet (Railway / tunnel). localhost will not work from Sarvam.
7. Test in Sarvam’s **Test agent** using `TEST_CASES.md` (those runs **consume credits**), then copy the **app id**.

## 2. Generate the KB files

From `zentrip/services/api`:

```bash
python -m scripts.export_sarvam_knowledge
```

Files land in `docs/sarvam-zenny-agent/kb/`.

## 3. Add the agent to Expo Go

**Do not** put the Sarvam API key, widget, or `sarvam-conv-ai-sdk` in the Expo app. Expo Go cannot load that SDK (`react-native-audio-api` is a custom native module). The meadow tab already records with `expo-audio` and speaks with `expo-speech`. The agent lives on Sarvam; the Zentrip API is the proxy.

```
Expo Go Companion
  tap Zenny → record clip (expo-audio)
       ↓  POST /v1/zenny/voice/turn  (JWT, never a Sarvam key)
Zentrip API
  transcribe → Sarvam Voice Agent (your prompt + KB)
       ↓  spoken text
Expo Go
  expo-speech plays the reply
```

That is tap-talk-tap, same as today. True duplex (Sarvam hears you while she talks) needs a **dev build** later, not Expo Go.

### What you copy from Sarvam

In the agent: **Deploy with Code** / **Embed** / Settings. You need four values (names vary slightly in the UI):

| Env var | Where it is |
| --- | --- |
| `SARVAM_API_KEY` | Sarvam dashboard API key (already used for STT if set) |
| `SARVAM_VOICE_APP_ID` | Agent **app id** |
| `SARVAM_VOICE_ORG_ID` | Organization id |
| `SARVAM_VOICE_WORKSPACE_ID` | Workspace id (often `default`) |

The agent must have a **committed / published version**. A draft-only agent will fail to connect.

### What you put where

**API** `services/api/.env` (never commit, never paste into the phone):

```
SARVAM_API_KEY=sk_...
SARVAM_VOICE_APP_ID=...
SARVAM_VOICE_ORG_ID=...
SARVAM_VOICE_WORKSPACE_ID=...
```

**Expo Go** — nothing new. Same Companion tab, same `EXPO_PUBLIC_API_URL` pointing at your running API. Sign in (guests cannot call Zenny).

### After the env is set

Restart the API. Tap Zenny on Companion: talk, tap again. Answers should come from the Sarvam agent (Taj / 112 / UPI behaviour you tested in Test agent), not the old OpenRouter gateway.

If those four env vars are missing, Companion still uses the existing Zentrip `handle_voice_turn` path.

Send the three ids (app / org / workspace) when you have them — not the API key — and we can finish the API proxy if it is not live yet.

## 4. Low latency (must leave Expo Go)

Tap-talk-tap cannot feel like Sarvam’s Test agent. Test agent streams **16 kHz PCM** in and TTS out over one WebSocket. Expo Go can only record a **file** and play **expo-speech**, so you always wait for the whole utterance plus a second hop.

Low-latency path:

```
Dev build (not Expo Go)
  20 ms PCM mic  →  signed Sarvam Voice Agent WebSocket  →  TTS PCM speaker
```

Zentrip API only **mints a short-lived session** (your JWT in, Sarvam key never on the phone). Audio does **not** go through OpenRouter or Whisper.

| Path | First spoken word | Expo Go |
| --- | --- | --- |
| Current tap → file → `/voice/turn` → phone TTS | ~2–10 s | Yes |
| File clip → Sarvam **text** chat → phone TTS | ~1.5–4 s | Yes |
| **PCM stream → Sarvam Voice Agent** (same as Test agent) | ~0.3–1 s | **No** |

### What you do on the phone

Once, from `zentrip/apps/mobile` (USB debugging on, Android Studio or Xcode installed):

```bash
npx expo run:android
# or: npx expo run:ios
```

That installs a **dev client** that includes `expo-stream-audio` (already in the app; Expo Go does not ship it). After that, `npx expo start --dev-client` — not Expo Go.

Do **not** put `sarvam-conv-ai-sdk` or the API key in the app. The meadow UI stays; only the audio pipe changes.

### What still has to be in `.env`

Same four Sarvam Voice Agent vars as section 3, plus a **committed** agent version.

Then we wire: `POST /v1/zenny/voice/agent/session` → phone opens the signed socket and pumps PCM (code already sketched in `lib/pcm-stream.ts`).

## What stays in Zentrip vs Sarvam

| In Sarvam KB files | Better as a live tool |
|---|---|
| Monument history, UNESCO facts | Trip planner / bookings |
| City primers, seasons, food districts | Live IRCTC / hotel prices |
| UPI / cash explainers | Grocery handoff |
| 112 emergency line (also in the prompt) | User-specific trip memory |
