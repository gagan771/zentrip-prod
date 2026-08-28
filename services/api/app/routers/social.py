import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.buddy_consent import apply_consent, first_name_only, ordered_user_ids, pair_unlocked, peer_public_card, user_has_consented
from app.db import get_db
from app.deps import get_current_user
from app.models import BuddyMessage, BuddyPairConsent, BuddyWaitlistRequest, User
from app.schemas import (
    BuddyConsentCreate,
    BuddyMatchRequest,
    BuddyMatchesResponse,
    BuddyMessageCreate,
    BuddyMessageListResponse,
    BuddyMessageOut,
    BuddyPeerListResponse,
    BuddyPeerOut,
    BuddyThreadListResponse,
    BuddyThreadOut,
    BuddyWaitlistCreate,
    BuddyWaitlistListResponse,
    BuddyWaitlistOut,
    CommunityEventOut,
    CommunityEventsResponse,
)
from app.social_service import find_buddy_matches, find_tonight_events, parse_buddy_request

router = APIRouter(tags=["social"])
_CORRIDOR_CITIES = {"delhi", "agra", "jaipur"}


def _waitlist_out(row: BuddyWaitlistRequest) -> BuddyWaitlistOut:
    return BuddyWaitlistOut(
        id=row.id,
        groupId=row.group_id,
        groupName=row.group_name,
        requestText=row.request_text,
        status=row.status,
        createdAt=row.created_at,
    )


def _other_user_id(pair: BuddyPairConsent, user_id) -> object:
    return pair.user_high_id if pair.user_low_id == user_id else pair.user_low_id


@router.get("/v1/community/events", response_model=CommunityEventsResponse)
async def community_events(city: str | None = None, user: User = Depends(get_current_user)) -> CommunityEventsResponse:
    """Return only current corridor events; stale demo posters are filtered in the service."""
    del user
    events = find_tonight_events(city or "") if not city or city.casefold() in _CORRIDOR_CITIES else []
    return CommunityEventsResponse(
        events=[CommunityEventOut(**event) for event in events],
        city=city,
    )


@router.post("/v1/buddy/matches", response_model=BuddyMatchesResponse)
async def buddy_matches(body: BuddyMatchRequest, user: User = Depends(get_current_user)) -> BuddyMatchesResponse:
    """Return aggregated compatibility cards without exposing traveler identities."""
    del user
    parsed = parse_buddy_request(body.text)
    return BuddyMatchesResponse(matches=find_buddy_matches(parsed), parsedRequest=parsed)


