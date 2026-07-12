"""Integration tests against a real PostGIS database.

Skipped unless TEST_DATABASE_URL is set, e.g.:
    TEST_DATABASE_URL=postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch \\
        pytest tests/test_api.py
(Run `docker compose up db` first.) These exercise the routers + SQLAlchemy +
PostGIS end to end; the pure logic is covered DB-free in test_domain.py.
"""

import os
from datetime import datetime, timedelta, timezone

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")

if TEST_DB:
    os.environ["DATABASE_URL"] = TEST_DB
    from fastapi.testclient import TestClient

    from app.db import Base, engine
    from app.init_db import main as init_db
    from app.main import app
    from app.seed import seed

    @pytest.fixture(scope="module")
    def client():
        Base.metadata.drop_all(engine)
        init_db()
        seed()
        with TestClient(app) as c:
            yield c


def test_list_returns_full_dataset(client):
    r = client.get("/incidents")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 360
    assert len(body["results"]) == 360
    # asOf ~ now, and the newest incident is re-anchored to near it.
    as_of = datetime.fromisoformat(body["asOf"].replace("Z", "+00:00"))
    assert abs((as_of - datetime.now(timezone.utc)).total_seconds()) < 30
    assert "aiSummary" in body["results"][0]


def test_filter_category_and_reject_unknown(client):
    ok = client.get("/incidents?category=flood")
    assert all(i["category"] == "flood" for i in ok.json()["results"])
    bad = client.get("/incidents?category=bogus")
    assert bad.status_code == 400 and "Unknown category" in bad.json()["error"]


def test_since_and_limit(client):
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    r = client.get(f"/incidents?since={since}")
    body = r.json()
    assert 0 < body["count"] < 360
    lim = client.get("/incidents?limit=5")
    assert lim.json()["count"] == 5
    for bad in ["0", "-3", "abc"]:
        assert client.get(f"/incidents?limit={bad}").status_code == 400


def test_incident_by_id(client):
    first = client.get("/incidents?limit=1").json()["results"][0]["id"]
    r = client.get(f"/incidents/{first}")
    assert r.status_code == 200 and isinstance(r.json()["recommendedActions"], list)
    assert client.get("/incidents/nope").status_code == 404


def test_county_summary(client):
    r = client.get("/counties/nairobi")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"name", "slug", "riskScore", "activeLast24h", "topCategory"}
    assert 0 <= body["riskScore"] <= 100
    assert client.get("/counties/atlantis").status_code == 404


def test_reports(client):
    ok = client.post(
        "/reports",
        json={
            "category": "crime",
            "description": "test",
            "lat": -1.29,
            "lng": 36.82,
            "anonymous": True,
        },
    )
    assert ok.status_code == 201
    assert ok.json()["status"] == "pending_review"
    assert ok.json()["id"].startswith("rpt_")

    bad = client.post("/reports", json={"category": "crime", "description": "x", "lat": 51.5, "lng": 36.8})
    assert bad.status_code == 400
    malformed = client.post(
        "/reports", content="{oops", headers={"content-type": "application/json"}
    )
    assert malformed.status_code == 400
