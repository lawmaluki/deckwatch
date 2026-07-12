from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
