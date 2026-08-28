"""Shared HTTPS session for OpenRouter / Deepgram — connection reuse cuts first-byte latency."""

from functools import lru_cache

import requests
from requests.adapters import HTTPAdapter


@lru_cache(maxsize=1)
def http_session() -> requests.Session:
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=16, pool_maxsize=16, max_retries=0)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session
