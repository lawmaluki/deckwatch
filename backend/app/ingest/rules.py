"""Deterministic, keyword-based classifier — a free, no-API-key alternative to
the Claude classifier. Returns the same candidate shape as
classifier.classify(), so the pipeline treats them interchangeably.

Much coarser than the LLM (it can't reason about context or ambiguity), but it
lets ingestion run live with no credits. Selected via INGEST_CLASSIFIER=rule."""

import functools
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

# --- severity ------------------------------------------------------------------
#
# The rubric, shared word for word with the Claude classifier (classifier.py
# SEVERITY_RUBRIC) so both rate alike:
#   critical  three or more people killed, a mass-casualty or terror attack,
#             or a disaster forcing large evacuations
#   high      one or two people killed, or a shooting, stabbing or kidnapping
#   medium    people injured but no one killed, a missing person, or serious
#             disruption (a major road closed, a violent protest)
#   low       no one hurt (arrests, property damage, minor disruption,
#             warnings), and coverage of past events (court cases,
#             anniversaries) whatever happened originally
# The rules approximate it from the words; measured against September 2026's
# hand-reviewed death tolls (see severity_of).

_DEATH = (
    "dead", "killed", "kills", "killing", "killings", "fatal", "fatally", "death", "deaths",
    "murder", "murdered", "die", "died", "dying", "perished", "succumbed", "lifeless",
    "body", "bodies", "drowned", "lynched",
)
_INJURY = (
    "injured", "injuries", "hurt", "wounded", "hospitalised", "hospitalized",
    "rushed to hospital", "critical condition",
)
_VIOLENT = ("shoot", "shot", "shooting", "stab", "stabbed", "stabbing", "kidnapped", "kidnap", "abducted", "abduction", "hacked")
# Coverage of something that happened before, rated low whatever it was: a
# murder trial is not a new murder, and an arrest hurts no one (the killing
# it follows is its own incident, which story matching merges it into).
# Not "appeal": "governor appeals for blood donations" is a live disaster.
_PAST = (
    "court", "trial", "sentenced", "sentencing", "sentence", "convicted", "jailed", "charged",
    "charge", "arraigned", "bail", "acquitted", "pleads", "prosecution", "inquest", "anniversary",
    "years after", "years ago", "years later", "a year later", "months later",
    "report on",
)
# Held apart from _PAST because an arrest cuts both ways: "suspects arrested
# over the Mbobu murder" is coverage of an earlier crime, while "journalist
# arrested in Nairobi CBD" is the thing that just happened. Treating every
# arrest as past dropped three real incidents in twelve; reading the two
# apart dropped none.
_ARREST = ("arrested", "arrests", "arrest", "persons of interest")
# What marks an arrest as follow-up: it points back at an offence already
# committed, rather than reporting the arrest itself as the event.
_PRIOR_OFFENCE = re.compile(
    r"\b(?:over|in connection with|linked to|suspect(?:ed)? in|accused of|for the)\b[^.]{0,40}"
    r"\b(?:murder|killing|death|deaths|rape|robbery|theft|fraud|assault|attack|massacre|crime|case)\b"
)


def is_past_coverage(text: str) -> bool:
    """True when the article covers something that already happened — a
    verdict, an inquest, an anniversary, an arrest over an earlier crime.

    The event itself was news when it occurred, and if it was in range the
    pipeline already carries it. Re-admitting the follow-up puts a 2023
    massacre on today's map under the county where the trial sits, not where
    the killings were.
    """
    if _has_any(text, _PAST):
        return True
    return _has_any(text, _ARREST) and _PRIOR_OFFENCE.search(text) is not None
# A death that is about animals: "1,470 pigs die", "killing of 415 goats".
_ANIMALS = (
    "livestock", "cattle", "goats", "goat", "pigs", "pig", "donkeys", "animals",
    "camels", "sheep", "cows", "poultry", "chickens",
)
_VAGUE_MANY = ("several", "many", "dozens", "scores", "multiple")
_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
}
# A count only counts if it is about people or deaths: "120 cattle", "Form 3",
# "Ksh 600,000" and "September 24" must not read as a death toll.
_COUNTED = (
    r"(?:killed|dead|die|died|dies|deaths|lives|bodies|people|persons|members|victims|"
    r"pilgrims|passengers|children|officers|students|relatives|family)"
)
_NUM = r"(\d{1,3}|" + "|".join(_NUMBER_WORDS) + r")"
_COUNT_BEFORE = re.compile(r"(?<![\w-])" + _NUM + r"\s+(?:[a-z'-]+\s+){0,3}?" + _COUNTED + r"\b")
_COUNT_AFTER = re.compile(
    r"\b(?:killed|kills|killing|claimed|claims|losing|lost|toll\s+(?:rises|rose|hits|climbs)\s+to|leaves|left)\s+"
    r"(?:at\s+least\s+)?" + _NUM + r"\b"
)
_NOT_A_TOLL = re.compile(r"\b(?:form|grade|class|ksh|sh|kes|no\.?)\s*$")


