"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "EchoMind"
    app_version: str = "0.1.0"
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    llm_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        alias="LLM_BASE_URL",
    )
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_model: str = Field(default="llama-3.1-8b-instant", alias="LLM_MODEL")
    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS")

    tts_voice: str = Field(default="en-US-JennyNeural", alias="TTS_VOICE")
    tts_rate: str = Field(default="+0%", alias="TTS_RATE")
    tts_max_chars: int = Field(default=1200, alias="TTS_MAX_CHARS")
    tts_timeout_seconds: float = Field(default=45.0, alias="TTS_TIMEOUT_SECONDS")

    chat_max_question_chars: int = 1000
    chat_max_history_turns: int = 12
    chat_max_history_message_chars: int = 4000

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_key: str = Field(default="", alias="SUPABASE_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_audience: str = Field(
        default="authenticated",
        alias="SUPABASE_JWT_AUDIENCE",
    )
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    owner_user_ids: str = Field(default="", alias="OWNER_USER_IDS")

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def owner_user_id_list(self) -> List[str]:
        return [user_id.strip() for user_id in self.owner_user_ids.split(",") if user_id.strip()]

    @property
    def primary_owner_id(self) -> str:
        """First owner ID; used to scope service-role DB queries."""
        ids = self.owner_user_id_list
        return ids[0] if ids else ""

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key.strip())

    @property
    def supabase_configured(self) -> bool:
        """True when both URL and service-role key are present."""
        return bool(self.supabase_url.strip() and self.supabase_service_role_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
