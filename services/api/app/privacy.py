"""Retention helpers for privacy-aware quality telemetry."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeInteraction


def telemetry_cutoff(retention_days: int, now: datetime | None = None) -> datetime:
    """Return the oldest allowed interaction timestamp for a positive retention window."""
    safe_days = max(1, int(retention_days))
    return (now or datetime.utcnow()) - timedelta(days=safe_days)


async def purge_expired_knowledge_interactions(
    db: AsyncSession, retention_days: int, now: datetime | None = None
) -> int:
    """Delete old raw interaction text while leaving aggregated knowledge gaps intact."""
    result = await db.execute(
        delete(KnowledgeInteraction).where(
            KnowledgeInteraction.created_at < telemetry_cutoff(retention_days, now)
        )
    )
    await db.commit()
    return int(result.rowcount or 0)
