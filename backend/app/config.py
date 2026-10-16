from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch"
    )

    # Ingestion pipeline (python -m app.ingest).
    #   ingest_classifier: "rule" (free, no key), "llm" (Claude Haiku 4.5) or
    #   "rag" (the same model, shown similar human-reviewed articles first) or
    #   "hybrid" (the rules decide clear cases, everything else goes to rag).
    # ANTHROPIC_API_KEY is read by the anthropic SDK's zero-arg client.
    ingest_classifier: str = "rule"
    ingest_model: str = "claude-haiku-4-5"
    anthropic_api_key: str = ""

    # RAG classifier. Examples are embedded locally (fastembed), no extra key.
    # rag_min_score is the cosine-similarity floor below which a retrieved
    # example is treated as unrelated and left out of the prompt.
    rag_examples_path: str = "fixtures/rag-examples.jsonl"
    # Also learn from every reviewed monthly report stored in the database.
    rag_examples_from_db: bool = True
    rag_embed_model: str = "BAAI/bge-small-en-v1.5"
    rag_top_k: int = 5
    rag_min_score: float = 0.55

    # Duplicate detection by headline (ingest/dedup.py): "auto" uses the
    # embedding model when the "rag" extra is installed, word overlap otherwise;
    # "embedding" / "lexical" force one; "off" keeps only the location rule.
    dedup_text: str = "auto"

    # Monthly report (python -m app.monthly). Consolidation is one long request
    # a month, so it uses the most capable model; without an API key the report
    # falls back to one incident per article, clearly marked as unreviewed.
    report_model: str = "claude-opus-5-5"

    # Whether the API container seeds the sample dataset on boot. Keep true so
    # the map isn't blank before the first ingest; set false for a clean prod DB.
    seed_on_start: bool = True

    # Seconds the API serves incident lists from memory before re-reading the
    # database (app/cache.py). Data only moves when ingest runs (every 15 min),
    # so a few minutes of staleness is invisible but saves most of the egress.
    # 0 disables the cache.
    incident_cache_seconds: int = 300

    # Media Cloud (search.mediacloud.org): only for finding new feeds
    # (python -m app.ingest.discover_feeds). Ingestion doesn't use it.
    mediacloud_api_key: str = ""

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
