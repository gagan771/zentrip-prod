from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    livekit_url: str = "ws://127.0.0.1:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    deepgram_api_key: str = ""
    deepgram_stt_model: str = "nova-3"
    deepgram_tts_model: str = "flux-brittany-en"

    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"
    openrouter_fallback_model: str = "google/gemini-2.0-flash-exp:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection: str = "knowledge"

    redis_url: str = "redis://127.0.0.1:6379/0"

    agent_name: str = "Zenny"
    max_history_turns: int = 6
    rag_top_k: int = 4
    knowledge_dir: str = "knowledge"
    embedding_model: str = ""
    prompt_path: str = "prompts/system.md"
    zentrip_api_url: str = ""


settings = Settings()
