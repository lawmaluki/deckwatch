"""The one-off duplicate cleanup. Pure planning plus a fake repository: no DB."""

from app.ingest import dedup, merge_duplicates

KAJ = (-1.9927, 36.936)  # Kajiado county centre


def inc(iid, title, reported, county="Kajiado", outlet="Tuko News", sources=None, status="unconfirmed"):
    return {
        "id": iid, "title": title, "county": county, "category": "traffic_accident",
        "lat": KAJ[0], "lng": KAJ[1], "reportedAt": reported,
        "sources": sources or [{"name": outlet, "type": "news", "url": f"https://{outlet}/{iid}"}],
        "reportCount": 1, "verificationScore": 30, "verificationStatus": status,
    }


STORED = [
    inc("ing-3", "Two killed after aircraft crash in Kajiado", "2026-09-18T11:00:00Z", outlet="KBC"),
    inc("ing-1", "Teacher, student killed in Kajiado aircraft crash", "2026-09-18T09:00:00Z", outlet="Tuko News"),
    inc("ing-2", "Herdsman shot dead as bandits steal cattle in Meru", "2026-09-18T10:00:00Z", county="Meru"),
    inc("ing-4", "Kajiado aircraft crash victims named as student pilot and instructor", "2026-09-19T08:00:00Z",
        outlet="Citizen Digital"),
    {**inc("ow-9", "Two killed after aircraft crash in Kajiado", "2026-09-18T11:30:00Z"), "id": "ow-9"},
]
LEX = dedup.LexicalSimilarity()


def test_plan_merges_the_story_into_its_earliest_report():
    groups = merge_duplicates.plan(STORED, LEX)
    assert len(groups) == 1
    g = groups[0]
    assert g["keep"]["id"] == "ing-1"  # earliest article survives
    assert [d["id"] for d in g["duplicates"]] == ["ing-3", "ing-4"]
    # every outlet ends up on the kept record, with its own headline for later matching
    sources = g["keep"]["sources"]
    assert [s["name"] for s in sources] == ["Tuko News", "KBC", "Citizen Digital"]
    assert sources[1]["title"] == "Two killed after aircraft crash in Kajiado"
    assert sources[1]["publishedAt"] == "2026-09-18T11:00:00Z"
    # three independent newsrooms now corroborate it, so it is re-scored
    assert (g["keep"]["verificationStatus"], g["keep"]["verificationScore"], g["keep"]["reportCount"]) == ("verified", 82, 3)


def test_plan_leaves_unrelated_and_sample_incidents_alone():
    ids = {d["id"] for g in merge_duplicates.plan(STORED, LEX) for d in g["duplicates"]}
    assert "ing-2" not in ids and "ow-9" not in ids


def test_plan_does_not_touch_the_callers_records():
    before = [dict(i, sources=list(i["sources"])) for i in STORED]
    merge_duplicates.plan(STORED, LEX)
    assert STORED == before


def test_without_story_matching_county_level_reports_stay_apart():
    assert merge_duplicates.plan(STORED, None) == []


class FakeSession:
    committed = False

    def commit(self):
        self.committed = True


def test_apply_moves_sources_then_deletes_duplicates(monkeypatch):
    from app import repository

    calls = []
    monkeypatch.setattr(repository, "merge_incident", lambda s, iid, src, *a: calls.append(("merge", iid, len(src))))
    monkeypatch.setattr(repository, "delete_incident", lambda s, iid: calls.append(("delete", iid)))
    session = FakeSession()
    merge_duplicates.apply(session, merge_duplicates.plan(STORED, LEX))
    assert calls == [("merge", "ing-1", 3), ("delete", "ing-3"), ("delete", "ing-4")]
    assert session.committed


def test_describe_and_json_list_every_merge():
    groups = merge_duplicates.plan(STORED, LEX)
    text = merge_duplicates.describe(groups)
    assert "1 incidents absorb 2 duplicates" in text and "KEEP ing-1" in text
    out = merge_duplicates.to_json(groups)
    assert out[0]["sourcesAfter"] == 3 and len(out[0]["duplicates"]) == 2


def test_excluded_incidents_stay_out_of_every_merge():
    # excluding a duplicate keeps it standalone; the rest still merge
    groups = merge_duplicates.plan(STORED, LEX, exclude=["ing-4"])
    assert [d["id"] for d in groups[0]["duplicates"]] == ["ing-3"]
    # excluding the earliest makes the next one the record others join
    groups = merge_duplicates.plan(STORED, LEX, exclude=["ing-1"])
    assert groups[0]["keep"]["id"] == "ing-3"
    assert all(d["id"] != "ing-1" for g in groups for d in g["duplicates"])
