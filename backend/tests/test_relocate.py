"""The re-locate cleanup's plan: pure, no database."""

from app.ingest import geocode, relocate

NAIROBI = geocode.locate("Nairobi", "Nairobi")


def _stored(id_, title, county="Nairobi", summary="", sources=()):
    center = geocode.locate(county, county)
    return {
        "id": id_, "title": title, "county": county, "locationName": county,
        "lat": center.lat, "lng": center.lng, "aiSummary": summary,
        "sources": list(sources) or [{"name": "Sample", "title": title}],
    }


def test_plan_places_a_county_centre_incident_from_its_headline():
    [change] = relocate.plan([_stored("ing-1", "Woman found stabbed to death in Kayole, Nairobi")])
    assert change["before"]["was"] == "county"
    assert (change["after"]["locationName"], change["after"]["precision"]) == ("Kayole", "local")


def test_plan_reads_merged_source_headlines():
    """A follow-up article often names the place the first one didn't."""
    inc = _stored(
        "ing-2", "Woman found dead in her house",
        sources=[{"name": "A", "title": "Woman found dead in her house"},
                 {"name": "B", "title": "Kayole woman found dead, police say"}],
    )
    [change] = relocate.plan([inc])
    assert change["after"]["locationName"] == "Kayole"


def test_plan_records_precision_for_incidents_it_cannot_place():
    [change] = relocate.plan([_stored("ing-3", "Police warn of rising crime")])
    assert change["after"]["precision"] == "county"
    assert not relocate._moved(change)


def test_plan_skips_seed_rows_and_exclusions():
    incidents = [
        _stored("ow-1", "Woman stabbed in Kayole"),
        _stored("ing-4", "Woman stabbed in Kayole"),
    ]
    assert relocate.plan(incidents, exclude=["ing-4"]) == []


def test_describe_lists_county_moves_for_review():
    changes = relocate.plan([_stored("ing-5", "5 people killed after road accident in Gilgil")])
    text = relocate.describe(changes)
    assert "COUNTY CHANGES (1)" in text
    assert "Nairobi -> Nakuru (Gilgil)" in text
