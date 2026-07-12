from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch"
    )

    # Ingestion pipeline (python -m app.ingest). ANTHROPIC_API_KEY is read by the
    # anthropic SDK's zero-arg client; kept here so config surfaces it too.
    anthropic_api_key: str = ""
    ingest_model: str = "claude-haiku-4-5"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
