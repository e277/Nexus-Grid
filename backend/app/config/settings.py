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
    redis_url: str = "redis://redis:6379/0"

    openai_api_key: str = ""
    cmdop_api_key: str = ""

    # Backend selection: safe in-memory defaults; compose/prod opt into
    # redis/postgres for durability across restarts and replicas
    event_bus_backend: str = "memory"  # memory | redis
    checkpointer_backend: str = "memory"  # memory | sqlite | postgres
    checkpointer_sqlite_path: str = "data/checkpoints.db"
    rate_limit_backend: str = "memory"  # memory | redis

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
