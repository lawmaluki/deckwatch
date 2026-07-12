"""Create the PostGIS extension and all tables. Idempotent.

Used instead of migrations while the schema is still a fixed seed; Alembic
comes in when the schema starts evolving (Phase 5+)."""

from sqlalchemy import text

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .db import Base, engine


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    Base.metadata.create_all(engine)
    print("Database initialized (postgis + tables).")


if __name__ == "__main__":
    main()
