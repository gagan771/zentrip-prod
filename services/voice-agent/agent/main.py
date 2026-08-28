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

logger = logging.getLogger("zentrip.voice-agent")


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
    def __init__(self) -> None:
        super().__init__(instructions=load_system_prompt())

    @function_tool()
    async def search_knowledge(self, query: str) -> str:
        """Search sourced India travel facts (monuments, cities, UPI, safety). Use for place and policy questions."""
        started = time.perf_counter()
        result = await rag_search(query)
        logger.info("tool search_knowledge ms=%s query=%s", int((time.perf_counter() - started) * 1000), query[:80])
        return result

    @function_tool()
    async def get_emergency_information(self) -> str:
        """Return India emergency numbers when the traveller is in danger or asks for police/ambulance."""
        return get_emergency_information()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("job room=%s", ctx.room.name)

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

    await session.start(agent=Zenny(), room=ctx.room)
    try:
        await session.generate_reply(
            instructions="Greet briefly as Zenny and wait. Do not dump a feature list.",
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
