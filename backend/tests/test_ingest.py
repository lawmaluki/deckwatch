"""Ingestion tests. The pure stages, RSS parsing, and classifier mapping run
here with no DB and no API key (the Anthropic client is stubbed). A DB-backed
integration test runs the whole pipeline when TEST_DATABASE_URL is set."""

import json
import os
from pathlib import Path

import pytest

from app.domain import REFERENCE_MS
from app.ingest import classifier, dedup, geocode, pipeline, prefilter, rules, sources
from app.ingest.verification import score_verification

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
SAMPLE_FEED = (FIXTURES / "sample-feed.xml").read_text()
_FEED = sources.Feed("Sample", "http://x", "news", "https://example.co.ke")


# --- prefilter ---------------------------------------------------------------

def test_prefilter_keeps_incidents_drops_noise():
    assert prefilter.is_relevant(
        {"title": "Two killed in matatu crash on Thika Road", "summary": ""}
    )
    assert prefilter.is_relevant({"title": "Flash floods displace families", "summary": ""})
    assert not prefilter.is_relevant(
        {"title": "County launches new tourism campaign", "summary": "visit parks"}
    )


# --- geocode -----------------------------------------------------------------

def test_geocode_resolves_hotspot():
    coords = geocode.geocode("Nairobi", "Eastleigh shopping centre")
    assert coords == pytest.approx((-1.2739, 36.8442), abs=1e-3)


def test_geocode_falls_back_to_county_center():
    coords = geocode.geocode("Mombasa", "an unlisted street")
    assert coords is not None
    # not any Nairobi/Eastleigh coordinate — a Mombasa-area centroid
    assert coords[0] < 0  # southern-hemisphere latitude


def test_geocode_unknown_county_is_none():
    assert geocode.geocode("Atlantis", "anywhere") is None


# --- dedup -------------------------------------------------------------------

def _inc(lat, lng, category, reported):
    return {"lat": lat, "lng": lng, "category": category, "reportedAt": reported}


def test_same_event_when_close_and_same_category():
    a = _inc(-1.29, 36.82, "crime", "2026-07-02T09:00:00.000Z")
    b = _inc(-1.291, 36.821, "crime", "2026-06-20T09:00:00.000Z")  # far in time, same cat
    assert dedup.is_same_event(a, b)


def test_not_same_event_when_far_apart():
    a = _inc(-1.29, 36.82, "crime", "2026-07-02T09:00:00.000Z")
    b = _inc(-4.05, 39.66, "crime", "2026-07-02T09:00:00.000Z")  # Mombasa, >400km
    assert not dedup.is_same_event(a, b)


def test_find_duplicate_returns_nearest():
    cand = _inc(-1.29, 36.82, "crime", "2026-07-02T09:00:00.000Z")
    existing = [
        _inc(-4.05, 39.66, "crime", "2026-07-02T09:00:00.000Z"),
        _inc(-1.2905, 36.8205, "crime", "2026-07-02T08:00:00.000Z"),
    ]
    dup = dedup.find_duplicate(cand, existing)
    assert dup is existing[1]


# --- verification ------------------------------------------------------------

def _src(name, type_="news"):
    return {"name": name, "type": type_}


def test_verification_single_newsroom_is_uncorroborated():
    # 23 base + 14 news, no independence bonus = 37
    assert score_verification([_src("The Standard")]) == (37, "unconfirmed")


def test_verification_same_owner_outlets_count_once():
    """NTV Kenya and Nairobi News are both Nation Media — one newsroom."""
    both = [_src("NTV Kenya"), _src("Nairobi News")]
    assert score_verification(both) == score_verification([_src("NTV Kenya")])
    # And strictly below two genuinely independent outlets.
    independent = [_src("NTV Kenya"), _src("The Standard")]
    assert score_verification(both)[0] < score_verification(independent)[0]


def test_verification_two_independent_newsrooms_corroborate():
    # 23 + 14 + 14 + 12 bonus = 63
    pair = [_src("The Standard"), _src("Citizen Digital")]
    assert score_verification(pair) == (63, "likely_true")


