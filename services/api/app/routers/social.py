from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.schemas import BuddyMatchRequest, BuddyMatchesResponse, CommunityEventsResponse, CommunityEventOut
from app.social_service import find_buddy_matches, find_tonight_events, parse_buddy_request

router = APIRouter(tags=["social"])
_CORRIDOR_CITIES = {"delhi", "agra", "jaipur"}


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
