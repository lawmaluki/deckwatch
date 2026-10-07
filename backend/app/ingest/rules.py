"""Deterministic, keyword-based classifier — a free, no-API-key alternative to
the Claude classifier. Returns the same candidate shape as
classifier.classify(), so the pipeline treats them interchangeably.

Much coarser than the LLM (it can't reason about context or ambiguity), but it
lets ingestion run live with no credits. Selected via INGEST_CLASSIFIER=rule."""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
_COUNTIES: List[str] = [
    c["name"] for c in json.loads((FIXTURES / "counties.json").read_text())
]
_HOTSPOTS: List[dict] = json.loads((FIXTURES / "hotspots.json").read_text())

# Ordered most-specific-first so a headline maps to its best-fitting category.
# Matched on word boundaries (see _has), so short tokens don't hit inside longer
# words (e.g. "buried" no longer matches a terror keyword).
CATEGORY_KEYWORDS = [
    ("terror_alert", ["terror", "terrorist", "shabaab", "al-shabaab", "grenade", "militant", "bomb", "bombing"]),
    ("flood", ["flood", "flooding", "flooded", "landslide", "mudslide", "swept away", "displaced", "heavy rains"]),
    ("fire", ["fire", "blaze", "gutted", "inferno", "explosion", "razed"]),
    ("wildlife", ["elephant", "lion", "hippo", "crocodile", "buffalo", "wildlife"]),
    ("public_health", ["outbreak", "cholera", "poisoning", "contamination", "epidemic"]),
    ("unrest", ["protest", "protests", "demonstration", "riot", "riots", "clashes", "teargas", "looting"]),
    ("missing_person", ["missing", "disappeared", "abducted", "kidnapped", "kidnap"]),
    ("infrastructure", ["collapse", "collapsed", "power outage", "blackout", "burst pipe"]),
    # Vehicles alone ("bus", "truck") only after the specific categories above,
    # and never "motorcycle": "armed motorcycle gang" is a crime, not a crash.
    ("traffic_accident", ["crash", "collision", "collided", "accident", "matatu", "lorry", "bus", "truck", "trailer", "overturned", "hit-and-run", "pedestrian", "knocked down", "ploughs into", "ploughed into", "head-on", "aircraft", "chopper", "helicopter", "capsize", "capsized"]),
    ("crime", ["robbery", "robbed", "mugging", "stabbed", "shot", "shooting", "killed", "murder", "murdered", "gang", "burglary", "rape", "raped", "assault", "carjacking", "gunman", "gunmen"]),
]

ACTIONS = {
    "traffic_accident": ["Avoid the affected stretch of road", "Watch for emergency responders"],
    "flood": ["Avoid crossing flooded roads or bridges", "Move to higher ground if in a low-lying area"],
    "fire": ["Keep clear of the area for emergency access", "Follow evacuation guidance from officials"],
    "crime": ["Avoid the area until police confirm it is secure", "Report related information to the police"],
    "unrest": ["Avoid the area and stay indoors if nearby", "Follow official updates before travelling"],
    "terror_alert": ["Avoid the area and report suspicious activity", "Follow instructions from security agencies"],
    "public_health": ["Follow guidance from health authorities", "Avoid affected water or food sources"],
    "wildlife": ["Keep a safe distance from wildlife", "Report sightings to Kenya Wildlife Service"],
    "infrastructure": ["Avoid the affected structure or route", "Report hazards to the county government"],
    "missing_person": ["Share any information with the police", "Contact the family's designated line if provided"],
}
DEFAULT_ACTIONS = ["Stay alert and avoid the affected area", "Follow official updates"]

_FATAL = ("dead", "killed", "fatal", "death", "murdered")
_MULTI = ("several", "many", "dozens", "multiple", "scores", "six", "five", "four", "three")
_INJURY = ("injured", "hurt", "wounded")


def _has(text: str, keyword: str) -> bool:
    """Whole-word (phrase) match, so short tokens don't hit inside longer words,
    plus a plural ending: "crash" must match "crashes" and "accident"
    "accidents", or multi-vehicle headlines fall through to crime on "killed"."""
    return re.search(r"\b" + re.escape(keyword) + r"(?:e?s)?\b", text) is not None


def _has_any(text: str, keywords) -> bool:
    return any(_has(text, k) for k in keywords)


def _explicit_counties(text: str) -> List[str]:
    return [
        name
        for name in _COUNTIES
        if re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", text, re.IGNORECASE)
    ]


def classify(item: Mapping[str, str], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
    title = item.get("title", "")
    summary = item.get("summary", "")
    text = f"{title} {summary}".lower()

    category = next(
        (cat for cat, kws in CATEGORY_KEYWORDS if _has_any(text, kws)), None
    )
    if category is None:
        return None

    county: Optional[str] = None
    location: Optional[str] = None
    # Prefer one unambiguous county named in the headline over incidental
    # mentions in the feed summary (often the outlet's name or dateline).
    headline_counties = _explicit_counties(title)
    if len(headline_counties) == 1:
        county = headline_counties[0]
        location = county
    else:
        for h in _HOTSPOTS:  # prefer a specific place
            if h["name"].lower() in text:
                county, location = h["county"], h["name"]
                break
    if county is None:
        for name in _COUNTIES:
            if name.lower() in text:
                county, location = name, name
                break
    if county is None:
        return None  # no locatable place -> skip (mirrors the LLM's "Unknown")

    if _has_any(text, _FATAL):
        severity = "critical" if _has_any(text, _MULTI) else "high"
    elif _has_any(text, _INJURY):
        severity = "medium"
    else:
        severity = "low"

    return {
        "category": category,
        "severity": severity,
        "county": county,
        "location_name": location,
        "summary": (item.get("summary") or item.get("title") or "").strip()[:400],
        "recommended_actions": ACTIONS.get(category, DEFAULT_ACTIONS),
    }


def matched_categories(text: str) -> List[str]:
    """Every category with a keyword in the (lower-cased) text, in priority
    order. classify() takes the first; the hybrid classifier treats more than
    one as a sign the rules can't be trusted on this article."""
    return [cat for cat, kws in CATEGORY_KEYWORDS if _has_any(text, kws)]


def analyse(item: Mapping[str, str]) -> Dict[str, Any]:
    """What the rules see in an article: every matching category and the
    candidate classify() returns (None without a category or a county). Lets
    the hybrid classifier judge the rules' confidence without re-implementing
    them."""
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    return {"text": text, "categories": matched_categories(text), "candidate": classify(item)}
