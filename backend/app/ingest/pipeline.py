"""Ingestion orchestrator: RSS -> pre-filter -> AI classify -> geocode ->
dedup/merge -> persist. The building blocks (build_incident, merge_fields) are
pure and unit-tested; run() wires them to the network, the LLM, and the DB."""

import hashlib
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional

from sqlalchemy.orm import Session

from .. import repository
from ..domain import now_ms, parse_iso_ms, to_iso_z
from . import dedup, prefilter, sources
from .classifier import ClassifierError
from .verification import score_verification

Classifier = Callable[[Mapping[str, str]], Optional[dict]]

# Consecutive classifier failures before the run gives up. One failure is a
# blip; several in a row means the key, the credit or the service is gone, and
# sending the rest of the feed at it only wastes time.
MAX_CONSECUTIVE_ERRORS = 3

# How far apart two articles can be and still merge: the wider of the place
# rule's and the story rule's windows (both 72 hours today).
DEDUP_WINDOW_HOURS = max(dedup.SIMILAR_MAX_HOURS_APART, dedup.STORY_WINDOW_HOURS)
MS_PER_HOUR = 3_600_000


def _published_ms(item: Mapping[str, str], at_ms: int) -> int:
    """The article's publish time as build_incident will store it (clamped to
    the run clock), or the run clock if the feed's date is unreadable."""
    try:
        return min(parse_iso_ms(item["published"]), at_ms)
    except (KeyError, ValueError, TypeError):
        return at_ms


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
    from .geocode import locate

    # The headline and feed summary are searched too: the keyword classifier
    # reports only the county, and a place named in the article beats its centre.
    loc = locate(
        candidate["county"], candidate["location_name"], item.get("title", ""), item.get("summary", "")
    )
    if loc is None:
        return None

    # Clamped to the run clock so a feed with a bad future date can't file an
    # incident dated ahead of the ingest that found it.
    reported_ms = min(parse_iso_ms(item["published"]), at_ms)

    # url is the specific article, not the outlet homepage, so "Sources" links
    # take the reader straight to the piece the incident was drawn from.
    # title and publishedAt let later articles be matched against this one's
    # headline after it has been merged into another incident (dedup.find_same_story).
    source = {
        "name": item["source"],
        "type": item["source_type"],
        "url": item["link"],
        "title": item["title"],
        "publishedAt": to_iso_z(reported_ms),
    }
    sources_list = [source]
    report_count = 1
    score, status = score_verification(sources_list)

    return {
        "id": article_id(item["link"]),
        "ordinal": ordinal,
        "title": item["title"],
        "category": candidate["category"],
        "severity": candidate["severity"],
        "county": loc.county,
        "locationName": loc.name,
        "locationPrecision": loc.precision,
        "lat": loc.lat,
        "lng": loc.lng,
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
    similarity: Any = None,
) -> Dict[str, int]:
    """`similarity` enables story matching (dedup.build_similarity); None
    leaves only the location rule."""
    at_ms = now_ms()
    raw = items if items is not None else sources.fetch_items(feeds)
    relevant = [item for item in raw if prefilter.is_relevant(item)]

    # Article ids are sha1(link), so an article already ingested rebuilds to the
    # same id on every run. Without this check the cron re-processed the whole
    # feed window hourly: each article matched its own stored copy at distance
    # zero and merged into itself, inflating reportCount without bound (one
    # incident reached 88 "reports" from 5 sources). An article that merged into
    # another incident is not stored under its own id — it lives on as a source
    # URL — so both routes are checked.
    #
    # Both are asked of the database for just this feed's articles. Loading the
    # whole table to answer them, 96 times a day, was a large share of the
    # project's Supabase egress (every returned byte is billed).
    seen_ids, seen_links = repository.find_ingested(
        session,
        [article_id(item["link"]) for item in relevant],
        [item["link"] for item in relevant],
    )
    fresh = [
        item for item in relevant
        if article_id(item["link"]) not in seen_ids and item["link"] not in seen_links
    ]

    # Dedup only compares articles within DEDUP_WINDOW_HOURS of each other, so
    # only incidents with activity that recent relative to the oldest new
    # article can be a match. Seed/demo data ("ow-" ids) is excluded in the
    # query: a fictional incident sharing a hotspot with a real story is not
    # the same real-world event.
    existing: List[Dict[str, Any]] = []
    if fresh:
        oldest_ms = min(_published_ms(item, at_ms) for item in fresh)
        since_ms = oldest_ms - DEDUP_WINDOW_HOURS * MS_PER_HOUR
        existing = repository.get_dedup_candidates(
            session, datetime.fromtimestamp(since_ms / 1000, tz=timezone.utc)
        )

    ordinal = repository.next_ordinal(session) if fresh else 0
    stats = {
        "fetched": len(raw),
        "relevant": len(relevant),
        "classified": 0,
        "inserted": 0,
        "merged": 0,
        "merged_by_story": 0,
        "skipped": 0,
        "already_ingested": len(relevant) - len(fresh),
        "errors": 0,
        "aborted": 0,
    }
    consecutive_errors = 0
    last_error = ""

    for item in fresh:
        # Re-checked here as well as above: two articles in one feed window can
        # share a link, and the first may have just been inserted or merged.
        # Doing it before classification keeps the classifier off work whose
        # answer we already have — free with the rule classifier, billed with
        # the LLM one.
        if article_id(item["link"]) in seen_ids or item["link"] in seen_links:
            stats["already_ingested"] += 1
            continue

        try:
            candidate = classify_fn(item)
        except ClassifierError as e:
            # Not judged, so not recorded: the article stays unseen and is
            # retried on the next run instead of being lost as "not an incident".
            stats["errors"] += 1
            consecutive_errors += 1
            last_error = str(e)
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                stats["aborted"] = 1
                break
            continue
        consecutive_errors = 0
        if candidate is None:
            stats["skipped"] += 1
            continue
        stats["classified"] += 1

        incident = build_incident(candidate, item, at_ms, ordinal)
        if incident is None:
            stats["skipped"] += 1
            continue

        duplicate, rule = dedup.find_match(incident, existing, similarity)
        if rule == "story":
            stats["merged_by_story"] += 1
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
    if last_error:
        print(f"classifier error ({stats['errors']} this run): {last_error}")
    return stats
