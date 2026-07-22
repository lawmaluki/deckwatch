from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch"
    )

    # Ingestion pipeline (python -m app.ingest).
    #   ingest_classifier: "rule" (free, no key) or "llm" (Claude Haiku 4.5).
    # ANTHROPIC_API_KEY is read by the anthropic SDK's zero-arg client.
    ingest_classifier: str = "rule"
    ingest_model: str = "claude-haiku-4-5"
    anthropic_api_key: str = ""

    # Whether the API container seeds the sample dataset on boot. Keep true so
    # the map isn't blank before the first ingest; set false for a clean prod DB.
    seed_on_start: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # Managed hosts (e.g. Railway) emit a bare postgresql:// URL; SQLAlchemy
        # needs the driver named so it uses psycopg 3, not psycopg2.
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://") :]
        if v.startswith("postgres://"):  # some providers use the older scheme
            return "postgresql+psycopg://" + v[len("postgres://") :]
        return v


settings = Settings()
