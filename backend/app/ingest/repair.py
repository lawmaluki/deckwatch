"""One-off cleanup: undo wrong merges and remove foreign stories.

    python -m app.ingest.repair                    # dry run: print the plan
    python -m app.ingest.repair --out plan.json    # ...and save it for review
    python -m app.ingest.repair --apply            # write it, in one transaction
    python -m app.ingest.repair --apply --exclude ing-b264a042
                                                   # ...leaving out ones you disagree with

Until October 2026 two rules let wrong records through, both fixed in
ingestion since:

  foreign stories   a South African killing was filed under Nairobi, because
                    "central business district" in its text matched Nairobi's
                    CBD hotspot. Now rules.is_foreign drops such headlines.
  mixed merges      the location rule merged anything pinned to one spot
                    within 72 h, whatever it was: a child's death in a fire,
                    a protest and a journalist's arrest became one incident.
                    Now it needs the same category, within 2 km.

This replays stored real incidents under the current rules:

  - a foreign incident is deleted;
  - in a merged incident, each article after the first is kept if its
    headline tells the same story as the others (dedup's story test) or it
    classifies into the incident's category. Otherwise it is detached;
  - a detached article that is an incident on its own becomes one, built
    from its headline (summaries of merged articles aren't stored), and is
    merged with other detached articles where they match; one that isn't an
    incident is dropped;
  - every incident that loses sources gets its verification recomputed.

Dry run by default. --apply deletes and rewrites production records and
cannot be undone, so read the plan first. Needs DATABASE_URL."""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from ..config import settings
from ..domain import Incident, parse_iso_ms
from . import dedup, rules
from .pipeline import build_incident
from .verification import score_verification

Plan = Dict[str, Any]


def _same_story(title: str, others: Sequence[str], similarity: Any) -> bool:
    # Articles inside one incident share a county, so the lower, same-county
    # threshold of dedup.find_same_story applies.
    return bool(others) and similarity.score(title, list(others)) >= similarity.moderate


def _belongs(source: Dict[str, Any], incident: Incident, others: Sequence[str], similarity: Any) -> bool:
    title = source.get("title") or ""
    if not title:
        return True  # older sources stored no headline: nothing to judge by
    if _same_story(title, others, similarity):
        return True
    candidate = rules.classify({"title": title, "summary": ""})
    return candidate is not None and candidate["category"] == incident["category"]


def _rebuild(source: Dict[str, Any], incident: Incident, at_ms: int) -> Optional[Incident]:
    """A detached article as an incident of its own, or None if it isn't one."""
    item = {
        "title": source.get("title") or "",
        "summary": "",
        "link": source.get("url") or "",
        "source": source.get("name") or "",
        "source_type": source.get("type") or "news",
        "published": source.get("publishedAt") or incident["reportedAt"],
    }
    if not item["title"] or not item["link"]:
        return None
    candidate = rules.classify(item)
    if candidate is None:
        return None
    return build_incident(candidate, item, at_ms, ordinal=0)


def _add_source(incident: Incident, source: Dict[str, Any]) -> None:
    incident["sources"] = incident["sources"] + [source]
    incident["reportCount"] = len(incident["sources"])
    incident["verificationScore"], incident["verificationStatus"] = score_verification(incident["sources"])


def plan(incidents: Sequence[Incident], similarity: Any, exclude: Sequence[str] = (), at_ms: int = 0) -> Plan:
    """What the current rules would change. Pure: the caller's incidents are
    untouched."""
    skip = set(exclude)
    real = [i for i in incidents if str(i["id"]).startswith("ing-") and i["id"] not in skip]
    deletes: List[Incident] = []
    trimmed: List[Dict[str, Any]] = []
    detached: List[Dict[str, Any]] = []

    for inc in real:
        if rules.is_foreign(inc["title"]):
            deletes.append(inc)
            detached += [{"source": s, "from": inc} for s in inc["sources"][1:]]
            continue
        sources = inc.get("sources", [])
        if len(sources) < 2:
            continue
        kept = [sources[0]]
        dropped = []
        for s in sources[1:]:
            others = [inc["title"]] + [k.get("title") for k in kept[1:] if k.get("title")]
            (kept if _belongs(s, inc, others, similarity) else dropped).append(s)
        if dropped:
            score, status = score_verification(kept)
            trimmed.append({
                "incident": inc, "kept": kept, "dropped": dropped,
                "verificationScore": score, "verificationStatus": status,
            })
            detached += [{"source": s, "from": inc} for s in dropped]

    # Detached articles, oldest first, become incidents or join one made
    # from an earlier detached article, by ingestion's own rules.
    created: List[Incident] = []
    discarded: List[Dict[str, Any]] = []
    detached.sort(key=lambda d: parse_iso_ms(d["source"].get("publishedAt") or d["from"]["reportedAt"]))
    coverage: List[Dict[str, Any]] = []
    for d in detached:
        new = _rebuild(d["source"], d["from"], at_ms)
        if new is None:
            coverage.append(d)
            continue
        match, _rule = dedup.find_match(new, created, similarity)
        if match is not None:
            _add_source(match, new["sources"][0])
        else:
            created.append(new)
    # Then articles that aren't incidents on their own ("Four injured as
    # building topples" names no county) join the rebuilt incident they
    # cover, whenever they were published relative to it.
    for d in coverage:
        title = d["source"].get("title") or ""
        story = {"title": title, "county": d["from"]["county"], "sources": [],
                 "reportedAt": d["source"].get("publishedAt") or d["from"]["reportedAt"]}
        match = dedup.find_same_story(story, created, similarity) if title and created else None
        if match is None:
            discarded.append(d)
        else:
            _add_source(match, d["source"])
    return {"delete": deletes, "trim": trimmed, "create": created, "discard": discarded}


