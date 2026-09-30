"""Editorial consolidation of a month's captured articles by Claude.

One request per month: every article's headline and summary go in, and a
grouping comes back (which articles describe the same real incident, which are
context, which are off-topic) plus the report's editorial copy. The response is
constrained to a JSON schema, then passed through report.clean_consolidation,
so a malformed or partial answer degrades the report instead of breaking it.

The Anthropic client is injected so tests pass a stub and need no API key."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping

from .report import COUNTY_NAMES, MISSING_STATUSES, REPORT_CATEGORIES, Article, eat_date, short_id

# Server-side fallback: if a safety classifier declines the request (crime
# reporting can trip one), the API re-runs it on Anthropic's recommended
# fallback model instead of returning a refusal.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

SYSTEM_PROMPT = """\
You are the editor of Deckwatch Kenya's monthly public-safety report. Deckwatch \
reads Kenyan news feeds and captures articles that its automatic classifier \
thinks describe safety incidents. You receive every article captured in one \
calendar month and produce the editorial consolidation the report is built from.

Readers are ordinary Kenyans deciding how to travel, commute and stay safe. The \
report must be accurate before it is interesting: it counts incidents captured \
by Deckwatch, never claims a place is "dangerous", and says plainly what is \
uncertain.

## Grouping

Put every article into exactly one of three places. Leave an article out of \
all groups to mark it off-topic.

1. An **event**: a distinct real-world safety incident that happened in this \
month. Several outlets covering the same crash, attack or fire are ONE event; \
follow-ups about that incident within the month (rising death toll, victims \
named, arrests in the days after) belong to the same event. Distinct incidents \
stay separate even when similar (two different crashes on the same road are \
two events).
2. **context**: relevant coverage that is not a new incident this month. Use a \
few labelled groups, such as: official warnings and preparedness (e.g. rain or \
flood warnings), scheduled power outages, court cases and arrests over \
incidents from earlier months, personal stories and aftermath of older events, \
security policy, anniversaries and commentary.
3. **off-topic** (no group): politics that merely uses words like "fire", \
"collapse" or "missing"; business, lifestyle, sport, tech, entertainment; \
events outside Kenya.

The classifier's category and county are often wrong. Judge from the headline \
and summary.

## Event fields

- key: short lowercase slug, unique (e.g. "kikopey-crash").
- title: one plain factual sentence in your own words, no clickbait, no \
quotation marks. Name the place.
- date: YYYY-MM-DD, the day the incident happened or was first reported, \
within the month.
- county: the Kenyan county where it happened (the headline's place, not the \
outlet's city). A highway incident goes to the county of the named place.
- category: security (crime, banditry, terror, killings, suspicious deaths), \
road (road, rail, air and water transport accidents), fire (fires and \
explosions), unrest (protests, riots, political violence), missing (missing \
persons, including those later found), collapse (buildings, walls, mines), \
weather (floods and storms that actually happened), health (disease outbreaks, \
poisoning), wildlife (human-wildlife conflict, poaching).
- deaths: the LOWEST death figure any article reports for this incident. \
"Several feared dead" with no number is 0. Deaths from an older incident are 0.
- conflict: if articles disagree on casualties, the kind of vehicle, the place \
or other key facts, one short sentence saying how; otherwise "".
- missing_status: for missing-person events, "Open", "Found", "Found alive" \
or "Found dead" as of the latest article; otherwise "".
- hotspot: the key of a hotspot this event belongs to, or "".

## Hotspots

3 to 6 places, corridors or patterns with several separate events this month \
(a highway, a town, a border belt, or a repeated method such as robberies \
after bank withdrawals). Each has key, title and a two-sentence summary of what \
happened there, grounded only in the events. Only create a hotspot with at \
least 2 member events. Do not create one just because a county had many events.

## Defining incidents

