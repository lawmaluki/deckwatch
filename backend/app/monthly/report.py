"""Pure monthly-report assembly: no database, no network.

A monthly report is built in two steps:
  1. consolidation — decide which captured articles describe the same real
     incident, which are context (warnings, court follow-ups) and which are
     off-topic, and write the editorial copy. Done by Claude
     (consolidate.py), by hand (an imported fixture), or by the automatic
     fallback below when no API key is configured.
  2. assembly (build_report) — turn articles + consolidation into the stored
     report document. Every number in the report is computed here from the
     articles themselves, so a model can shape the grouping and the copy but
     can't invent a figure.

The document is camelCase JSON and is rendered as-is by
src/app/dashboard/reports/[month]/page.tsx; its shape is MonthlyReport in
src/lib/monthly-reports.ts. Bump REPORT_VERSION if the shape changes.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

REPORT_VERSION = 1

# Reports are cut on Kenyan calendar days: an article published at 01:00 EAT on
# the 1st belongs to the new month even though it is still the 31st in UTC.
EAT = timezone(timedelta(hours=3))

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
COUNTY_NAMES: List[str] = [
    c["name"] for c in json.loads((FIXTURES / "counties.json").read_text())
]

# Report categories are coarser than the map's: a reader of a monthly brief
# cares that something was "crime & security", not whether the classifier
# called it crime or terror_alert.
REPORT_CATEGORIES: Tuple[str, ...] = (
    "security",
    "road",
    "fire",
    "unrest",
    "missing",
    "collapse",
    "weather",
    "health",
    "wildlife",
)
FROM_INCIDENT_CATEGORY: Dict[str, str] = {
    "crime": "security",
    "terror_alert": "security",
    "election_violence": "unrest",
    "traffic_accident": "road",
    "fire": "fire",
    "unrest": "unrest",
    "missing_person": "missing",
    "infrastructure": "collapse",
    "flood": "weather",
    "public_health": "health",
    "wildlife": "wildlife",
}
MISSING_STATUSES: Tuple[str, ...] = ("", "Open", "Found", "Found alive", "Found dead")

Article = Dict[str, Any]  # an incident dict as returned by repository._to_dict
Consolidation = Dict[str, Any]

_MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# --- calendar ----------------------------------------------------------------

def parse_month(month: str) -> Tuple[int, int]:
    m = _MONTH_RE.match(month)
    if not m:
        raise ValueError(f"month must look like 2026-09, got {month!r}")
    return int(m.group(1)), int(m.group(2))


def month_window(month: str) -> Tuple[datetime, datetime]:
    """[start, end) of a calendar month in EAT, as aware datetimes."""
    year, mon = parse_month(month)
    start = datetime(year, mon, 1, tzinfo=EAT)
    end = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=EAT)
    return start, end


def previous_month(month: str) -> str:
    year, mon = parse_month(month)
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def current_month(now: datetime) -> str:
    local = now.astimezone(EAT)
    return f"{local.year}-{local.month:02d}"


def is_last_day_of_month(now: datetime) -> bool:
    """True on the final calendar day of the month in Kenya."""
    local = now.astimezone(EAT)
    return (local + timedelta(days=1)).month != local.month


def month_due(now: datetime) -> Optional[str]:
    """The month a scheduled run should report on, or None.

    The workflow is scheduled for 23:30 EAT on the 28th-31st, but GitHub
    starts scheduled runs late, sometimes by more than half an hour. So:
      - the month's last day, from 18:00 EAT: this month;
      - the 1st, before noon EAT: last month (a late run that crossed
        midnight, which must not skip the month);
      - anything else: nothing (in particular, a run from the 30th that
        slips past midnight into the 31st must not publish a day early)."""
    local = now.astimezone(EAT)
    if is_last_day_of_month(now) and local.hour >= 18:
        return current_month(now)
    if local.day == 1 and local.hour < 12:
        return previous_month(current_month(now))
    return None


def eat_date(iso: str) -> str:
    """YYYY-MM-DD of an ISO timestamp, on the Kenyan calendar."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return dt.astimezone(EAT).date().isoformat()


def short_id(article: Mapping[str, Any]) -> str:
    """Ingested ids look like ing-<hex>; the hex alone is what the model sees."""
    return str(article["id"]).removeprefix("ing-")


def coverage_from(articles: Iterable[Article], month: str, as_of: datetime) -> Optional[str]:
    """First day of the unbroken run of days with captured articles that ends at
    the last covered day. None when coverage was complete from the 1st.

    A month where ingestion started (or broke and resumed) partway through
    would otherwise read as a quiet start of the month rather than a gap in
    Deckwatch's own coverage."""
    start, end = month_window(month)
    last = min(end - timedelta(days=1), as_of.astimezone(EAT)).date()
    days = {eat_date(a["reportedAt"]) for a in articles}
    first = start.date()
    d = last
    while d >= first and d.isoformat() in days:
        d -= timedelta(days=1)
    run_start = d + timedelta(days=1)
    if run_start <= first:
        return None
    if run_start > last:  # nothing captured on the last covered day
        return None
    return run_start.isoformat()