def describe(p: Plan) -> str:
    lines = [
        f"{len(p['delete'])} foreign incidents to delete, {len(p['trim'])} incidents to trim, "
        f"{len(p['create'])} incidents to create from detached articles, {len(p['discard'])} articles dropped"
    ]
    lines.append("\nDELETE (foreign)")
    for i in p["delete"]:
        lines.append(f"  {i['id']}  {i['county']}: {i['title']}")
    lines.append("\nTRIM (articles that don't belong)")
    for t in p["trim"]:
        i = t["incident"]
        lines.append(f"  {i['id']}  [{i['category']}] {i['title']}")
        for s in t["dropped"]:
            lines.append(f"      - {s.get('name')}: {s.get('title')}")
        lines.append(f"      verification {i['verificationStatus']} {i['verificationScore']} -> "
                     f"{t['verificationStatus']} {t['verificationScore']}")
    lines.append("\nCREATE (detached articles that are incidents)")
    for c in p["create"]:
        lines.append(f"  {c['id']}  [{c['category']}] {c['county']}: {c['title']}  ({len(c['sources'])} source(s))")
    lines.append("\nDROP (detached articles that aren't incidents on their own)")
    for d in p["discard"]:
        lines.append(f"  {d['source'].get('name')}: {d['source'].get('title')}")
    return "\n".join(lines)


def to_json(p: Plan) -> Dict[str, Any]:
    return {
        "delete": [{"id": i["id"], "title": i["title"]} for i in p["delete"]],
        "trim": [{"id": t["incident"]["id"], "title": t["incident"]["title"],
                  "dropped": [s.get("title") for s in t["dropped"]]} for t in p["trim"]],
        "create": [{"id": c["id"], "county": c["county"], "category": c["category"], "title": c["title"],
                    "sources": [s.get("title") for s in c["sources"]]} for c in p["create"]],
        "discard": [d["source"].get("title") for d in p["discard"]],
    }


def apply(session: Any, p: Plan) -> None:
    from .. import repository

    for i in p["delete"]:
        repository.delete_incident(session, i["id"])
    for t in p["trim"]:
        repository.merge_incident(
            session, t["incident"]["id"], t["kept"], len(t["kept"]), t["verificationScore"], t["verificationStatus"]
        )
    ordinal = repository.next_ordinal(session)
    for c in p["create"]:
        repository.insert_incident(session, {**c, "ordinal": ordinal})
        ordinal += 1
    session.commit()


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    ap.add_argument("--out", type=Path, help="write the plan as JSON")
    ap.add_argument("--exclude", action="append", default=[], metavar="ID",
                    help="incident id to leave exactly as stored (repeatable)")
    args = ap.parse_args(argv)

    from .. import repository
    from ..db import SessionLocal
    from ..domain import now_ms

    similarity = dedup.build_similarity(settings.dedup_text, settings.rag_embed_model) or dedup.LexicalSimilarity()
    print(f"story matching: {getattr(similarity, 'name', '?')}")
    with SessionLocal() as session:
        p = plan(repository.get_all_incidents(session, detail=True), similarity, args.exclude, now_ms())
        print(describe(p))
        if args.out:
            args.out.write_text(json.dumps(to_json(p), ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\nwrote {args.out}")
        if not any(p.values()):
            return
        if not args.apply:
            print("\nDry run: nothing changed. Re-run with --apply to write.")
            return
        apply(session, p)
        print("\nrepaired")


if __name__ == "__main__":
    main()