def _number(word: str) -> int:
    return int(word) if word.isdigit() else _NUMBER_WORDS[word]


def death_count(text: str) -> int:
    """The largest number of people the text says were killed, 0 if none is
    given. Only numbers next to a person or death word count."""
    best = 0
    for rx in (_COUNT_BEFORE, _COUNT_AFTER):
        for m in rx.finditer(text):
            if _NOT_A_TOLL.search(text[: m.start(1)]):
                continue
            best = max(best, _number(m.group(1)))
    return best


def _human_death(text: str) -> bool:
    """A death word not about animals: each is checked against the three
    words either side of it."""
    words = re.findall(r"[a-z0-9'-]+", text)
    for i, w in enumerate(words):
        if any(w == d or w == d + "s" for d in _DEATH):
            near = words[max(0, i - 3): i + 4]
            if not any(a in near for a in _ANIMALS):
                return True
    return False


def severity_of(text: str, category: Optional[str]) -> str:
    """Severity of a (lower-cased) headline and summary, per the rubric above.

    Measured against September 2026's hand-reviewed death tolls (3+ deaths
    critical, 1-2 high): 85% of incident articles land in the right tier, up
    from 70%, and 28 of 32 articles on 3+ death incidents are critical, up
    from 8 (digits like "17 killed" never counted, nor "dies" or "kills").
    Court and follow-up coverage is rated low 89% of the time. Tuned on that
    same month, so re-check on fresh labels."""
    if is_past_coverage(text):
        return "low"
    # "claimed five", "losing 5 members": a toll phrase is itself a death.
    if _human_death(text) or _COUNT_AFTER.search(text):
        many = death_count(text) >= 3 or any(
            re.search(r"\b" + v + r"\b(?:\s+\w+){0,3}\s+(?:killed|dead|died|deaths)", text) for v in _VAGUE_MANY
        )
        return "critical" if many else "high"
    if _has_any(text, _VIOLENT):
        return "high"
    if _has_any(text, _INJURY) or category == "missing_person":
        return "medium"
    return "low"


@functools.lru_cache(maxsize=None)
def _word_re(keyword: str) -> "re.Pattern[str]":
    return re.compile(r"\b" + re.escape(keyword) + r"(?:e?s)?\b")


def _has(text: str, keyword: str) -> bool:
    """Whole-word (phrase) match, so short tokens don't hit inside longer words,
    plus a plural ending: "crash" must match "crashes" and "accident"
    "accidents", or multi-vehicle headlines fall through to crime on "killed"."""
    return _word_re(keyword).search(text) is not None


def _has_any(text: str, keywords) -> bool:
    return any(_has(text, k) for k in keywords)


def _explicit_counties(text: str) -> List[str]:
    return [
        name
        for name in _COUNTIES
        if re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", text, re.IGNORECASE)
    ]


def classify(item: Mapping[str, str], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
    text = _text(item)
    return _classify(item, text, matched_categories(text))


def _straight_quotes(text: str) -> str:
    """Feeds write "Murang’a" with a curly apostrophe; county names use a
    straight one, so without this the county was never found in the text."""
    return text.replace("\u2019", "'").replace("\u2018", "'")


def _text(item: Mapping[str, str]) -> str:
    return _straight_quotes(f"{item.get('title', '')} {item.get('summary', '')}").lower()


def _classify(item: Mapping[str, str], text: str, categories: List[str]) -> Optional[Dict[str, Any]]:
    title = _straight_quotes(item.get("title", ""))
    if not categories:
        return None
    # Coverage of something already over is not a new incident. This used only
    # to set severity low, which still put verdicts and anniversaries on the
    # map — dated today, and placed wherever the court sits.
    if is_past_coverage(text):
        return None
    category = categories[0]

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

    severity = severity_of(text, category)

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
    text = _text(item)
    categories = matched_categories(text)
    return {"text": text, "categories": categories, "candidate": _classify(item, text, categories)}
