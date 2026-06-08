"""Recoup — backend configuration.

Reads environment (optionally a .env) and reports which live integrations are
wired. Missing credentials are NOT fatal: the service runs in clearly-labelled
fallback mode so the whole flow stays demoable. Gemini activates with a free
AI Studio key; MongoDB (the partner MCP / store) activates with a free Atlas URI.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"  # backend/.env, regardless of CWD


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # --- Gemini (free Google AI Studio key) ---
    google_api_key: str = ""
    use_vertex: bool = False
    gemini_model: str = "gemini-2.5-flash"  # free tier; gemini-3-pro-preview with billing
    google_cloud_project: str = ""
    google_cloud_region: str = "us-central1"

    # --- MongoDB (partner MCP + case store; free Atlas M0) ---
    mongodb_uri: str = ""
    mongodb_db: str = "recoup"

    # --- behaviour ---
    use_cached_fallback: bool = True
    cors_origins: str = "*"

    @property
    def gemini_ready(self) -> bool:
        return bool(self.google_api_key or self.google_cloud_project)

    @property
    def mongodb_ready(self) -> bool:
        return bool(self.mongodb_uri)

    def integration_status(self) -> dict:
        return {
            "gemini": "live" if self.gemini_ready else "fallback",
            "mongodb": "live" if self.mongodb_ready else "fallback",
        }

    @property
    def mode(self) -> str:
        return "live" if all(v == "live" for v in self.integration_status().values()) else "partial"


@lru_cache
def get_settings() -> Settings:
    return Settings()
