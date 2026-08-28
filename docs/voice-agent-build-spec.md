# Real-Time Voice Agent Build Spec

## 1. Goal

Build a low-latency, multilingual, production-ready voice agent that can be integrated into an Expo-based mobile app.

The agent should:

- Accept real-time microphone audio from the mobile app.
- Stream audio using LiveKit/WebRTC.
- Transcribe speech using Deepgram Nova-3.
- Search a private knowledge base when needed.
- Generate responses using an LLM through OpenRouter.
- Convert the response to speech using Deepgram Aura-1.
- Stream audio back to the user through LiveKit.
- Support interruptions/barge-in so the user can speak while the AI is talking.
- Keep infrastructure cost very low by running orchestration, RAG, LiveKit, Redis, and Qdrant on an Oracle Cloud Ampere A1 free-tier VM.

---

## 2. Final Architecture

```text
Expo Mobile App
      │
      │ WebRTC microphone/audio
      ▼
LiveKit Server
Oracle Ampere A1
      │
      ▼
LiveKit Voice Agent
      │
      ├── Deepgram Nova-3 Streaming STT
      │
      ├── RAG / Tool Router
      │       │
      │       └── Qdrant Knowledge Base
      │
      ├── OpenRouter LLM
      │
      └── Deepgram Aura-1 Streaming TTS
              │
              ▼
          LiveKit
              │
              ▼
        Expo Mobile App
```

Oracle acts primarily as the **control/orchestration layer** rather than running heavy AI inference locally.

---

## 3. Technology Stack

### Mobile

- Expo / React Native
- Expo Development Build / `expo-dev-client`
- LiveKit React Native SDK

> Standard Expo Go is not enough for LiveKit WebRTC because native modules are required.

### Real-Time Transport

- LiveKit Server
- WebRTC
- LiveKit Agents

### Speech-to-Text

- Deepgram Nova-3
- Streaming transcription
- Multilingual model if required

### LLM

- OpenRouter
- OpenAI-compatible streaming API
- Fast/cheap model as the default
- Optional fallback model for complex requests

### Text-to-Speech

- Deepgram Aura-1
- Streaming TTS

### Knowledge Base / RAG

- Qdrant
- Markdown/JSON/DB content ingestion
- Small embedding model or embedding API
- Retrieval exposed to the LLM as a tool

### Infrastructure

- Oracle Cloud Ampere A1 ARM64
- Ubuntu 24.04
- Docker / Docker Compose
- Redis
- Caddy or Nginx

---

## 4. Oracle Server Responsibilities

Run the following services on the Oracle VM:

```text
Oracle Ampere A1
│
├── LiveKit Server
├── Redis
├── Voice Agent Service
├── Qdrant
├── RAG Service
├── Token/API Service
└── Caddy / Nginx
```

Do **not** run the main STT, LLM, or TTS inference on the Oracle VM.

Those remain external:

```text
STT → Deepgram
LLM → OpenRouter
TTS → Deepgram
```

This avoids CPU contention on the Ampere instance and keeps response latency low.

---

## 5. Recommended Repository Structure

```text
voice-platform/
│
├── docker-compose.yml
├── .env
├── livekit.yaml
├── Caddyfile
│
├── agent/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   │
│   ├── config/
│   │   └── settings.py
│   │
│   ├── llm/
│   │   └── openrouter.py
│   │
│   ├── rag/
│   │   ├── ingest.py
│   │   ├── retriever.py
│   │   ├── embeddings.py
│   │   └── schemas.py
│   │
│   ├── tools/
│   │   ├── search_knowledge.py
│   │   ├── search_places.py
│   │   ├── booking.py
│   │   └── emergency.py
│   │
│   ├── prompts/
│   │   └── system.md
│   │
│   └── api/
│       └── tokens.py
│
├── knowledge/
│   ├── faq.md
│   ├── product.md
│   ├── policies.md
│   ├── destinations.md
│   └── safety.md
│
└── scripts/
    ├── deploy.sh
    ├── ingest.sh
    └── healthcheck.sh
```

Expo project:

```text
mobile/
│
├── app/
├── src/
│   ├── voice/
│   │   ├── VoiceScreen.tsx
│   │   ├── useVoiceAgent.ts
│   │   ├── livekit.ts
│   │   └── types.ts
│   │
│   └── api/
│       └── voice.ts
│
└── app.json
```

---

## 6. Environment Variables

Example `.env`:

