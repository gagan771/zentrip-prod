from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres is the single primary DB for the whole app (see 00-consolidated-tech-stack.md §1.3).
    database_url: str = "postgresql+asyncpg://zentrip:zentrip@localhost:5432/zentrip"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # Set this to the real OAuth client ID(s) from Google Cloud Console before
    # "Continue with Google" actually works end to end. Accepts a comma-separated
    # list because Google issues a different client ID per platform (web/iOS/Android)
    # and a token's `aud` claim must match one of them.
    google_client_ids: str = ""

    @property
    def google_client_id_list(self) -> list[str]:
        return [c.strip() for c in self.google_client_ids.split(",") if c.strip()]

    # OpenRouter is the default Phase 1 provider so development can use the free-model
    # router. Set LLM_PROVIDER=anthropic only when switching back to direct Claude.
    llm_provider: str = "openrouter"
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_site_url: str = ""
    openrouter_app_name: str = "Zentrip"
    # Camera-based landmark ID (07-historical-cultural-guide.md, full version) needs a
    # vision-capable model. openrouter_model above defaults to the free-model router,
    # which is not guaranteed to support image input — kept separate so a working text
    # itinerary setup doesn't silently break landmark ID, and vice versa.
    openrouter_vision_model: str = ""

    # Optional direct Claude configuration. It remains available as a provider adapter,
    # but is no longer required for the default local setup.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"

    # Twilio outbound onboarding call. PUBLIC_BASE_URL must be reachable by Twilio and
    # should be HTTPS outside local development/tunnel testing.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    public_base_url: str = ""

    # Zenny voice-first mode. The faster-whisper dependency and its model are
    # deliberately optional so ordinary API development does not download a speech
    # model or require GPU resources at startup. See requirements-voice.txt.
    voice_stt_model: str = "base.en"
    voice_stt_device: str = "auto"
    voice_stt_compute_type: str = "int8"
    voice_max_upload_bytes: int = 15_000_000


settings = Settings()
