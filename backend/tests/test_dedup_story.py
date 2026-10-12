"""Merging duplicate coverage by headline (dedup.find_same_story). Runs with
no database and no model: word overlap is real, embeddings are stubbed."""

import pytest

from _fakes import fake_store

from app.ingest import dedup, pipeline

KAJ_LAT, KAJ_LNG = -1.9927, 36.936  # Kajiado county centre: geocoder found no specific place


def inc(title, reported, county="Kajiado", sources=None, iid="ing-a"):
    return {
        "id": iid, "title": title, "county": county, "category": "traffic_accident",
        "lat": KAJ_LAT, "lng": KAJ_LNG, "reportedAt": reported,
        "sources": sources or [{"name": "Tuko News", "type": "news", "url": "https://x/" + iid}],
        "reportCount": 1,
    }


LEX = dedup.LexicalSimilarity()


def test_location_rule_alone_cannot_merge_county_level_reports():
    a = inc("Teacher, student killed in Kajiado aircraft crash", "2026-09-18T09:00:00Z")
    b = inc("Two killed in Kajiado aircraft crash", "2026-09-18T11:00:00Z", iid="ing-b")
    assert dedup.find_duplicate(b, [a]) is None  # both at the county centre
    assert dedup.find_same_story(b, [a], LEX) is a


def test_moderate_similarity_needs_the_same_county():
    a = inc("Matatu crash on Thika Road kills two", "2026-09-18T09:00:00Z", county="Kiambu")
    near = inc("Two dead after matatu crash on busy road", "2026-09-18T10:00:00Z", county="Kiambu", iid="ing-b")
    far = dict(near, county="Mombasa", id="ing-c")
    s = LEX.score(near["title"], [a["title"]])
    assert LEX.moderate <= s < LEX.strong
    assert dedup.find_same_story(near, [a], LEX) is a
    assert dedup.find_same_story(far, [a], LEX) is None


def test_near_identical_headlines_merge_even_if_the_county_was_misread():
    a = inc("Five killed as bus and saloon car collide at Kikopey", "2026-09-14T03:00:00Z", county="Nakuru")
    b = inc("Five killed as bus and saloon car collide at Kikopey on highway", "2026-09-14T05:00:00Z",
            county="Nairobi", iid="ing-b")
    assert dedup.find_same_story(b, [a], LEX) is a


def test_follow_ups_match_any_merged_headline_and_extend_the_window():
    # First article on the 18th; a follow-up merged on the 20th keeps the story
    # open, so an article on the 22nd (96 h after the first) can still join it.
    a = inc("Training aircraft crashes near Kipeto wind farm", "2026-09-18T09:00:00Z", sources=[
        {"name": "Tuko News", "type": "news", "url": "https://x/1"},
        {"name": "KBC", "type": "news", "url": "https://x/2",
         "title": "Kenya School of Flying names pilot killed in Kipeto crash", "publishedAt": "2026-09-20T09:00:00Z"},
    ])
    late = inc("Family mourns pilot killed in Kipeto crash, Kenya School of Flying says", "2026-09-22T09:00:00Z",
               iid="ing-b")
    assert dedup.find_same_story(late, [a], LEX) is a
    stale = inc("Training aircraft crashes near Kipeto wind farm", "2026-09-30T09:00:00Z", iid="ing-c")
    assert dedup.find_same_story(stale, [a], LEX) is None  # 10 days after the last article


def test_unrelated_stories_in_one_county_stay_apart():
    a = inc("Herdsman shot dead as bandits steal cattle in Meru", "2026-09-16T09:00:00Z", county="Meru")
    b = inc("Woman killed while walking to outdoor toilet in Meru", "2026-09-16T12:00:00Z", county="Meru", iid="ing-b")
    assert dedup.find_same_story(b, [a], LEX) is None


def test_best_match_wins():
    weak = inc("Aircraft crash in Kajiado", "2026-09-18T09:00:00Z", iid="ing-w")
    strong = inc("Pilot and student killed in Kajiado aircraft crash near Ngong", "2026-09-18T09:30:00Z", iid="ing-s")
    cand = inc("Pilot and student killed in Kajiado aircraft crash near Ngong hills", "2026-09-18T10:00:00Z", iid="ing-c")
    assert dedup.find_same_story(cand, [weak, strong], LEX) is strong


