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


# --- ordering ----------------------------------------------------------------

def test_sort_newest_first():
    older = {"id": "ing-b", "reportedAt": "2026-07-03T19:29:00.000Z"}
    newer = {"id": "ing-a", "reportedAt": "2026-08-19T20:52:00.000Z"}
    assert domain.sort_newest_first([older, newer]) == [newer, older]


def test_sort_newest_first_breaks_ties_on_id():
    """Deterministic order matters: the TS side must agree exactly."""
    same = "2026-08-19T09:00:00.000Z"
    b = {"id": "ing-b", "reportedAt": same}
    a = {"id": "ing-a", "reportedAt": same}
    assert domain.sort_newest_first([b, a]) == [a, b]
    assert domain.sort_newest_first([a, b]) == [a, b]


def test_sort_newest_first_does_not_mutate_input():
    original = [
        {"id": "ing-b", "reportedAt": "2026-07-03T19:29:00.000Z"},
        {"id": "ing-a", "reportedAt": "2026-08-19T20:52:00.000Z"},
    ]
    before = [i["id"] for i in original]
    domain.sort_newest_first(original)
    assert [i["id"] for i in original] == before


def test_sort_after_shift_interleaves_seed_and_real_correctly():
    """Seed is stored in the REFERENCE frame and real data in true time, so the
    sort is only meaningful once shift_incidents has put them on one clock."""
    to = REF + 40 * 24 * 3_600_000  # 40 days past the reference
    seed = {"id": "ow-0001", "reportedAt": domain.to_iso_z(REF)}  # shifts to `to`
    real = {"id": "ing-x", "reportedAt": domain.to_iso_z(REF)}  # stays put
    ordered = domain.sort_newest_first(domain.shift_incidents([real, seed], to))
    assert [i["id"] for i in ordered] == ["ow-0001", "ing-x"]


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


def test_filter_live_only():
    # Seed fixtures have no isLive key at all (repository.py computes it from
    # the id prefix); filtering must not KeyError on that, and must treat a
    # missing key as "not live".
    mixed = [{**INCIDENTS[0], "isLive": True}, INCIDENTS[1]]
    out = domain.filter_incidents(mixed, {"liveOnly": True}, REF)
    assert [i["id"] for i in out] == [mixed[0]["id"]]
    assert domain.filter_incidents(mixed, {"liveOnly": False}, REF) == mixed


# --- query validation --------------------------------------------------------

def test_parse_query_happy():
    r = domain.parse_incident_query(
        {"category": "flood", "limit": "5"}, COUNTY_NAMES, REF
    )
    assert r["ok"] is True
    assert r["value"]["filter"]["categories"] == ["flood"]
    assert r["value"]["limit"] == 5


def test_parse_query_live_param():
    r = domain.parse_incident_query({"live": "true"}, COUNTY_NAMES, REF)
    assert r["ok"] is True
    assert r["value"]["filter"]["liveOnly"] is True

    bad = domain.parse_incident_query({"live": "yes"}, COUNTY_NAMES, REF)
    assert bad["ok"] is False


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
