"""One-off cleanup: re-locate stored incidents with the current geocoder.

    python -m app.ingest.relocate                   # dry run: print the plan
    python -m app.ingest.relocate --out plan.json   # ...and save it for review
    python -m app.ingest.relocate --apply           # write it, in one transaction
    python -m app.ingest.relocate --apply --exclude ing-c88fbea7
                                                    # ...leaving out ones you disagree with

Until October 2026 the geocoder knew ~70 hotspots, so 96% of real incidents
were stored at their county's centre. geocode.locate now searches ~9,000
GeoNames places in the stored location, the headline, the AI summary and the
headlines of merged sources. This replays every stored real incident through
it and records the result: the point, the place name, the precision, and the
county when an unambiguous town shows it was filed under the wrong one.

Dry run by default. Review the county moves above all: they change county
pages and risk scores. --exclude leaves an incident exactly as stored. Every
other real incident gets its precision recorded, moved or not. Needs
DATABASE_URL."""

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from ..domain import Incident
from .geocode import is_county_centroid, locate

Change = Dict[str, Any]


def _summary_text(incident: Incident) -> str:
    """The AI summary plus every merged article's headline: a follow-up often
    names the place the first report didn't."""
    titles = [s.get("title", "") for s in incident.get("sources", []) if s.get("title") != incident["title"]]
    return " ".join([incident.get("aiSummary") or ""] + titles)


def plan(incidents: Sequence[Incident], exclude: Sequence[str] = ()) -> List[Change]:
    """Where the geocoder now puts each real incident. Pure."""
    skip = set(exclude)
    out: List[Change] = []
    for inc in incidents:
        if not str(inc["id"]).startswith("ing-") or inc["id"] in skip:
            continue
        loc = locate(inc["county"], inc["locationName"], inc["title"], _summary_text(inc))
        if loc is None:  # county no longer known: leave it
            continue
        before = (
            "county" if is_county_centroid(inc["county"], inc["lat"], inc["lng"]) else "placed"
        )
        out.append({
            "id": inc["id"],
            "title": inc["title"],
            "before": {
                "county": inc["county"], "locationName": inc["locationName"],
                "lat": inc["lat"], "lng": inc["lng"], "was": before,
                "precision": inc.get("locationPrecision"),
            },
            "after": {
                "county": loc.county, "locationName": loc.name,
                "lat": loc.lat, "lng": loc.lng, "precision": loc.precision,
            },
        })
    return out


def _moved(c: Change) -> bool:
    b, a = c["before"], c["after"]
    return abs(b["lat"] - a["lat"]) > 1e-4 or abs(b["lng"] - a["lng"]) > 1e-4


def describe(changes: Sequence[Change]) -> str:
    n = len(changes)
    if not n:
        return "no real incidents to re-locate"
    precision = Counter(c["after"]["precision"] for c in changes)
    lines = [f"{n} real incidents. Precision after:"]
    for p in ("local", "town", "road", "area", "county"):
        lines.append(f"  {p:<7} {precision[p]:>4}  {100 * precision[p] / n:3.0f}%")
    was_county = sum(1 for c in changes if c["before"]["was"] == "county")
    newly = [c for c in changes if c["before"]["was"] == "county" and c["after"]["precision"] != "county"]
    lines.append(f"\n{len(newly)} of {was_county} incidents at a county centre now have a place.")

    county_moves = [c for c in changes if c["before"]["county"] != c["after"]["county"]]
    lines.append(f"\nCOUNTY CHANGES ({len(county_moves)}): review each one")
    for c in county_moves:
        lines.append(
            f"  {c['id']}  {c['before']['county']} -> {c['after']['county']} "
            f"({c['after']['locationName']})  {c['title']}"
        )

    other = [c for c in changes if _moved(c) and c not in county_moves]
    lines.append(f"\nNEW POINTS IN THE SAME COUNTY ({len(other)})")
    for c in sorted(other, key=lambda c: (c["after"]["precision"], c["after"]["county"])):
        lines.append(
            f"  {c['id']}  {c['after']['precision']:<5} {c['after']['county']}: "
            f"{c['after']['locationName']}  <-  {c['title']}"
        )
    return "\n".join(lines)


def apply(session: Any, changes: Sequence[Change]) -> None:
    from .. import repository

    for c in changes:
        a = c["after"]
        repository.relocate_incident(
            session, c["id"], a["county"], a["locationName"], a["lat"], a["lng"], a["precision"]
        )
    session.commit()


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write the new locations (default: dry run)")
    ap.add_argument("--out", type=Path, help="write the plan as JSON")
    ap.add_argument("--exclude", action="append", default=[], metavar="ID",
                    help="incident id to leave exactly as stored (repeatable)")
    args = ap.parse_args(argv)

    from .. import repository
    from ..db import SessionLocal

    with SessionLocal() as session:
        changes = plan(repository.get_all_incidents(session, detail=True), args.exclude)
        print(describe(changes))
        if args.out:
            args.out.write_text(json.dumps(changes, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\nwrote {args.out}")
        if not changes:
            return
        if not args.apply:
            print("\nDry run: nothing changed. Re-run with --apply to write.")
            return
        apply(session, changes)
        print(f"\nre-located {len(changes)} incidents")


if __name__ == "__main__":
    main()
