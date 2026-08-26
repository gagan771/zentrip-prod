from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_gateway import handle_message, load_session_messages
from app.db import get_db
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/v1/agent", tags=["agent"])


class AgentMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    tripId: str | None = None


class AgentMessageResponse(BaseModel):
    intent: str
    policyTier: str
    reply: str
    confidence: str
    items: list[str] = Field(default_factory=list)


@router.post("/message", response_model=AgentMessageResponse)
async def send_message(
    body: AgentMessageRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> AgentMessageResponse:
    result = await handle_message(user, body.text, db)
    return AgentMessageResponse(
        intent=result.intent,
        policyTier=result.policy_tier,
        reply=result.reply,
        confidence=result.confidence,
        items=result.items,
    )


class SessionHistoryResponse(BaseModel):
    messages: list[dict]


@router.get("/session", response_model=SessionHistoryResponse)
async def get_session(user: User = Depends(get_current_user)) -> SessionHistoryResponse:
    return SessionHistoryResponse(messages=await load_session_messages(user.id))
