"""Hybrid classifier: the keyword rules settle clear cases for free, and
anything they can't be trusted on goes to the RAG classifier. Selected via
INGEST_CLASSIFIER=hybrid.

The rules are cheap but read words, not meaning. Replaying September 2026's
369 articles against the hand review showed where that breaks, and each
escalation trigger below targets one of those failure modes:

  no rule answer     no category keyword (e.g. election violence has none)
                     or no county found
  several categories "matatu torched in Embu rally": the priority order
                     picks one, often the wrong one
  a risky category   fire, missing person, collapse, unrest, terror, flood,
                     wildlife, health: the categories most often triggered by
                     a metaphor or by politics ("under fire", "missing from")
  a follow-up cue    court, burial, autopsy, "months after", "seeks help":
                     coverage of an earlier event, not a new incident

On that replay the rules were right 80% of the time on articles with no
trigger. Those were tuned on the same month they were scored on, so re-check
them with `python -m app.ingest.evaluate --classifier hybrid` on fresh labels.

If Claude is unavailable, the rule answer is used when there is one, so
ingestion keeps going; with no rule answer the article is left for the next
run, like the plain RAG classifier."""

from typing import Any, Callable, Dict, List, Mapping, Optional

from . import rules
from .classifier import ClassifierError

Candidate = Optional[Dict[str, Any]]

RISKY_CATEGORIES = frozenset(
    {"fire", "missing_person", "infrastructure", "unrest", "terror_alert", "flood", "wildlife", "public_health"}
)

FOLLOW_UP_CUES = (
    # courts and investigations into something that already happened
    "court", "trial", "sentenced", "sentencing", "convicted", "charged", "bail", "case",
    "probe", "inquest", "investigation", "autopsy", "reveal",
    # aftermath and human-interest coverage
    "laid to rest", "burial", "buried", "mourns", "mourn", "in tears", "recalls",
    "seeks help", "months after", "months before", "years after", "years ago", "years later",
    "anniversary",
    # plans, warnings and statements rather than events
    "warns", "ahead of", "plan", "says", "update",
    # political gatherings: rally violence is unrest, not plain crime
    "rally",
)


def needs_review(analysis: Mapping[str, Any]) -> List[str]:
    """Why the rules can't be trusted on this article (empty: they can)."""
    reasons: List[str] = []
    candidate = analysis["candidate"]
    if candidate is None:
        reasons.append("no rule answer")
    if len(analysis["categories"]) > 1:
        reasons.append("several categories")
    if candidate and candidate["category"] in RISKY_CATEGORIES:
        reasons.append(f"risky category: {candidate['category']}")
    cue = next((c for c in FOLLOW_UP_CUES if rules._has(analysis["text"], c)), None)
    if cue:
        reasons.append(f"follow-up cue: {cue}")
    return reasons


class HybridClassifier:
    """Callable like the other classifiers (item -> candidate or None), and
    counts how each article was decided so a run can report it."""

    def __init__(self, escalate: Callable[[Mapping[str, str]], Candidate]):
        self.escalate = escalate
        self.stats = {"rule": 0, "rag": 0, "fallback": 0}

    def __call__(self, item: Mapping[str, str]) -> Candidate:
        analysis = rules.analyse(item)
        if not needs_review(analysis):
            self.stats["rule"] += 1
            return analysis["candidate"]
        try:
            candidate = self.escalate(item)
        except ClassifierError:
            if analysis["candidate"] is None:
                raise  # nothing to fall back on: leave it for the next run
            self.stats["fallback"] += 1
            return analysis["candidate"]
        self.stats["rag"] += 1
        return candidate

    def summary(self) -> str:
        s = self.stats
        return f"hybrid: rules decided {s['rule']}, RAG decided {s['rag']}, rule fallback (Claude unavailable) {s['fallback']}"
