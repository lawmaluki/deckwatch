"""Score the ingestion classifier against a human-labelled sample.

    python -m app.ingest.evaluate --labels eval/labels.csv                 # keyword rules
    python -m app.ingest.evaluate --labels eval/labels.csv --classifier llm
    python -m app.ingest.evaluate --labels eval/labels.csv --errors errors.csv

Labels come from `python -m app.ingest.snapshot`. Predictions are recomputed
live from each article, so the same frozen labels score any classifier that
build_classifier() can return — keyword rules today, the LLM or a RAG variant
later — and the numbers stay comparable.

Stages scored separately, so a weak one isn't hidden by a strong one:
  prefilter   recall on real incidents (it must not drop them) + noise it lets through
  incident    precision / recall / F1 of "is this a real, locatable incident"
  category    accuracy + confusion matrix, over incidents both sides found
  severity    exact and within-one-level accuracy, same population
  location    county accuracy, hotspot accuracy, real incidents dropped as unlocatable
  dedup       pairwise precision / recall of "same event" against event_id tags
"""

import argparse
import csv
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

from ..domain import SEVERITIES, now_ms
from . import dedup, prefilter

Classifier = Callable[[Mapping[str, str]], Optional[dict]]


# --- labels ------------------------------------------------------------------

def load_labels(path: Path) -> List[Dict[str, str]]:
    """Rows a human has labelled (is_incident filled in). Unlabelled rows are
    ignored, so a half-finished sheet can still be scored."""
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        verdict = (r.get("is_incident") or "").strip().lower()
        if verdict not in ("yes", "no"):
            continue
        r["is_incident"] = verdict
        # The snapshot doesn't store source_type; build_incident needs it.
        r["source_type"] = r.get("source_type") or "news"
        for k in ("category", "severity", "county", "location_name", "event_id"):
            r[k] = (r.get(k) or "").strip()
        out.append(r)
    return out


# --- small metric helpers ----------------------------------------------------

def _ratio(num: int, den: int) -> Optional[float]:
    return None if den == 0 else num / den


def prf(tp: int, fp: int, fn: int) -> Dict[str, Any]:
    p, r = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    f1 = None if p is None or r is None or (p + r) == 0 else 2 * p * r / (p + r)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": p, "recall": r, "f1": f1}


def _fmt(x: Optional[float]) -> str:
    return "n/a" if x is None else f"{x:.1%}"


# --- scoring -----------------------------------------------------------------

def predict(
    row: Mapping[str, str], classify_fn: Classifier, use_prefilter: bool
) -> Tuple[bool, Optional[dict]]:
    """(passed_prefilter, candidate). With use_prefilter off the classifier sees
    everything, which isolates its quality from the pre-filter's."""
    passed = prefilter.is_relevant(row) if use_prefilter else True
    return passed, (classify_fn(row) if passed else None)


def score_dedup(
    labelled: List[Tuple[Mapping[str, str], Optional[dict]]], at_ms: int
) -> Dict[str, Any]:
    """Pairwise "same event" quality. Gold pairs come from shared event_id among
    real incidents; predicted pairs from the pipeline's own is_same_event on
    incidents built exactly as run() builds them. A gold pair where one side was
    never detected or geocoded counts as a miss, since in production it could
    never have merged."""
    from .pipeline import build_incident  # lazy: pulls in SQLAlchemy

    built: Dict[int, dict] = {}
    for i, (row, cand) in enumerate(labelled):
        if cand is None:
            continue
        inc = build_incident(cand, row, at_ms, i)
        if inc is not None:
            built[i] = inc

    gold_idx = [i for i, (row, _) in enumerate(labelled)
                if row["is_incident"] == "yes" and row["event_id"]]
    tp = fp = fn = 0
    for a in range(len(gold_idx)):
        for b in range(a + 1, len(gold_idx)):
            i, j = gold_idx[a], gold_idx[b]
            gold_same = labelled[i][0]["event_id"] == labelled[j][0]["event_id"]
            pred_same = (
                i in built and j in built and dedup.is_same_event(built[i], built[j])
            )
            if gold_same and pred_same:
                tp += 1
            elif pred_same:
                fp += 1
            elif gold_same:
                fn += 1
    return prf(tp, fp, fn)


