"""Resolve an incident's place to coordinates, and say how precise they are.

Pure and deterministic; no external geocoding service. Two gazetteers:

  hotspots.json  ~70 curated places (exported from src/lib/data/hotspots.ts)
  places.json    ~9,000 GeoNames places (scripts/build-places.py)

and the county centre when neither names a place in the text. Every result
carries a precision (domain.LOCATION_PRECISIONS) so a reader of the point can
tell an estate from "somewhere in Nairobi":

  local   a village, estate or neighbourhood
  town    a town
  road    a named road; the point is only somewhere along it
  area    an administrative location, or a curated region: a few to tens of km
  county  the county centre: no place was found

Place names are matched as capitalised whole words in the classifier's
location, then the headline, then the article summary. Matching that loosely
needs three guards, each from a miss on the live October 2026 data:

  county names   "Kajiado" in a headline is the county, not Kajiado town;
                 matching it would pin every county-level story to its seat.
  NOT_PLACES     names that are also people, communities or words: "Obado"
                 and "Orengo" are villages and politicians, "Salama" a place
                 and the Swahili for safe, "Highway" an estate.
  ambiguity      a name listed more than SAME_PLACE_KM apart within the
                 county ("Kiamba", "Township") is not used at all: a wrong
                 point is worse than the county centre.

A place outside the classified county moves the incident there only when it is
a town known by one point nationwide and it is in the location or headline:
"5 people killed after road accident in Gilgil" was filed under Nairobi.
"""

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

_HOTSPOTS: List[dict] = json.loads((FIXTURES / "hotspots.json").read_text())
_COUNTIES: List[dict] = json.loads((FIXTURES / "counties.json").read_text())
_PLACES: List[list] = json.loads((FIXTURES / "places.json").read_text(encoding="utf-8"))["places"]

# county name -> center [lat, lng]
_COUNTY_CENTER: Dict[str, Tuple[float, float]] = {
    c["name"]: (c["center"][0], c["center"][1]) for c in _COUNTIES
}

# Curated hotspots by how much ground each covers. hotspots.json is generated
# from the frontend, so the kind lives here; one added later and missing here
# counts as a town.
HOTSPOT_PRECISION: Dict[str, str] = {
    **{n: "road" for n in ("Mombasa Road", "Ngong Road", "Thika Road")},
    **{n: "local" for n in (
        "Eastleigh", "Kayole", "Kibra", "Kisauni", "Kondele", "Nyali", "Nyalenda",
        "Uhuru Park", "Central Business District", "Old Town", "Likoni Ferry Crossing",
        "Busia Border Post",
    )},
    **{n: "area" for n in (
        "Amboseli Corridor", "Kakamega Forest Edge", "Kilifi Creek", "Nandi Hills",
        "Tana River Delta", "Turkana Central", "West Pokot Highlands",
    )},
}

# Gazetteer names that read as something else far more often than as the
# place. Lower case. Add to it when the relocate dry run shows a false match.
NOT_PLACES = frozenset({
    # politicians, officials and public figures
    "arati", "gachagua", "joho", "kalonzo", "kanja", "kindiki", "moi", "mudavadi",
    "natembeya", "obado", "odinga", "orengo", "raila", "ruto", "sakaja", "sifuna",
    "uhuru", "wetangula", "kenyatta", "karua", "matiang'i", "murkomen", "duale",
    "kibaki", "nyoro", "omtatah", "kiunjuri", "waititu", "sonko", "mutua",
    # common surnames that are also villages
    "okoth", "maina", "ndungu", "mbugua", "karanja",
    # communities and languages
    "kikuyu", "luo", "teso", "maasai", "masai", "kalenjin", "luhya", "kamba",
    "kisii", "somali", "borana", "pokot", "turkana", "samburu", "meru", "embu",
    "taita", "giriama", "swahili",
    # words, institutions and brands
    "highway", "border", "lazima", "salama", "bandari", "harambee", "olympic",
    "jamhuri", "amani", "baraka", "upendo", "tumaini", "uhuru", "police", "market",
    "central", "township", "mjini", "station", "junction", "stage", "hospital",
    "nzoia", "tana", "state", "court", "national", "county", "kenya", "africa",
    "east", "west", "north", "south", "upper", "lower", "new", "old", "great",
    "rift", "valley", "coast", "lake", "river", "hill", "hills", "forest", "camp",
    "mission", "estate", "village", "farm", "school", "church", "hotel", "club",
    "bridge", "gate", "corner", "centre", "center", "city", "town", "road",
    "mile", "sunday", "friday", "monday", "may", "june", "july", "victoria",
    "william", "charles", "elizabeth", "mary", "grace", "joseph", "john",
})

# Two listings of one name further apart than this are different places.
SAME_PLACE_KM = 10.0
# Which listing of a name to use when one name has several kinds in a county
# ("Ngong" is a town and a location): the one people mean by it.
_LISTING_ORDER = {"town": 0, "local": 1, "area": 2, "road": 3}
# Which of several places named in one text to use: the most precise.
_PRECISION_ORDER = {"local": 0, "town": 1, "road": 2, "area": 3}
_MAX_NAME_WORDS = 4

# A name after one of these is where someone was going or came from, not where
# it happened: "pilgrims killed on the way to Subukia" crashed at Salama.
_NOT_HERE_BEFORE = frozenset({"to", "towards", "from", "via"})
# A name before one of these is a road named after the town, and the road can
# be anywhere: "Kangundo Road, Nairobi" is not Kangundo.
_ROAD_WORDS = frozenset({"road", "rd", "highway", "street", "avenue", "way", "bypass", "expressway", "drive", "lane"})

