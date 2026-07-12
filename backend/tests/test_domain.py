"""Pure domain tests — no database required. Run: pytest tests/test_domain.py"""

import json
from pathlib import Path

from app import domain

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
INCIDENTS = json.loads((FIXTURES / "incidents.json").read_text())
COUNTIES = json.loads((FIXTURES / "counties.json").read_text())
COUNTY_NAMES = {c["name"] for c in COUNTIES}

REF = domain.REFERENCE_MS


def test_fixtures_loaded():
    assert len(INCIDENTS) == 360
    assert len(COUNTIES) == 47


# --- time-shift invariance ---------------------------------------------------

def test_iso_roundtrip():
    ms = domain.parse_iso_ms("2026-07-02T07:47:02.865Z")
    assert domain.to_iso_z(ms) == "2026-07-02T07:47:02.865Z"


def test_shift_moves_every_timestamp_by_the_same_delta():
    to = domain.parse_iso_ms("2027-03-15T18:30:00.000Z")
    delta = to - REF
    shifted = domain.shift_incidents(INCIDENTS, to)
    assert len(shifted) == len(INCIDENTS)
    for original, moved in zip(INCIDENTS, shifted):
        assert domain.parse_iso_ms(moved["reportedAt"]) == (
            domain.parse_iso_ms(original["reportedAt"]) + delta
        )


def test_shift_keeps_durations_invariant():
    to = domain.now_ms()
    shifted = domain.shift_incidents(INCIDENTS, to)
    for original, moved in zip(INCIDENTS, shifted):
        assert abs(
            domain.hours_ago(moved, to) - domain.hours_ago(original, REF)
        ) < 1e-6


def test_shift_does_not_mutate_input():
    before = INCIDENTS[0]["reportedAt"]
    domain.shift_incidents(INCIDENTS, domain.now_ms())
    assert INCIDENTS[0]["reportedAt"] == before


# --- risk score parity (hand-computed against stats.ts formula) --------------

def test_risk_score_single_critical_now():
    incident = {"severity": "critical", "reportedAt": domain.to_iso_z(REF)}
    # raw = 9 * 1.0; 24 * log2(1 + 9/4) = 24 * log2(3.25) ≈ 40.81 → 41
    assert domain.county_risk_score([incident], REF) == 41


def test_risk_score_single_low_now():
    incident = {"severity": "low", "reportedAt": domain.to_iso_z(REF)}
    # raw = 1.0; 24 * log2(1.25) ≈ 7.73 → 8
    assert domain.county_risk_score([incident], REF) == 8


def test_risk_score_empty_is_zero():
    assert domain.county_risk_score([], REF) == 0


def test_risk_score_is_shift_invariant():
    nairobi = [i for i in INCIDENTS if i["county"] == "Nairobi"]
    at_ref = domain.county_risk_score(nairobi, REF)
    to = domain.now_ms()
    shifted = domain.shift_incidents(nairobi, to)
    assert domain.county_risk_score(shifted, to) == at_ref


# --- filtering ---------------------------------------------------------------

def test_filter_by_category():
    out = domain.filter_incidents(INCIDENTS, {"categories": ["flood"]}, REF)
    assert out and all(i["category"] == "flood" for i in out)


def test_filter_within_hours():
    out = domain.filter_incidents(INCIDENTS, {"withinHours": 24}, REF)
    assert all(domain.hours_ago(i, REF) <= 24 for i in out)
    assert len(out) < len(INCIDENTS)


def test_filter_free_text():
    out = domain.filter_incidents(INCIDENTS, {"freeText": "nairobi"}, REF)
    for i in out:
        assert "nairobi" in f"{i['title']} {i['locationName']} {i['county']}".lower()


# --- query validation --------------------------------------------------------

def test_parse_query_happy():
    r = domain.parse_incident_query(
        {"category": "flood", "limit": "5"}, COUNTY_NAMES, REF
    )
    assert r["ok"] is True
    assert r["value"]["filter"]["categories"] == ["flood"]
    assert r["value"]["limit"] == 5


def test_parse_query_rejects_unknown_category():
    r = domain.parse_incident_query({"category": "bogus"}, COUNTY_NAMES, REF)
    assert r["ok"] is False and 'Unknown category "bogus"' in r["error"]


def test_parse_query_rejects_unknown_county():
    r = domain.parse_incident_query({"county": "Atlantis"}, COUNTY_NAMES, REF)
    assert r["ok"] is False and "Atlantis" in r["error"]


def test_parse_query_since_and_bad_since():
    ok = domain.parse_incident_query(
        {"since": "2026-07-01T00:00:00Z"}, COUNTY_NAMES, REF
    )
    assert ok["ok"] is True and ok["value"]["filter"]["timeWindow"]["end"] == REF
    bad = domain.parse_incident_query({"since": "notadate"}, COUNTY_NAMES, REF)
    assert bad["ok"] is False


def test_parse_query_bad_limits():
    for v in ["0", "-3", "abc"]:
        r = domain.parse_incident_query({"limit": v}, COUNTY_NAMES, REF)
        assert r["ok"] is False


# --- report validation -------------------------------------------------------

VALID_REPORT = {
    "category": "crime",
    "description": "Suspicious activity near the market",
    "lat": -1.2921,
    "lng": 36.8219,
    "anonymous": True,
}


def test_validate_report_happy():
    r = domain.validate_report(VALID_REPORT)
    assert r["ok"] is True and r["value"]["anonymous"] is True


def test_validate_report_rejections():
    cases = [
        {**VALID_REPORT, "category": "gossip"},
        {**VALID_REPORT, "description": "   "},
        {**VALID_REPORT, "lat": 51.5},
        {**VALID_REPORT, "lng": 0},
        {**VALID_REPORT, "anonymous": "yes"},
        {"category": "crime"},
        "not a dict",
    ]
    for c in cases:
        assert domain.validate_report(c)["ok"] is False
