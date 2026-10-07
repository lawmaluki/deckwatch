"""RAG classifier tests: stub embedder + stub Anthropic client, so no model
download, no network and no API key."""

import json

import pytest

np = pytest.importorskip("numpy")

from app.ingest import classify, examples, rag  # noqa: E402

VOCAB = ["crash", "matatu", "road", "fire", "blaze", "robbery", "gang", "court", "protest"]


def stub_embed(texts):
    """Bag-of-words over a tiny vocabulary: deterministic, and close enough to
    'similar text -> similar vector' to exercise ranking."""
    return [[float(w in t.lower()) for w in VOCAB] for t in texts]


EXAMPLES = [
    {"title": "Matatu crash on Thika Road kills two", "summary": "", "url": "u1",
     "is_incident": True, "category": "traffic_accident", "county": "Kiambu"},
    {"title": "Blaze guts Gikomba market, fire engines delayed", "summary": "", "url": "u2",
     "is_incident": True, "category": "fire", "county": "Nairobi"},
    {"title": "Gang stages robbery at Eastleigh shop", "summary": "", "url": "u3",
     "is_incident": True, "category": "crime", "county": "Nairobi"},
    {"title": "Court hears robbery case against former MP", "summary": "", "url": "u4",
     "is_incident": False, "category": "", "county": ""},
    {"title": "Lorry and matatu crash blocks road", "summary": "", "url": "u5",
     "is_incident": True, "category": "traffic_accident", "county": "Nakuru"},
]

PAYLOAD = {
    "is_incident": True, "category": "traffic_accident", "severity": "high",
    "county": "Nairobi", "location_name": "Mombasa Road", "summary": "Crash.",
    "recommended_actions": ["Avoid the road"],
}
ITEM = {"title": "Three hurt in matatu crash on Mombasa Road", "summary": "",
        "link": "https://x/1", "source": "Sample"}


class _Block:
    type = "text"

    def __init__(self, text):
        self.text = text


class _Resp:
    def __init__(self, text):
        self.content = [_Block(text)]


class RecordingClient:
    def __init__(self, payload=PAYLOAD):
        self.payload, self.calls = payload, []

    @property
    def messages(self):
        return self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return _Resp(json.dumps(self.payload))


def _index(exs=EXAMPLES):
    return examples.ExampleIndex(exs, stub_embed)


# --- example store -----------------------------------------------------------

def test_from_report_maps_categories_and_splits_terror():
    report = {"month": "2026-09", "events": [
        {"title": "Crash", "category": "road", "county": "Nakuru",
         "sources": [{"name": "A", "url": "a", "title": "Bus crash kills five"},
                     {"name": "B", "url": "b", "title": "Five dead in bus crash"}]},
        {"title": "Attack", "category": "security", "county": "Lamu",
         "sources": [{"name": "A", "url": "c", "title": "Suspected Al-Shabaab militants attack camp"}]},
        {"title": "Gang", "category": "security", "county": "Nairobi",
         "sources": [{"name": "A", "url": "d", "title": "Gang terrorising residents"}]},
        {"title": "?", "category": "unheard-of", "county": "X", "sources": [{"title": "t", "url": "e"}]},
    ]}
    exs = examples.from_report(report)
    assert [e["category"] for e in exs] == [
        "traffic_accident", "traffic_accident", "terror_alert", "crime"]
    assert exs[0]["county"] == "Nakuru" and exs[0]["origin"] == "report:2026-09"


def test_from_labels_keeps_negatives_and_skips_unlabelled():
    rows = [
        {"title": "A", "link": "1", "is_incident": "yes", "category": "fire", "county": "Nairobi"},
        {"title": "B", "link": "2", "is_incident": "no", "category": "", "county": ""},
        {"title": "C", "link": "3", "is_incident": "", "category": "", "county": ""},
        {"title": "D", "link": "4", "is_incident": "yes", "category": "typo", "county": ""},
    ]
    exs = examples.from_labels(rows)
    assert [(e["title"], e["is_incident"]) for e in exs] == [("A", True), ("B", False)]


def test_dedupe_lets_a_later_label_override(tmp_path):
    a = {"title": "T", "url": "u", "category": "crime", "is_incident": True}
    b = {"title": "T", "url": "u", "category": "unrest", "is_incident": True}
    assert examples.dedupe([a, b]) == [b]
    p = tmp_path / "e.jsonl"
    examples.save(p, [b])
    assert examples.load(p) == [b]
    assert examples.load(tmp_path / "missing.jsonl") == []


def test_committed_store_is_valid():
    from app.domain import CATEGORIES
    exs = examples.load()
    assert len(exs) > 100
    assert all(e["category"] in CATEGORIES for e in exs if e["is_incident"])


def test_search_ranks_similar_first_and_excludes_self():
    idx = _index()
    hits = idx.search("matatu crash on the road", k=2)
    assert {h["url"] for h, _ in hits} == {"u1", "u5"}
    assert hits[0][1] >= hits[1][1]
    # an article already in the store must not retrieve itself
    hits = idx.search("Lorry and matatu crash blocks road", k=5, exclude_url="u5")
    assert "u5" not in [h["url"] for h, _ in hits]
    assert examples.ExampleIndex([], stub_embed).search("anything") == []


