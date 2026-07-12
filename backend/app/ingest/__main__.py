"""CLI entrypoint: python -m app.ingest

Fetches configured RSS feeds, classifies items with Claude, and writes new
incidents to the database. Requires ANTHROPIC_API_KEY in the environment and a
reachable database (DATABASE_URL)."""

from anthropic import Anthropic

from ..db import SessionLocal
from . import pipeline


def main() -> None:
    client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    with SessionLocal() as session:
        stats = pipeline.run(client, session)
    summary = ", ".join(f"{k}={v}" for k, v in stats.items())
    print(f"ingest complete: {summary}")


if __name__ == "__main__":
    main()
