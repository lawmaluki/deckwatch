"""Ingestion orchestrator: RSS -> pre-filter -> AI classify -> geocode ->
dedup/merge -> persist. The building blocks (build_incident, merge_fields) are
pure and unit-tested; run() wires them to the network, the LLM, and the DB."""

import hashlib
from typing import Any, Dict, List, Mapping, Optional

from sqlalchemy.orm import Session

from .. import repository
from ..domain import REFERENCE_MS, now_ms, parse_iso_ms, to_iso_z
from . import classifier, dedup, prefilter, sources
from .verification import score_verification


def build_incident(
    candidate: Mapping[str, Any],
    item: Mapping[str, str],
    at_ms: int,
    ordinal: int,
) -> Optional[Dict[str, Any]]:
    """Turn a classified candidate + its source item into a full incident dict,
    or None if it can't be geocoded. reportedAt is stored in the seed's
    REFERENCE frame (REFERENCE - article age) so the API's time-shift renders it
    as 'N hours ago' consistently with the seed data."""
    from .geocode import geocode

    coords = geocode(candidate["county"], candidate["location_name"])
    if coords is None:
        return None
    lat, lng = coords

    age_ms = max(0, at_ms - parse_iso_ms(item["published"]))
    reported_ms = REFERENCE_MS - age_ms

    source = {"name": item["source"], "type": item["source_type"], "url": item["homepage"]}
    sources_list = [source]
    report_count = 1
    score, status = score_verification(sources_list, report_count, candidate["severity"])

    incident_id = "ing-" + hashlib.sha1(item["link"].encode()).hexdigest()[:8]
    return {
        "id": incident_id,
        "ordinal": ordinal,
        "title": item["title"],
        "category": candidate["category"],
        "severity": candidate["severity"],
        "county": candidate["county"],
        "locationName": candidate["location_name"],
        "lat": lat,
        "lng": lng,
        "reportedAt": to_iso_z(reported_ms),
        "verificationScore": score,
        "verificationStatus": status,
        "sources": sources_list,
        "reportCount": report_count,
        "aiSummary": candidate["summary"],
        "recommendedActions": candidate["recommended_actions"],
        "hasImage": False,
        "isCitizenReport": False,
    }


def merge_fields(existing: Mapping[str, Any], new_source: Mapping[str, Any]):
    """Compute the updated (sources, reportCount, score, status) when folding a
    new corroborating source into an existing incident."""
    sources_list = list(existing["sources"])
    if not any(s["name"] == new_source["name"] for s in sources_list):
        sources_list.append(new_source)
    report_count = existing["reportCount"] + 1
    score, status = score_verification(
        sources_list, report_count, existing["severity"]
    )
    return sources_list, report_count, score, status


def run(
    client: Any,
    session: Session,
    items: Optional[List[Dict[str, str]]] = None,
    feeds: Optional[list] = None,
    model: Optional[str] = None,
) -> Dict[str, int]:
    at_ms = now_ms()
    existing = repository.get_all_incidents(session)
    ordinal = repository.next_ordinal(session)
    stats = {
        "fetched": 0,
        "relevant": 0,
        "classified": 0,
        "inserted": 0,
        "merged": 0,
        "skipped": 0,
    }

    raw = items if items is not None else sources.fetch_items(feeds)
    stats["fetched"] = len(raw)

    for item in raw:
        if not prefilter.is_relevant(item):
            continue
        stats["relevant"] += 1

        candidate = classifier.classify(item, client, model)
        if candidate is None:
            stats["skipped"] += 1
            continue
        stats["classified"] += 1

        incident = build_incident(candidate, item, at_ms, ordinal)
        if incident is None:
            stats["skipped"] += 1
            continue

        duplicate = dedup.find_duplicate(incident, existing)
        if duplicate is not None:
            merged_sources, report_count, score, status = merge_fields(
                duplicate, incident["sources"][0]
            )
            repository.merge_incident(
                session, duplicate["id"], merged_sources, report_count, score, status
            )
            duplicate["sources"] = merged_sources
            duplicate["reportCount"] = report_count
            duplicate["verificationScore"] = score
            duplicate["verificationStatus"] = status
            stats["merged"] += 1
        else:
            repository.insert_incident(session, incident)
            existing.append(incident)
            ordinal += 1
            stats["inserted"] += 1

    session.commit()
    return stats