class StubEmbed:
    """Maps known headlines to fixed unit vectors; counts model loads."""

    loads = 0

    def __init__(self, vectors):
        self.vectors = vectors

    def __call__(self):
        StubEmbed.loads += 1
        return lambda texts: [self.vectors[t] for t in texts]


def test_embedding_similarity_catches_rewordings_and_loads_lazily():
    vectors = {
        "Aircraft crash kills two in Kajiado": [1.0, 0.0],
        "Pilot and student die near Ngong": [0.9, 0.436],  # cosine 0.9
        "Robbery at Kitengela bank": [0.0, 1.0],
    }
    StubEmbed.loads = 0
    sim = dedup.EmbeddingSimilarity(StubEmbed(vectors))
    assert StubEmbed.loads == 0
    a = inc("Aircraft crash kills two in Kajiado", "2026-09-18T09:00:00Z")
    b = inc("Pilot and student die near Ngong", "2026-09-18T10:00:00Z", iid="ing-b")
    c = inc("Robbery at Kitengela bank", "2026-09-18T10:00:00Z", iid="ing-c")
    assert dedup.find_same_story(b, [a], sim) is a
    assert dedup.find_same_story(c, [a], sim) is None
    assert StubEmbed.loads == 1


def test_build_similarity_modes():
    assert dedup.build_similarity("off", "m") is None
    assert isinstance(dedup.build_similarity("lexical", "m"), dedup.LexicalSimilarity)
    try:
        import fastembed  # noqa: F401
    except ImportError:
        assert isinstance(dedup.build_similarity("auto", "m"), dedup.LexicalSimilarity)
        with pytest.raises(RuntimeError):
            dedup.build_similarity("embedding", "m")
    else:
        assert isinstance(dedup.build_similarity("auto", "m"), dedup.EmbeddingSimilarity)


# --- through the pipeline -------------------------------------------------------

class _Session:
    def commit(self):
        pass


def _item(title, link, published):
    return {"title": title, "summary": "", "link": link, "published": published,
            "source": "Tuko News", "source_type": "news"}


CANDIDATE = {"category": "traffic_accident", "severity": "high", "county": "Kajiado",
             "location_name": "Kajiado", "summary": "Crash.", "recommended_actions": []}


def test_pipeline_merges_county_level_duplicates_by_story(monkeypatch):
    stored, merged = [], []
    fake_store(monkeypatch, pipeline.repository, stored)
    monkeypatch.setattr(pipeline.repository, "next_ordinal", lambda s: 1)
    monkeypatch.setattr(pipeline.repository, "insert_incident", lambda s, i: stored.append(i))
    monkeypatch.setattr(pipeline.repository, "merge_incident", lambda s, *a: merged.append(a))
    items = [
        _item("Teacher, student killed in Kajiado aircraft crash", "https://tuko/1", "2026-09-18T09:00:00Z"),
        _item("Two killed after aircraft crash in Kajiado", "https://kbc/2", "2026-09-18T10:00:00Z"),
    ]
    stats = pipeline.run(_Session(), lambda item: dict(CANDIDATE), items=items, similarity=LEX)
    assert (stats["inserted"], stats["merged"], stats["merged_by_story"]) == (1, 1, 1)
    # the first article's headline is kept on its source, for later matching
    assert stored[0]["sources"][0]["title"] == "Teacher, student killed in Kajiado aircraft crash"
    assert merged[0][0] == stored[0]["id"]
    assert merged[0][1][-1]["title"] == "Two killed after aircraft crash in Kajiado"


def test_pipeline_with_story_matching_off_keeps_them_apart(monkeypatch):
    stored = []
    fake_store(monkeypatch, pipeline.repository, stored)
    monkeypatch.setattr(pipeline.repository, "next_ordinal", lambda s: 1)
    monkeypatch.setattr(pipeline.repository, "insert_incident", lambda s, i: stored.append(i))
    monkeypatch.setattr(pipeline.repository, "merge_incident", lambda s, *a: None)
    items = [
        _item("Teacher, student killed in Kajiado aircraft crash", "https://tuko/1", "2026-09-18T09:00:00Z"),
        _item("Two killed after aircraft crash in Kajiado", "https://kbc/2", "2026-09-18T10:00:00Z"),
    ]
    stats = pipeline.run(_Session(), lambda item: dict(CANDIDATE), items=items, similarity=None)
    assert stats["inserted"] == 2 and stats["merged"] == 0
