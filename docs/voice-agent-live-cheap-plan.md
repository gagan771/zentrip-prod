# Zentrip Cheap Live Companion Plan

This is the alternative to `docs/voice-agent-build-plan.md`.

That document is the **scale path**: self-hosted LiveKit, Pipecat workers, local Whisper, Piper/Kokoro. It is the right architecture for many concurrent calls. It is the wrong next build if the goal is a companion that feels live this month, on the current laptop/hotspot, without a GPU or a TURN fleet.

This document is the **live-now path**: one authenticated WebSocket, paid streaming STT, the existing FastAPI agent, and TTS that starts before the full reply exists.

```text
Expo phone
  -> one WSS (PCM / short audio frames)
  -> FastAPI /v1/zenny/voice/live
  -> Sarvam Saaras realtime (STT + VAD)
  -> existing Agent Gateway (tools, KB, policy)
  -> first-sentence TTS (native now, streaming later)
```

Do **not** use Sarvam Voice Agents or ElevenLabs Conversational AI as Zenny. They own the dialogue. Zenny’s value is the knowledge base, citations, and policy engine.

## Why the current call still does not feel live

The orb can stay red. The pipe is still turn-based:

```text
record file -> wait for pause -> upload m4a -> CPU Whisper -> keyword router -> speak whole reply
```

Measured local round trip through `/v1/zenny/voice/turn` with Whisper was about **10 seconds**. Native phone TTS is not the bottleneck. File STT and waiting for the full answer are.

LiveKit/Pipecat would fix this, but only after: a development build, a media SFU, TURN, worker orchestration, and a local speech GPU. On CPU, self-hosted Whisper stays slow.

## Cost and latency, honestly

Indicative only. Recheck vendor cards before committing spend.

| Path | Time to a live-feeling call | Typical monthly cost at ~100 call-hours | Live feel |
|---|---|---|---|
| Today: Whisper file + expo-speech | already built | ~$0 speech, your GPU/CPU | walkie-talkie |
| Self-hosted LiveKit + Pipecat + Whisper + Piper | weeks | server + TURN + GPU, even with zero users | live, once ops is real |
| **This plan: Sarvam STT stream + existing agent + native TTS** | days | STT usage only (~a few tens of USD at that volume) | live listen, fast first word |
| Then: add Sarvam Bulbul or ElevenLabs Flash stream | extra days | STT + TTS usage | live listen **and** branded voice |

Pay for the one thing the laptop cannot do: **low-latency Indian/Hinglish STT**. Keep everything else you already own.

ElevenLabs as the *brain* is the expensive option. ElevenLabs Flash as *mouth only* is optional phase 2.

## Architecture

### Session

```text
POST /v1/zenny/voice/live/session
-> { sessionId, wsUrl }
```

Auth is the existing JWT. The socket is bound to that user and `sessionId`. Keep Redis transcript memory on the same session key already used by voice turns.

### Socket

One FastAPI WebSocket, `/v1/zenny/voice/live`.

Phone → server (binary):

- 16 kHz mono PCM frames, ~40–60 ms each, or the smallest container Sarvam will accept without a full m4a file.

Phone → server (JSON):

- `{ "type": "barge_in" }`
- `{ "type": "hangup" }`

Server → phone (JSON):

- `{ "type": "partial", "text" }`     // words while the traveller is still talking
- `{ "type": "final", "text" }`        // one utterance
- `{ "type": "status", "phase" }`      // listening | thinking | speaking
- `{ "type": "reply", "text", "intent", "citations", "items" }`
- `{ "type": "speak", "text" }`        // first speakable sentence, then follow-ups
- `{ "type": "error", "message" }`

No LiveKit room. No Pipecat process. No second media port. Hotspot testing works the same way the API already works: `EXPO_PUBLIC_API_BASE_URL` over LAN, then WSS when you have TLS.

### STT

**Default: Sarvam `saaras:v3-realtime` over WebSocket**, from the backend, never from the phone.

Why Sarvam, not Whisper, not ElevenLabs STT:

- Indian English, Hindi, Hinglish, Tamil, and code-mix are the product.
- Realtime partials + server VAD replace the client’s `380 ms` cut.
- Usage pricing beats a GPU that sits on for one developer.

Swap behind `voice-service`: Deepgram Nova streaming is the fallback if Sarvam is down. Keep `faster-whisper` only for the old multipart endpoint and offline/dev without keys.

