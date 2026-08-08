"""Environment-based application configuration.

All runtime configuration is read from environment variables (or a local
.env file) through a single typed ``Settings`` object, so no other module
needs to call ``os.getenv`` directly.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings loaded from the environment."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Nexus-Grid"
    app_description: str = "Autonomous Caribbean Food Supply Chain AI"
    app_version: str = "1.0"
    environment: str = "development"

    database_url: str = "postgresql://postgres:postgres@db:5432/nexus"

    cmdop_api_key: str = ""

    # LLM provider for the workflow's recommendation step. MiniMax exposes
    # an OpenAI-compatible chat completions endpoint, called directly via
    # httpx (see app/workflows/minimax_recommend.py)
    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimax.io/v1"
    minimax_model: str = "MiniMax-M2"

    sho_api_key: str = ""
    sho_base_url: str = ""
    sho_model: str = ""

    # Backend selection: safe in-memory defaults for local development.
    event_bus_backend: str = "memory"
    checkpointer_backend: str = "memory"  # memory | sqlite | postgres
    checkpointer_sqlite_path: str = "data/checkpoints.db"
    rate_limit_backend: str = "memory"

    # Agent runtime
    skip_agent_startup: bool = False
    agent_poll_interval_seconds: int = 10

    # Security
    # Dev-only default; set SECRET_KEY (32+ bytes) in every real environment
    secret_key: str = "dev-only-nexus-grid-secret-key-change-in-production"
    access_token_expire_minutes: int = 60
    rate_limit_per_minute: int = 120

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings instance."""
    return Settings()
