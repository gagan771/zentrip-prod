"""Mutual-consent helpers for buddy chat (spec 10 / §23.4).

Identities stay hidden until both queued travelers consent. After unlock we
only surface a first name — never email or a full legal name.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models import BuddyPairConsent


def ordered_user_ids(user_a: uuid.UUID, user_b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (user_a, user_b) if user_a < user_b else (user_b, user_a)


def first_name_only(full_name: str | None) -> str:
    token = (full_name or "").strip().split()[0] if (full_name or "").strip() else ""
    return token[:40] if token else "Traveler"


def pair_unlocked(pair: BuddyPairConsent) -> bool:
    return pair.low_consented_at is not None and pair.high_consented_at is not None


def user_has_consented(pair: BuddyPairConsent, user_id: uuid.UUID) -> bool:
    if user_id == pair.user_low_id:
        return pair.low_consented_at is not None
    if user_id == pair.user_high_id:
        return pair.high_consented_at is not None
    return False


def apply_consent(pair: BuddyPairConsent, user_id: uuid.UUID, when: datetime) -> None:
    if user_id == pair.user_low_id:
        if pair.low_consented_at is None:
            pair.low_consented_at = when
        return
    if user_id == pair.user_high_id:
        if pair.high_consented_at is None:
            pair.high_consented_at = when
        return
    raise ValueError("user is not a member of this pair")


def peer_public_card(
    *,
    other_name: str | None,
    you_consented: bool,
    they_consented: bool,
) -> dict:
    unlocked = you_consented and they_consented
    return {
        "label": first_name_only(other_name) if unlocked else "Queued traveler",
        "displayName": first_name_only(other_name) if unlocked else None,
        "youConsented": you_consented,
        "theyConsented": they_consented,
        "chatUnlocked": unlocked,
    }