### Brain

Call the existing `handle_voice_turn` / Agent Gateway. Do not reimplement guide, compare, safety, grocery, or buddy inside a vendor dashboard.

Must-fix in the same pass, because live STT will make these more obvious:

- `"going to"` must not classify as buddy (`agent_intent.py`).
- Replace “I don’t have a specific tool wired” with a short clarification.
- Honor `trip_id` when present.
- Log transcript, intent, tool, latency, and failure. Redact phone/email/payment.

LLM stays OpenRouter, but **pin a tool-capable model**. Do not use random `openrouter/free` as the live-call default — free-router tail latency will undo the STT win.

Stream the model when the path already streams. If the current tool path is still request/response, split the spoken reply into sentences and emit `speak` as soon as the first sentence is ready (`spoken_preview` already exists).

### TTS — two phases

**Phase A (ship live feel, $0 TTS):** keep `expo-speech`. It starts in tens of milliseconds. Play each `speak` event as it arrives. Keep the mic hot. Barge-in already stops speech.

The companion will sound like the phone’s English/Hindi voice. That is acceptable while proving the live loop.

**Phase B (branded Zenny):** stream Sarvam Bulbul for Indic/Hinglish sessions, ElevenLabs Flash for English-only sessions. Same socket, `type: "audio"` frames, play with `expo-audio`. One cloned English voice across companion, translator, and guide.

Do not start Phase B until Phase A barge-in and first-audio latency are good.

### Client

Replace the file-and-pause loop in `lib/zenny-call.ts` with:

1. Open the live socket.
2. Stream mic frames continuously.
3. Show partial transcript on the orb.
4. Speak `speak` events immediately; do not wait for the full card.
5. On barge-in, send `{ "type": "barge_in" }` and stop local TTS. Server cancels in-flight LLM/TTS.
6. If the socket cannot connect, fall back to today’s `POST /v1/zenny/voice/turn`.

Expo may still be file-oriented. If raw PCM is not available without a native module, send **overlapping ~700 ms clips** on the same socket while the previous clip is in flight. That is still far closer to live than waiting for a pause and a 10 s Whisper job. Prefer PCM once a small development build is justified — not LiveKit, just an audio-frame plugin.

Keep the current UI: one tap starts the call, End call hangs up, leaving the tab hangs up.

## What we explicitly skip (for now)

- Self-hosted LiveKit, TURN, Pipecat workers
- Local Piper/Kokoro and Ollama as the live path
- Vendor-hosted “voice agent” products
- Replacing the Agent Gateway
- iOS/web polish before Android feels live

Revisit the LiveKit plan when concurrent calls, telephony bridging, or Expo-Go limitations become the actual blocker. Until then it is extra moving parts.

## Implementation sequence

1. Add `voice-service` streaming adapter for Sarvam realtime (Deepgram-shaped fallback). No mobile change.
2. Add `POST /v1/zenny/voice/live/session` + WebSocket that: accepts frames, forwards to Sarvam, on final transcript calls `handle_voice_turn`, emits `speak` + `reply`.
3. Point `useZennyCall` at the socket. Kill client 380 ms endpointing. Keep native TTS.
4. Cancel server work on barge-in. Ignore backchannels (“okay”, “uh-huh”).
5. Fix intent collisions and the placeholder chat fallback.
6. Feature-flag old vs new. Keep multipart until Android call quality is accepted.
7. Only then: streaming TTS (Bulbul / ElevenLabs Flash).

## Acceptance tests

- Partial transcript appears before the traveller finishes the sentence.
- Time-to-first-spoken-audio under ~1.5 s after they stop, on LAN, excluding cold LLM.
- A ~1 s pause does not split “Tell me about the Taj Mahal.” into two tools.
- Talking over Zenny stops TTS and starts a new utterance.
- “I’m going to Jaipur” is trip/guide, not buddy.
- Missing compare origin/destination asks a question, does not 500.
- Socket drop reconnects or falls back to multipart without a stuck orb.
- No Sarvam/ElevenLabs key on the device.
- Whisper multipart path still works with the flag off.

## Assumptions

- A Sarvam API key is acceptable spend; a speech GPU and TURN cluster are not, yet.
- Existing FastAPI tools remain authoritative.
- Android first.
- Native TTS is a shipping tactic, not the long-term Zenny voice.
- The LiveKit/Pipecat plan remains the graduation path, not the next commit.
