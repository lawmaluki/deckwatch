"""How precisely are Deckwatch incidents located?

Measures whether the incident data is good enough for Route Watch (matching
incidents to a travel route). Every incident's coordinates come from the
geocoder (backend/app/ingest/geocode.py), which can only produce one of:

  a known place  - one of the hotspots in backend/fixtures/hotspots.json
  county centre  - no known place was found, so the county's centre is used

and a known place covers one of four sizes of ground:

  neighbourhood - an estate, CBD or landmark (e.g. "Eastleigh")
  town          - a town (e.g. "Naivasha")
  road          - a whole road stored as one point (e.g. "Thika Road")
  region        - a wide area (e.g. "Tana River Delta")

Run from the repo root (no install needed, standard library only):

    python scripts/location-precision.py                    # reads the live site
    python scripts/location-precision.py incidents.json     # or a saved copy
    python scripts/location-precision.py --url http://localhost:3000/api/incidents
"""

import argparse
import json
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "backend" / "fixtures"
DEFAULT_URL = "https://deckwatch.vercel.app/api/incidents"
TOL = 1e-4  # ~10 m; coordinates round-trip through PostGIS

# Every hotspot in backend/fixtures/hotspots.json, by how much ground it covers.
# Listed by hand because names don't say it reliably ("Naivasha" is a town,
# "Tana River Delta" is a whole region). A hotspot added later and missing here
# is reported as "unlisted" so this table gets updated.
PLACE_KIND = {
    "road": ["Mombasa Road", "Ngong Road", "Thika Road"],
    "neighbourhood": [
        "Eastleigh", "Kayole", "Kibra", "Kisauni", "Kondele", "Nyali", "Nyalenda",
        "Uhuru Park", "Central Business District", "Old Town", "Likoni Ferry Crossing",
        "Busia Border Post",
    ],
    "town": [
        "Athi River", "Bungoma Town", "Eldoret CBD", "Embu Town", "Garissa Town",
        "Homa Bay Town", "Isiolo Town", "Kericho Town", "Kisumu CBD", "Kitale Town",
        "Kitengela", "Kwale Town", "Lamu Old Town", "Machakos Town", "Malindi Town",
        "Mandera Town", "Marsabit Town", "Meru Town", "Migori Town", "Naivasha",
        "Nakuru Town East", "Nyeri Town", "Ruiru", "Thika Town", "Voi Town", "Wajir Town",
    ],
    "region": [
        "Amboseli Corridor", "Kakamega Forest Edge", "Kilifi Creek", "Nandi Hills",
        "Tana River Delta", "Turkana Central", "West Pokot Highlands",
    ],
}
_KIND_OF = {name: kind for kind, names in PLACE_KIND.items() for name in names}


def place_kind(name: str) -> str:
    return _KIND_OF.get(name, "unlisted")


