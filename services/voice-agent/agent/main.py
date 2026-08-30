"""LiveKit worker: Deepgram STT/TTS, OpenRouter LLM, RAG/emergency tools. No secrets on the phone."""

from __future__ import annotations

import logging
import time

from livekit.agents import Agent, AgentSession, AutoSubscribe, JobContext, WorkerOptions, cli, function_tool
from livekit.plugins import deepgram, openai, silero

from agent.config.settings import settings
from agent.prompts_loader import load_system_prompt
from agent.tools.emergency import get_emergency_information
from agent.tools.search_knowledge import search_knowledge as rag_search
from agent.trip_brief import focus_city, greeting_instructions, spoken_trip_instructions, trip_context_from_metadata

logger = logging.getLogger("zentrip.voice-agent")

_NO_TRIP = '{"hasTrip":false}'


def trip_context_from_job(ctx: JobContext) -> str:
    job = getattr(ctx, "job", None)
    return trip_context_from_metadata(getattr(job, "metadata", None), getattr(ctx.room, "metadata", None))


def _openrouter_llm(model: str) -> openai.LLM:
    return openai.LLM(
        model=model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        max_completion_tokens=256,
    )


def _tts():
    model = settings.deepgram_tts_model
    kwargs = {"model": model, "api_key": settings.deepgram_api_key or None}
    if model.startswith("flux-"):
        return deepgram.TTSv2(**kwargs)
    return deepgram.TTS(**kwargs)


def _llm():
    fallback_name = (settings.openrouter_fallback_model or "").strip()
    if fallback_name and fallback_name != settings.openrouter_model:
        try:
            from livekit.agents.llm import FallbackAdapter

            return FallbackAdapter(
                [_openrouter_llm(settings.openrouter_model), _openrouter_llm(fallback_name)]
            )
        except Exception:
            logger.warning("LLM fallback adapter unavailable; using %s only", settings.openrouter_model)
    return _openrouter_llm(settings.openrouter_model)


class Zenny(Agent):
    def __init__(self, trip_context: str = _NO_TRIP) -> None:
        extra = spoken_trip_instructions(trip_context)
        super().__init__(instructions=f"{load_system_prompt()}\n\n# This traveler\n{extra}")
        self._trip_context = trip_context or _NO_TRIP

    @function_tool()
    async def search_knowledge(self, query: str) -> str:
        """Search sourced India travel facts (monuments, cities, UPI, safety). Use for place and policy questions."""
        started = time.perf_counter()
        city = focus_city(self._trip_context)
        result = await rag_search(query, city)
        logger.info(
            "tool search_knowledge ms=%s query=%s city=%s",
            int((time.perf_counter() - started) * 1000),
            query[:80],
            city[:40],
        )
        return result

    @function_tool()
    async def get_trip_context(self) -> str:
        """Return this traveler's saved trip (cities, dates, pace). Use when they ask what to do today or about their plan."""
        return self._trip_context

    @function_tool()
    async def get_emergency_information(self) -> str:
        """Return India emergency numbers when the traveller is in danger or asks for police/ambulance."""
        return get_emergency_information()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    trip_context = trip_context_from_job(ctx)
    logger.info("job room=%s hasTrip=%s", ctx.room.name, "true" if '"hasTrip":true' in trip_context.replace(" ", "") else "false")

    session = AgentSession(
        stt=deepgram.STT(
            model=settings.deepgram_stt_model,
            language="en",
            interim_results=True,
            punctuate=True,
            smart_format=True,
            api_key=settings.deepgram_api_key or None,
        ),
        llm=_llm(),
        tts=_tts(),
        vad=silero.VAD.load(),
    )

    await session.start(agent=Zenny(trip_context), room=ctx.room)
    try:
        await session.generate_reply(
            instructions=greeting_instructions(trip_context),
            allow_interruptions=True,
        )
    except Exception:
        logger.exception("greeting failed; session stays open for the caller")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="zenny",
        )
    )
