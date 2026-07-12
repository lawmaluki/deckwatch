"""Deduplication: recognize when a freshly-ingested item describes the same
real-world event as an existing incident, so multiple outlets covering one event
merge (raising the verification score) instead of piling up duplicate map pins.

Ports the heuristic from src/lib/geo.ts: same place (<= 8km) and either close in
time (<= 72h) or the same category."""

import math
from datetime import datetime, timezone
from typing import Optional

from ..domain import Incident, parse_iso_ms

EARTH_RADIUS_KM = 6371
SIMILAR_MAX_DISTANCE_KM = 8.0
SIMILAR_MAX_HOURS_APART = 72.0
MS_PER_HOUR = 3_600_000


def haversine_km(a: tuple, b: tuple) -> float:
    lat1, lng1 = a
    lat2, lng2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    s = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(s))


def is_same_event(
    candidate: Incident, existing: Incident
) -> bool:
    distance = haversine_km(
        (candidate["lat"], candidate["lng"]),
        (existing["lat"], existing["lng"]),
    )
    if distance > SIMILAR_MAX_DISTANCE_KM:
        return False
    hours_apart = abs(
        parse_iso_ms(candidate["reportedAt"]) - parse_iso_ms(existing["reportedAt"])
    ) / MS_PER_HOUR
    return (
        hours_apart <= SIMILAR_MAX_HOURS_APART
        or candidate["category"] == existing["category"]
    )


def find_duplicate(candidate: Incident, existing: list) -> Optional[Incident]:
    """Return the nearest existing incident that describes the same event, or None."""
    matches = [e for e in existing if is_same_event(candidate, e)]
    if not matches:
        return None
    return min(
        matches,
        key=lambda e: haversine_km(
            (candidate["lat"], candidate["lng"]), (e["lat"], e["lng"])
        ),
    )


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
