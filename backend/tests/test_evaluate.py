"""Evaluation-harness tests: no network, no DB, no API key."""

import csv

import pytest

from app.ingest import evaluate, rules, snapshot


def _row(title, link, is_incident, category="", severity="", county="", location="",
         event="", summary="", published="2026-09-10T08:00:00.000Z"):
    return {
        "title": title, "summary": summary, "link": link, "published": published,
        "source": "Test", "source_type": "news", "is_incident": is_incident,
        "category": category, "severity": severity, "county": county,
        "location_name": location, "event_id": event,
    }


ROWS = [
    # correct on every field
    _row("Two killed in matatu crash in Eastleigh", "http://a/1", "yes",
         "traffic_accident", "high", "Nairobi", "Eastleigh", "e1"),
    # same event, second outlet
    _row("Matatu crash in Eastleigh leaves two dead", "http://b/1", "yes",
         "traffic_accident", "high", "Nairobi", "Eastleigh", "e1"),
    # real incident, wrong category by the keyword order (flood beats fire)
    _row("Fire in Eastleigh displaced families", "http://a/2", "yes",
         "fire", "medium", "Nairobi", "Eastleigh", "e2", published="2026-09-20T08:00:00.000Z"),
    # not an incident but trips a keyword -> false positive
    _row("Mombasa court hears robbery case against former MP", "http://a/3", "no"),
    # real incident with no place the rules know -> dropped by classifier
    _row("Gunmen attack police post", "http://a/4", "yes",
         "crime", "high", "Garissa", "", "e3"),
    # incident the prefilter never sees
    _row("Gale sinks fishing boat", "http://a/5", "yes", "flood", "high", "Mombasa", "", "e4"),
    # clean negative
    _row("County launches tourism campaign", "http://a/6", "no"),
]


def test_prf_handles_zero_division():
    assert evaluate.prf(0, 0, 0)["precision"] is None
    r = evaluate.prf(3, 1, 1)
    assert r["precision"] == pytest.approx(0.75)
    assert r["f1"] == pytest.approx(0.75)


def test_score_with_rule_classifier():
    rep = evaluate.score(ROWS, rules.classify)
    assert rep["n_incidents"] == 5 and rep["n_noise"] == 2

    # prefilter: 4 of 5 incidents kept (the boat story is dropped); 1 of 2 noise rows passes
    assert rep["prefilter"]["recall"] == pytest.approx(4 / 5)
    assert rep["prefilter"]["noise_passed"] == pytest.approx(1 / 2)

    inc = rep["incident"]
    # No false positives: the court-case row is labelled "no" here, and the
    # classifier now agrees — it rejects coverage of an event already over
    # rather than admitting it at low severity.
    assert (inc["tp"], inc["fp"], inc["fn"]) == (3, 0, 2)

    problems = {e["problem"] for e in rep["errors"]}
    assert {"dropped_by_prefilter", "classifier_rejected", "wrong_category"} <= problems
    assert "false_positive" not in problems
    assert rep["location"]["incidents_dropped_by_classifier"] == 1
    assert rep["category"]["accuracy"] == pytest.approx(2 / 3)


def test_skip_prefilter_exposes_classifier_alone():
    rep = evaluate.score(ROWS, rules.classify, use_prefilter=False)
    assert rep["prefilter"]["recall"] == 1.0


def test_dedup_pairs_and_split_events():
    rep = evaluate.score(ROWS, rules.classify)
    d = rep["dedup"]
    # the two Eastleigh articles share an event and sit at one hotspot, hours apart
    assert d["tp"] == 1 and d["fp"] == 0


def test_dedup_flags_wrongly_merged_events():
    # Two different crimes at one hotspot within the window: the location
    # rule still merges these, and the evaluator must catch it.
    rows = [
        _row("Gunmen rob M-Pesa shop in Eastleigh", "http://a/1", "yes",
             "crime", "high", "Nairobi", "Eastleigh", "e1"),
        _row("Man stabbed in Eastleigh street fight", "http://b/9", "yes",
             "crime", "high", "Nairobi", "Eastleigh", "e9"),
    ]
    d = evaluate.score(rows, rules.classify)["dedup"]
    assert d["fp"] == 1  # different events, merged by the location+time rule


def test_dedup_keeps_different_kinds_of_event_apart():
    """A crash and a robbery at one spot are two events (Oct 2026: a fire, a
    protest and a journalist's arrest were merged at one Nairobi point)."""
    rows = [
        _row("Two killed in matatu crash in Eastleigh", "http://a/1", "yes",
             "traffic_accident", "high", "Nairobi", "Eastleigh", "e1"),
        _row("Gunmen robbed shop in Eastleigh", "http://b/9", "yes",
             "crime", "high", "Nairobi", "Eastleigh", "e9"),
    ]
    assert evaluate.score(rows, rules.classify)["dedup"]["fp"] == 0


def test_load_labels_skips_unlabelled(tmp_path):
    p = tmp_path / "l.csv"
    with p.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=snapshot.COLUMNS)
        w.writeheader()
        w.writerow({"link": "x", "title": "t", "is_incident": "YES"})
        w.writerow({"link": "y", "title": "t", "is_incident": ""})
    rows = evaluate.load_labels(p)
    assert len(rows) == 1 and rows[0]["is_incident"] == "yes"
    assert rows[0]["source_type"] == "news"


def test_render_mentions_every_stage():
    text = evaluate.render(evaluate.score(ROWS, rules.classify))
    for word in ("prefilter", "incident", "category", "severity", "location", "dedup"):
        assert word in text


def test_snapshot_appends_without_touching_labels():
    item = {"link": "http://n/1", "title": "Two killed in crash in Eastleigh",
            "summary": "", "published": "2026-09-10T08:00:00.000Z", "source": "S"}
    first = snapshot.merge_snapshot([], [item])
    assert first[0]["kw_prefilter"] == "yes" and first[0]["is_incident"] == ""
    first[0]["is_incident"] = "yes"  # human labels it
    again = snapshot.merge_snapshot(first, [item, {**item, "link": "http://n/2"}])
    assert len(again) == 2 and again[0]["is_incident"] == "yes"
