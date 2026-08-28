"""Explorer mission and moderated-submission workflow."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import ExplorerMission, ExplorerProfile, ExplorerSubmission, User
from app.schemas import (
    ExplorerActivateRequest, ExplorerApplyRequest, ExplorerMissionOut, ExplorerProfileOut, ExplorerSubmissionCreate, ExplorerSubmissionOut,
)

router = APIRouter(prefix="/v1/explorer", tags=["explorer"])


def _profile_out(row: ExplorerProfile) -> ExplorerProfileOut:
    return ExplorerProfileOut(id=row.id, status=row.status, reputationPoints=row.reputation_points, missionsCompleted=row.missions_completed)


def _mission_out(row: ExplorerMission) -> ExplorerMissionOut:
    return ExplorerMissionOut(id=row.id, title=row.title, category=row.category, city=row.city, description=row.description, safetyNote=row.safety_note, requiredEvidence=row.required_evidence)


def _submission_out(row: ExplorerSubmission) -> ExplorerSubmissionOut:
    return ExplorerSubmissionOut(id=row.id, missionId=row.mission_id, text=row.text, latitude=row.latitude, longitude=row.longitude, evidenceUrl=row.evidence_url, status=row.status, reviewerNote=row.reviewer_note, createdAt=row.created_at)


async def _get_profile(db: AsyncSession, user_id: uuid.UUID) -> ExplorerProfile:
    profile = await db.scalar(select(ExplorerProfile).where(ExplorerProfile.user_id == user_id))
    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apply to the Explorer program first")
    return profile


@router.get("/profile", response_model=ExplorerProfileOut | None)
async def explorer_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExplorerProfileOut | None:
    profile = await db.scalar(select(ExplorerProfile).where(ExplorerProfile.user_id == user.id))
    return _profile_out(profile) if profile else None


@router.post("/apply", response_model=ExplorerProfileOut, status_code=status.HTTP_201_CREATED)
async def apply_explorer(body: ExplorerApplyRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExplorerProfileOut:
    existing = await db.scalar(select(ExplorerProfile).where(ExplorerProfile.user_id == user.id))
    if existing:
        return _profile_out(existing)
    profile = ExplorerProfile(user_id=user.id, motivation=body.motivation, status="applicant")
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _profile_out(profile)


@router.post("/activate", response_model=ExplorerProfileOut)
async def activate_explorer(body: ExplorerActivateRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExplorerProfileOut:
    """Record the safety briefing. Staff must still approve via moderation before missions unlock."""
    if not body.safetyAcknowledged:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Safety acknowledgement is required")
    profile = await _get_profile(db, user.id)
    if profile.status == "applicant":
        profile.status = "pending_review"
        await db.commit()
        await db.refresh(profile)
    return _profile_out(profile)


@router.get("/missions", response_model=list[ExplorerMissionOut])
async def missions(city: str | None = Query(default=None, max_length=50), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[ExplorerMissionOut]:
    del user
    query = select(ExplorerMission).where(ExplorerMission.status == "published").order_by(ExplorerMission.city, ExplorerMission.title)
    if city:
        query = query.where(ExplorerMission.city.ilike(city))
    return [_mission_out(row) for row in (await db.scalars(query)).all()]


@router.post("/missions/{mission_id}/submissions", response_model=ExplorerSubmissionOut, status_code=status.HTTP_201_CREATED)
async def submit_mission(mission_id: uuid.UUID, body: ExplorerSubmissionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ExplorerSubmissionOut:
    profile = await _get_profile(db, user.id)
    if profile.status not in ("active", "certified"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Explorer profile must be approved before submitting missions")
    mission = await db.scalar(select(ExplorerMission).where(ExplorerMission.id == mission_id, ExplorerMission.status == "published"))
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
    row = ExplorerSubmission(explorer_id=profile.id, mission_id=mission.id, text=body.text, latitude=body.latitude, longitude=body.longitude, evidence_url=body.evidenceUrl)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _submission_out(row)


@router.get("/submissions", response_model=list[ExplorerSubmissionOut])
async def my_submissions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[ExplorerSubmissionOut]:
    profile = await _get_profile(db, user.id)
    rows = (await db.scalars(select(ExplorerSubmission).where(ExplorerSubmission.explorer_id == profile.id).order_by(ExplorerSubmission.created_at.desc()))).all()
    return [_submission_out(row) for row in rows]
