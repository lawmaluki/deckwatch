"""Resolve (county, location_name) to coordinates using the curated hotspot
gazetteer, falling back to the county centroid. Pure and deterministic; no
external geocoding service."""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

_HOTSPOTS: List[dict] = json.loads((FIXTURES / "hotspots.json").read_text())
_COUNTIES: List[dict] = json.loads((FIXTURES / "counties.json").read_text())

# county name -> center [lat, lng]
_COUNTY_CENTER: Dict[str, Tuple[float, float]] = {
    c["name"]: (c["center"][0], c["center"][1]) for c in _COUNTIES
}


def geocode(county: str, location_name: str) -> Optional[Tuple[float, float]]:
    """Best-effort lat/lng. Returns None only if the county is unknown."""
    text = (location_name or "").lower()

    # Prefer a hotspot within the county whose name appears in the location text.
    for h in _HOTSPOTS:
        if h["county"] == county and h["name"].lower() in text:
            return (h["lat"], h["lng"])

    # Fall back to the county centroid.
    return _COUNTY_CENTER.get(county)


def is_county_centroid(county: str, lat: float, lng: float) -> bool:
    """True when these coordinates are the county's centroid, i.e. the geocoder
    found no specific place and fell back.

    This distinction matters for dedup: a centroid is not a location, it is the
    absence of one. Every vague report in a county lands on the exact same
    point, so distance between two of them is always zero — which reads as
    "same place" to anything comparing coordinates.
    """
    center = _COUNTY_CENTER.get(county)
    if center is None:
        return False
    # Coordinates round-trip through Postgres/PostGIS, so compare with a
    # tolerance rather than for exact float equality (~1m at this latitude).
    return abs(center[0] - lat) < 1e-5 and abs(center[1] - lng) < 1e-5