def load_incidents(source: str):
    if source.startswith("http"):
        req = urllib.request.Request(source, headers={"User-Agent": "deckwatch-precision-check"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
    else:
        data = json.loads(Path(source).read_text(encoding="utf-8"))
    return data["results"] if isinstance(data, dict) else data


# The API's own locationPrecision (set by the geocoder since October 2026), in
# this script's terms. Incidents without it are worked out from coordinates.
_FROM_API = {"local": "neighbourhood", "town": "town", "road": "road", "area": "region", "county": "county"}


def classify(inc, hotspots, centres):
    if inc.get("locationPrecision") in _FROM_API:
        return _FROM_API[inc["locationPrecision"]], inc.get("locationName", "")
    lat, lng = inc["lat"], inc["lng"]
    for h in hotspots:
        if abs(h["lat"] - lat) < TOL and abs(h["lng"] - lng) < TOL:
            return place_kind(h["name"]), h["name"]
    c = centres.get(inc.get("county"))
    if c and abs(c[0] - lat) < TOL and abs(c[1] - lng) < TOL:
        return "county", inc.get("county", "")
    return "other", inc.get("locationName", "")


def pct(n, total):
    return f"{n / total:.0%}" if total else "n/a"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("source", nargs="?", help="saved /api/incidents JSON (default: the live site)")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--all", action="store_true", help="include seed/demo incidents (default: real ones only)")
    args = ap.parse_args()

    hotspots = json.loads((FIXTURES / "hotspots.json").read_text(encoding="utf-8"))
    centres = {
        c["name"]: (c["center"][0], c["center"][1])
        for c in json.loads((FIXTURES / "counties.json").read_text(encoding="utf-8"))
    }
    incidents = load_incidents(args.source or args.url)
    if not args.all:
        incidents = [i for i in incidents if str(i.get("id", "")).startswith("ing-")]
    total = len(incidents)
    if not total:
        sys.exit("no incidents found (use --all to include seed data)")

    rows = [(i, *classify(i, hotspots, centres)) for i in incidents]
    kinds = Counter(k for _, k, _ in rows)
    labels = {
        "neighbourhood": "Neighbourhood, estate or CBD",
        "town": "Town",
        "road": "A whole road, stored as one point",
        "region": "A wide region",
        "unlisted": "A hotspot not in this script's table",
        "county": "County centre only (no place found)",
        "other": "Not a known point (check the geocoder)",
    }

    now = datetime.now(timezone.utc)
    ages = []
    for i in incidents:
        try:
            t = datetime.fromisoformat(i["reportedAt"].replace("Z", "+00:00"))
            ages.append((now - t).total_seconds() / 3600)
        except (KeyError, ValueError):
            pass

    print(f"Incidents analysed: {total} (real ingested incidents{'' if not args.all else ' + seed'})\n")
    print("How precisely each incident is placed")
    for k in ("neighbourhood", "town", "road", "region", "unlisted", "county", "other"):
        if k in ("unlisted", "other") and not kinds[k]:
            continue
        print(f"  {labels[k]:<42} {kinds[k]:>5}  {pct(kinds[k], total):>4}")

    usable_town = kinds["neighbourhood"] + kinds["town"] + kinds["road"]
    print("\nWhat that means for Route Watch")
    print(f"  Can be matched to a route between towns        {pct(usable_town, total):>4}")
    print(f"  Can be matched to a route within a city        {pct(kinds['neighbourhood'], total):>4}"
          "   (a road stored as one point can't be)")
    print(f"  Only roughly placed (wide region)              {pct(kinds['region'], total):>4}")
    print(f"  Can only be shown as 'somewhere in the county' {pct(kinds['county'], total):>4}")

    print("\nCounty-only incidents by county (top 10)")
    by_county = Counter(i.get("county", "?") for i, k, _ in rows if k == "county")
    for c, n in by_county.most_common(10):
        print(f"  {c:<20} {n}")

    print("\nMost used places")
    for name, n in Counter(nm for _, k, nm in rows if k != "county").most_common(10):
        print(f"  {name:<32} {n}")

    by_cat = defaultdict(Counter)
    for i, k, _ in rows:
        by_cat[i.get("category", "?")][k] += 1
    print("\nPlaced better than county level, by category")
    for cat, c in sorted(by_cat.items(), key=lambda kv: -sum(kv[1].values())):
        n = sum(c.values())
        print(f"  {cat:<20} {pct(n - c['county'], n):>4} of {n}")

    if ages:
        ages.sort()
        buckets = [("last 3 hours", 3), ("last 24 hours", 24), ("last 7 days", 168)]
        print("\nHow recent (Route Watch would mostly show the newest)")
        for label, h in buckets:
            n = sum(1 for a in ages if a <= h)
            print(f"  {label:<14} {n:>5}  {pct(n, len(ages)):>4}")
        print(f"  median age     {ages[len(ages) // 2]:.0f} hours")


if __name__ == "__main__":
    main()