def test_leave_one_out_scores_retrieval():
    res = _index().leave_one_out(k=2)
    assert res["n"] == 4  # the non-incident is not scored
    assert 0 < res["accuracy"] <= 1


# --- classifier --------------------------------------------------------------

def test_classify_puts_retrieved_examples_in_the_prompt():
    client = RecordingClient()
    out = rag.classify(ITEM, client, _index(), k=2, min_score=0.3)
    assert out["category"] == "traffic_accident"
    call = client.calls[0]
    prompt = call["messages"][0]["content"]
    assert "Matatu crash on Thika Road" in prompt
    assert "category=traffic_accident" in prompt
    assert "Blaze guts Gikomba" not in prompt           # dissimilar, not retrieved
    assert prompt.rstrip().endswith("Summary:")          # the article comes last
    assert "reviewed" in call["system"]


def test_negative_examples_are_shown_as_not_incidents():
    client = RecordingClient()
    item = {"title": "Court to rule on robbery case", "summary": "", "link": "z"}
    rag.classify(item, client, _index(), k=2, min_score=0.3)
    assert "Reviewed verdict: not an incident" in client.calls[0]["messages"][0]["content"]


def test_weak_matches_are_dropped_and_it_falls_back_to_plain_llm():
    from app.ingest import classifier
    client = RecordingClient()
    item = {"title": "Elephant strays into village", "summary": "", "link": "z"}
    assert rag.classify(item, client, _index(), k=3, min_score=0.3) is not None
    call = client.calls[0]
    assert call["system"] == classifier.SYSTEM_PROMPT
    assert "Similar articles" not in call["messages"][0]["content"]


def test_no_index_or_broken_retrieval_still_classifies():
    class Broken:
        def __len__(self):
            return 3

        def search(self, *a, **k):
            raise RuntimeError("model missing")

    for index in (None, Broken()):
        assert rag.classify(ITEM, RecordingClient(), index, k=3, min_score=0.3) is not None


def test_model_rejection_still_returns_none():
    client = RecordingClient({**PAYLOAD, "is_incident": False})
    assert rag.classify(ITEM, client, _index(), k=2, min_score=0.3) is None


def test_build_classifier_selects_rag(monkeypatch):
    import anthropic

    monkeypatch.setattr(classify.settings, "ingest_classifier", "rag")
    monkeypatch.setattr(anthropic, "Anthropic", lambda: RecordingClient())
    monkeypatch.setattr(examples, "default_embedder", lambda name: stub_embed)
    monkeypatch.setattr(examples, "reports_from_db", lambda: [])
    fn = classify.build_classifier()
    assert fn(ITEM)["category"] == "traffic_accident"


# --- examples from monthly reports --------------------------------------------

def _report(month, method="claude"):
    return {
        "month": month,
        "method": method,
        "events": [{"category": "road", "county": "Nakuru", "title": "Kikopey crash",
                    "sources": [{"title": f"Five killed at Kikopey ({month})", "url": f"https://x/{month}/1"}]}],
        "setAside": [
            {"title": "Court hears old robbery case", "url": f"https://x/{month}/2",
             "reason": "Court cases and arrests over earlier incidents"},
            {"title": "MP under fire over fuel deal", "url": f"https://x/{month}/3", "reason": "Off-topic"},
        ],
    }


def test_report_set_aside_articles_become_negative_examples():
    exs = examples.from_report(_report("2026-10"))
    pos = [e for e in exs if e["is_incident"]]
    neg = [e for e in exs if not e["is_incident"]]
    assert [e["category"] for e in pos] == ["traffic_accident"]
    assert [e["note"] for e in neg] == ["Court cases and arrests over earlier incidents", "Off-topic"]
    assert all(e["origin"] == "report:2026-10" for e in exs)


def test_unreviewed_automatic_reports_teach_nothing():
    assert examples.from_report(_report("2026-10", method="automatic")) == []


def test_collect_merges_every_report_and_lets_hand_labels_win():
    hand = {"title": "Five killed at Kikopey (2026-10)", "summary": "", "url": "https://x/2026-10/1",
            "is_incident": False, "category": "", "county": "", "origin": "labels"}
    store = examples.collect([hand], [_report("2026-10"), _report("2026-11"), _report("2026-12", "automatic")])
    assert len(store) == 6  # 3 per reviewed month; the automatic month adds none
    overridden = next(e for e in store if e["url"] == "https://x/2026-10/1")
    assert overridden["origin"] == "labels"


def test_prompt_says_why_an_example_is_not_an_incident():
    neg = examples.from_report(_report("2026-10"))[1]
    text = rag.format_examples([(neg, 0.9)])
    assert "not an incident (court cases and arrests over earlier incidents)" in text


def test_build_classifier_reads_reports_from_the_database(monkeypatch, capsys):
    import anthropic

    monkeypatch.setattr(classify.settings, "ingest_classifier", "rag")
    monkeypatch.setattr(anthropic, "Anthropic", lambda: RecordingClient())
    monkeypatch.setattr(examples, "default_embedder", lambda name: stub_embed)
    monkeypatch.setattr(examples, "load", lambda path: [])
    monkeypatch.setattr(examples, "reports_from_db", lambda: [_report("2026-10"), _report("2026-11")])
    classify.build_classifier()
    assert "rag: 6 examples (2 monthly reports)" in capsys.readouterr().out
