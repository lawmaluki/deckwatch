"""Pure, database-free domain logic.

Ports the exact behavior of the TypeScript frontend's shared library so the
backend and the seeded Next.js routes produce identical responses:
  - src/lib/stats.ts          (hours_ago, within_hours, county_risk_score, ...)
  - src/lib/incident-filter.ts (filter_incidents)
  - src/lib/api-validation.ts  (parse_incident_query, validate_report)
  - src/lib/incidents-source.ts (shift_incidents / time-shift invariance)

Everything here operates on plain camelCase dicts matching src/lib/types.ts,
so it can be unit tested against the JSON fixtures with no DB, and reused by
the routers over rows loaded from PostGIS.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Tuple

# Fixed reference "now" the seed is anchored to (mirrors DATA_REFERENCE_TIME).
REFERENCE_TIME = datetime(2026, 7, 2, 9, 0, 0, tzinfo=timezone.utc)
REFERENCE_MS = int(REFERENCE_TIME.timestamp() * 1000)

MS_PER_HOUR = 3_600_000

# Ordered to match the TS unions so validation error messages line up.
CATEGORIES: Tuple[str, ...] = (
    "crime",
    "traffic_accident",
    "flood",
    "fire",
    "unrest",
    "missing_person",
    "terror_alert",
    "public_health",
    "infrastructure",
    "wildlife",
    "election_violence",
)
SEVERITIES: Tuple[str, ...] = ("low", "medium", "high", "critical")
VERIFICATION_STATUSES: Tuple[str, ...] = (
    "verified",
    "likely_true",
    "unconfirmed",
    "false_report",
)

SEVERITY_WEIGHT = {"low": 1.0, "medium": 2.5, "high": 5.0, "critical": 9.0}

# Rough bounding box for Kenya, with margin for border areas.
KENYA_LAT_MIN, KENYA_LAT_MAX = -5.0, 5.5
KENYA_LNG_MIN, KENYA_LNG_MAX = 33.0, 42.5

Incident = Dict[str, Any]
Source = Dict[str, Any]  # {"name": str, "type": str, "url"?: str}


# --- time helpers ------------------------------------------------------------

def parse_iso_ms(iso: str) -> int:
    """Epoch milliseconds from an ISO-8601 string (accepts a trailing Z)."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return round(dt.timestamp() * 1000)


def to_iso_z(epoch_ms: int) -> str:
    """Millisecond-precision UTC ISO string ending in Z (matches JS toISOString)."""
    whole, ms = divmod(int(epoch_ms), 1000)
    dt = datetime.fromtimestamp(whole, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms:03d}Z"


def now_ms() -> int:
    return round(datetime.now(tz=timezone.utc).timestamp() * 1000)


def shift_incidents(incidents: List[Incident], to_ms: int) -> List[Incident]:
    """Re-anchor the seeded dataset so its newest activity sits at to_ms.

    Data and clock shift by the same delta, keeping every duration-derived
    value identical to the fixed-clock seed (time-shift invariance).
    """
    delta = to_ms - REFERENCE_MS
    shifted = []
    for i in incidents:
        copy = dict(i)
        copy["reportedAt"] = to_iso_z(parse_iso_ms(i["reportedAt"]) + delta)
        shifted.append(copy)
    return shifted


# --- stats -------------------------------------------------------------------

def hours_ago(incident: Incident, at_ms: int) -> float:
    return (at_ms - parse_iso_ms(incident["reportedAt"])) / MS_PER_HOUR


def within_hours(incident: Incident, hours: float, at_ms: int) -> bool:
    return hours_ago(incident, at_ms) <= hours


def _js_round(x: float) -> int:
    # Match JS Math.round (round half up), not Python's banker's rounding.
    return math.floor(x + 0.5)


def county_risk_score(incidents: List[Incident], at_ms: int) -> int:
    if not incidents:
        return 0
    raw = 0.0
    for i in incidents:
        recency = max(0.15, 1 - hours_ago(i, at_ms) / (24 * 30))
        raw += SEVERITY_WEIGHT[i["severity"]] * recency
    # Log-dampened so a handful of incidents doesn't saturate the scale.
    score = 24 * math.log2(1 + raw / 4)
    return min(100, _js_round(score))


def category_breakdown(incidents: List[Incident]) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for i in incidents:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return [{"category": c, "count": n} for c, n in ordered]


# --- filtering ---------------------------------------------------------------

