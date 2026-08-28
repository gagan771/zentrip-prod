from pathlib import Path

from agent.config.settings import settings


def load_system_prompt() -> str:
    path = Path(settings.prompt_path)
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return (
        "You are Zenny, Zentrip's India travel companion. "
        "Speak in 1-3 short sentences. Use search_knowledge for places and facts. "
        "If they are in danger, tell them to call 112. Never invent ticket prices or cafes."
    )
