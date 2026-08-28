"""The safe feedback loop that improves Zenny's knowledge coverage.

The loop has three explicit stages:

1. Record every agent question and retrieval outcome.
2. Aggregate misses and negative feedback into a staff review queue.
3. Let an editor add a cited claim/alias/observation, then resolve the gap.

Only stage 1 and aggregation are automatic. Content is never published from a
traveler question or an LLM answer without editorial review.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeGap, KnowledgeInteraction, User

_EMAIL_RE = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{8,}\d)(?!\w)")
_QUERY_RE = re.compile(r"[^\w\s-]", re.UNICODE)


def sanitize_query(text: str) -> str:
    """Remove obvious contact details before a question enters editorial telemetry."""
    value = _EMAIL_RE.sub("[redacted email]", text.strip())

    def redact_phone(match: re.Match[str]) -> str:
        # Do not turn travel dates or short route numbers into redactions.
        digits = sum(character.isdigit() for character in match.group(0))
        return "[redacted phone]" if digits >= 10 else match.group(0)

    return _PHONE_RE.sub(redact_phone, value)[:4000]


def normalize_query(text: str) -> str:
    """Create a stable, bounded key for recurring-question aggregation."""
    value = sanitize_query(text).casefold()
    value = _QUERY_RE.sub(" ", value)
    return " ".join(value.split())[:500]


def _gap_required(*, intent: str, result_count: int, citation_count: int, confidence: str) -> bool:
    # Chat/tool requests are not KB gaps just because they have no citations.
    # Guide-like intents are expected to be grounded in reviewed records.
    return intent in {"guide", "payment", "safety"} and (
        result_count == 0 or citation_count == 0 or confidence != "verified"
    )


def _outcome(*, intent: str, result_count: int, citation_count: int, confidence: str) -> str:
    if result_count == 0:
        return "no_match"
    if _gap_required(intent=intent, result_count=result_count, citation_count=citation_count, confidence=confidence):
        return "low_confidence"
    return "answered"


async def _get_or_create_gap(
    db: AsyncSession,
    *,
    normalized_query: str,
    example_query: str,
    intent: str,
    no_match: bool = False,
    negative_feedback: bool = False,
) -> KnowledgeGap:
    gap = await db.scalar(select(KnowledgeGap).where(KnowledgeGap.normalized_query == normalized_query))
    now = datetime.utcnow()
    if gap is None:
        initial_no_match = 1 if no_match else 0
        initial_negative_feedback = 1 if negative_feedback else 0
        gap = KnowledgeGap(
            normalized_query=normalized_query,
            example_query=example_query,
            intent=intent,
            occurrence_count=1,
            no_match_count=initial_no_match,
            negative_feedback_count=initial_negative_feedback,
            priority=min(100, 40 + (10 if no_match else 0) + (10 if negative_feedback else 0)),
            status="open",
            last_seen_at=now,
        )
        db.add(gap)
        return gap

    gap.occurrence_count += 0 if negative_feedback else 1
    gap.no_match_count += 1 if no_match else 0
    gap.negative_feedback_count += 1 if negative_feedback else 0
    gap.priority = min(
        100,
        40
        + min(gap.occurrence_count * 5, 25)
        + min(gap.no_match_count * 10, 20)
        + min(gap.negative_feedback_count * 10, 20),
    )
    gap.last_seen_at = now
    gap.updated_at = now
    # A recurring question after a previous resolution means coverage regressed
    # or the editor resolved the wrong phrasing. Put it back in review.
    if gap.status in {"resolved", "dismissed"}:
        gap.status = "open"
    return gap


async def record_knowledge_interaction(
    db: AsyncSession,
    user: User,
    *,
    query: str,
    intent: str,
    result_count: int,
    citation_count: int,
    confidence: str,
    session_id: str | None = None,
) -> KnowledgeInteraction:
    """Persist one answer-quality event and create/update a gap when warranted."""
    safe_query = sanitize_query(query)
    normalized = normalize_query(safe_query)
    interaction = KnowledgeInteraction(
        user_id=user.id,
        session_id=session_id,
        query_text=safe_query,
        normalized_query=normalized,
        intent=intent,
        result_count=max(0, result_count),
        citation_count=max(0, citation_count),
        answer_confidence=confidence,
        outcome=_outcome(
            intent=intent,
            result_count=result_count,
            citation_count=citation_count,
            confidence=confidence,
        ),
    )
    db.add(interaction)
    if normalized and _gap_required(
        intent=intent, result_count=result_count, citation_count=citation_count, confidence=confidence
    ):
        await _get_or_create_gap(
            db,
            normalized_query=normalized,
            example_query=safe_query,
            intent=intent,
            no_match=result_count == 0,
        )
    await db.flush()
    return interaction


async def record_knowledge_feedback(
    db: AsyncSession,
    interaction: KnowledgeInteraction,
    *,
    helpful: bool,
    note: str | None = None,
) -> KnowledgeInteraction:
    """Attach explicit traveler feedback and promote a bad answer to the gap queue."""
    previous_feedback = interaction.feedback
    interaction.feedback = "helpful" if helpful else "not_helpful"
    interaction.feedback_note = sanitize_query(note)[:1000] if note else None
    interaction.feedback_at = datetime.utcnow()
    if not helpful and previous_feedback != "not_helpful" and interaction.normalized_query:
        await _get_or_create_gap(
            db,
            normalized_query=interaction.normalized_query,
            example_query=interaction.query_text,
            intent=interaction.intent,
            negative_feedback=True,
        )
    await db.flush()
    return interaction


def knowledge_improvement_report(
    interactions: Iterable[object], gaps: Iterable[object]
) -> dict:
    """Build a dashboard-friendly report without requiring a database session."""
    interactions = list(interactions)
    gaps = list(gaps)
    open_gaps = [gap for gap in gaps if gap.status in {"open", "in_progress"}]
    top_gaps = sorted(
        open_gaps,
        key=lambda gap: (gap.priority, gap.occurrence_count, gap.last_seen_at),
        reverse=True,
    )[:20]
    return {
        "totalInteractions": len(interactions),
        "noMatch": sum(row.outcome == "no_match" for row in interactions),
        "lowConfidence": sum(row.outcome == "low_confidence" for row in interactions),
        "negativeFeedback": sum(row.feedback == "not_helpful" for row in interactions),
        "openGaps": len(open_gaps),
        "resolvedGaps": sum(row.status == "resolved" for row in gaps),
        "topGaps": [
            {
                "id": str(gap.id),
                "query": gap.example_query,
                "intent": gap.intent,
                "occurrences": gap.occurrence_count,
                "noMatch": gap.no_match_count,
                "negativeFeedback": gap.negative_feedback_count,
                "priority": gap.priority,
                "status": gap.status,
            }
            for gap in top_gaps
        ],
    }
