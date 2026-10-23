"""The repair cleanup's plan: pure, no database, word-overlap story matching."""

from app.ingest import dedup, geocode, repair

SIM = dedup.LexicalSimilarity()
NAIROBI = geocode.locate("Nairobi", "Nairobi")


def _src(name, title, url, at="2026-10-22T10:00:00.000Z"):
    return {"name": name, "type": "news", "url": url, "title": title, "publishedAt": at}


def _inc(id_, title, category, sources):
    return {
        "id": id_, "title": title, "category": category, "severity": "high",
        "county": "Nairobi", "locationName": "Nairobi", "lat": NAIROBI.lat, "lng": NAIROBI.lng,
        "reportedAt": sources[0]["publishedAt"], "sources": sources, "reportCount": len(sources),
        "verificationScore": 63, "verificationStatus": "likely_true",
    }


def test_foreign_incident_is_deleted_and_its_kenyan_coverage_rebuilt():
    inc = _inc("ing-1", "South Africa xenophobia: Police launch probe after foreign national is beaten to death by mob",
               "crime", [
                   _src("A", "South Africa xenophobia: Police launch probe after foreign national is beaten to death by mob", "http://a/1"),
                   _src("B", "Teenager stabbed to death in Eastleigh", "http://b/2", "2026-10-22T12:00:00.000Z"),
               ])
    p = repair.plan([inc], SIM)
    assert [i["id"] for i in p["delete"]] == ["ing-1"]
    assert [c["title"] for c in p["create"]] == ["Teenager stabbed to death in Eastleigh"]


def test_an_unrelated_article_of_another_kind_is_detached():
    inc = _inc("ing-2", "Tragedy as 3-year-old girl burnt to death in Nairobi plot fire", "fire", [
        _src("A", "Tragedy as 3-year-old girl burnt to death in Nairobi plot fire", "http://a/3"),
        _src("B", "Teenager stabbed to death in Eastleigh", "http://b/4", "2026-10-22T13:00:00.000Z"),
    ])
    p = repair.plan([inc], SIM)
    [trim] = p["trim"]
    assert [s["url"] for s in trim["kept"]] == ["http://a/3"]
    assert [c["category"] for c in p["create"]] == ["crime"]


def test_the_same_story_told_differently_stays_merged():
    inc = _inc("ing-3", "Two killed in Thika Road matatu crash", "traffic_accident", [
        _src("A", "Two killed in Thika Road matatu crash", "http://a/5"),
        _src("B", "Thika Road matatu crash: two killed near Githurai", "http://b/6"),
    ])
    p = repair.plan([inc], SIM)
    assert p == {"delete": [], "trim": [], "create": [], "discard": []}


def test_excluded_incidents_are_left_alone():
    inc = _inc("ing-4", "Two mass shootings in South Africa leave 27 dead", "crime", [
        _src("A", "Two mass shootings in South Africa leave 27 dead", "http://a/7"),
    ])
    assert repair.plan([inc], SIM, exclude=["ing-4"])["delete"] == []
