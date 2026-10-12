"""Create the PostGIS extension and all tables. Idempotent.

Used instead of migrations while the schema is still a fixed seed; Alembic
comes in when the schema starts evolving (Phase 5+). Until then a column added
to an existing table is added here too, because create_all only creates
tables that are missing and never alters one that exists."""

from sqlalchemy import text

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .db import Base, engine

# Columns added after their table was first deployed. Each must be nullable
# (or defaulted) so existing rows stay valid, and safe to run on every boot.
ADDED_COLUMNS = (
    "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_precision text",
)


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for statement in ADDED_COLUMNS:
            conn.execute(text(statement))
    print("Database initialized (postgis + tables).")


if __name__ == "__main__":
    main()
