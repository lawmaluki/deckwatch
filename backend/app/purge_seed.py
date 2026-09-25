"""Delete the seeded sample incidents, keeping everything ingestion produced.

The seed existed to keep the map populated before real reporting arrived.
Nothing serves it any more — server pages filter to ingested incidents and
/api/incidents forces live=true — so on a deployed database those rows are
unreadable weight that every query still pages through.

Ingested incidents are the ones whose id starts with "ing-" (set in
pipeline.build_incident, and the same rule repository._to_dict uses to
derive isLive). Anything else came from the seed.

    python -m app.purge_seed          # show what would go
    python -m app.purge_seed --yes    # delete it

Set SEED_ON_START=false first, or the next restart puts it all back.
"""

import sys

from sqlalchemy import func, not_, select

from .db import SessionLocal
from .models import Incident

INGESTED_PREFIX = "ing-"


def main() -> int:
    confirmed = "--yes" in sys.argv
    session = SessionLocal()
    try:
        is_seed = not_(Incident.id.startswith(INGESTED_PREFIX))
        seeded = session.scalar(select(func.count()).select_from(Incident).where(is_seed)) or 0
        kept = session.scalar(
            select(func.count()).select_from(Incident).where(~is_seed)
        ) or 0

        if seeded == 0:
            print(f"nothing to purge; {kept} ingested incidents present")
            return 0

        if not confirmed:
            print(f"would delete {seeded} seeded incidents, keeping {kept} ingested")
            print("re-run with --yes to apply")
            return 0

        session.query(Incident).filter(is_seed).delete(synchronize_session=False)
        session.commit()
        print(f"deleted {seeded} seeded incidents; {kept} ingested remain")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