```env
# LiveKit
LIVEKIT_URL=wss://voice.example.com
LIVEKIT_API_KEY=replace_me
LIVEKIT_API_SECRET=replace_me

# Deepgram
DEEPGRAM_API_KEY=replace_me
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_MODEL=aura-1

# OpenRouter
OPENROUTER_API_KEY=replace_me
OPENROUTER_MODEL=replace_with_fast_model
OPENROUTER_FALLBACK_MODEL=replace_with_stronger_model

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=knowledge

# Redis
REDIS_URL=redis://redis:6379

# API
API_BASE_URL=https://api.example.com

# Agent
MAX_HISTORY_TURNS=6
RAG_TOP_K=4
```

Never expose these secrets in the Expo bundle:

- `LIVEKIT_API_SECRET`
- `DEEPGRAM_API_KEY`
- `OPENROUTER_API_KEY`

Only short-lived LiveKit participant tokens should reach the mobile client.

---

## 7. Docker Compose

Starter configuration:

```yaml
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    ports:
      - "7880:7880"
      - "7881:7881"
      - "50000-50100:50000-50100/udp"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - ./data/qdrant:/qdrant/storage
    restart: unless-stopped

  agent:
    build: ./agent
    env_file:
      - .env
    depends_on:
      - livekit
      - redis
      - qdrant
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data/caddy:/data
    restart: unless-stopped
```

Do not expose Qdrant or Redis publicly unless required.

---

## 8. LiveKit Configuration

Example `livekit.yaml`:

```yaml
port: 7880

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true

redis:
  address: redis:6379

keys:
  YOUR_LIVEKIT_API_KEY: YOUR_LIVEKIT_API_SECRET
```

Store real credentials outside source control.

---

## 9. Voice Session Flow

### Session startup

```text
1. User opens Voice screen.
2. Expo calls POST /voice/token.
3. Oracle backend authenticates the user.
4. Backend creates a short-lived LiveKit token.
5. Expo joins a LiveKit room.
6. Expo publishes microphone audio.
7. Voice agent joins the room.
8. Conversation begins.
```

### One conversational turn

```text
User speaks
   ↓
LiveKit streams microphone audio
   ↓
Deepgram Nova-3 performs streaming STT
   ↓
Agent receives final/partial transcript
   ↓
Agent decides whether a tool/RAG lookup is necessary
   ↓
Relevant KB context is retrieved if required
   ↓
OpenRouter streams LLM tokens
   ↓
Text chunks are passed immediately to Aura-1
   ↓
Deepgram streams synthesized audio
   ↓
LiveKit sends audio to mobile client
```

---

## 10. LiveKit Agent

The agent should be responsible for:

- Connecting to the LiveKit room.
- Receiving the user's audio track.
- Passing audio into Deepgram STT.
- Handling endpoint/turn detection.
- Maintaining short conversation state.
- Calling RAG/tools when appropriate.
- Streaming messages to OpenRouter.
- Passing LLM output incrementally into Deepgram TTS.
- Publishing audio back into LiveKit.
- Cancelling output when the user interrupts.

Pseudo-code:

```python
async def handle_turn(transcript: str):
    context = conversation.get_recent_turns(limit=6)

    tools_context = None

    if should_search_knowledge(transcript):
        tools_context = await search_knowledge(transcript)

    messages = build_messages(
        transcript=transcript,
        conversation=context,
        knowledge=tools_context,
    )

    stream = openrouter.stream(messages)

    async for text_chunk in stream:
        await tts.push(text_chunk)
```

In production, prefer proper function/tool calling over a hardcoded `should_search_knowledge()` classifier.

---

## 11. OpenRouter LLM Integration

Use its OpenAI-compatible API.

Example:

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)
```

Streaming request:

```python
stream = await client.chat.completions.create(
    model=OPENROUTER_MODEL,
    messages=messages,
    stream=True,
    temperature=0.4,
)
```

### Model strategy

Use a routing approach:

```text
Simple conversation
        ↓
Fast cheap model

Knowledge-base request
        ↓
Fast model + RAG

Complex reasoning
        ↓
Stronger fallback model
```

Do not use the expensive model for every request.

---

## 12. System Prompt Design

Example `prompts/system.md`:

```text
You are a real-time conversational assistant inside a mobile application.

Rules:
- Answer conversationally.
- Prefer 1-3 short sentences unless the user asks for detail.
- Never invent information from the private knowledge base.
- Use search_knowledge when the answer depends on company/product/private information.
- Use available tools when real-time or structured information is required.
- Avoid unnecessarily repeating the user's question.
- Optimize responses for spoken conversation rather than written articles.
- Respond quickly and directly.
```

Short responses reduce both LLM latency and TTS cost.

---

## 13. RAG Architecture

### Knowledge Sources

Initial version:

```text
knowledge/
├── faq.md
├── product.md
├── policies.md
├── destinations.md
└── safety.md
```

Later sources can include:

- PostgreSQL
- APIs
- CMS content
- Google Drive exports
- Internal database records
- FAQ/admin dashboard

### Ingestion Flow

```text
Document
   ↓
