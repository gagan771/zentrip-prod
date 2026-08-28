"""Sourced, confidence-tagged traveler risk lookup."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import RiskPattern, User
from app.schemas import RiskPatternOut, RiskPatternsResponse

router = APIRouter(prefix="/v1/risks", tags=["risk-intelligence"])


def _out(row: RiskPattern) -> RiskPatternOut:
    return RiskPatternOut(
        id=row.id, city=row.city, locationLabel=row.location_label, category=row.category,
        pattern=row.pattern, recommendation=row.recommendation, confidence=row.confidence,
        sourceName=row.source_name, sourceUrl=row.source_url, lastVerified=row.last_verified,
    )


@router.get("", response_model=RiskPatternsResponse)
async def list_risks(
    city: str | None = Query(default=None, max_length=50),
    category: str | None = Query(default=None, max_length=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RiskPatternsResponse:
    del user
    query = select(RiskPattern).where(RiskPattern.status == "published").order_by(RiskPattern.last_verified.desc())
    if city:
        query = query.where(RiskPattern.city.ilike(city))
    if category:
        query = query.where(RiskPattern.category == category)
    rows = list((await db.scalars(query)).all())
    return RiskPatternsResponse(results=[_out(row) for row in rows], city=city, category=category)
