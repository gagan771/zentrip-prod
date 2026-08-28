# Zenny knowledge improvement loop

Zenny now turns real questions into a measurable, reviewable improvement loop:

1. Every `/v1/agent/message`, Zenny voice turn, and live voice turn receives an
   `interactionId` and records the query, intent, retrieval count, citations,
   confidence, and outcome.
2. Guide, payment, and safety questions with no grounded result (or a weak answer)
   are aggregated in `knowledge_gaps`. A repeated question increases its priority.
3. Clients can send explicit feedback to
   `POST /v1/knowledge/interactions/{interactionId}/feedback` with
   `{ "helpful": false, "note": "..." }`. Negative feedback also opens or
   prioritizes a gap.
4. Staff use `GET /v1/moderation/knowledge/gaps` and
   `GET /v1/moderation/knowledge/improvement-report` to choose what to research.
   After adding a cited claim, alias, or operational observation through the
   existing moderation endpoints, staff mark the gap `resolved`.

Run the report once or continuously:

```bash
python -m scripts.knowledge_improvement_loop
python -m scripts.knowledge_improvement_loop --watch --interval-seconds 900
```

The loop does not auto-publish user text or model output. That boundary keeps
Zenny's answer source-of-truth citation-backed while still using demand and
feedback to decide what the editorial team should add next.