Normalize text
   ↓
Split into chunks
   ↓
Generate embedding
   ↓
Store in Qdrant
```

Recommended initial chunking:

- ~300-600 tokens per chunk
- small overlap between chunks
- retain metadata such as document, heading, URL, category, updated date

Example metadata:

```json
{
  "document": "policies.md",
  "section": "Cancellation",
  "category": "policy",
  "updated_at": "2026-08-28"
}
```

---

## 14. Knowledge Retrieval

Runtime flow:

```text
User question
     ↓
Embedding
     ↓
Qdrant semantic search
     ↓
Top 3-5 relevant chunks
     ↓
Return compact evidence to LLM
```

Do not send the full knowledge base to the LLM.

Example:

```python
async def search_knowledge(query: str):
    vector = await embed(query)

    results = qdrant.query_points(
        collection_name="knowledge",
        query=vector,
        limit=4,
    )

    return format_results(results)
```

---

## 15. Use RAG as a Tool

Do not automatically perform vector search for every user turn.

Preferred behavior:

```text
"Hi, how are you?"
       ↓
Direct LLM response

"What is our cancellation policy?"
       ↓
search_knowledge()
       ↓
LLM response

"Book this for me"
       ↓
booking tool/API
```

This improves latency and lowers embedding/LLM usage.

---

## 16. Tool Calling

Recommended tools:

```text
search_knowledge(query)
search_places(query, location)
get_booking_details(id)
get_trip_information(id)
get_emergency_information(location)
create_support_ticket(...)
```

Tool results should be structured JSON wherever possible.

Example:

```json
{
  "name": "search_knowledge",
  "arguments": {
    "query": "cancellation policy"
  }
}
```

The backend executes the tool and feeds the result back to the LLM.

---

## 17. Deepgram STT

Use Nova-3 streaming transcription.

Important settings:

- streaming WebSocket
- interim results enabled
- endpoint detection
- smart formatting where appropriate
- multilingual model when needed

The agent should receive partial transcripts while the user is still speaking.

Avoid this:

```text
record complete audio
      ↓
upload file
      ↓
wait for transcription
```

Use this:

```text
microphone stream
      ↓
Deepgram streaming STT
      ↓
partial transcripts
      ↓
final turn
```

---

## 18. Deepgram TTS

Use Aura-1 with streaming output.

Critical requirement:

Do not wait for the complete LLM response before starting TTS.

Bad:

```text
LLM writes complete paragraph
        ↓
TTS starts
```

Good:

```text
LLM token stream
      ↓
sentence / phrase buffer
      ↓
Aura TTS
      ↓
audio begins immediately
```

Create a small text chunker that emits natural speech chunks, for example after:

- sentence-ending punctuation
- commas for sufficiently long clauses
- ~40-100 characters if no punctuation arrives

Avoid feeding single tokens individually to TTS.

---

## 19. Barge-In / Interruptions

This is essential for a natural voice agent.

Expected behavior:

```text
AI speaking
    ↓
User begins talking
    ↓
VAD detects speech
    ↓
Cancel current LLM generation if appropriate
    ↓
Stop TTS generation
    ↓
Stop publishing old audio
    ↓
