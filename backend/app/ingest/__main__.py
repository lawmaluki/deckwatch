"""CLI entrypoint: python -m app.ingest

Fetches configured RSS feeds, classifies items (rule-based by default, or Claude
when INGEST_CLASSIFIER=llm), and writes new incidents to the database. Needs a
reachable database (DATABASE_URL); the llm classifier also needs
ANTHROPIC_API_KEY."""

from ..db import SessionLocal
from .classify import build_classifier
from . import pipeline


def main() -> None:
    classify_fn = build_classifier()
    with SessionLocal() as session:
        stats = pipeline.run(session, classify_fn)
    summary = ", ".join(f"{k}={v}" for k, v in stats.items())
    print(f"ingest complete: {summary}")


if __name__ == "__main__":
    main()