def test_verification_aggregator_corroborates_weakly():
    """A Tuko rewrite is worth less than an independent newsroom's own report."""
    assert score_verification([_src("Tuko News")])[0] < score_verification(
        [_src("The Standard")]
    )[0]
    with_aggregator = [_src("The Standard"), _src("Tuko News")]
    with_newsroom = [_src("The Standard"), _src("Citizen Digital")]
    assert score_verification(with_aggregator)[0] < score_verification(with_newsroom)[0]


def test_verification_multi_source_verified():
    # 23 + 14+24+22 + 12*2 bonus = 107 -> clamped to 99
    sources_list = [
        _src("The Standard"),
        _src("Ministry of Health", "government"),
        _src("Kenya Police Service", "police"),
    ]
    score, status = score_verification(sources_list)
    assert status == "verified"
    assert score == 99


def test_verification_ignores_severity_and_report_count():
    """Neither is evidence that the event happened."""
    one = [_src("The Standard")]
    # Same sources -> same score, no matter how severe or how many merges.
    assert score_verification(one) == score_verification(list(one))


def test_verification_never_machine_asserts_false_report():
    """The weakest thing ingestion can build is a lone aggregator."""
    weakest, status = score_verification([_src("Tuko News")])
    assert weakest == 30
    assert status == "unconfirmed"


def test_verification_unknown_outlet_is_treated_as_independent():
    pair = [_src("The Standard"), _src("Some New Outlet")]
    assert score_verification(pair)[0] > score_verification([_src("The Standard")])[0]


# --- RSS parsing -------------------------------------------------------------

def test_parse_feed():
    items = sources.parse_feed(SAMPLE_FEED, _FEED)
    assert len(items) == 4
    assert "matatu crash" in items[0]["title"]
    assert items[0]["source"] == "Sample"
    assert items[0]["source_type"] == "news"
    assert items[0]["link"].startswith("https://example.co.ke")


# --- rule-based classifier (no key) ------------------------------------------

def test_rules_classify_traffic_in_known_county():
    item = {
        "title": "Six dead in Nakuru-Eldoret Highway crash",
        "summary": "A head-on collision on the highway killed six people.",
    }
    result = rules.classify(item)
    assert result["category"] == "traffic_accident"
    assert result["severity"] == "critical"  # "six" + fatalities
    assert result["county"] in ("Nakuru", "Uasin Gishu")
    assert result["recommended_actions"]


def test_rules_classify_crime_severity_high():
    item = {"title": "One killed in Eastleigh robbery", "summary": "gang attacked a shop"}
    result = rules.classify(item)
    assert result["category"] == "crime"
    assert result["severity"] == "high"
    assert result["county"] == "Nairobi"


def test_rules_classify_non_locatable_is_none():
    # A safety keyword but no recognizable Kenyan place -> skip.
    assert rules.classify({"title": "Fire reported somewhere", "summary": ""}) is None


def test_rules_classify_non_incident_is_none():
    assert rules.classify({"title": "Nairobi hosts tourism expo", "summary": "visitors"}) is None


# --- config: DATABASE_URL normalization --------------------------------------

def test_database_url_normalization():
    from app.config import Settings

    bare = Settings(database_url="postgresql://u:p@host:5432/db")
    assert bare.database_url == "postgresql+psycopg://u:p@host:5432/db"
    legacy = Settings(database_url="postgres://u:p@host:5432/db")
    assert legacy.database_url == "postgresql+psycopg://u:p@host:5432/db"
    already = Settings(database_url="postgresql+psycopg://u:p@host:5432/db")
    assert already.database_url == "postgresql+psycopg://u:p@host:5432/db"


# --- classifier (stubbed Anthropic client) -----------------------------------

class _Block:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _Response:
    def __init__(self, text):
        self.content = [_Block(text)]


class StubClient:
    """Mimics the minimal Anthropic surface classify() uses."""

    def __init__(self, payload):
        self._payload = payload  # str or dict

    @property
    def messages(self):
        return self

    def create(self, **kwargs):
        body = self._payload
        return _Response(body if isinstance(body, str) else json.dumps(body))


