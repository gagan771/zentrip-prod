from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # local | staging | production — production refuses the default JWT secret and hides /docs.
    app_env: str = "local"

    # Postgres is the single primary DB for the whole app (see 00-consolidated-tech-stack.md §1.3).
    database_url: str = "postgresql+asyncpg://zentrip:zentrip@localhost:5432/zentrip"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # Comma-separated browser origins. "*" is only appropriate for local Expo web / LAN testing.
    cors_origins: str = "*"
    rate_limit_default: str = "120/minute"
    rate_limit_auth: str = "20/minute"

    @property
    def cors_origin_list(self) -> list[str]:
        raw = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        return raw or ["*"]

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
    staff_emails: str = ""

    @property
    def staff_email_list(self) -> list[str]:
        return [email.strip().casefold() for email in self.staff_emails.split(",") if email.strip()]

    # Zenny voice-first mode. The faster-whisper dependency and its model are
    # deliberately optional so ordinary API development does not download a speech
    # model or require GPU resources at startup. See requirements-voice.txt.
    # tiny is multilingual and much faster than base.en on CPU. Set VOICE_STT_MODEL=base.en
    # if you want higher English accuracy and can wait. cpu avoids a CUDA/cuBLAS hang on Windows.
    voice_stt_model: str = "tiny"
    voice_stt_device: str = "cpu"
    voice_stt_compute_type: str = "int8"
    voice_stt_beam_size: int = 1
    # Companion is English-first. "auto" forces language detection on every clip (~0.5–2s).
    voice_stt_language: str = "en"
    voice_max_upload_bytes: int = 15_000_000
    voice_warmup: bool = True
    # Optional Deepgram key for multilingual translator STT. When empty, faster-whisper is used.
    deepgram_api_key: str = ""
    # Paid streaming STT. One key, or many for rate-limit failover (comma-separated).
    sarvam_api_key: str = ""
    sarvam_api_keys: str = ""
    sarvam_rate_limit_cooldown_seconds: int = 90
    voice_live_enabled: bool = True
    # BCP-47 for Sarvam realtime. "en" → en-IN. "auto" detects Hinglish but is slower on short clips.
    voice_stt_bcp47: str = ""

    @property
    def voice_language_tag(self) -> str:
        if self.voice_stt_bcp47.strip():
            return self.voice_stt_bcp47.strip()
        raw = (self.voice_stt_language or "en").strip().casefold()
        if raw in {"auto", "unknown"}:
            return "auto"
        if "-" in raw:
            return raw
        mapping = {
            "en": "en-IN",
            "hi": "hi-IN",
            "ta": "ta-IN",
            "te": "te-IN",
            "bn": "bn-IN",
            "ml": "ml-IN",
            "mr": "mr-IN",
            "gu": "gu-IN",
            "kn": "kn-IN",
            "pa": "pa-IN",
        }
        return mapping.get(raw, "en-IN")

    @property
    def sarvam_key_list(self) -> list[str]:
        from app.sarvam_keys import parse_sarvam_keys

        return parse_sarvam_keys(self.sarvam_api_key, self.sarvam_api_keys)

    @property
    def live_stt_ready(self) -> bool:
        return bool(self.sarvam_key_list or self.deepgram_api_key.strip())


settings = Settings()
