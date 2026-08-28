"""Short-lived LiveKit participant tokens. Secrets never leave this process."""

from __future__ import annotations

import time
import uuid

import jwt

from app.config import settings

ZENNY_AGENT_NAME = "zenny"


def livekit_ready() -> bool:
    return bool(settings.livekit_url.strip() and settings.livekit_api_key.strip() and settings.livekit_api_secret.strip())


def mint_livekit_token(*, identity: str, name: str, room: str, ttl_seconds: int = 900) -> str:
    now = int(time.time())
    payload = {
        "iss": settings.livekit_api_key.strip(),
        "sub": identity[:64],
        "name": name[:64],
        "nbf": now - 5,
        "exp": now + ttl_seconds,
        "jti": uuid.uuid4().hex,
        "video": {
            "roomJoin": True,
            "room": room,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
        "roomConfig": {"agents": [{"agentName": ZENNY_AGENT_NAME}]},
    }
    return jwt.encode(payload, settings.livekit_api_secret.strip(), algorithm="HS256")
