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
    gemini_model: str = "gemini-3-flash-preview"  # hackathon headline model; falls back to gemini-2.5-flash if unavailable
    # Resilience ladder, tried in order when the primary is rate-limited. Gemma models are served
    # FREE on the same Generative Language API with a separate (larger) quota pool, so the agent
    # keeps a REAL Google model reasoning 24/7 — zero extra infrastructure, zero cost. Each tier
    # is labeled honestly in the response (`model` field) — never passed off as Gemini 3.
    fallback_models: str = "gemma-3-27b-it,gemma-3-12b-it,gemini-2.5-flash"
    google_cloud_project: str = ""
    google_cloud_region: str = "us-central1"

    # --- MongoDB (partner MCP + case store; free Atlas M0) ---
    mongodb_uri: str = ""
    mongodb_db: str = "recoup"

    # --- auth (all optional; each provider activates when its key is set) ---
    app_secret: str = ""                    # HMAC secret for session tokens
    base_url: str = "http://localhost:8099"  # public backend URL (for OAuth/magic-link callbacks)
    frontend_url: str = "http://localhost:8099"  # set to the Cloud Run URL in production
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    resend_api_key: str = ""                # magic-link email sender (resend.com, free)
    email_from: str = "Recoup <onboarding@resend.dev>"
    turnstile_secret: str = ""              # Cloudflare Turnstile CAPTCHA (free)
    turnstile_site_key: str = ""

    # --- behaviour ---
    use_cached_fallback: bool = True
    # pinned allowlist by default (never reflect an arbitrary Origin with credentials). Set to "*" only for a no-credentials open demo.
    cors_origins: str = "http://localhost:8123,http://127.0.0.1:8123"

    @property
    def gemini_ready(self) -> bool:
        return bool(self.google_api_key or self.google_cloud_project)

    @property
    def mongodb_ready(self) -> bool:
        return bool(self.mongodb_uri)

    @property
    def email_ready(self) -> bool:
        return bool(self.resend_api_key)

    def integration_status(self) -> dict:
        return {
            "gemini": "live" if self.gemini_ready else "fallback",
            "mongodb": "live" if self.mongodb_ready else "fallback",
        }

    @property
    def mode(self) -> str:
        return "live" if all(v == "live" for v in self.integration_status().values()) else "partial"

    @property
    def is_local(self) -> bool:
        """True only for a localhost/dev backend — gates dev-only affordances (e.g. the magic-link dev_link)."""
        b = (self.base_url or "").lower()
        return "localhost" in b or "127.0.0.1" in b


@lru_cache
def get_settings() -> Settings:
    return Settings()
