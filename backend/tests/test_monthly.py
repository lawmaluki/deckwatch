"""Monthly report tests. Pure assembly, the calendar rules and the Claude call
(stubbed client) run with no DB and no API key."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.monthly import consolidate as cons
from app.monthly import report as m


def _art(id_, when, title="Two killed in crash", category="traffic_accident", county="Nakuru", outlet="Tuko", status="unconfirmed", count=1):
    return {
        "id": f"ing-{id_}",
        "title": title,
        "category": category,
        "county": county,
        "reportedAt": when,
        "verificationStatus": status,
        "reportCount": count,
        "aiSummary": "",
        "sources": [{"name": outlet, "url": f"https://news.example/{id_}", "type": "news"}],
    }


# --- calendar -----------------------------------------------------------------

def test_month_window_is_on_the_kenyan_calendar():
    start, end = m.month_window("2026-09")
    assert start.isoformat() == "2026-09-01T00:00:00+03:00"
    assert end.isoformat() == "2026-10-01T00:00:00+03:00"
    assert m.month_window("2026-12")[1].year == 2027


def test_an_article_after_midnight_eat_is_next_month():
    # 21:30 UTC on 30 Sep is 00:30 EAT on 1 Oct.
    assert m.eat_date("2026-09-30T21:30:00Z") == "2026-10-01"


@pytest.mark.parametrize(
    "utc, expected",
    [
        ("2026-09-30T20:30:00+00:00", True),  # 23:30 EAT, 30 Sep
        ("2026-09-29T20:30:00+00:00", False),
        ("2026-02-28T20:30:00+00:00", True),  # not a leap year
        ("2028-02-28T20:30:00+00:00", False),  # leap year
        ("2026-10-31T20:30:00+00:00", True),
    ],
)
def test_is_last_day_of_month(utc, expected):
    assert m.is_last_day_of_month(datetime.fromisoformat(utc)) is expected


@pytest.mark.parametrize(
    "utc, expected",
    [
        ("2026-09-30T20:30:00+00:00", "2026-09"),  # on time: 23:30 EAT, 30 Sep
        ("2026-09-30T21:40:00+00:00", "2026-09"),  # late: 00:40 EAT, 1 Oct
        ("2026-12-31T22:10:00+00:00", "2026-12"),  # late across the year
        ("2026-09-30T08:00:00+00:00", None),  # last day, but morning
        ("2026-10-30T21:40:00+00:00", None),  # 30th's run slipped into the 31st
        ("2026-10-01T10:00:00+00:00", None),  # the 1st, afternoon EAT
        ("2026-09-29T20:30:00+00:00", None),
    ],
)
def test_month_due_tolerates_late_scheduled_runs(utc, expected):
    assert m.month_due(datetime.fromisoformat(utc)) == expected


def test_previous_month_wraps_the_year():
    assert m.previous_month("2026-01") == "2025-12"
    assert m.previous_month("2026-10") == "2026-09"


def test_parse_month_rejects_garbage():
    with pytest.raises(ValueError):
        m.parse_month("2026-13")
    with pytest.raises(ValueError):
        m.parse_month("sept")


def test_coverage_from_finds_a_late_start():
    as_of = datetime(2026, 9, 30, 22, tzinfo=timezone.utc)
    arts = [_art("a", "2026-09-04T08:00:00Z")] + [
        _art(f"d{d}", f"2026-09-{d:02d}T08:00:00Z") for d in range(12, 31)
    ]
    assert m.coverage_from(arts, "2026-09", as_of) == "2026-09-12"


def test_coverage_from_is_none_when_complete():
    as_of = datetime(2026, 9, 30, 22, tzinfo=timezone.utc)
    arts = [_art(f"d{d}", f"2026-09-{d:02d}T08:00:00Z") for d in range(1, 31)]
    assert m.coverage_from(arts, "2026-09", as_of) is None


# --- cleaning -------------------------------------------------------------------

ARTS = [
    _art("a1", "2026-09-14T06:00:00Z", "Five killed at Kikopey", county="Nairobi", outlet="Tuko"),
    _art("a2", "2026-09-14T09:00:00Z", "Kikopey crash victims named", outlet="Citizen Digital"),
    _art("b1", "2026-09-16T10:00:00Z", "Bandits kill five in Gotu", category="crime", county="Isiolo", outlet="KBC", count=2),
    _art("c1", "2026-09-20T10:00:00Z", "Flood warning for Nairobi", category="flood", county="Nairobi", outlet="Nation"),
    _art("x1", "2026-09-21T10:00:00Z", "Why can't I see TikTok captions?", category="missing_person", county="Nairobi"),
]


def test_clean_drops_unknown_ids_and_gives_each_article_to_one_group():
    raw = {
        "events": [
            {"key": "Kikopey Crash", "title": "Five killed at Kikopey", "date": "2026-09-14", "county": "Nakuru", "category": "road", "deaths": 5, "article_ids": ["a1", "a2", "nope"], "hotspot": "", "conflict": "", "missing_status": ""},
            {"key": "dupe", "title": "dupe", "date": "2026-09-14", "county": "Nakuru", "category": "road", "deaths": 1, "article_ids": ["a2"], "hotspot": "", "conflict": "", "missing_status": ""},
        ],
        "context": [{"key": "warnings", "label": "Warnings", "article_ids": ["c1", "a1"]}],
    }
    c = m.clean_consolidation(raw, ARTS, "2026-09")
    assert [e["key"] for e in c["events"]] == ["kikopey-crash"]  # dupe had nothing left
    assert c["events"][0]["article_ids"] == ["a1", "a2"]
    assert c["context"][0]["article_ids"] == ["c1"]


def test_clean_repairs_bad_fields():
    raw = {
        "events": [
            {"key": "g", "title": "Gotu ambush", "date": "2026-08-30", "county": "Atlantis", "category": "banditry", "deaths": -3, "article_ids": ["b1"], "hotspot": "ghost", "conflict": "", "missing_status": "Lost"},
        ],
        "defining": [{"event_key": "g", "why": "Deadliest attack."}, {"event_key": "nope", "why": "x"}],
        "hotspots": [{"key": "unused", "title": "Nowhere", "summary": ""}],
    }
    c = m.clean_consolidation(raw, ARTS, "2026-09")
    e = c["events"][0]
    assert e["county"] == "Isiolo"  # fell back to the article's county
    assert e["category"] == "security"  # mapped from the article's crime
    assert e["date"] == "2026-09-16"  # out-of-month date replaced
    assert e["deaths"] == 0
    assert e["hotspot"] == "" and c["hotspots"] == []  # no member events
    assert e["missing_status"] == ""
    assert c["defining"] == [{"event_key": "g", "why": "Deadliest attack."}]


# --- assembly -------------------------------------------------------------------

def _report(raw):
    c = m.clean_consolidation(raw, ARTS, "2026-09")
    return m.build_report(
        "2026-09",
        ARTS,
        c,
        as_of=datetime(2026, 9, 30, 20, 30, tzinfo=timezone.utc),
        generated_at=datetime(2026, 9, 30, 20, 31, tzinfo=timezone.utc),
        method="claude",
        model="claude-opus-5-5",
    )


RAW = {
    "events": [
        {"key": "kikopey", "title": "Five killed at Kikopey", "date": "2026-09-14", "county": "Nakuru", "category": "road", "deaths": 5, "article_ids": ["a1", "a2"], "hotspot": "a104", "conflict": "", "missing_status": ""},
        {"key": "gotu", "title": "Bandits kill five in Gotu", "date": "2026-09-16", "county": "Isiolo", "category": "security", "deaths": 5, "article_ids": ["b1"], "hotspot": "", "conflict": "", "missing_status": ""},
    ],
    "context": [{"key": "warnings", "label": "Warnings", "article_ids": ["c1"]}],
    "hotspots": [{"key": "a104", "title": "Nairobi–Nakuru highway", "summary": "Crashes."}],
    "defining": [{"event_key": "kikopey", "why": "Five of one family."}],
    "watch": [{"title": "Rains", "body": "Flood warnings.", "action": "Know your route."}],
    "headline": "A deadly month on the roads",
    "what_headline": "Road crashes led.",
}


def test_build_report_counts_come_from_the_articles():
    r = _report(RAW)
    assert (r["articles"], r["eventArticles"], r["contextArticles"], r["offTopic"]) == (5, 3, 1, 1)
    assert r["autoMerged"] == 1
    assert r["statusCounts"] == {"unconfirmed": 5}
    kik = next(e for e in r["events"] if e["key"] == "kikopey")
    assert kik["articles"] == 2 and kik["outlets"] == ["Tuko", "Citizen Digital"]
    assert kik["defining"] is True and kik["why"] == "Five of one family."
    assert kik["hotspot"] == "a104"
    # a1 was filed under Nairobi by the classifier; the review says Nakuru.
    assert r["countyAgree"] == 67
    assert r["catAgree"] == 100
    assert r["headlines"] == {"month": "A deadly month on the roads", "what": "Road crashes led."}
    assert r["model"] == "claude-opus-5-5"
    assert r["generatedAt"] == "2026-09-30T20:31:00Z"
    json.dumps(r)  # stored as JSONB


def test_summary():
    s = m.summary(_report(RAW))
    assert s == {
        "month": "2026-09",
        "generatedAt": "2026-09-30T20:31:00Z",
        "method": "claude",
        "incidents": 2,
        "counties": 2,
        "deaths": 10,
        "articles": 5,
        "headline": "A deadly month on the roads",
    }


def test_automatic_consolidation_is_one_event_per_article():
    c = m.clean_consolidation(m.automatic_consolidation(ARTS), ARTS, "2026-09")
    assert len(c["events"]) == len(ARTS)
    assert {e["category"] for e in c["events"]} <= set(m.REPORT_CATEGORIES)


# --- Claude call ----------------------------------------------------------------

class _Stream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


class _Client:
    def __init__(self, message):
        self.calls = []
        msgs = SimpleNamespace(stream=lambda **kw: (self.calls.append(kw), _Stream(message))[1])
        self.beta = SimpleNamespace(messages=msgs)


def _msg(text, stop="end_turn"):
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="text", text=text)])


def test_consolidate_sends_every_article_and_parses_json():
    client = _Client(_msg(json.dumps(RAW)))
    out = cons.consolidate("September 2026", ARTS, client, "claude-opus-5-5")
    assert out["events"][0]["key"] == "kikopey"
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default" and call["betas"] == [cons.FALLBACK_BETA]
    assert call["output_config"]["format"]["type"] == "json_schema"
    prompt = call["messages"][0]["content"]
    for a in ARTS:
        assert f'"id": "{m.short_id(a)}"' in prompt


@pytest.mark.parametrize("stop", ["refusal", "max_tokens"])
def test_consolidate_raises_on_unusable_stops(stop):
    with pytest.raises(cons.ConsolidationError):
        cons.consolidate("September 2026", ARTS, _Client(_msg("{}", stop)), "claude-opus-5-5")


def test_schema_constrains_county_and_category():
    props = cons._schema()["properties"]["events"]["items"]["properties"]
    assert "Nairobi" in props["county"]["enum"] and len(props["county"]["enum"]) == 47
    assert props["category"]["enum"] == list(m.REPORT_CATEGORIES)
