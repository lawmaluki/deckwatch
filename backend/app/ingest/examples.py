"""Reviewed-example store for the RAG classifier (retrieval half).

An "example" is a past article whose category a human has confirmed. Before the
LLM classifies a new article it is shown the most semantically similar examples,
so it applies categories the way an editor already did rather than from keyword
overlap. Similarity is cosine distance between sentence embeddings from a small
local model (fastembed / ONNX: no API key, no network after the first download).

A few hundred short headlines fit in memory, so the "index" is one numpy matrix
rebuilt at start-up; no vector database is involved.

    # (re)build the store from the reviewed monthly report + your labelled sample
    python -m app.ingest.examples build \\
        --report ../src/lib/data/monthly-reports/2026-09.json \\
        --labels eval/labels.csv --out fixtures/rag-examples.jsonl

    # sanity-check retrieval alone: leave-one-out nearest-neighbour accuracy
    python -m app.ingest.examples check
"""

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from ..domain import CATEGORIES

Example = Dict[str, Any]
# texts -> one vector per text (anything numpy can turn into a 2-D float array)
Embedder = Callable[[Sequence[str]], Any]

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
DEFAULT_PATH = FIXTURES / "rag-examples.jsonl"

# The monthly report uses an editorial taxonomy; map it onto the app's categories.
REPORT_CATEGORY_MAP = {
    "security": "crime",
    "road": "traffic_accident",
    "unrest": "unrest",
    "missing": "missing_person",
    "fire": "fire",
    "collapse": "infrastructure",
    "health": "public_health",
    "wildlife": "wildlife",
    "weather": "flood",
}
# "security" in the report also covers terror attacks, which the app separates.
_TERROR = re.compile(r"shabaab|terroris[mt]|militant|grenade|\bbomb", re.IGNORECASE)


# --- building ----------------------------------------------------------------

def from_report(report: Mapping[str, Any]) -> List[Example]:
    """One example per source article of every reviewed event."""
    out: List[Example] = []
    for event in report.get("events", []):
        category = REPORT_CATEGORY_MAP.get(event.get("category"))
        if category is None:
            continue
        for src in event.get("sources", []):
            title = (src.get("title") or "").strip()
            if not title:
                continue
            cat = category
            if category == "crime" and _TERROR.search(f"{title} {event.get('title', '')}"):
                cat = "terror_alert"
            out.append({
                "title": title,
                "summary": "",
                "url": src.get("url", ""),
                "is_incident": True,
                "category": cat,
                "county": event.get("county", ""),
                "origin": f"report:{report.get('month', '')}",
            })
    return out


def from_labels(rows: Sequence[Mapping[str, str]]) -> List[Example]:
    """Examples from a labelled eval sheet. Non-incidents are kept too: seeing
    "court hears robbery case -> not an incident" is what teaches the boundary."""
    out: List[Example] = []
    for r in rows:
        verdict = (r.get("is_incident") or "").strip().lower()
        if verdict not in ("yes", "no"):
            continue
        is_incident = verdict == "yes"
        category = (r.get("category") or "").strip()
        if is_incident and category not in CATEGORIES:
            continue
        out.append({
            "title": (r.get("title") or "").strip(),
            "summary": (r.get("summary") or "").strip(),
            "url": (r.get("link") or "").strip(),
            "is_incident": is_incident,
            "category": category if is_incident else "",
            "county": (r.get("county") or "").strip() if is_incident else "",
            "origin": "labels",
        })
    return out


def dedupe(examples: Sequence[Example]) -> List[Example]:
    """Later entries win, so a hand label overrides the report for one article."""
    by_key: Dict[str, Example] = {}
    for ex in examples:
        by_key[ex.get("url") or ex["title"]] = ex
    return list(by_key.values())