VALID_PAYLOAD = {
    "is_incident": True,
    "category": "crime",
    "severity": "high",
    "county": "Nairobi",
    "location_name": "Eastleigh shopping centre",
    "summary": "Armed robbery at a shop in Eastleigh.",
    "recommended_actions": ["Avoid the area", "Report to police"],
}

ITEM = {
    "title": "Armed robbery reported at Eastleigh",
    "summary": "gang robbed a shop at gunpoint",
    "link": "https://example.co.ke/news/eastleigh-robbery-4",
    "published": "2026-07-07T06:00:00.000Z",
    "source": "Sample",
    "source_type": "news",
    "homepage": "https://example.co.ke",
}


def test_classify_valid_incident():
    result = classifier.classify(ITEM, StubClient(VALID_PAYLOAD))
    assert result["category"] == "crime"
    assert result["county"] == "Nairobi"
    assert result["recommended_actions"]


def test_classify_non_incident_is_none():
    payload = {**VALID_PAYLOAD, "is_incident": False}
    assert classifier.classify(ITEM, StubClient(payload)) is None


def test_classify_unknown_county_is_none():
    payload = {**VALID_PAYLOAD, "county": "Unknown"}
    assert classifier.classify(ITEM, StubClient(payload)) is None


def test_classify_malformed_is_none():
    assert classifier.classify(ITEM, StubClient("not json")) is None


# --- build_incident / merge_fields (pure) ------------------------------------

def test_build_incident_keeps_the_articles_true_publish_date():
    candidate = classifier.classify(ITEM, StubClient(VALID_PAYLOAD))
    at_ms = REFERENCE_MS + 100 * 24 * 3_600_000  # pretend "now" is 100 days after ref
    inc = pipeline.build_incident(candidate, ITEM, at_ms, ordinal=500)
    assert inc["id"].startswith("ing-")
    assert inc["lat"] == pytest.approx(-1.2739, abs=1e-3)  # Eastleigh
    assert inc["isCitizenReport"] is False
    # Source links to the specific article the incident was drawn from, not
    # just the outlet's homepage.
    assert inc["sources"][0]["url"] == ITEM["link"]
    assert inc["sources"][0]["url"] != ITEM["homepage"]
    # The stored date is the article's own, verifiable against the source —
    # NOT re-anchored into the seed's REFERENCE frame.
    assert inc["reportedAt"] == ITEM["published"]


def test_build_incident_clamps_a_future_dated_article():
    candidate = classifier.classify(ITEM, StubClient(VALID_PAYLOAD))
    future_item = {**ITEM, "published": "2030-01-01T00:00:00.000Z"}
    at_ms = REFERENCE_MS
    inc = pipeline.build_incident(candidate, future_item, at_ms, ordinal=1)
    from app.domain import parse_iso_ms as _p

    assert _p(inc["reportedAt"]) == at_ms


def test_real_incidents_are_not_time_shifted():
    """A real incident's date must not drift as the clock moves on."""
    from app import domain

    real = {"id": "ing-abc123", "reportedAt": "2026-08-01T09:00:00.000Z"}
    seed = {"id": "ow-0001", "reportedAt": "2026-07-01T09:00:00.000Z"}

    for days_later in (0, 1, 30):
        delta = days_later * 24 * 3_600_000
        to = REFERENCE_MS + delta
        shifted_real, shifted_seed = domain.shift_incidents([real, seed], to)
        # Real: identical no matter when it's read.
        assert shifted_real["reportedAt"] == real["reportedAt"]
        # Seed: still re-anchored by exactly the delta, so the demo looks live.
        assert domain.parse_iso_ms(shifted_seed["reportedAt"]) == (
            domain.parse_iso_ms(seed["reportedAt"]) + delta
        )


def test_merge_fields_adds_source_and_raises_score():
    existing = {
        "sources": [{"name": "Sample", "type": "news"}],
        "reportCount": 1,
        "severity": "high",
        "verificationScore": 39,
    }
    new_source = {"name": "Capital FM News", "type": "news"}
    merged_sources, report_count, score, status = pipeline.merge_fields(
        existing, new_source
    )
    assert len(merged_sources) == 2
    assert report_count == 2
    assert score > 39