Pick 5 to 8 events that defined the month, weighing deaths, public reach, \
how widely they were reported and what they signal. For each write "why": two \
or three plain sentences on why it matters to a reader. State only what the \
articles support.

## What to watch

4 to 6 items for the coming month, each based ONLY on warnings, ongoing \
situations or scheduled events in these articles, never on speculation. Each \
has a title, a two- or three-sentence body with specific facts, and one \
practical action a reader can take. Do not be alarmist.

## Headlines

headline: one sentence summarising the month's safety picture for the report's \
first section. what_headline: one sentence on which kinds of incident \
dominated. Neither may name a county as the "most dangerous".

Write in plain British English, as Kenyan news outlets do. Do not use em dashes.\
"""


def _schema() -> Dict[str, Any]:
    def obj(props: Dict[str, Any]) -> Dict[str, Any]:
        return {"type": "object", "additionalProperties": False, "properties": props, "required": list(props)}

    ids = {"type": "array", "items": {"type": "string"}}
    s = {"type": "string"}
    return obj(
        {
            "events": {
                "type": "array",
                "items": obj(
                    {
                        "key": s,
                        "title": s,
                        "date": s,
                        "county": {"type": "string", "enum": COUNTY_NAMES},
                        "category": {"type": "string", "enum": list(REPORT_CATEGORIES)},
                        "deaths": {"type": "integer"},
                        "article_ids": ids,
                        "hotspot": s,
                        "conflict": s,
                        "missing_status": {"type": "string", "enum": list(MISSING_STATUSES)},
                    }
                ),
            },
            "context": {"type": "array", "items": obj({"key": s, "label": s, "article_ids": ids})},
            "hotspots": {"type": "array", "items": obj({"key": s, "title": s, "summary": s})},
            "defining": {"type": "array", "items": obj({"event_key": s, "why": s})},
            "watch": {"type": "array", "items": obj({"title": s, "body": s, "action": s})},
            "headline": s,
            "what_headline": s,
        }
    )


def _article_lines(articles: List[Article]) -> str:
    rows = []
    for a in sorted(articles, key=lambda a: a["reportedAt"]):
        outlets = ", ".join(dict.fromkeys(s.get("name", "") for s in a.get("sources") or []))
        summary = " ".join(str(a.get("aiSummary") or "").split())[:300]
        rows.append(
            json.dumps(
                {
                    "id": short_id(a),
                    "date": eat_date(a["reportedAt"]),
                    "outlets": outlets,
                    "auto_category": a["category"],
                    "auto_county": a["county"],
                    "headline": a["title"],
                    "summary": summary if summary and summary != a["title"] else "",
                },
                ensure_ascii=False,
            )
        )
    return "\n".join(rows)


def user_prompt(month_label: str, articles: List[Article]) -> str:
    return (
        f"Month: {month_label}\n"
        f"Articles captured: {len(articles)}\n\n"
        "One JSON object per line, oldest first:\n"
        f"{_article_lines(articles)}"
    )


class ConsolidationError(RuntimeError):
    pass


def consolidate(month_label: str, articles: List[Article], client: Any, model: str) -> Mapping[str, Any]:
    """Raw consolidation from Claude (pass it to report.clean_consolidation).

    Streams because the output is long; a non-streamed request this size can
    outlast the SDK's HTTP timeout."""
    with client.beta.messages.stream(
        model=model,
        max_tokens=64000,
        betas=[FALLBACK_BETA],
        fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": _schema()},
        },
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt(month_label, articles)}],
    ) as stream:
        message = stream.get_final_message()

    if message.stop_reason == "refusal":
        raise ConsolidationError("Claude declined to consolidate this month")
    if message.stop_reason == "max_tokens":
        raise ConsolidationError("consolidation was cut off at max_tokens")
    text = next((b.text for b in message.content if getattr(b, "type", None) == "text"), None)
    if text is None:
        raise ConsolidationError("no text in Claude's response")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ConsolidationError(f"unparseable consolidation: {exc}") from exc
