"""AI classification + extraction. Sends a news item to Claude and gets back a
structured incident (or a "not an incident" signal).

Uses Claude Haiku 4.5 with structured outputs (JSON schema) so the response is
guaranteed to match our shape, and constrains `county` to the 47 real counties
(plus "Unknown") so the model can't invent a location. The Anthropic client is
injected, so tests pass a stub and no API key is needed there."""

import json
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from ..config import settings
from ..domain import CATEGORIES, SEVERITIES

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
_COUNTY_NAMES: List[str] = [
    c["name"] for c in json.loads((FIXTURES / "counties.json").read_text())
]

class ClassifierError(Exception):
    """The classifier could not be reached or refused the request (bad or
    missing API key, no credit, rate limit, outage). Distinct from "this is not
    an incident": the article was never judged, so it must not be silently
    dropped — the pipeline counts it, retries it next run and fails loudly if
    the service is down."""


SYSTEM_PROMPT = (
    "You are a public-safety news analyst for Kenya. You read a single news "
    "item and decide whether it describes a specific, real public-safety "
    "incident that belongs on a live incident map (crime, road accidents, "
    "floods, fires, unrest, missing persons, terror alerts, public-health "
    "emergencies, infrastructure failures, wildlife conflicts, or election "
    "violence). Opinion pieces, politics, sports, business, and general news "
    "are NOT incidents. If it is an incident, extract structured details, "
    "choosing the single Kenyan county it occurred in. If the county is "
    "unclear, use \"Unknown\". For location_name give the most specific place "
    "the article says it happened: an estate, village, town or road, with the "
    "nearest landmark if given (e.g. \"Githurai 45, Thika Road\"). Use the "
    "county name only if nothing more specific is given, and never a place "
    "people were travelling to or from. Write a concise factual summary and 2-4 short "
    "recommended safety actions for people nearby."
)

# Severity, shared with the keyword rules (rules.py severity_of) so every
# classifier rates on one scale. Without it the model chose a level by its own
# sense of "high", and the hybrid mixed two standards on one map.
SEVERITY_RUBRIC = (
    " Rate severity by what this article reports happened, using exactly this "
    "scale. critical: three or more people killed, a mass-casualty or terror "
    "attack, or a disaster forcing large evacuations. high: one or two people "
    "killed, or a shooting, stabbing or kidnapping. medium: people injured but "
    "no one killed, a missing person, or serious disruption such as a major road "
    "closed or a violent protest. low: no one hurt, such as arrests, property "
    "damage, minor disruption or warnings; and coverage of past events (court "
    "cases, arrests over an earlier crime, anniversaries), whatever happened "
    "originally. Deaths of animals do not count as deaths."
)
SYSTEM_PROMPT += SEVERITY_RUBRIC


def _schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "is_incident": {"type": "boolean"},
            "category": {"type": "string", "enum": list(CATEGORIES)},
            "severity": {"type": "string", "enum": list(SEVERITIES)},
            "county": {"type": "string", "enum": _COUNTY_NAMES + ["Unknown"]},
            "location_name": {"type": "string"},
            "summary": {"type": "string"},
            "recommended_actions": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "is_incident",
            "category",
            "severity",
            "county",
            "location_name",
            "summary",
            "recommended_actions",
        ],
    }


def _user_prompt(item: Mapping[str, str]) -> str:
    return (
        f"Source: {item.get('source', '')}\n"
        f"Headline: {item.get('title', '')}\n"
        f"Summary: {item.get('summary', '')}"
    )


def classify(
    item: Mapping[str, str],
    client: Any,
    model: Optional[str] = None,
    system: Optional[str] = None,
    user_prompt: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return an extracted incident dict, or None if this item isn't a usable
    incident (not an incident, unknown county, or an unparseable reply).
    Raises ClassifierError if the API call itself fails.

    `system` / `user_prompt` let the RAG classifier (rag.py) add retrieved
    examples while sharing this schema, request and validation."""
    try:
        response = client.messages.create(
            model=model or settings.ingest_model,
            max_tokens=1024,
            system=system or SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": _schema()}},
            messages=[{"role": "user", "content": user_prompt or _user_prompt(item)}],
        )
    except Exception as e:
        raise ClassifierError(f"{type(e).__name__}: {e}") from e

    try:
        text = next(
            (b.text for b in response.content if getattr(b, "type", None) == "text"),
            None,
        )
        if text is None:
            return None
        data = json.loads(text)
    except Exception:
        return None

    if not data.get("is_incident"):
        return None
    if data.get("county") in (None, "Unknown"):
        return None
    if data.get("category") not in CATEGORIES or data.get("severity") not in SEVERITIES:
        return None

    return {
        "category": data["category"],
        "severity": data["severity"],
        "county": data["county"],
        "location_name": data.get("location_name") or data["county"],
        "summary": data["summary"],
        "recommended_actions": data.get("recommended_actions") or [],
    }