@router.post(
    "/v1/buddy/waitlist",
    response_model=BuddyWaitlistOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_buddy_waitlist(
    body: BuddyWaitlistCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyWaitlistOut:
    """Queue a private join/waitlist request. Chat stays closed until another queued traveler consents back."""
    existing = await db.scalar(
        select(BuddyWaitlistRequest).where(
            BuddyWaitlistRequest.user_id == user.id,
            BuddyWaitlistRequest.group_id == body.groupId,
            BuddyWaitlistRequest.status == "queued",
        )
    )
    if existing:
        return _waitlist_out(existing)

    row = BuddyWaitlistRequest(
        user_id=user.id,
        group_id=body.groupId,
        group_name=body.groupName,
        request_text=body.requestText,
        status="queued",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _waitlist_out(row)


@router.get("/v1/buddy/waitlist", response_model=BuddyWaitlistListResponse)
async def list_buddy_waitlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyWaitlistListResponse:
    rows = (
        await db.scalars(
            select(BuddyWaitlistRequest)
            .where(BuddyWaitlistRequest.user_id == user.id)
            .order_by(BuddyWaitlistRequest.created_at.desc())
        )
    ).all()
    return BuddyWaitlistListResponse(requests=[_waitlist_out(row) for row in rows])


@router.get("/v1/buddy/peers", response_model=BuddyPeerListResponse)
async def list_buddy_peers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyPeerListResponse:
    """Anonymous cards for other queued travelers. Names appear only after mutual consent."""
    mine = (
        await db.scalars(
            select(BuddyWaitlistRequest).where(
                BuddyWaitlistRequest.user_id == user.id,
                BuddyWaitlistRequest.status == "queued",
            )
        )
    ).all()
    if not mine:
        return BuddyPeerListResponse(peers=[])

    group_ids = {row.group_id for row in mine}
    group_name = {row.group_id: row.group_name for row in mine}
    others = (
        await db.scalars(
            select(BuddyWaitlistRequest).where(
                BuddyWaitlistRequest.group_id.in_(group_ids),
                BuddyWaitlistRequest.status == "queued",
                BuddyWaitlistRequest.user_id != user.id,
            )
        )
    ).all()
    if not others:
        return BuddyPeerListResponse(peers=[])

    pairs = (
        await db.scalars(
            select(BuddyPairConsent).where(
                BuddyPairConsent.group_id.in_(group_ids),
                or_(BuddyPairConsent.user_low_id == user.id, BuddyPairConsent.user_high_id == user.id),
            )
        )
    ).all()
    pair_by_other: dict[tuple[str, object], BuddyPairConsent] = {}
    for pair in pairs:
        pair_by_other[(pair.group_id, _other_user_id(pair, user.id))] = pair

    unlocked_ids = {
        _other_user_id(pair, user.id)
        for pair in pairs
        if pair_unlocked(pair)
    }
    names: dict[object, str] = {}
    if unlocked_ids:
        named = (await db.scalars(select(User).where(User.id.in_(unlocked_ids)))).all()
        names = {row.id: row.name for row in named}

    peers: list[BuddyPeerOut] = []
    for other in others:
        pair = pair_by_other.get((other.group_id, other.user_id))
        you_consented = user_has_consented(pair, user.id) if pair else False
        they_consented = user_has_consented(pair, other.user_id) if pair else False
        card = peer_public_card(
            other_name=names.get(other.user_id),
            you_consented=you_consented,
            they_consented=they_consented,
        )
        unlocked = bool(card["chatUnlocked"])
        peers.append(
            BuddyPeerOut(
                peerId=other.id,
                groupId=other.group_id,
                groupName=group_name.get(other.group_id, other.group_name),
                label=card["label"],
                displayName=card["displayName"],
                youConsented=card["youConsented"],
                theyConsented=card["theyConsented"],
                chatUnlocked=unlocked,
                pairId=pair.id if unlocked and pair else None,
            )
        )
    return BuddyPeerListResponse(peers=peers)


@router.post("/v1/buddy/consent", response_model=BuddyPeerOut)
async def create_buddy_consent(
    body: BuddyConsentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyPeerOut:
    other = await db.get(BuddyWaitlistRequest, body.peerId)
    if other is None or other.status != "queued" or other.user_id == user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No queued traveler found for that request.")

    mine = await db.scalar(
        select(BuddyWaitlistRequest).where(
            BuddyWaitlistRequest.user_id == user.id,
            BuddyWaitlistRequest.group_id == other.group_id,
            BuddyWaitlistRequest.status == "queued",
        )
    )
    if mine is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Join that group's waitlist before offering consent.")

    low_id, high_id = ordered_user_ids(user.id, other.user_id)
    pair = await db.scalar(
        select(BuddyPairConsent).where(
            BuddyPairConsent.group_id == other.group_id,
            BuddyPairConsent.user_low_id == low_id,
            BuddyPairConsent.user_high_id == high_id,
        )
    )
    if pair is None:
        pair = BuddyPairConsent(group_id=other.group_id, user_low_id=low_id, user_high_id=high_id)
        db.add(pair)
        await db.flush()

    apply_consent(pair, user.id, datetime.utcnow())
    await db.commit()
    await db.refresh(pair)

    other_user = await db.get(User, other.user_id) if pair_unlocked(pair) else None
    card = peer_public_card(
        other_name=other_user.name if other_user else None,
        you_consented=user_has_consented(pair, user.id),
        they_consented=user_has_consented(pair, other.user_id),
    )
    unlocked = bool(card["chatUnlocked"])
    return BuddyPeerOut(
        peerId=other.id,
        groupId=other.group_id,
        groupName=other.group_name,
        label=card["label"],
        displayName=card["displayName"],
        youConsented=card["youConsented"],
        theyConsented=card["theyConsented"],
        chatUnlocked=unlocked,
        pairId=pair.id if unlocked else None,
    )


@router.get("/v1/buddy/threads", response_model=BuddyThreadListResponse)
async def list_buddy_threads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyThreadListResponse:
    pairs = (
        await db.scalars(
            select(BuddyPairConsent).where(
                or_(BuddyPairConsent.user_low_id == user.id, BuddyPairConsent.user_high_id == user.id)
            )
        )
    ).all()
    unlocked = [pair for pair in pairs if pair_unlocked(pair)]
    if not unlocked:
        return BuddyThreadListResponse(threads=[])

    other_ids = {_other_user_id(pair, user.id) for pair in unlocked}
    named = (await db.scalars(select(User).where(User.id.in_(other_ids)))).all()
    names = {row.id: first_name_only(row.name) for row in named}

    mine = (
        await db.scalars(
            select(BuddyWaitlistRequest).where(
                BuddyWaitlistRequest.user_id == user.id,
                BuddyWaitlistRequest.status == "queued",
            )
        )
    ).all()
    group_name = {row.group_id: row.group_name for row in mine}

    return BuddyThreadListResponse(
        threads=[
            BuddyThreadOut(
                pairId=pair.id,
                groupId=pair.group_id,
                groupName=group_name.get(pair.group_id, pair.group_id),
                displayName=names.get(_other_user_id(pair, user.id), "Traveler"),
            )
            for pair in unlocked
        ]
    )


async def _unlocked_pair_or_404(
    db: AsyncSession,
    pair_id: uuid.UUID,
    user: User,
) -> BuddyPairConsent:
    pair = await db.get(BuddyPairConsent, pair_id)
    if pair is None or user.id not in (pair.user_low_id, pair.user_high_id) or not pair_unlocked(pair):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat is not available yet.")
    return pair


@router.get("/v1/buddy/threads/{pair_id}/messages", response_model=BuddyMessageListResponse)
async def list_buddy_messages(
    pair_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyMessageListResponse:
    pair = await _unlocked_pair_or_404(db, pair_id, user)
    other = await db.get(User, _other_user_id(pair, user.id))
    group_row = await db.scalar(
        select(BuddyWaitlistRequest).where(
            BuddyWaitlistRequest.user_id == user.id,
            BuddyWaitlistRequest.group_id == pair.group_id,
        )
    )
    rows = (
        await db.scalars(
            select(BuddyMessage).where(BuddyMessage.pair_id == pair.id).order_by(BuddyMessage.created_at.asc())
        )
    ).all()
    return BuddyMessageListResponse(
        pairId=pair.id,
        displayName=first_name_only(other.name if other else None),
        groupName=group_row.group_name if group_row else pair.group_id,
        messages=[
            BuddyMessageOut(
                id=row.id,
                sender="you" if row.sender_id == user.id else "them",
                body=row.body,
                createdAt=row.created_at,
            )
            for row in rows
        ],
    )


@router.post("/v1/buddy/threads/{pair_id}/messages", response_model=BuddyMessageOut, status_code=status.HTTP_201_CREATED)
async def create_buddy_message(
    pair_id: uuid.UUID,
    body: BuddyMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BuddyMessageOut:
    pair = await _unlocked_pair_or_404(db, pair_id, user)
    row = BuddyMessage(pair_id=pair.id, sender_id=user.id, body=body.body.strip())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return BuddyMessageOut(id=row.id, sender="you", body=row.body, createdAt=row.created_at)
