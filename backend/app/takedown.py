"""Take an incident down at someone's request (Terms of Use: Corrections and
takedowns).

    python -m app.takedown ing-1a2b3c4d --reason "names a witness"        # show what would go
    python -m app.takedown ing-1a2b3c4d --reason "names a witness" --yes  # delete it

Deletes the incident and records each of its source links in
removed_articles, which ingestion treats as already seen, so the same
articles don't bring it back on the next hourly run. The API serves incident
lists from a short cache (INCIDENT_CACHE_SECONDS), so the map catches up
within minutes. A monthly report that counted the incident is a separate
document: rebuild or edit that month and re-import it. Needs DATABASE_URL."""

import argparse
import sys

from . import repository
from .db import SessionLocal
from .models import Incident


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.takedown", description=__doc__.split("\n")[0])
    parser.add_argument("incident_id", help='the incident id, e.g. "ing-1a2b3c4d"')
    parser.add_argument("--reason", required=True, help="why it is coming down, kept with the removed links")
    parser.add_argument("--yes", action="store_true", help="delete it (without this, only shows what would go)")
    args = parser.parse_args(argv)

    session = SessionLocal()
    try:
        incident = session.get(Incident, args.incident_id)
        if incident is None:
            print(f"no incident {args.incident_id}")
            return 1
        print(f"{incident.id}  {incident.reported_at:%Y-%m-%d}  {incident.county_name}  {incident.title}")
        for s in incident.sources or []:
            print(f"  {s.get('name', '')}: {s.get('url', '')}")
        if not args.yes:
            print("dry run: re-run with --yes to take it down")
            return 0
        urls = repository.take_down_incident(session, args.incident_id, args.reason)
        session.commit()
        print(f"taken down; {len(urls)} source link(s) blocked from re-ingestion")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
