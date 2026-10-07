"""CLI entrypoint: python -m app.ingest

Fetches configured RSS feeds, classifies items (rule-based by default, or Claude
when INGEST_CLASSIFIER=llm), and writes new incidents to the database. Needs a
reachable database (DATABASE_URL); the llm classifier also needs
ANTHROPIC_API_KEY."""

import sys

from ..config import settings
from ..db import SessionLocal
from .classify import build_classifier
from . import dedup, pipeline


def main() -> None:
    classify_fn = build_classifier()
    similarity = dedup.build_similarity(settings.dedup_text, settings.rag_embed_model)
    with SessionLocal() as session:
        stats = pipeline.run(session, classify_fn, similarity=similarity)
    summary = ", ".join(f"{k}={v}" for k, v in stats.items())
    print(f"ingest complete: {summary}")
    if hasattr(classify_fn, "summary"):
        print(classify_fn.summary())
    if stats.get("aborted"):
        # Non-zero exit turns the scheduled run red, so a dead key or empty
        # balance is noticed instead of quietly ingesting nothing.
        print("ingest FAILED: the classifier is unavailable; check ANTHROPIC_API_KEY and credit")
        sys.exit(1)


if __name__ == "__main__":
    main()