# --- consolidation -------------------------------------------------------------

def automatic_consolidation(articles: List[Article]) -> Consolidation:
    """Fallback when no model is configured: one incident per article, the
    classifier's own labels, no editorial copy. The report says so on its
    face (method "automatic") rather than pretending it was reviewed."""
    events = []
    for a in articles:
        events.append(
            {
                "key": short_id(a),
                "title": a["title"],
                "date": eat_date(a["reportedAt"]),
                "county": a["county"],
                "category": FROM_INCIDENT_CATEGORY.get(a["category"], "security"),
                "deaths": 0,
                "article_ids": [short_id(a)],
                "hotspot": "",
                "conflict": "",
                "missing_status": "",
            }
        )
    return {"events": events, "context": [], "hotspots": [], "defining": [], "watch": []}


def clean_consolidation(raw: Mapping[str, Any], articles: List[Article], month: str) -> Consolidation:
    """Make a consolidation safe to assemble, whoever produced it.

    Drops ids that aren't this month's articles, gives each article to the
    first group that claims it, drops groups left empty, and repairs fields a
    model could get wrong (unknown county, out-of-month date, dangling
    hotspot/defining references)."""
    by_id = {short_id(a): a for a in articles}
    start, end = month_window(month)
    first_day, last_day = start.date().isoformat(), (end - timedelta(days=1)).date().isoformat()
    claimed: set = set()

    def take(ids: Iterable[Any]) -> List[str]:
        kept = []
        for i in ids or []:
            i = str(i).removeprefix("ing-")
            if i in by_id and i not in claimed:
                claimed.add(i)
                kept.append(i)
        return kept

    events: List[Dict[str, Any]] = []
    seen_keys: set = set()
    for e in raw.get("events") or []:
        ids = take(e.get("article_ids"))
        if not ids:
            continue
        arts = [by_id[i] for i in ids]
        key = _slug(e.get("key") or ids[0])
        while key in seen_keys:
            key += "-x"
        seen_keys.add(key)
        county = e.get("county")
        if county not in COUNTY_NAMES:
            county = arts[0]["county"] if arts[0]["county"] in COUNTY_NAMES else "Nairobi"
        category = e.get("category")
        if category not in REPORT_CATEGORIES:
            category = FROM_INCIDENT_CATEGORY.get(arts[0]["category"], "security")
        d = str(e.get("date") or "")
        if not (first_day <= d <= last_day):
            d = min(eat_date(a["reportedAt"]) for a in arts)
        status = e.get("missing_status") or ""
        events.append(
            {
                "key": key,
                "title": str(e.get("title") or arts[0]["title"]).strip(),
                "date": d,
                "county": county,
                "category": category,
                "deaths": max(0, int(e.get("deaths") or 0)),
                "article_ids": ids,
                "hotspot": str(e.get("hotspot") or ""),
                "conflict": str(e.get("conflict") or "").strip(),
                "missing_status": status if status in MISSING_STATUSES else "",
            }
        )

    context = []
    for g in raw.get("context") or []:
        ids = take(g.get("article_ids"))
        if ids:
            context.append({"key": _slug(g.get("key") or g.get("label") or "context"), "label": str(g.get("label") or "Other context"), "article_ids": ids})

    hotspots = []
    used = {e["hotspot"] for e in events if e["hotspot"]}
    for h in raw.get("hotspots") or []:
        key = str(h.get("key") or "")
        if key in used and not any(x["key"] == key for x in hotspots):
            hotspots.append({"key": key, "title": str(h.get("title") or key), "summary": str(h.get("summary") or "")})
    live = {h["key"] for h in hotspots}
    for e in events:
        if e["hotspot"] not in live:
            e["hotspot"] = ""

    event_keys = {e["key"] for e in events}
    defining = []
    for d in raw.get("defining") or []:
        k = _slug(d.get("event_key") or "")
        if k in event_keys and all(x["event_key"] != k for x in defining):
            defining.append({"event_key": k, "why": str(d.get("why") or "").strip()})

    watch = [
        {"title": str(w.get("title") or ""), "body": str(w.get("body") or ""), "action": str(w.get("action") or "")}
        for w in raw.get("watch") or []
        if w.get("title") and w.get("body")
    ]
    out: Consolidation = {"events": events, "context": context, "hotspots": hotspots, "defining": defining, "watch": watch}
    for k in ("headline", "what_headline"):
        if raw.get(k):
            out[k] = str(raw[k]).strip()
    return out


