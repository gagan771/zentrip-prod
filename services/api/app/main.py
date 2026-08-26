from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agent, auth, compare, guide, knowledge, memory, onboarding, trips, zenny_voice

app = FastAPI(title="Zentrip API", version="0.1.0")

# Dev-only: wide open CORS so the Expo app (any origin/port during development) can call this.
# Tighten this before anything resembling production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agent.router)
app.include_router(trips.router)
app.include_router(onboarding.router)
app.include_router(compare.router)
app.include_router(guide.router)
app.include_router(knowledge.router)
app.include_router(memory.router)
app.include_router(zenny_voice.router)


@app.get("/health")
async def health() -> dict:
    """No DB/Redis dependency on purpose — this must answer even if those are down."""
    return {"status": "ok", "service": "zentrip-api"}
