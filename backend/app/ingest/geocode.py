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
