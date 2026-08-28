"""Traveler-to-local-expert ticket workflow; experts are not emergency responders."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import ExpertCase, ExpertProfile, User
from app.schemas import ExpertCaseCreate, ExpertCaseOut, ExpertCaseResponseCreate, ExpertProfileCreate, ExpertProfileOut

router = APIRouter(prefix="/v1/experts", tags=["destination-experts"])


def _profile_out(row: ExpertProfile) -> ExpertProfileOut:
    return ExpertProfileOut(id=row.id, displayName=row.display_name, city=row.city, specialties=row.specialties, status=row.status, rating=row.rating)


def _case_out(row: ExpertCase) -> ExpertCaseOut:
    return ExpertCaseOut(id=row.id, requesterId=row.requester_id, expertId=row.expert_id, city=row.city, category=row.category, question=row.question, status=row.status, response=row.response, createdAt=row.created_at, updatedAt=row.updated_at)


@router.post("/profile", response_model=ExpertProfileOut, status_code=status.HTTP_201_CREATED)
async def create_expert_profile(body: ExpertProfileCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExpertProfileOut:
    existing = await db.scalar(select(ExpertProfile).where(ExpertProfile.user_id == user.id))
    if existing:
        return _profile_out(existing)
    row = ExpertProfile(user_id=user.id, display_name=body.displayName, city=body.city, specialties=body.specialties, status="applicant")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _profile_out(row)


@router.get("/available", response_model=list[ExpertProfileOut])
async def available_experts(city: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[ExpertProfileOut]:
    del user
    query = select(ExpertProfile).where(ExpertProfile.status == "active")
    if city:
        query = query.where(ExpertProfile.city.ilike(city))
    return [_profile_out(row) for row in (await db.scalars(query.order_by(ExpertProfile.rating.desc()))).all()]


@router.post("/cases", response_model=ExpertCaseOut, status_code=status.HTTP_201_CREATED)
async def create_case(body: ExpertCaseCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExpertCaseOut:
    expert = None
    query = select(ExpertProfile).where(ExpertProfile.status == "active")
    if body.city:
        query = query.where(ExpertProfile.city.ilike(body.city))
    expert = await db.scalar(query.order_by(ExpertProfile.rating.desc()).limit(1))
    row = ExpertCase(requester_id=user.id, expert_id=expert.id if expert else None, city=body.city, category=body.category, question=body.question, status="assigned" if expert else "waiting")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _case_out(row)


@router.get("/cases", response_model=list[ExpertCaseOut])
async def list_cases(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[ExpertCaseOut]:
    profile = await db.scalar(select(ExpertProfile).where(ExpertProfile.user_id == user.id))
    if profile:
        query = select(ExpertCase).where(or_(ExpertCase.requester_id == user.id, ExpertCase.expert_id == profile.id))
    else:
        query = select(ExpertCase).where(ExpertCase.requester_id == user.id)
    return [_case_out(row) for row in (await db.scalars(query.order_by(ExpertCase.created_at.desc()))).all()]


@router.post("/cases/{case_id}/respond", response_model=ExpertCaseOut)
async def respond_case(case_id: uuid.UUID, body: ExpertCaseResponseCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExpertCaseOut:
    profile = await db.scalar(select(ExpertProfile).where(ExpertProfile.user_id == user.id, ExpertProfile.status == "active"))
    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only active destination experts can respond")
    row = await db.scalar(select(ExpertCase).where(ExpertCase.id == case_id, ExpertCase.expert_id == profile.id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned case not found")
    row.response = body.response
    row.status = "responded"
    await db.commit()
    await db.refresh(row)
    return _case_out(row)
