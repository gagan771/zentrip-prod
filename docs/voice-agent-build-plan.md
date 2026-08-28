# Zentrip Open-Source Voice Agent Build Plan

## Summary

Replace the current upload-based voice loop with a hybrid, open-source architecture:

```text
Expo phone
  -> WebRTC
  -> self-hosted LiveKit
  -> Pipecat voice agent
  -> local STT/VAD
  -> OpenRouter LLM with tool calling
  -> existing FastAPI tools
  -> streaming TTS
```

Pipecat provides the open-source voice pipeline. Self-hosted LiveKit provides scalable real-time media. OpenRouter remains the configurable LLM layer. Pipecat is an open-source Python framework for real-time voice agents, and LiveKit supports self-hosted, multi-node deployments.

References:

- https://github.com/pipecat-ai/pipecat
- https://docs.pipecat.ai/pipecat/learn/transports
- https://docs.livekit.io/transport/self-hosting/
- https://docs.livekit.io/deploy/custom/deployments/
- https://openrouter.ai/docs/guides/features/tool-calling

## Current-State Audit

The current path is:

```text
Phone recorder -> local metering -> multipart audio upload -> faster-whisper
-> keyword intent router -> deterministic tool -> native phone TTS
```

Known issues to address:

- `380 ms` endpointing splits natural speech into fragments.
- Broad substring keywords, such as `going to`, cause false intent matches.
- Unknown requests return the placeholder “specific tool wired” response.
- There is no streaming audio path or semantic turn detection.
- Whisper warmup errors are silently swallowed.
- Voice logs lack transcript, intent, latency, and failure diagnostics.
- The client hardcodes `audio/m4a`, including when the recording is WebM.
- `trip_id` is accepted but ignored.

## Target Services

- `apps/mobile`: LiveKit client, microphone publication, agent audio playback, transcript UI, reconnect state, and interruption UI.
- `services/voice-agent`: Pipecat pipeline and agent worker processes.
- `services/api`: Authentication, session authorization, database, Redis, and authoritative business tools.
- `infra/livekit`: Self-hosted LiveKit configuration for development and production.

The voice agent must call existing FastAPI business tools through typed internal clients. It must not duplicate trip, guide, compare, payment, safety, translation, grocery, or buddy logic.

## API Contracts

Add a short-lived session-token endpoint:

```text
POST /v1/zenny/voice/session
```

Response:

```json
{
  "roomName": "zenny-user-session",
  "participantToken": "...",
  "livekitUrl": "wss://...",
  "sessionId": "..."
}
```

Internal typed tools:

```text
search_knowledge(query, city?)
compare_routes(origin, destination, budget_level?)
search_stays(city, budget_level?)
get_trip_context(user_id)
get_safety_guidance(query)
translate_phrase(text, language)
find_services(items)
```

Each tool requires authorization, validated input, timeout, cancellation behavior, structured errors, and provenance/confidence metadata.

Keep `/v1/zenny/voice/turn` temporarily as the compatibility fallback while the WebRTC path is rolled out.

## Model and Provider Strategy

- VAD and endpointing: Pipecat-compatible local VAD plus semantic turn analysis where available.
- STT: local `faster-whisper`, initially `base.en`; add a multilingual model separately.
- LLM: OpenRouter through the existing provider abstraction.
- Development model: a pinned tool-capable OpenRouter `:free` model.
- Production model: a pinned model with provider fallback; do not use random `openrouter/free` routing as the production default.
- TTS: streaming local Piper/Kokoro adapter, with native phone TTS as fallback.
- Local LLM option: Ollama/vLLM behind the same provider interface.

OpenRouter supports OpenAI-compatible streaming and standardized tool calling. Free models have variable availability, rate limits, and latency, so model capability checks and fallback handling are required.

## Conversation Behavior

- Use LLM tool selection for natural-language requests.
- Preserve deterministic safety and payment rules.
- Never invent live fares, availability, bookings, or citations.
- Ask a clarification question when required tool arguments are missing.
- Keep the last 20 turns in Redis.
- Include `sessionId`, `turnId`, and `traceId` in every event.
- Cancel in-flight STT, LLM, tool, and TTS work on barge-in.
- Ignore short backchannels such as “okay” and “uh-huh”.
- Replace the placeholder fallback with a useful clarification or supported-capability response.

## Mobile Migration

Replace the manual recorder loop with:

- LiveKit room connection.
- Microphone publication.
- Agent audio subscription.
- Server-driven speech-start and speech-end events.
- Interruption and reconnect handling.
- Visible transcript, tool, and connection status.
- Fallback to the multipart endpoint when WebRTC cannot connect.

The Expo app may require a development build if the LiveKit React Native client uses native modules.

## Reliability, Security, and Scaling

- Run stateless Pipecat workers; keep durable state in Redis/Postgres.
- Assign one call/job to one worker process.
- Add JSON logs for connection, transcript, intent, tool, latency, and failure events.
- Redact email, phone, payment, and identity data from logs.
- Add metrics for time-to-first-transcript, time-to-first-audio, endpoint delay, interruption latency, active calls, and provider failures.
- Add readiness checks for LiveKit, Redis, database, STT, TTS, and OpenRouter.
- Use bounded audio buffers, request timeouts, retries, and worker draining.
- Use self-hosted LiveKit with Redis and multiple agent workers for production scale.
- Require HTTPS/WSS, TURN, authentication, and a publicly reachable LiveKit deployment outside the local hotspot.

## Implementation Sequence

1. Add shared typed tool schemas and provider interfaces without changing the mobile flow.
2. Build a local Pipecat agent using self-contained WebRTC transport.
3. Complete one path: voice -> guide tool -> streamed response.
4. Add self-hosted LiveKit and FastAPI token issuance.
5. Migrate the Expo companion screen.
6. Port compare, trips, payment, safety, translation, services, and buddy tools.
7. Add OpenRouter structured tool calling, model capability checks, and fallback routing.
8. Add interruption cancellation, reconnection, observability, and rate limits.
9. Run old and new paths behind a feature flag.
10. Switch the new path to default and deprecate multipart voice after validation.

## Acceptance Tests

- Complete sentences remain one turn instead of becoming fragments.
- Pauses near one second do not prematurely close a turn.
- Genuine barge-in stops TTS promptly.
- Brief acknowledgments do not unnecessarily interrupt the agent.
- Guide, compare, stays, safety, payment, translation, services, and buddy requests invoke the correct tools.
- “I’m going to Jaipur” does not incorrectly invoke Buddy matching.
- Missing route locations produce clarification instead of an internal error.
- Unsupported OpenRouter models are rejected or replaced before a call starts.
- OpenRouter rate limits and provider failures produce graceful fallback behavior.
- WebRTC reconnects after temporary Wi-Fi loss.
- Worker restarts do not corrupt sessions.
- Multiple calls distribute across workers.
- The legacy multipart endpoint remains functional during migration.

## Assumptions

- Hybrid is the selected strategy: open-source/self-hosted voice infrastructure with OpenRouter as the optional LLM gateway.
- Open-source software has no mandatory license fee; compute, bandwidth, TURN, and optional hosted-model usage remain deployment costs.
- Existing FastAPI tools and database models remain authoritative.
- Android is the first mobile target; iOS and web follow after Android validation.
- Local hotspot testing remains supported for the legacy API path.
