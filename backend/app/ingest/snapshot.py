"""Freeze a labelling sample from the live feeds.

    python -m app.ingest.snapshot --out eval/labels.csv

Fetches every configured feed, keeps ALL items (deliberately *before* the
keyword pre-filter, otherwise items it wrongly drops could never be found), and
writes one CSV row per article with the keyword pipeline's verdict beside empty
label columns for a human to fill in. Run it on several days and pass the same
--out: new links are appended, existing rows (and their labels) are untouched.

Label columns (fill these in, leave the rest):
  is_incident    yes / no
  category       one of domain.CATEGORIES
  severity       one of domain.SEVERITIES
  county         true county name (blank if not locatable)
  location_name  true place, e.g. a hotspot name (blank if only the county is known)
  event_id       any short tag; articles about one real event share it
"""

import argparse
import csv
from pathlib import Path
from typing import Dict, List, Optional

from . import prefilter, rules, sources

ITEM_COLUMNS = ["link", "published", "source", "title", "summary"]
KEYWORD_COLUMNS = [
    "kw_prefilter", "kw_is_incident", "kw_category", "kw_severity", "kw_county", "kw_location",
]
LABEL_COLUMNS = ["is_incident", "category", "severity", "county", "location_name", "event_id"]
COLUMNS = ITEM_COLUMNS + KEYWORD_COLUMNS + LABEL_COLUMNS


def keyword_verdict(item: Dict[str, str]) -> Dict[str, str]:
    """What today's keyword pipeline does with this item (for reference only;
    scoring recomputes predictions live, so these never go stale)."""
    passed = prefilter.is_relevant(item)
    cand = rules.classify(item) if passed else None
    return {
        "kw_prefilter": "yes" if passed else "no",
        "kw_is_incident": "yes" if cand else "no",
        "kw_category": cand["category"] if cand else "",
        "kw_severity": cand["severity"] if cand else "",
        "kw_county": cand["county"] if cand else "",
        "kw_location": cand["location_name"] if cand else "",
    }


def read_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_rows(path: Path, rows: List[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def merge_snapshot(
    existing: List[Dict[str, str]], items: List[Dict[str, str]]
) -> List[Dict[str, str]]:
    """Append items whose link isn't already present. Existing rows are never
    rewritten, so labels typed between runs survive."""
    seen = {r["link"] for r in existing}
    out = list(existing)
    for item in items:
        if item["link"] in seen:
            continue
        seen.add(item["link"])
        row = {c: item.get(c, "") for c in ITEM_COLUMNS}
        row.update(keyword_verdict(item))
        row.update({c: "" for c in LABEL_COLUMNS})
        out.append(row)
    return out


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--out", default="eval/labels.csv", help="CSV to create or append to")
    args = ap.parse_args(argv)

    path = Path(args.out)
    existing = read_rows(path)
    merged = merge_snapshot(existing, sources.fetch_items())
    write_rows(path, merged)
    print(f"snapshot: {len(merged) - len(existing)} new, {len(merged)} total -> {path}")


if __name__ == "__main__":
    main()
