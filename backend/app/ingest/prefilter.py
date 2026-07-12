"""Cheap keyword pre-filter: drop obviously-irrelevant news items before they
reach the (paid) LLM classifier. Precision here doesn't matter — the LLM makes
the real call — but a false negative drops a real incident, so keep the keyword
set broad."""

from typing import Mapping

# Broad safety-relevance vocabulary spanning the incident categories. Lowercase;
# matched as substrings against the item's title + summary.
SAFETY_KEYWORDS = (
    # crime
    "robbery", "robbed", "mugging", "carjack", "gunman", "gang", "stabbed",
    "shot", "shooting", "killed", "murder", "assault", "theft", "burglary",
    "kidnap", "abduct", "rape", "attack", "police", "arrest", "crime",
    # traffic
    "accident", "crash", "collision", "overturn", "matatu", "highway", "road",
    "pedestrian", "boda", "lorry",
    # flood / weather
    "flood", "flooding", "flash flood", "river burst", "landslide", "mudslide",
    "displaced", "swept away", "heavy rain",
    # fire
    "fire", "blaze", "burnt", "gutted", "explosion", "inferno",
    # unrest / protest / election
    "protest", "demo", "demonstration", "riot", "unrest", "clashes", "chaos",
    "teargas", "looting", "election violence",
    # missing persons
    "missing", "disappeared", "search for",
    # terror
    "terror", "al-shabaab", "shabaab", "bomb", "grenade", "ied", "militant",
    # public health
    "outbreak", "cholera", "disease", "poisoning", "contamination", "epidemic",
    # infrastructure
    "collapse", "collapsed", "bridge", "power outage", "blackout", "burst pipe",
    # wildlife
    "wildlife", "elephant", "lion", "hippo", "crocodile", "human-wildlife",
    "buffalo",
)


def is_relevant(item: Mapping[str, str]) -> bool:
    haystack = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    return any(kw in haystack for kw in SAFETY_KEYWORDS)
