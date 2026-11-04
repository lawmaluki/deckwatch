"""app.takedown and repository.take_down_incident, without a database: a
fake session records what would be written. The SQL side (find_ingested
treating removed links as seen) is covered in test_api.py."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app import repository, takedown
from app.models import RemovedArticle


class FakeSession:
    def __init__(self, incidents):
        self.incidents = {i.id: i for i in incidents}
        self.merged, self.deleted, self.committed, self.closed = [], [], False, False

    def get(self, model, key):
        return self.incidents.get(key)

    def merge(self, obj):
        self.merged.append(obj)

    def delete(self, obj):
        self.deleted.append(obj.id)

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


def _incident():
    return SimpleNamespace(
        id="ing-1a2b3c4d",
        title="Man found dead in Kayole",
        county_name="Nairobi",
        reported_at=datetime(2026, 10, 8, tzinfo=timezone.utc),
        sources=[
            {"name": "Tuko", "url": "https://tuko.example/a"},
            {"name": "Citizen Digital", "url": "https://citizen.example/b"},
            {"name": "Tuko", "url": "https://tuko.example/a"},  # repeated link
            {"name": "Police", "url": ""},
        ],
    )


def test_take_down_records_each_link_once_and_deletes():
    session = FakeSession([_incident()])
    urls = repository.take_down_incident(session, "ing-1a2b3c4d", "names a witness")
    assert urls == ["https://tuko.example/a", "https://citizen.example/b"]
    assert all(isinstance(r, RemovedArticle) for r in session.merged)
    assert [(r.url, r.incident_id, r.reason) for r in session.merged] == [
        ("https://tuko.example/a", "ing-1a2b3c4d", "names a witness"),
        ("https://citizen.example/b", "ing-1a2b3c4d", "names a witness"),
    ]
    assert session.deleted == ["ing-1a2b3c4d"]


def test_take_down_of_unknown_incident_changes_nothing():
    session = FakeSession([])
    assert repository.take_down_incident(session, "ing-missing", "x") == []
    assert session.merged == [] and session.deleted == []


def test_cli_is_a_dry_run_without_yes(monkeypatch, capsys):
    session = FakeSession([_incident()])
    monkeypatch.setattr(takedown, "SessionLocal", lambda: session)
    assert takedown.main(["ing-1a2b3c4d", "--reason", "wrong county"]) == 0
    out = capsys.readouterr().out
    assert "Man found dead in Kayole" in out and "dry run" in out
    assert session.deleted == [] and not session.committed and session.closed


def test_cli_takes_down_with_yes(monkeypatch, capsys):
    session = FakeSession([_incident()])
    monkeypatch.setattr(takedown, "SessionLocal", lambda: session)
    assert takedown.main(["ing-1a2b3c4d", "--reason", "wrong county", "--yes"]) == 0
    assert session.deleted == ["ing-1a2b3c4d"] and session.committed
    assert "2 source link(s) blocked" in capsys.readouterr().out


def test_cli_reports_an_unknown_incident(monkeypatch, capsys):
    monkeypatch.setattr(takedown, "SessionLocal", lambda: FakeSession([]))
    assert takedown.main(["ing-missing", "--reason", "x", "--yes"]) == 1
    assert "no incident ing-missing" in capsys.readouterr().out
