"""Hybrid classifier tests: real keyword rules, a stub RAG step."""

import pytest

from app.ingest import classify, hybrid, rules
from app.ingest.classifier import ClassifierError

RAG_ANSWER = {
    "category": "unrest", "severity": "high", "county": "Embu", "location_name": "Embu",
    "summary": "Rally violence.", "recommended_actions": [],
}


class StubRag:
    def __init__(self, answer=RAG_ANSWER, fail=False):
        self.answer, self.fail, self.calls = answer, fail, []

    def __call__(self, item):
        self.calls.append(item["title"])
        if self.fail:
            raise ClassifierError("APIConnectionError: down")
        return self.answer


def item(title):
    return {"title": title, "summary": "", "link": "https://x/" + title[:10], "source": "Sample"}


def test_rules_decide_a_clear_road_crash_without_calling_rag():
    rag = StubRag()
    clf = hybrid.HybridClassifier(rag)
    out = clf(item("Matatu crash on Thika Road in Kiambu kills two"))
    assert out["category"] == "traffic_accident"
    assert rag.calls == [] and clf.stats == {"rule": 1, "rag": 0, "fallback": 0}


@pytest.mark.parametrize(
    "title, reason",
    [
        ("Kindiki under fire as Gachagua links Embu violence to Mt Kenya politics", "risky category: fire"),
        ("Orengo missing as Linda Mwananchi endorses Sifuna in Siaya", "risky category: missing_person"),
        ("Court hears robbery case against Nairobi trader", "follow-up cue: court"),
        ("Police say one killed, six vehicles torched in violence at Kindiki rally in Embu", "follow-up cue: rally"),
        ("Election violence hotspots mapped ahead of 2027 polls", "no rule answer"),
    ],
)
def test_ambiguous_articles_go_to_rag(title, reason):
    assert reason in hybrid.needs_review(rules.analyse(item(title)))
    rag = StubRag()
    clf = hybrid.HybridClassifier(rag)
    assert clf(item(title)) == RAG_ANSWER
    assert rag.calls == [title] and clf.stats["rag"] == 1


def test_rag_saying_not_an_incident_overrides_the_rules():
    clf = hybrid.HybridClassifier(StubRag(answer=None))
    assert clf(item("Kindiki under fire over fuel deal in Embu")) is None


def test_claude_down_falls_back_to_the_rule_answer():
    clf = hybrid.HybridClassifier(StubRag(fail=True))
    out = clf(item("Blaze guts market stalls in Nairobi"))
    assert out["category"] == "fire"
    assert clf.stats == {"rule": 0, "rag": 0, "fallback": 1}
    assert "rule fallback (Claude unavailable) 1" in clf.summary()


def test_claude_down_with_no_rule_answer_leaves_the_article_for_next_run():
    clf = hybrid.HybridClassifier(StubRag(fail=True))
    with pytest.raises(ClassifierError):
        clf(item("Election violence hotspots mapped ahead of 2027 polls"))


def test_plural_keywords_match():
    # "crashes" / "accidents" used to fall through to crime on "killed".
    assert rules.analyse(item("Three killed in two separate crashes on Mwea-Embu highway"))["candidate"]["category"] == "traffic_accident"
    assert rules.analyse(item("9 killed in separate road accidents in Kisii"))["candidate"]["category"] == "traffic_accident"


def test_build_classifier_selects_hybrid(monkeypatch):
    monkeypatch.setattr(classify.settings, "ingest_classifier", "hybrid")
    monkeypatch.setattr(classify, "_build_rag", lambda: StubRag())
    clf = classify.build_classifier()
    assert isinstance(clf, hybrid.HybridClassifier)
    assert clf(item("Kindiki under fire over fuel deal in Embu")) == RAG_ANSWER