Listen to new user turn
```

Without barge-in, the system will feel like a voice recording rather than a conversation.

---

## 20. Conversation Memory

Do not send the entire conversation to OpenRouter on every request.

Maintain:

```text
System prompt
+
Short conversation summary
+
Last 4-8 turns
+
Current retrieved KB evidence
```

Example:

```python
messages = [
    system_prompt,
    conversation_summary,
    *recent_turns[-6:],
    current_user_message,
]
```

Generate/update summaries periodically if a conversation becomes long.

---

## 21. Mobile Expo Integration

### Important

Use an Expo development build rather than the standard Expo Go client.

Typical setup:

```bash
npx expo install expo-dev-client
```

Install the LiveKit React Native dependencies required by the official SDK.

Then create a development build using either:

```bash
npx expo run:android
```

or EAS Development Builds.

### Mobile Responsibilities

The app should only handle:

- obtaining a LiveKit token
- joining/leaving a voice room
- publishing microphone audio
- playing the remote AI audio track
- mute/unmute
- connection state
- voice UI/animations
- captions/transcripts if desired

Do not run RAG or model inference on the phone.

---

## 22. Token API

Expose:

```http
POST /voice/token
```

Request:

```json
{
  "user_id": "user_123"
}
```

Response:

```json
{
  "url": "wss://voice.example.com",
  "token": "SHORT_LIVED_LIVEKIT_TOKEN",
  "room": "voice-user_123-..."
}
```

The backend should validate the user's existing app authentication before generating this token.

---

## 23. Security

### Never expose server keys in Expo

Never embed:

```text
LIVEKIT_API_SECRET
DEEPGRAM_API_KEY
OPENROUTER_API_KEY
QDRANT_ADMIN_CREDENTIALS
```

### Required controls

- authenticate `/voice/token`
- issue short-lived LiveKit tokens
- use unique room names
- rate-limit token creation
- restrict Qdrant to internal Docker networking
- restrict Redis to internal Docker networking
- keep `.env` out of Git
- rotate provider keys if compromised
- add API request limits
- validate all tool parameters

---

## 24. Oracle Networking

Open only what is required.

Typical ports:

```text
80/TCP      HTTP redirect / certificate setup
443/TCP     HTTPS
7881/TCP    LiveKit RTC TCP
50000-50100/UDP LiveKit WebRTC media
```

Port `7880` can remain internal depending on the production LiveKit configuration.

Remember Oracle has both:

1. OCI network security rules / NSG / Security List
2. Operating system firewall rules

Both layers must permit the required WebRTC traffic.

---

## 25. Domains

Recommended:

```text
voice.example.com → LiveKit
api.example.com   → agent/token API
```

Use Caddy/Nginx for HTTPS API traffic.

Example Caddyfile:

```text
api.example.com {
    reverse_proxy agent:8000
}
```

Follow LiveKit's recommended production TLS/networking setup for the WebRTC endpoint.

---

## 26. ARM64 Considerations

Oracle Ampere A1 is ARM64.

Before deployment, verify every Docker image supports:

```text
linux/arm64
```

Primary services should generally have ARM-compatible images, but always verify pinned versions before production rollout.

---

## 27. Latency Strategy

Target architecture:

```text
User finishes turn
       ↓
STT finalization
       ↓
RAG/tool only when needed
       ↓
LLM first tokens
       ↓
TTS starts before LLM is finished
       ↓
User hears answer
```

Primary latency optimization rules:

1. Stream every stage.
2. Keep prompts small.
3. Keep conversation history short.
4. Retrieve only 3-5 relevant RAG chunks.
5. Use a fast LLM by default.
6. Keep voice responses to 1-3 sentences.
7. Use tool calling rather than stuffing every piece of data into the system prompt.
8. Start TTS from partial LLM output.
9. Support interruption immediately.
10. Deploy Oracle and choose provider regions close to the majority of users.

---

## 28. Target Response Timing

Engineering targets, not guarantees:

```text
Turn/end detection       ~150-300 ms
RAG search               ~20-100 ms
LLM first token          ~150-500 ms
TTS first audio          ~100-300 ms
Network overhead         ~50-150 ms
```

A reasonable MVP target is for the user to start hearing a response roughly within:

```text
~0.6-1.5 seconds
```

after a clear end-of-turn under good network conditions.

Measure actual results rather than relying on estimated provider latency.

---

## 29. Observability

Log timing for every stage:

```text
session_id
user_id
stt_first_partial_ms
stt_final_ms
rag_ms
llm_first_token_ms
llm_complete_ms
tts_first_audio_ms
first_audio_played_ms
full_turn_ms
interrupt_count
error_type
```

Create metrics for:

- p50 latency
- p95 latency
- STT error rate
- LLM failures
- Deepgram failures
- OpenRouter fallback frequency
- average TTS characters
- average conversation duration
- cost per session

Never log sensitive voice content by default unless explicitly required and compliant with your privacy policy.

---

## 30. Failure Handling

### Deepgram STT failure

```text
retry connection
↓
if unavailable, tell user voice recognition is temporarily unavailable
```

### OpenRouter model failure

```text
primary model
    ↓ failure
