"""Rotate Sarvam free-tier keys when one account hits its rate limit."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

_SPLIT = re.compile(r"[\s,;]+")
_LIMIT_HINTS = ("rate", "quota", "limit", "429", "capacity", "throttle")


def parse_sarvam_keys(*raw_groups: str) -> list[str]:
    seen: set[str] = set()
    keys: list[str] = []
    for group in raw_groups:
        for piece in _SPLIT.split(group or ""):
            key = piece.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            keys.append(key)
    return keys


def is_sarvam_rate_limit(message: str | None = None, close_code: int | None = None) -> bool:
    if close_code in {1003, 1008, 4003, 4029}:
        return True
    text = (message or "").casefold()
    return any(hint in text for hint in _LIMIT_HINTS)


def key_label(key: str) -> str:
    return f"...{key[-4:]}" if len(key) >= 4 else "****"


@dataclass
class SarvamKeyPool:
    keys: list[str]
    cooldown_seconds: float = 90.0
    _index: int = 0
    _cooldown_until: dict[str, float] = field(default_factory=dict)

    def acquire(self, now: float | None = None) -> str | None:
        if not self.keys:
            return None
        clock = time.monotonic() if now is None else now
        for _ in range(len(self.keys)):
            key = self.keys[self._index % len(self.keys)]
            self._index += 1
            if self._cooldown_until.get(key, 0) <= clock:
                return key
        return None

    def mark_limited(self, key: str, now: float | None = None, seconds: float | None = None) -> None:
        clock = time.monotonic() if now is None else now
        self._cooldown_until[key] = clock + (self.cooldown_seconds if seconds is None else seconds)

    def seconds_until_ready(self, now: float | None = None) -> float:
        if not self.keys:
            return 0.0
        clock = time.monotonic() if now is None else now
        waits = [max(0.0, self._cooldown_until.get(key, 0) - clock) for key in self.keys]
        return min(waits) if waits else 0.0

    @property
    def ready_count(self) -> int:
        clock = time.monotonic()
        return sum(1 for key in self.keys if self._cooldown_until.get(key, 0) <= clock)


_pool: SarvamKeyPool | None = None


def sarvam_pool() -> SarvamKeyPool:
    global _pool
    from app.config import settings

    keys = settings.sarvam_key_list
    cooldown = float(settings.sarvam_rate_limit_cooldown_seconds)
    if _pool is None or _pool.keys != keys or _pool.cooldown_seconds != cooldown:
        _pool = SarvamKeyPool(keys=keys, cooldown_seconds=cooldown)
    return _pool
