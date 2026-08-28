"""Terminal smoke: RAG + OpenRouter answer a Taj Mahal question the way Zenny would."""

from __future__ import annotations

import asyncio
import json

from openai import AsyncOpenAI

from agent.config.settings import settings
from agent.prompts_loader import load_system_prompt
from agent.tools.search_knowledge import search_knowledge

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "Search sourced India travel facts (monuments, cities, UPI, safety).",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    }
]


async def main() -> None:
    print("model", settings.openrouter_model)
    kb = await search_knowledge("Taj Mahal Agra")
    print("=== RAG ===")
    print(kb[:900] or "(empty)")

    client = AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url)
    headers = {"HTTP-Referer": "https://zentrip.social", "X-Title": "Zentrip smoke"}
    messages: list[dict] = [
        {"role": "system", "content": load_system_prompt()},
        {
            "role": "assistant",
            "content": "Hi, I’m Zenny. Ask me about a place, a route, how to pay, or if you need help.",
        },
        {"role": "user", "content": "Did you know anything about the Taj Mahal?"},
    ]
    first = await client.chat.completions.create(
        model=settings.openrouter_model,
        messages=messages,
        tools=TOOLS,
        max_tokens=400,
        extra_headers=headers,
    )
    msg = first.choices[0].message
    print("=== first LLM turn ===")
    print("text:", (msg.content or "").strip() or "(no spoken text yet)")
    print("tool_calls:", [c.function.name for c in (msg.tool_calls or [])])

    if not msg.tool_calls:
        return

    messages.append(msg.model_dump(exclude_unset=True))
    for call in msg.tool_calls:
        args = json.loads(call.function.arguments or "{}")
        query = args.get("query") or "Taj Mahal Agra"
        result = await search_knowledge(query)
        messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    second = await client.chat.completions.create(
        model=settings.openrouter_model,
        messages=messages,
        max_tokens=400,
        extra_headers=headers,
    )
    print("=== spoken answer ===")
    print((second.choices[0].message.content or "").strip())


if __name__ == "__main__":
    asyncio.run(main())
