"""Verification scoring for real ingested reporting.

Confidence here means exactly one thing: how much *independent* corroboration
an event has. Two facts about Kenyan media drive the calibration, and a naive
outlet count is blind to both:

  1. Common ownership. Nation Africa, NTV Kenya, Business Daily and Nairobi
     News are all Nation Media Group; The Standard and KTN are Standard Group;
     Citizen Digital is Royal Media; K24 and People Daily are Mediamax. Two
     mastheads under one owner run the same newsroom's copy — that is one
     source wearing two hats, not two confirmations.
  2. Aggregation. Tuko and Kenyans.co.ke largely rewrite other outlets'
     reporting rather than originating it, so they corroborate weakly.

Deliberately NOT a port of the mock generator's computeVerification
(src/lib/data/mock-incidents.ts). That one was tuned to make demo data look
varied, and additionally scored severity and raw report count:

  - Severity measures how bad an event is, not whether it happened. Scoring it
    made a dramatic single-source story outrank a mundane well-sourced one.
  - reportCount rose in lockstep with the source list, so each new outlet was
    counted twice — once as a source, once as a report.

Neither belongs in a credibility number, so neither is here. Seed incidents
keep their generator-assigned scores; only real ingested incidents are scored
by this module.
"""

from typing import Dict, List, Tuple

from ..domain import Source

# Parent company per outlet. Outlets sharing an owner share a newsroom, so they
# collapse to a single source. This is a factual mapping, not a tuning knob —
# update it when ownership actually changes.
OWNER_GROUP = {
    "Nation Africa": "nation-media",
    "Daily Nation": "nation-media",
    "NTV Kenya": "nation-media",
    "Business Daily": "nation-media",
    "Nairobi News": "nation-media",
    "The Standard": "standard-group",
    "Standard Digital": "standard-group",
    "KTN News": "standard-group",
    "Citizen Digital": "royal-media",
    "Citizen TV": "royal-media",
    "Radio Citizen": "royal-media",
    "K24": "mediamax",
    "People Daily": "mediamax",
    "Capital FM News": "capital-group",
    "The Star": "radio-africa",
    "KBC": "kbc",
    "TV47": "cape-media",
}

# Outlets that mostly republish other newsrooms' reporting. They still count,
# but a rewrite is not an independent confirmation.
AGGREGATORS = {"Tuko News", "Kenyans.co.ke"}

SOURCE_WEIGHT = {"government": 24, "police": 22, "news": 14, "social": 6, "citizen": 4}
AGGREGATOR_WEIGHT = 7

BASE = 23  # something was reported at all
INDEPENDENCE_BONUS = 12  # per corroborating owner group beyond the first
MAX_BONUS_GROUPS = 3

VERIFIED_AT = 80
LIKELY_AT = 55
UNCONFIRMED_AT = 30


def owner_group(source: Source) -> str:
    """Which newsroom this source really belongs to. An unrecognized outlet is
    assumed independent (its own group) rather than silently merged."""
    name = source.get("name", "")
    return OWNER_GROUP.get(name, name)


def source_weight(source: Source) -> int:
    if source.get("name") in AGGREGATORS:
        return AGGREGATOR_WEIGHT
    return SOURCE_WEIGHT.get(source.get("type", ""), 0)


def score_verification(sources: List[Source]) -> Tuple[int, str]:
    """Score an incident from its sources alone.

    Each owner group contributes once, at the weight of its strongest source,
    plus a bonus per *independent* group corroborating the first.
    """
    strongest: Dict[str, int] = {}
    for s in sources:
        group = owner_group(s)
        weight = source_weight(s)
        if weight > strongest.get(group, -1):
            strongest[group] = weight

    independent = len(strongest)
    score = BASE + sum(strongest.values())
    score += INDEPENDENCE_BONUS * min(max(independent - 1, 0), MAX_BONUS_GROUPS)
    score = max(4, min(99, score))

    # Note the floor in practice: the weakest thing ingestion can produce is a
    # lone aggregator (23 + 7 = 30), so "false_report" is never machine-
    # asserted. Calling a story false is an editorial judgement this pipeline
    # has no basis to make; that band exists only for seed data.
    if score >= VERIFIED_AT:
        status = "verified"
    elif score >= LIKELY_AT:
        status = "likely_true"
    elif score >= UNCONFIRMED_AT:
        status = "unconfirmed"
    else:
        status = "false_report"

    return score, status