_ROAD_BETWEEN = re.compile(
    r"\b([A-Z][\w']+)\s?-\s?([A-Z][\w']+)\s+(road|highway|expressway|bypass)\b", re.IGNORECASE
)
_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]")


@dataclass(frozen=True)
class Location:
    county: str
    name: str
    lat: float
    lng: float
    precision: str  # domain.LOCATION_PRECISIONS


@dataclass(frozen=True)
class _Listing:
    county: str
    lat: float
    lng: float
    kind: str


def _norm(text: str) -> str:
    return (
        (text or "")
        .replace("’", "'").replace("‘", "'")
        .replace("–", "-").replace("—", "-")
    )


def _key(name: str) -> str:
    return " ".join(_norm(name).lower().split())


_COUNTY_KEYS = frozenset(_key(c) for c in _COUNTY_CENTER)
_INDEX: Dict[str, List[_Listing]] = {}
for _name, _county, _lat, _lng, _kind in _PLACES:
    _INDEX.setdefault(_key(_name), []).append(_Listing(_county, _lat, _lng, _kind))


def _km(a: _Listing, b: _Listing) -> float:
    dlat = (a.lat - b.lat) * 111.0
    dlng = (a.lng - b.lng) * 111.0 * math.cos(math.radians(a.lat))
    return math.hypot(dlat, dlng)


def _one_place(listings: List[_Listing]) -> Optional[_Listing]:
    """The listing these all describe, or None if they are different places."""
    if not listings:
        return None
    if any(_km(a, b) > SAME_PLACE_KM for a in listings for b in listings):
        return None
    return min(listings, key=lambda l: _LISTING_ORDER[l.kind])


def _names_in(text: str) -> Iterable[Tuple[str, str]]:
    """(key, as written) for every run of up to _MAX_NAME_WORDS words that is a
    usable place name and starts with a capital, longest first at each word.
    Skips destinations and origins (_NOT_HERE_BEFORE) and roads named after a
    place (_ROAD_WORDS); a road the gazetteer lists by name still matches,
    being the longer run."""
    words = [(m.group(0), m.start()) for m in _WORD.finditer(text)]
    i = 0
    while i < len(words):
        for n in range(min(_MAX_NAME_WORDS, len(words) - i), 0, -1):
            span = words[i:i + n]
            written = text[span[0][1]: span[-1][1] + len(span[-1][0])]
            key = _key(re.sub(r"'s$", "", written))
            if key in _INDEX and written[0].isupper() and _usable(key):
                before = words[i - 1][0].lower() if i > 0 else ""
                after = words[i + n][0].lower() if i + n < len(words) else ""
                if before not in _NOT_HERE_BEFORE and after not in _ROAD_WORDS:
                    yield key, written
                i += n
                break
        else:
            i += 1


def _usable(key: str) -> bool:
    return len(key) >= 4 and key not in _COUNTY_KEYS and key not in NOT_PLACES


def _hotspot(county: str, text: str) -> Optional[Location]:
    low = text.lower()
    for h in _HOTSPOTS:
        if h["county"] == county and h["name"].lower() in low:
            return Location(county, h["name"], h["lat"], h["lng"], HOTSPOT_PRECISION.get(h["name"], "town"))
    return None


def _road(county: str, text: str) -> Optional[Location]:
    """"Eldoret-Webuye Road", pinned to the end in this county. A road with
    neither end in the county is left alone: the point would sit outside the
    county it is filed under, and which county the stretch is in is unknown."""
    for m in _ROAD_BETWEEN.finditer(text):
        ends = [_one_place(_INDEX.get(_key(m.group(g)), [])) for g in (1, 2)]
        here = [e for e in ends if e is not None and e.county == county]
        if here:
            name = f"{m.group(1)}-{m.group(2)} {m.group(3).title()}"
            return Location(county, name, here[0].lat, here[0].lng, "road")
    return None


def _place(county: str, text: str, may_move: bool) -> Optional[Location]:
    found: List[Location] = []
    elsewhere: List[Location] = []
    for key, written in _names_in(text):
        listings = _INDEX[key]
        here = _one_place([l for l in listings if l.county == county])
        if here is not None:
            found.append(Location(county, written, here.lat, here.lng, here.kind))
            continue
        if may_move and not any(l.county == county for l in listings):
            there = _one_place(listings)
            if there is not None and there.kind == "town":
                elsewhere.append(Location(there.county, written, there.lat, there.lng, "town"))
    if found:
        return min(found, key=lambda l: _PRECISION_ORDER[l.precision])
    return elsewhere[0] if len(elsewhere) == 1 else None


def locate(county: str, location_name: str, headline: str = "", summary: str = "") -> Optional[Location]:
    """The most precise place the texts name, or the county centre. None only
    if the county is unknown.

    Searched in order, stopping at the first that names a place: the
    classifier's location, the headline, the summary. A location matched
    from the classifier's own text keeps that text as its name ("Githurai 45,
    off Thika Road" says more than "Githurai")."""
    center = _COUNTY_CENTER.get(county)
    if center is None:
        return None
    location_name = _norm(location_name)
    for text, may_move in ((location_name, True), (_norm(headline), True), (_norm(summary), False)):
        if not text:
            continue
        loc = _hotspot(county, text) or _place(county, text, may_move) or _road(county, text)
        if loc is not None:
            if text is location_name and loc.county == county:
                loc = Location(loc.county, location_name, loc.lat, loc.lng, loc.precision)
            return loc
    return Location(county, location_name or county, center[0], center[1], "county")


def geocode(county: str, location_name: str) -> Optional[Tuple[float, float]]:
    """Best-effort lat/lng. Returns None only if the county is unknown."""
    loc = locate(county, location_name)
    return None if loc is None else (loc.lat, loc.lng)


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
