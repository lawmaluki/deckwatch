"""Build backend/fixtures/places.json, the gazetteer the geocoder searches,
and public/data/route-places.json, the places Route Watch can route between.

    python scripts/build-places.py              # downloads GeoNames' Kenya file
    python scripts/build-places.py KE.txt       # or uses one already unzipped

Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0. Its Kenya
dump has every town, village, estate, administrative location and many named
roads, about ten thousand places against the seventy hand-placed hotspots.

Each place is filed under the county whose boundary contains it, from
public/data/kenya-counties.geojson, rather than under GeoNames' own admin
codes: the map draws those boundaries, so a place and its county always agree
on screen. Boundaries are simplified to ~111 m (see simplify-counties.py), so
a village within a stone's throw of a border can land in the neighbour.

Kinds (what one point stands for, see geocode.locate):
  town   a county or sub-county seat, or a place of 5,000+ people
  local  a village, estate or neighbourhood
  area   an administrative location or sub-location: a few km across
  road   a named road; its point is only somewhere along it

Standard library only. Re-run when the boundaries or the source change; the
output is deterministic for a given input.
"""

import io
import json
import math
import re
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARIES = ROOT / "public" / "data" / "kenya-counties.geojson"
OUT = ROOT / "backend" / "fixtures" / "places.json"
ROUTE_PLACES = ROOT / "public" / "data" / "route-places.json"
URL = "https://download.geonames.org/export/dump/KE.zip"

TOWN_CODES = {"PPLA", "PPLA2", "PPLC"}
PLACE_CODES = TOWN_CODES | {"PPL", "PPLX", "PPLL"}
TOWN_POPULATION = 5000
# Same name, county and kind this close together is one place listed twice.
SAME_PLACE_KM = 2.0
ADMIN_SUFFIX = re.compile(r"\s+(Sub-Location|Location|Section|Division|Ward)$")


def read_geonames(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    print(f"downloading {URL}")
    with urllib.request.urlopen(URL, timeout=60) as r:
        data = r.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return z.read("KE.txt").decode("utf-8")


def load_counties():
    """[(county, polygon rings, bbox)], one entry per polygon."""
    out = []
    for f in json.loads(BOUNDARIES.read_text(encoding="utf-8"))["features"]:
        geom = f["geometry"]
        polygons = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for rings in polygons:
            xs = [p[0] for p in rings[0]]
            ys = [p[1] for p in rings[0]]
            out.append((f["properties"]["name"], rings, (min(xs), min(ys), max(xs), max(ys))))
    return out


def _in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def county_at(counties, lat: float, lng: float) -> str | None:
    for name, rings, (x0, y0, x1, y1) in counties:
        if x0 <= lng <= x1 and y0 <= lat <= y1 and _in_ring(lng, lat, rings[0]):
            if not any(_in_ring(lng, lat, hole) for hole in rings[1:]):
                return name
    return None


def km(a, b) -> float:
    dlat = (a[0] - b[0]) * 111.0
    dlng = (a[1] - b[1]) * 111.0 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlng)


def kind_of(feature_class: str, code: str, population: int) -> str | None:
    if feature_class == "P" and code in PLACE_CODES:
        return "town" if code in TOWN_CODES or population >= TOWN_POPULATION else "local"
    if feature_class == "A" and code == "ADMD":
        return "area"
    if feature_class == "R" and code == "RD":
        return "road"
    return None


def build(text: str):
    counties = load_counties()
    places = []
    seen: dict[tuple, list] = {}
    for line in text.splitlines():
        r = line.split("\t")
        if len(r) < 15:
            continue
        kind = kind_of(r[6], r[7], int(r[14] or 0))
        if kind is None:
            continue
        name = r[1].replace("’", "'").replace("‘", "'").strip()
        if kind == "area":
            name = ADMIN_SUFFIX.sub("", name)
        lat, lng = round(float(r[4]), 4), round(float(r[5]), 4)
        county = county_at(counties, lat, lng)
        if county is None:  # offshore, or just outside a simplified border
            continue
        key = (name.lower(), county, kind)
        if any(km((lat, lng), p) <= SAME_PLACE_KM for p in seen.get(key, [])):
            continue
        seen.setdefault(key, []).append((lat, lng))
        places.append([name, county, lat, lng, kind])
    places.sort(key=lambda p: (p[1], p[0].lower(), p[4], p[2], p[3]))
    return places


def main() -> None:
    places = build(read_geonames(sys.argv[1] if len(sys.argv) > 1 else None))
    doc = {
        "source": "GeoNames Kenya dump (https://www.geonames.org), CC BY 4.0. Built by scripts/build-places.py.",
        "built": date.today().isoformat(),
        "columns": ["name", "county", "lat", "lng", "kind"],
        "places": places,
    }
    # One place per line: small diffs when the source changes.
    body = ",\n".join(json.dumps(p, ensure_ascii=False) for p in places)
    head = json.dumps({k: v for k, v in doc.items() if k != "places"}, ensure_ascii=False, indent=1)[:-2]
    OUT.write_text(head + ',\n "places": [\n' + body + "\n ]\n}\n", encoding="utf-8")
    kinds = {}
    for p in places:
        kinds[p[4]] = kinds.get(p[4], 0) + 1
    print(f"wrote {len(places)} places to {OUT.relative_to(ROOT)}: {kinds}")
    write_route_places(places)


def write_route_places(places) -> None:
    """The places Route Watch offers as a start or destination: towns,
    villages and estates, one per name and county (a town beats a village of
    the same name). Areas and roads are left out: neither is somewhere you
    set off from. 3 decimals (~100 m) is plenty for routing and keeps the
    file small, since the browser downloads it."""
    best: dict[tuple, list] = {}
    for name, county, lat, lng, kind in places:
        if kind not in ("town", "local"):
            continue
        key = (name.lower(), county)
        if key not in best or (kind == "town" and best[key][4] != "town"):
            best[key] = [name, county, round(lat, 3), round(lng, 3), kind]
    rows = sorted(best.values(), key=lambda p: (p[4] != "town", p[0].lower(), p[1]))
    body = ",\n".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in rows)
    ROUTE_PLACES.write_text(
        '{"source":"GeoNames (geonames.org), CC BY 4.0. Built by scripts/build-places.py.",\n'
        '"columns":["name","county","lat","lng","kind"],\n"places":[\n' + body + "\n]}\n",
        encoding="utf-8",
    )
    print(f"wrote {len(rows)} route start/end places to {ROUTE_PLACES.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
