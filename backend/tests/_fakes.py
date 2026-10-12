def fake_store(monkeypatch, repo, stored):
    """Stand in for the two ingestion reads (find_ingested and
    get_dedup_candidates) over an in-memory list of stored incidents."""

    def find_ingested(session, ids, links):
        ids, links = set(ids), set(links)
        return (
            {i["id"] for i in stored if i["id"] in ids},
            {s["url"] for i in stored for s in i.get("sources", []) if s.get("url") in links},
        )

    monkeypatch.setattr(repo, "find_ingested", find_ingested)
    monkeypatch.setattr(
        repo,
        "get_dedup_candidates",
        lambda session, since: [i for i in stored if i["id"].startswith("ing-")],
    )
