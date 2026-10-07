"""One-off cleanup: merge duplicate incidents already in the database.

    python -m app.ingest.merge_duplicates                  # dry run: print the plan
    python -m app.ingest.merge_duplicates --out plan.json  # ...and save it for review
    python -m app.ingest.merge_duplicates --apply          # merge, in one transaction
    python -m app.ingest.merge_duplicates --apply --exclude ing-c88fbea7 --exclude ing-67a86870
                                                           # ...leaving out ones you disagree with

Live ingestion merges a new article into an existing incident when the two
describe the same event (dedup.find_duplicate, then dedup.find_same_story).
Incidents stored before story matching existed never got that chance, so the
same event can sit on the map several times. This replays every stored real
incident in publish order through the very same rules and merges what
ingestion would have merged: each duplicate's sources move onto the incident
it belongs to, the verification score is recomputed, and the duplicate row is
deleted.

Dry run by default. --apply rewrites production records and cannot be undone
(a deleted duplicate's id stops resolving, so a shared link to it breaks), so
review the plan first: about 1 merge in 20 was wrong on the October 2026
production data (two different crashes on one highway, two murders in one
county). --exclude an incident to keep it out of every merge, as neither a
duplicate nor a record others merge into. Needs DATABASE_URL."""

import argparse
import copy
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from ..config import settings
from ..domain import Incident, parse_iso_ms
from . import dedup
from .pipeline import merge_fields

Group = Dict[str, Any]  # {"keep": Incident, "duplicates": [Incident, ...]}


def _with_story_fields(source: Dict[str, Any], incident: Incident) -> Dict[str, Any]:
    """A source moving onto another incident keeps its own headline and time,
    so later articles can still match it. Older sources stored neither, so they
    inherit the incident they came from."""
    out = dict(source)
    out.setdefault("title", incident["title"])
    out.setdefault("publishedAt", incident["reportedAt"])
    return out


def plan(
    incidents: Sequence[Incident], similarity: Optional[Any], exclude: Sequence[str] = ()
) -> List[Group]:
    """The merges ingestion would have made, oldest first. Pure: works on
    copies, so the caller's incidents are untouched. Excluded incidents are
    left exactly as they are."""
    skip = set(exclude)
    kept: List[Incident] = []
    groups: Dict[str, Group] = {}
    ordered = sorted(
        (i for i in incidents if str(i["id"]).startswith("ing-") and i["id"] not in skip),
        key=lambda i: (parse_iso_ms(i["reportedAt"]), i["id"]),
    )
    for inc in ordered:
        target = dedup.find_duplicate(inc, kept)
        if target is None and similarity is not None:
            target = dedup.find_same_story(inc, kept, similarity)
        if target is None:
            kept.append(copy.deepcopy(inc))
            continue
        for src in inc["sources"]:
            sources, count, score, status = merge_fields(target, _with_story_fields(src, inc))
            target.update(sources=sources, reportCount=count, verificationScore=score, verificationStatus=status)
        groups.setdefault(target["id"], {"keep": target, "duplicates": []})["duplicates"].append(inc)
    return list(groups.values())


def apply(session: Any, groups: Sequence[Group]) -> None:
    from .. import repository

    for g in groups:
        keep = g["keep"]
        repository.merge_incident(
            session, keep["id"], keep["sources"], keep["reportCount"],
            keep["verificationScore"], keep["verificationStatus"],
        )
        for dup in g["duplicates"]:
            repository.delete_incident(session, dup["id"])
    session.commit()


def describe(groups: Sequence[Group]) -> str:
    n = sum(len(g["duplicates"]) for g in groups)
    lines = [f"{len(groups)} incidents absorb {n} duplicates"]
    for g in sorted(groups, key=lambda g: -len(g["duplicates"])):
        k = g["keep"]
        lines.append(f"\n  KEEP {k['id']}  {k['reportedAt'][:10]}  {k['county']}  {k['title']}")
        for d in g["duplicates"]:
            lines.append(f"    + {d['id']}  {d['reportedAt'][:10]}  {d['county']}  {d['title']}")
    return "\n".join(lines)


def to_json(groups: Sequence[Group]) -> List[Dict[str, Any]]:
    return [
        {
            "keep": {"id": g["keep"]["id"], "title": g["keep"]["title"]},
            "duplicates": [{"id": d["id"], "title": d["title"], "reportedAt": d["reportedAt"]} for d in g["duplicates"]],
            "sourcesAfter": len(g["keep"]["sources"]),
            "verificationAfter": g["keep"]["verificationStatus"],
        }
        for g in groups
    ]


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="perform the merges (default: dry run)")
    ap.add_argument("--out", type=Path, help="write the plan as JSON")
    ap.add_argument("--exclude", action="append", default=[], metavar="ID",
                    help="incident id to leave out of every merge (repeatable)")
    args = ap.parse_args(argv)

    from .. import repository
    from ..db import SessionLocal

    similarity = dedup.build_similarity(settings.dedup_text, settings.rag_embed_model)
    print(f"story matching: {getattr(similarity, 'name', 'off')}")
    with SessionLocal() as session:
        incidents = repository.get_all_incidents(session)
        groups = plan(incidents, similarity, args.exclude)
        print(describe(groups))
        if args.out:
            args.out.write_text(json.dumps(to_json(groups), ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\nwrote {args.out}")
        if not groups:
            return
        if not args.apply:
            print("\nDry run: nothing changed. Re-run with --apply to merge.")
            return
        apply(session, groups)
        print(f"\nmerged {sum(len(g['duplicates']) for g in groups)} duplicates")


if __name__ == "__main__":
    main()