def save(path: Path, examples: Sequence[Example]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")


def load(path: Path = DEFAULT_PATH) -> List[Example]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


# --- retrieval ---------------------------------------------------------------

def text_of(item: Mapping[str, Any]) -> str:
    return f"{item.get('title', '')}. {item.get('summary', '')}".strip(" .")


def default_embedder(model_name: str) -> Embedder:
    """Local sentence-embedding model. Imported lazily so the rule and plain-llm
    classifiers never need fastembed installed."""
    try:
        from fastembed import TextEmbedding
    except ImportError as e:  # pragma: no cover - environment dependent
        raise RuntimeError(
            'INGEST_CLASSIFIER=rag needs the embedding model: pip install ".[rag]"'
        ) from e
    model = TextEmbedding(model_name)
    return lambda texts: list(model.embed(list(texts)))


class ExampleIndex:
    """In-memory cosine-similarity search over the examples."""

    def __init__(self, examples: Sequence[Example], embed: Embedder):
        import numpy as np

        self._np = np
        self.examples = list(examples)
        self._embed = embed
        if self.examples:
            self._matrix = self._unit(embed([text_of(e) for e in self.examples]))
        else:
            self._matrix = np.zeros((0, 0), dtype="float32")

    def _unit(self, vectors: Any):
        np = self._np
        m = np.asarray(vectors, dtype="float32")
        norms = np.linalg.norm(m, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return m / norms

    def __len__(self) -> int:
        return len(self.examples)

    def search(
        self, text: str, k: int = 5, exclude_url: Optional[str] = None
    ) -> List[Tuple[Example, float]]:
        """Top-k most similar examples, best first. exclude_url drops the query
        article's own entry: without it, scoring an article that is also in the
        store would just hand the model its own answer."""
        if not self.examples or k <= 0:
            return []
        q = self._unit(self._embed([text]))[0]
        return self._rank(self._matrix @ q, k, exclude_url)

    def _rank(self, scores: Any, k: int, exclude_url: Optional[str], skip: int = -1):
        order = self._np.argsort(-scores)
        hits: List[Tuple[Example, float]] = []
        for i in order:
            ex = self.examples[int(i)]
            if int(i) == skip or (exclude_url and ex.get("url") == exclude_url):
                continue
            hits.append((ex, float(scores[int(i)])))
            if len(hits) == k:
                break
        return hits

    def leave_one_out(self, k: int = 5) -> Dict[str, Any]:
        """How often the majority category of an example's k nearest *other*
        examples matches its own. Measures retrieval quality by itself, with no
        LLM in the loop: if this is low, the examples can't help the model."""
        sims = self._matrix @ self._matrix.T
        ok = n = 0
        misses: Counter = Counter()
        for i, ex in enumerate(self.examples):
            if not ex.get("is_incident"):
                continue
            hits = self._rank(sims[i], k, None, skip=i)
            votes = Counter(h["category"] for h, _ in hits if h.get("is_incident"))
            if not votes:
                continue
            guess = votes.most_common(1)[0][0]
            n += 1
            if guess == ex["category"]:
                ok += 1
            else:
                misses[(ex["category"], guess)] += 1
        return {"n": n, "accuracy": (ok / n) if n else None, "misses": dict(misses)}


# --- CLI ---------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="write the example store")
    b.add_argument("--report", action="append", default=[], help="monthly report JSON (repeatable)")
    b.add_argument("--labels", action="append", default=[], help="labelled eval CSV (repeatable)")
    b.add_argument("--out", default=str(DEFAULT_PATH))
    c = sub.add_parser("check", help="leave-one-out retrieval accuracy")
    c.add_argument("--examples", default=str(DEFAULT_PATH))
    c.add_argument("-k", type=int, default=5)
    args = ap.parse_args(argv)

    if args.cmd == "build":
        examples: List[Example] = []
        for p in args.report:
            examples += from_report(json.loads(Path(p).read_text(encoding="utf-8")))
        for p in args.labels:
            with Path(p).open(newline="", encoding="utf-8") as f:
                examples += from_labels(list(csv.DictReader(f)))
        examples = dedupe(examples)
        save(Path(args.out), examples)
        counts = Counter(e["category"] or "not_incident" for e in examples)
        print(f"wrote {len(examples)} examples -> {args.out}")
        for cat, n in counts.most_common():
            print(f"  {cat}: {n}")
        return

    from ..config import settings

    index = ExampleIndex(load(Path(args.examples)), default_embedder(settings.rag_embed_model))
    res = index.leave_one_out(args.k)
    acc = "n/a" if res["accuracy"] is None else f"{res['accuracy']:.1%}"
    print(f"examples: {len(index)}   nearest-neighbour category accuracy (k={args.k}): {acc}  (n={res['n']})")
    for (gold, guess), n in sorted(res["misses"].items(), key=lambda t: -t[1])[:8]:
        print(f"  {gold} -> {guess}: {n}")


if __name__ == "__main__":
    main()