def filter_incidents(
    incidents: List[Incident], flt: Mapping[str, Any], at_ms: int
) -> List[Incident]:
    categories = flt.get("categories") or []
    severities = flt.get("severities") or []
    verification = flt.get("verification") or []
    county = flt.get("county")
    within = flt.get("withinHours")
    free_text = (flt.get("freeText") or "").strip().lower()
    time_window = flt.get("timeWindow")

    out = []
    for i in incidents:
        if categories and i["category"] not in categories:
            continue
        if severities and i["severity"] not in severities:
            continue
        if verification and i["verificationStatus"] not in verification:
            continue
        if county and i["county"] != county:
            continue
        if within and hours_ago(i, at_ms) > within:
            continue
        if free_text:
            haystack = f"{i['title']} {i['locationName']} {i['county']}".lower()
            if free_text not in haystack:
                continue
        if time_window:
            t = parse_iso_ms(i["reportedAt"])
            if t < time_window["start"] or t > time_window["end"]:
                continue
        out.append(i)
    return out


# --- request validation ------------------------------------------------------

Result = Dict[str, Any]  # {"ok": True, "value": ...} | {"ok": False, "error": str}


def _unknown(param: str, value: str, allowed: Tuple[str, ...]) -> str:
    return f'Unknown {param} "{value}". Expected one of: {", ".join(allowed)}.'


def parse_incident_query(
    params: Mapping[str, str], valid_counties: set, at_ms: int
) -> Result:
    flt: Dict[str, Any] = {}

    category = params.get("category")
    if category is not None:
        if category not in CATEGORIES:
            return {"ok": False, "error": _unknown("category", category, CATEGORIES)}
        flt["categories"] = [category]

    severity = params.get("severity")
    if severity is not None:
        if severity not in SEVERITIES:
            return {"ok": False, "error": _unknown("severity", severity, SEVERITIES)}
        flt["severities"] = [severity]

    verification = params.get("verification")
    if verification is not None:
        if verification not in VERIFICATION_STATUSES:
            return {
                "ok": False,
                "error": _unknown("verification", verification, VERIFICATION_STATUSES),
            }
        flt["verification"] = [verification]

    county = params.get("county")
    if county is not None:
        if county not in valid_counties:
            return {"ok": False, "error": f'Unknown county "{county}".'}
        flt["county"] = county

    since = params.get("since")
    if since is not None:
        try:
            start = parse_iso_ms(since)
        except ValueError:
            return {
                "ok": False,
                "error": f'Invalid since date "{since}". Expected an ISO date.',
            }
        flt["timeWindow"] = {"start": start, "end": at_ms}

    limit: Optional[int] = None
    raw_limit = params.get("limit")
    if raw_limit is not None:
        if not re.fullmatch(r"\d+", raw_limit) or int(raw_limit) < 1:
            return {
                "ok": False,
                "error": f'Invalid limit "{raw_limit}". Expected a positive integer.',
            }
        limit = int(raw_limit)

    return {"ok": True, "value": {"filter": flt, "limit": limit}}


def validate_report(body: Any) -> Result:
    if not isinstance(body, dict):
        return {"ok": False, "error": "Request body must be a JSON object."}

    category = body.get("category")
    if not isinstance(category, str) or category not in CATEGORIES:
        return {"ok": False, "error": _unknown("category", str(category), CATEGORIES)}

    description = body.get("description")
    if not isinstance(description, str) or description.strip() == "":
        return {"ok": False, "error": "description must be a non-empty string."}

    lat = body.get("lat")
    if not _is_number(lat) or lat < KENYA_LAT_MIN or lat > KENYA_LAT_MAX:
        return {
            "ok": False,
            "error": f"lat must be a number between {KENYA_LAT_MIN} and {KENYA_LAT_MAX}.",
        }

    lng = body.get("lng")
    if not _is_number(lng) or lng < KENYA_LNG_MIN or lng > KENYA_LNG_MAX:
        return {
            "ok": False,
            "error": f"lng must be a number between {KENYA_LNG_MIN} and {KENYA_LNG_MAX}.",
        }

    anonymous = body.get("anonymous")
    if anonymous is not None and not isinstance(anonymous, bool):
        return {"ok": False, "error": "anonymous must be a boolean."}

    return {
        "ok": True,
        "value": {
            "category": category,
            "description": description.strip(),
            "lat": lat,
            "lng": lng,
            "anonymous": anonymous is True,
        },
    }


def _is_number(v: Any) -> bool:
    # bool is a subclass of int in Python; exclude it, mirror JS typeof "number".
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