def score(
    rows: List[Dict[str, str]],
    classify_fn: Classifier,
    use_prefilter: bool = True,
    at_ms: Optional[int] = None,
) -> Dict[str, Any]:
    at_ms = at_ms if at_ms is not None else now_ms()
    labelled: List[Tuple[Dict[str, str], Optional[dict]]] = []
    errors: List[Dict[str, str]] = []

    pf_kept_inc = pf_total_inc = pf_kept_noise = pf_total_noise = 0
    tp = fp = fn = 0
    cat_ok = cat_n = 0
    sev_exact = sev_within1 = sev_n = 0
    county_ok = county_n = 0
    hotspot_ok = hotspot_n = 0
    confusion: Counter = Counter()

    for row in rows:
        passed, cand = predict(row, classify_fn, use_prefilter)
        labelled.append((row, cand))
        gold_inc = row["is_incident"] == "yes"
        pred_inc = cand is not None

        if gold_inc:
            pf_total_inc += 1
            pf_kept_inc += passed
        else:
            pf_total_noise += 1
            pf_kept_noise += passed

        if gold_inc and pred_inc:
            tp += 1
        elif pred_inc:
            fp += 1
            errors.append(_err(row, cand, "false_positive"))
        elif gold_inc:
            fn += 1
            reason = "dropped_by_prefilter" if not passed else "classifier_rejected"
            errors.append(_err(row, cand, reason))
            continue
        if not (gold_inc and pred_inc):
            continue

        # Both sides call it an incident: grade the extracted fields.
        cat_n += 1
        confusion[(row["category"], cand["category"])] += 1
        if row["category"] == cand["category"]:
            cat_ok += 1
        else:
            errors.append(_err(row, cand, "wrong_category"))

        if row["severity"] in SEVERITIES:
            sev_n += 1
            gap = abs(SEVERITIES.index(row["severity"]) - SEVERITIES.index(cand["severity"]))
            sev_exact += gap == 0
            sev_within1 += gap <= 1
            if gap:
                errors.append(_err(row, cand, "wrong_severity"))

        if row["county"]:
            county_n += 1
            if row["county"].lower() == cand["county"].lower():
                county_ok += 1
            else:
                errors.append(_err(row, cand, "wrong_county"))
        if row["location_name"]:
            hotspot_n += 1
            hotspot_ok += row["location_name"].lower() == cand["location_name"].lower()

    # Real incidents that passed the pre-filter but the classifier turned away
    # (for the rules that mostly means no place it recognises in the text).
    dropped_by_classifier = sum(1 for e in errors if e["problem"] == "classifier_rejected")

    return {
        "n_labelled": len(rows),
        "n_incidents": pf_total_inc,
        "n_noise": pf_total_noise,
        "prefilter": {
            "recall": _ratio(pf_kept_inc, pf_total_inc),
            "noise_passed": _ratio(pf_kept_noise, pf_total_noise),
        },
        "incident": prf(tp, fp, fn),
        "category": {"accuracy": _ratio(cat_ok, cat_n), "n": cat_n, "confusion": dict(confusion)},
        "severity": {
            "exact": _ratio(sev_exact, sev_n),
            "within_one": _ratio(sev_within1, sev_n),
            "n": sev_n,
        },
        "location": {
            "county_accuracy": _ratio(county_ok, county_n),
            "hotspot_accuracy": _ratio(hotspot_ok, hotspot_n),
            "incidents_dropped_by_classifier": dropped_by_classifier,
        },
        "dedup": score_dedup(labelled, at_ms),
        "errors": errors,
    }


def _err(row: Mapping[str, str], cand: Optional[dict], problem: str) -> Dict[str, str]:
    return {
        "problem": problem,
        "title": row.get("title", ""),
        "link": row.get("link", ""),
        "gold_category": row.get("category", ""),
        "pred_category": cand["category"] if cand else "",
        "gold_severity": row.get("severity", ""),
        "pred_severity": cand["severity"] if cand else "",
        "gold_county": row.get("county", ""),
        "pred_county": cand["county"] if cand else "",
    }


# --- reporting ---------------------------------------------------------------

def render(report: Mapping[str, Any]) -> str:
    inc, pf, cat = report["incident"], report["prefilter"], report["category"]
    sev, loc, dd = report["severity"], report["location"], report["dedup"]
    lines = [
        f"labelled: {report['n_labelled']} ({report['n_incidents']} incidents, {report['n_noise']} not)",
        "",
        f"prefilter  recall {_fmt(pf['recall'])}   noise passed through {_fmt(pf['noise_passed'])}",
        f"incident   precision {_fmt(inc['precision'])}   recall {_fmt(inc['recall'])}   "
        f"F1 {_fmt(inc['f1'])}   (tp {inc['tp']} fp {inc['fp']} fn {inc['fn']})",
        f"category   accuracy {_fmt(cat['accuracy'])}  (n={cat['n']})",
        f"severity   exact {_fmt(sev['exact'])}   within one level {_fmt(sev['within_one'])}  (n={sev['n']})",
        f"location   county {_fmt(loc['county_accuracy'])}   hotspot {_fmt(loc['hotspot_accuracy'])}   "
        f"real incidents the classifier dropped {loc['incidents_dropped_by_classifier']}",
        f"dedup      pair precision {_fmt(dd['precision'])}   pair recall {_fmt(dd['recall'])}   "
        f"(tp {dd['tp']} fp {dd['fp']} fn {dd['fn']})",
    ]
    wrong = sorted(
        ((g, p, n) for (g, p), n in cat["confusion"].items() if g != p),
        key=lambda t: -t[2],
    )[:8]
    if wrong:
        lines += ["", "most common category confusions (gold -> predicted):"]
        lines += [f"  {g or '?'} -> {p}: {n}" for g, p, n in wrong]
    return "\n".join(lines)


def write_errors(path: Path, errors: List[Dict[str, str]]) -> None:
    fields = list(errors[0].keys()) if errors else ["problem", "title", "link"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(errors)


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--labels", default="eval/labels.csv")
    ap.add_argument("--classifier", choices=["rule", "llm", "rag", "hybrid"], default="rule")
    ap.add_argument("--skip-prefilter", action="store_true",
                    help="show every article to the classifier (isolates it from the pre-filter)")
    ap.add_argument("--errors", help="write every miss to this CSV for review")
    args = ap.parse_args(argv)

    from ..config import settings
    from .classify import build_classifier

    settings.ingest_classifier = args.classifier
    rows = load_labels(Path(args.labels))
    if not rows:
        raise SystemExit(f"no labelled rows in {args.labels} (fill in the is_incident column)")

    classify_fn = build_classifier()
    report = score(rows, classify_fn, use_prefilter=not args.skip_prefilter)
    print(render(report))
    if hasattr(classify_fn, "summary"):
        print(classify_fn.summary())
    if args.errors:
        write_errors(Path(args.errors), report["errors"])
        print(f"\nwrote {len(report['errors'])} errors -> {args.errors}")


if __name__ == "__main__":
    main()