fallback model
```

### TTS failure

If captions exist, show the text response and allow retry.

### LiveKit disconnect

Attempt a controlled reconnect and rejoin with a newly issued token if necessary.

---

## 31. Suggested Development Phases

### Phase 1 — Basic voice loop

Build only:

```text
Expo
→ LiveKit
→ Deepgram STT
→ OpenRouter
→ Deepgram TTS
→ Expo
```

Acceptance criteria:

- mobile can join room
- microphone works
- transcript is generated
- LLM responds
- response is spoken

### Phase 2 — Streaming and latency

Add:

- partial STT
- streaming LLM
- streaming TTS
- sentence chunking
- timing logs

### Phase 3 — Barge-in

Add:

- VAD
- interruption detection
- cancellation of active response

### Phase 4 — Knowledge base

Add:

- Qdrant
- ingestion pipeline
- knowledge search tool
- citations/source metadata internally

### Phase 5 — Application tools

Add product-specific actions:

```text
booking
trip lookup
place search
support
emergency flows
```

### Phase 6 — Production security

Add:

- authentication
- rate limiting
- provider key rotation
- structured logging
- monitoring
- backups
- abuse protection

---

## 32. Build Order

Recommended implementation sequence:

```text
1. Create Oracle Docker environment
2. Deploy LiveKit + Redis
3. Build token endpoint
4. Connect Expo development build to LiveKit
5. Verify microphone ↔ room audio
6. Create Python LiveKit agent
7. Integrate Deepgram Nova-3
8. Integrate OpenRouter streaming
9. Integrate Deepgram Aura-1
10. Implement interruption handling
11. Add Qdrant
12. Create ingestion pipeline
13. Add search_knowledge tool
14. Add product-specific tools
15. Add metrics/logging
16. Security hardening
17. Load/latency testing
18. Production rollout
```

---

## 33. MVP Acceptance Checklist

### Voice

- [ ] User can start/stop voice conversation.
- [ ] User speech streams over WebRTC.
- [ ] STT produces accurate transcript.
- [ ] LLM starts generation without waiting unnecessarily.
- [ ] TTS begins before the full LLM answer finishes.
- [ ] AI audio plays smoothly.
- [ ] User can interrupt AI.

### Knowledge

- [ ] Markdown docs can be ingested.
- [ ] Qdrant returns relevant chunks.
- [ ] Agent only invokes RAG when necessary.
- [ ] Agent does not invent KB facts.

### Infrastructure

- [ ] Services restart automatically.
- [ ] Redis/Qdrant are not publicly accessible.
- [ ] HTTPS works.
- [ ] LiveKit WebRTC works over mobile networks.
- [ ] ARM64 images are verified.

### Security

- [ ] No provider API secrets in Expo.
- [ ] LiveKit tokens are short-lived.
- [ ] Token endpoint requires authentication.
- [ ] Rate limiting is enabled.

### Observability

- [ ] End-to-end response latency is logged.
- [ ] LLM first-token latency is logged.
- [ ] TTS first-audio latency is logged.
- [ ] Provider errors are visible.

---

## 34. Cost Model for Low Usage

For approximately 2 hours of voice usage per month:

```text
Oracle Ampere A1      → free-tier infrastructure
LiveKit self-hosted   → no per-minute software fee
Redis                 → self-hosted
Qdrant                → self-hosted
RAG                   → self-hosted
Deepgram STT          → usage-based
OpenRouter            → usage-based
Deepgram TTS          → usage-based
```

At such low usage, managed STT/TTS APIs are usually cheaper and operationally simpler than maintaining GPU infrastructure for Whisper/Kokoro.

Revisit self-hosting speech inference only after usage becomes high enough that GPU hosting is cheaper than the API bill.

---

## 35. Future Improvements

Possible later additions:

- smarter semantic endpoint detection
- speaker emotion detection
- multiple TTS voices
- multilingual automatic language detection
- per-user memory
- user preference profiles
- tool result caching
- semantic response cache
- dynamic model routing
- OpenRouter provider fallbacks
- local embedding model
- PostgreSQL + pgvector instead of Qdrant if operational simplicity becomes more important
- admin dashboard for knowledge ingestion
- analytics dashboard for latency and cost
- conversation transcripts with privacy controls
- background conversation summaries
- prompt versioning
- evaluation datasets for STT/RAG/LLM quality

---

## 36. Final Recommended MVP Stack

```text
CLIENT
Expo Development Build
LiveKit React Native SDK

REAL-TIME TRANSPORT
Self-hosted LiveKit
Oracle Ampere A1

BACKEND
Python LiveKit Agent
Redis
Qdrant

STT
Deepgram Nova-3 Streaming

RAG
Qdrant + compact embeddings
Tool-based retrieval

LLM
OpenRouter
Fast cheap model by default
Fallback model for difficult queries

TTS
Deepgram Aura-1 Streaming

DEPLOYMENT
Docker Compose
Oracle Ubuntu ARM64
Caddy/Nginx
HTTPS + secure WebRTC
```

This design keeps infrastructure close to free while preserving low-latency conversational performance and full control over the agent's knowledge, prompts, tools, and application behavior.
