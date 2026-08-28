# Zentrip voice agent (LiveKit spec)

This is the stack in `docs/voice-agent-build-spec.md`.

```text
Expo dev build → LiveKit WebRTC → Deepgram Nova-3 → OpenRouter → Deepgram TTS → phone
```

Zentrip owns prompts, tools, and knowledge. Deepgram and OpenRouter are speech and language APIs. **Do not** put those keys in the Expo app. Expo Go cannot run this path.

## Local bring-up

1. Copy `.env.example` to `.env` and set `DEEPGRAM_API_KEY`, `OPENROUTER_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. The LLM default is a free OpenRouter model (`nvidia/nemotron-3.5-lightning:free`), not GPT.
2. Put the same LiveKit key/secret in `livekit.yaml`.
3. `docker compose up --build`
4. On FastAPI, set `LIVEKIT_URL` (LiveKit Cloud `wss://…` or the LAN URL the device dials), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
5. Browser test (no Expo): open `http://127.0.0.1:8001/v1/zenny/voice/call` (or `:8000` if that is how you run the API), sign in, Start call. The agent worker must be running. Use localhost — browsers block the microphone on plain `http://192.168…`.
6. Phone: `npx expo run:android` from `apps/mobile`, then Companion → Zenny. Expo Go cannot run this path.

Lexical RAG works without embeddings. Optional: set `EMBEDDING_MODEL` and run `scripts/ingest.sh`.

## What the phone does

`POST /v1/zenny/voice/token` (JWT) → join LiveKit room → publish mic → play agent audio.

If LiveKit native modules are missing (Expo Go), Companion keeps tap-to-talk on `/v1/zenny/voice/turn`.
