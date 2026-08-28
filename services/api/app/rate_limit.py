from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

_limiter_options = {
    "key_func": get_remote_address,
    "default_limits": [settings.rate_limit_default],
}
if settings.rate_limit_storage_uri.strip():
    _limiter_options["storage_uri"] = settings.rate_limit_storage_uri.strip()

limiter = Limiter(**_limiter_options)