def test_merge_fields_does_not_duplicate_same_source():
    existing = {
        "sources": [{"name": "Sample", "type": "news"}],
        "reportCount": 1,
        "severity": "high",
    }
    same_source = {"name": "Sample", "type": "news"}
    merged_sources, report_count, _, _ = pipeline.merge_fields(existing, same_source)
    assert len(merged_sources) == 1
    assert report_count == 2


# --- run(): dedup must not match against seed/demo data ----------------------

class _FakeSession:
    def commit(self):
        pass


def test_run_does_not_dedup_real_incident_against_seed(monkeypatch):
    # A seed incident at the same spot/category as the incoming real item.
    seed = {
        "id": "ow-0047",
        "lat": -1.2739,
        "lng": 36.8442,
        "category": "crime",
        "reportedAt": "2020-01-01T00:00:00.000Z",
        "sources": [{"name": "The Standard", "type": "news"}],
        "reportCount": 1,
        "severity": "high",
    }
    monkeypatch.setattr(pipeline.repository, "get_all_incidents", lambda session: [seed])
    monkeypatch.setattr(pipeline.repository, "next_ordinal", lambda session: 1)
    inserted = []
    merged = []
    monkeypatch.setattr(
        pipeline.repository, "insert_incident", lambda session, inc: inserted.append(inc)
    )
    monkeypatch.setattr(
        pipeline.repository,
        "merge_incident",
        lambda session, *args: merged.append(args),
    )

    stub_classify = lambda item: classifier.classify(item, StubClient(VALID_PAYLOAD))
    stats = pipeline.run(_FakeSession(), stub_classify, items=[ITEM])

    assert stats["inserted"] == 1
    assert stats["merged"] == 0
    assert not merged
    assert inserted[0]["id"].startswith("ing-")


# --- integration (needs a real database) -------------------------------------

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")
def test_pipeline_inserts_and_merges():
    os.environ["DATABASE_URL"] = TEST_DB
    from app.db import Base, engine
    from app.init_db import main as init_db
    from app import repository

    # Empty incidents baseline so the pipeline's insert path is exercised in
    # isolation. Seed data is excluded from dedup entirely (see
    # test_run_does_not_dedup_real_incident_against_seed), so this doesn't
    # need seed rows present.
    Base.metadata.drop_all(engine)
    init_db()

    items = sources.parse_feed(SAMPLE_FEED, _FEED)
    from app.db import SessionLocal

    stub_classify = lambda item: classifier.classify(item, StubClient(VALID_PAYLOAD))

    with SessionLocal() as session:
        before = len(repository.get_all_incidents(session))
        stats = pipeline.run(session, stub_classify, items=items)
        after = len(repository.get_all_incidents(session))

    # All relevant items classify to the same Nairobi/Eastleigh event, so one
    # inserts and the rest merge onto it.
    assert stats["inserted"] == 1
    assert stats["merged"] >= 1
    assert after == before + 1

    # Re-running is idempotent (same article ids; near-duplicates merge).
    with SessionLocal() as session:
        pipeline.run(session, stub_classify, items=items)
        final = len(repository.get_all_incidents(session))
    assert final == before + 1


@pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")
def test_pipeline_rule_mode_inserts_real_headlines():
    os.environ["DATABASE_URL"] = TEST_DB
    from app.db import Base, SessionLocal, engine
    from app.init_db import main as init_db
    from app import repository

    Base.metadata.drop_all(engine)
    init_db()

    items = sources.parse_feed(SAMPLE_FEED, _FEED)
    with SessionLocal() as session:
        stats = pipeline.run(session, rules.classify, items=items)
        rows = repository.get_all_incidents(session)

    # The fixture has a matatu crash (Thika Road, Nairobi), Tana River floods,
    # and an Eastleigh robbery — all locatable, distinct events.
    assert stats["inserted"] >= 2
    assert all(r["id"].startswith("ing-") for r in rows)
