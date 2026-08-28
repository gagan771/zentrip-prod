from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.rate_limit import limiter
from app.routers import (
    agent,
    auth,
    compare,
    experts,
    explorer,
    grocery,
    guide,
    guardian,
    knowledge,
    memory,
    moderation,
    onboarding,
    peaks,
    risk,
    social,
    trails,
    translation,
    trips,
    zenny_live,
    zenny_voice,
)

# Refuse to boot with the well-known local default when APP_ENV=production.
if settings.app_env == "production" and settings.jwt_secret in ("", "dev-secret-change-me"):
    raise RuntimeError("JWT_SECRET must be set to a strong random value when APP_ENV=production")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.voice_warmup and not settings.live_stt_ready:
        import asyncio

        from app.voice_service import warmup_transcriber

        asyncio.create_task(asyncio.to_thread(warmup_transcriber))
    yield


app = FastAPI(
    title="Zentrip API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None if settings.app_env == "production" else "/redoc",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Dev defaults to *; production/staging should set CORS_ORIGINS to an explicit list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agent.router)
app.include_router(trips.router)
app.include_router(onboarding.router)
app.include_router(onboarding.config_router)
app.include_router(compare.router)
app.include_router(guide.router)
app.include_router(guardian.router)
app.include_router(translation.router)
app.include_router(risk.router)
app.include_router(explorer.router)
app.include_router(experts.router)
app.include_router(moderation.router)
app.include_router(trails.router)
app.include_router(peaks.router)
app.include_router(knowledge.router)
app.include_router(memory.router)
app.include_router(zenny_voice.router)
app.include_router(zenny_live.router)
app.include_router(social.router)
app.include_router(grocery.router)


@app.get("/health")
@limiter.exempt
async def health() -> dict:
    """No DB/Redis dependency on purpose — this must answer even if those are down."""
    return {"status": "ok", "service": "zentrip-api"}


@app.get("/ready")
@limiter.exempt
async def ready(request: Request) -> JSONResponse:
    """Liveness of dependencies for deploy probes. Returns 503 if DB or Redis is down."""
    del request
    from sqlalchemy import text

    from app.db import engine
    from app.redis_client import redis

    checks: dict[str, str] = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 — probe must never raise
        checks["database"] = f"error:{type(exc).__name__}"
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error:{type(exc).__name__}"

    ok = all(value == "ok" for value in checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ready" if ok else "degraded", "checks": checks},
    )