def _slug(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-") or "item"


# --- assembly ------------------------------------------------------------------

def build_report(
    month: str,
    articles: List[Article],
    consolidation: Consolidation,
    *,
    as_of: datetime,
    generated_at: datetime,
    method: str,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """The stored report document. `consolidation` must already be cleaned."""
    by_id = {short_id(a): a for a in articles}
    agree_cat = agree_county = n = 0
    events = []
    for e in consolidation["events"]:
        arts = [by_id[i] for i in e["article_ids"]]
        sources: Dict[str, Dict[str, str]] = {}
        for a in arts:
            n += 1
            agree_cat += FROM_INCIDENT_CATEGORY.get(a["category"]) == e["category"]
            agree_county += a["county"] == e["county"]
            for s in a.get("sources") or []:
                url = s.get("url") or ""
                if url and url not in sources:
                    sources[url] = {"name": s.get("name", ""), "url": url, "title": a["title"]}
        outlets = list(dict.fromkeys(s["name"] for s in sources.values()))
        ev: Dict[str, Any] = {
            "key": e["key"],
            "title": e["title"],
            "date": e["date"],
            "county": e["county"],
            "category": e["category"],
            "deaths": e["deaths"],
            "articles": len(arts),
            "outlets": outlets,
            "sources": list(sources.values()),
        }
        for src, dst in (("hotspot", "hotspot"), ("conflict", "conflict"), ("missing_status", "status")):
            if e.get(src):
                ev[dst] = e[src]
        events.append(ev)

    whys = {d["event_key"]: d["why"] for d in consolidation.get("defining", [])}
    for ev in events:
        if ev["key"] in whys:
            ev["defining"] = True
            ev["why"] = whys[ev["key"]]
    events.sort(key=lambda e: (e["date"], e["key"]))

    outlet_counts: Dict[str, int] = {}
    status_counts: Dict[str, int] = {}
    for a in articles:
        for s in a.get("sources") or []:
            outlet_counts[s.get("name", "")] = outlet_counts.get(s.get("name", ""), 0) + 1
        status_counts[a["verificationStatus"]] = status_counts.get(a["verificationStatus"], 0) + 1

    event_articles = sum(len(e["article_ids"]) for e in consolidation["events"])
    context_articles = sum(len(g["article_ids"]) for g in consolidation.get("context", []))
    report: Dict[str, Any] = {
        "version": REPORT_VERSION,
        "month": month,
        "generatedAt": _iso(generated_at),
        "asOf": _iso(as_of),
        "method": method,
        "coverageFrom": coverage_from(articles, month, as_of),
        "articles": len(articles),
        "eventArticles": event_articles,
        "contextArticles": context_articles,
        "offTopic": len(articles) - event_articles - context_articles,
        "autoMerged": sum(1 for a in articles if (a.get("reportCount") or 1) > 1),
        "statusCounts": status_counts,
        "outletCounts": sorted(([k, v] for k, v in outlet_counts.items()), key=lambda kv: (-kv[1], kv[0])),
        "catAgree": round(100 * agree_cat / n) if n else 0,
        "countyAgree": round(100 * agree_county / n) if n else 0,
        "context": [{"key": g["key"], "label": g["label"], "count": len(g["article_ids"])} for g in consolidation.get("context", [])],
        "setAside": set_aside(articles, consolidation),
        "events": events,
        "hotspots": consolidation.get("hotspots", []),
        "watch": consolidation.get("watch", []),
    }
    if model:
        report["model"] = model
    if consolidation.get("headline") or consolidation.get("what_headline"):
        report["headlines"] = {
            "month": consolidation.get("headline", ""),
            "what": consolidation.get("what_headline", ""),
        }
    return report


OFF_TOPIC = "Off-topic"


def set_aside(articles: List[Article], consolidation: Consolidation) -> List[Dict[str, str]]:
    """Every article that is NOT one of the report's incidents, with why.

    The page only shows counts, but the articles themselves are the most useful
    part for the ingest classifier: "court hears an old robbery case" or "MP
    under fire over a fuel deal" marked as not-an-incident is exactly what it
    gets wrong (app/ingest/examples.py reads these as negative examples)."""
    by_id = {short_id(a): a for a in articles}
    used = {i for e in consolidation["events"] for i in e["article_ids"]}
    out: List[Dict[str, str]] = []
    for g in consolidation.get("context", []):
        for i in g["article_ids"]:
            used.add(i)
            out.append(_aside(by_id[i], g["label"]))
    for a in sorted(articles, key=lambda a: a["reportedAt"]):
        if short_id(a) not in used:
            out.append(_aside(a, OFF_TOPIC))
    return out


def _aside(article: Article, reason: str) -> Dict[str, str]:
    url = next((s.get("url", "") for s in article.get("sources") or [] if s.get("url")), "")
    return {"title": article["title"], "url": url, "reason": reason}


def summary(report: Mapping[str, Any]) -> Dict[str, Any]:
    """The list-endpoint view of a report."""
    events = report.get("events", [])
    return {
        "month": report["month"],
        "generatedAt": report["generatedAt"],
        "method": report["method"],
        "incidents": len(events),
        "counties": len({e["county"] for e in events}),
        "deaths": sum(e["deaths"] for e in events),
        "articles": report["articles"],
        "headline": (report.get("headlines") or {}).get("month", ""),
    }


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

