"""Camera-based landmark identification, per 07-historical-cultural-guide.md §17.4:

    GPS narrows candidates -> image classification -> confidence threshold
    -> knowledge retrieval -> LLM turns retrieved facts into conversational text -> TTS

This module owns only the classification step (the second arrow above). It is
deliberately CONSTRAINED classification, not open-ended "what is this and tell me
about it" — the model is given a fixed list of known KB entity names and must pick
one exactly or say none, with a confidence tier. Facts about whichever entity gets
identified still come from the existing citation-first Knowledge Base
(app.knowledge_service / app.routers.guide), never from the vision model's own
"knowledge" of the landmark. This is the same retrieve-then-generate rule the guide
and payment intents already follow — 07's Guardrails §5: "Never let the LLM answer
historical/cultural questions purely from model memory when a KB entry exists."
"""

import base64
import json
from typing import Any

import anthropic
import requests

from app.config import settings


class VisionNotConfiguredError(Exception):
    pass


class VisionProviderError(Exception):
    pass


class LandmarkIdentification:
    def __init__(self, entity_name: str | None, confidence: str):
        self.entity_name = entity_name
        self.confidence = confidence  # "high" | "medium" | "low" | "none"


_IDENTIFY_TOOL = {
    "name": "identify_landmark",
    "description": "Report which known landmark (if any) the photo shows.",
    "input_schema": {
        "type": "object",
        "properties": {
            "landmarkName": {
                "type": ["string", "null"],
                "description": "Must exactly match one of the candidate names given in the system prompt, or null if none match.",
            },
            "confidence": {
                "type": "string",
                "enum": ["high", "medium", "low", "none"],
                "description": "How confident you are in this identification.",
            },
        },
        "required": ["landmarkName", "confidence"],
    },
}


def _system_prompt(candidate_names: list[str]) -> str:
    names = "\n".join(f"- {name}" for name in candidate_names)
    return (
        "You are a landmark classifier for a travel app. You will see one photo. Decide whether "
        "it shows one of these known landmarks:\n"
        f"{names}\n\n"
        "Respond with the exact candidate name (character-for-character) if you recognize one of "
        "them, or null if the photo doesn't clearly show any of them (a different building, a "
        "street, a person, food, an unrelated landmark not on this list, etc). Do not guess a name "
        "that isn't in the list above, even if you recognize a different famous landmark. Do not "
        "describe the landmark or provide any facts about it — only classify. Call the "
        "identify_landmark tool with your answer."
    )


def _client() -> anthropic.Anthropic:
    if not settings.anthropic_api_key:
        raise VisionNotConfiguredError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _identify_with_anthropic(image_bytes: bytes, media_type: str, candidate_names: list[str]) -> LandmarkIdentification:
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    response = _client().messages.create(
        model=settings.anthropic_model,
        max_tokens=256,
        system=_system_prompt(candidate_names),
        tools=[_IDENTIFY_TOOL],
        tool_choice={"type": "tool", "name": "identify_landmark"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                    {"type": "text", "text": "Identify this landmark, if it's one of the candidates."},
                ],
            }
        ],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "identify_landmark":
            return LandmarkIdentification(
                entity_name=block.input.get("landmarkName"), confidence=block.input.get("confidence", "none")
            )
    raise VisionProviderError("Claude did not return the expected identify_landmark tool call")


def _openrouter_tool() -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": _IDENTIFY_TOOL["name"],
            "description": _IDENTIFY_TOOL["description"],
            "parameters": _IDENTIFY_TOOL["input_schema"],
        },
    }


def _identify_with_openrouter(image_bytes: bytes, media_type: str, candidate_names: list[str]) -> LandmarkIdentification:
    if not settings.openrouter_api_key:
        raise VisionNotConfiguredError("OPENROUTER_API_KEY is not set")
    if not settings.openrouter_vision_model:
        raise VisionNotConfiguredError(
            "OPENROUTER_VISION_MODEL is not set — the default openrouter_model (free-model router) "
            "is not guaranteed to support image input for landmark identification."
        )

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    if settings.openrouter_site_url:
        headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        headers["X-Title"] = settings.openrouter_app_name

    response = requests.post(
        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
        headers=headers,
        json={
            "model": settings.openrouter_vision_model,
            "messages": [
                {"role": "system", "content": _system_prompt(candidate_names)},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this landmark, if it's one of the candidates."},
                        {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{image_b64}"}},
                    ],
                },
            ],
            "tools": [_openrouter_tool()],
            "tool_choice": {"type": "function", "function": {"name": "identify_landmark"}},
            "max_tokens": 256,
        },
        timeout=60,
    )
    if not response.ok:
        raise VisionProviderError(f"OpenRouter returned HTTP {response.status_code}: {response.text[:500]}")

    try:
        message = response.json()["choices"][0]["message"]
        tool_call = next(call for call in message.get("tool_calls", []) if call["function"]["name"] == "identify_landmark")
        args = json.loads(tool_call["function"]["arguments"])
        return LandmarkIdentification(entity_name=args.get("landmarkName"), confidence=args.get("confidence", "none"))
    except (KeyError, IndexError, StopIteration, TypeError, json.JSONDecodeError) as exc:
        raise VisionProviderError("OpenRouter did not return the expected identify_landmark tool call") from exc


def identify_landmark(image_bytes: bytes, media_type: str, candidate_names: list[str]) -> LandmarkIdentification:
    if not candidate_names:
        return LandmarkIdentification(entity_name=None, confidence="none")

    if settings.llm_provider == "anthropic":
        result = _identify_with_anthropic(image_bytes, media_type, candidate_names)
    elif settings.llm_provider == "openrouter":
        result = _identify_with_openrouter(image_bytes, media_type, candidate_names)
    else:
        raise VisionProviderError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")

    # Defense in depth: even a "confident"-looking model response must be an exact match
    # to a real candidate — never trust free-form model output as a Knowledge Base key.
    if result.entity_name not in candidate_names:
        return LandmarkIdentification(entity_name=None, confidence="none")
    return result
