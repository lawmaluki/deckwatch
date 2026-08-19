"""Ingestion orchestrator: RSS -> pre-filter -> AI classify -> geocode ->
dedup/merge -> persist. The building blocks (build_incident, merge_fields) are
pure and unit-tested; run() wires them to the network, the LLM, and the DB."""

import hashlib
from typing import Any, Callable, Dict, List, Mapping, Optional

from sqlalchemy.orm import Session

from .. import repository
from ..domain import now_ms, parse_iso_ms, to_iso_z
from . import dedup, prefilter, sources
from .verification import score_verification

Classifier = Callable[[Mapping[str, str]], Optional[dict]]


def article_id(link: str) -> str:
    """Stable id for an article, derived from its URL alone.

    Deliberately independent of classification so an already-ingested article
    can be recognized *before* the classifier runs — under the LLM classifier
    that is the difference between paying to re-read the whole feed window
    every hour and paying only for genuinely new articles.
    """
    return "ing-" + hashlib.sha1(link.encode()).hexdigest()[:8]


def build_incident(
    candidate: Mapping[str, Any],
    item: Mapping[str, str],
    at_ms: int,
    ordinal: int,
) -> Optional[Dict[str, Any]]:
    """Turn a classified candidate + its source item into a full incident dict,
    or None if it can't be geocoded. reportedAt is the article's own publish
    time: this is a record built from verifiable reporting, so the stored date
    has to match what the source says. Only seed data lives in the REFERENCE
    frame and gets time-shifted on read (see domain.shift_incidents)."""
    from .geocode import geocode

    coords = geocode(candidate["county"], candidate["location_name"])
    if coords is None:
        return None
    lat, lng = coords

    # Clamped to the run clock so a feed with a bad future date can't file an
    # incident dated ahead of the ingest that found it.
    reported_ms = min(parse_iso_ms(item["published"]), at_ms)

    # url is the specific article, not the outlet homepage, so "Sources" links
    # take the reader straight to the piece the incident was drawn from.
    source = {"name": item["source"], "type": item["source_type"], "url": item["link"]}
    sources_list = [source]
    report_count = 1
    score, status = score_verification(sources_list)

    return {
        "id": article_id(item["link"]),
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
    # Keyed on the article URL, not the outlet name: an outlet can publish two
    # genuinely separate pieces on one event, and both belong on the record.
    # Keying on name also silently dropped the second article, leaving no trace
    # that it had been merged — so the next run merged it again, and the next.
    # Sources without a URL (seed data) still fall back to the name, or a
    # missing URL would compare equal to every other missing one.
    new_url = new_source.get("url")
    if new_url:
        already_listed = any(s.get("url") == new_url for s in sources_list)
    else:
        already_listed = any(s["name"] == new_source["name"] for s in sources_list)
    if not already_listed:
        sources_list.append(new_source)
    report_count = existing["reportCount"] + 1
    # reportCount is kept for display ("N reports merged"), but deliberately
    # does not feed the score — see verification.py.
    score, status = score_verification(sources_list)
    return sources_list, report_count, score, status


def run(
    session: Session,
    classify_fn: Classifier,
    items: Optional[List[Dict[str, str]]] = None,
    feeds: Optional[list] = None,
) -> Dict[str, int]:
    at_ms = now_ms()
    # Dedup only against other real ingested incidents ("ing-" ids), never
    # seed/demo data ("ow-" ids) — a fictional incident sharing a hotspot and
    # category with a real story is not the same real-world event, and merging
    # them would silently attach a real article as a "source" on a mock incident.
    existing = [
        inc for inc in repository.get_all_incidents(session)
        if inc["id"].startswith("ing-")
    ]
    # Article ids are sha1(link), so an article already ingested rebuilds to the
    # same id on every run. Without this set the cron re-processed the whole feed
    # window hourly: each article matched its own stored copy at distance zero
    # and merged into itself, inflating reportCount without bound (one incident
    # reached 88 "reports" from 5 sources) and dragging the verification score up
    # with it.
    seen_ids = {inc["id"] for inc in existing}
    # An article that merged into another incident is not stored under its own
    # id — it lives on as a source URL. Both routes have to be checked, or the
    # merged ones keep re-merging on every run.
    seen_links = {
        s["url"]
        for inc in existing
        for s in inc["sources"]
        if s.get("url")
    }
    ordinal = repository.next_ordinal(session)
    stats = {
        "fetched": 0,
        "relevant": 0,
        "classified": 0,
        "inserted": 0,
        "merged": 0,
        "skipped": 0,
        "already_ingested": 0,
    }

    raw = items if items is not None else sources.fetch_items(feeds)
    stats["fetched"] = len(raw)

    for item in raw:
        if not prefilter.is_relevant(item):
            continue
        stats["relevant"] += 1

        # Identity check first: this article may already be on record, either as
        # its own incident or as a source merged onto one. Doing it before
        # classification keeps the classifier off work whose answer we already
        # have — free with the rule classifier, billed with the LLM one.
        if article_id(item["link"]) in seen_ids or item["link"] in seen_links:
            stats["already_ingested"] += 1
            continue

        candidate = classify_fn(item)
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
            seen_links.add(item["link"])
            stats["merged"] += 1
        else:
            repository.insert_incident(session, incident)
            existing.append(incident)
            seen_ids.add(incident["id"])
            seen_links.add(item["link"])
            ordinal += 1
            stats["inserted"] += 1

    session.commit()
    return stats
