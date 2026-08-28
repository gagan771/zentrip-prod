from openai import AsyncOpenAI

from agent.config.settings import settings


def openrouter_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
        default_headers={
            "HTTP-Referer": "https://zentrip.social",
            "X-Title": "Zentrip Zenny",
        },
    )
