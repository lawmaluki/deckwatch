"""Verification scoring from corroborating sources. Ports computeVerification
from src/lib/data/mock-incidents.ts (minus the mock generator's random jitter —
ingestion is deterministic). One outlet on first ingest scores low; as dedup
merges more independent sources onto the same event, the score rises."""

from typing import List, Tuple

from ..domain import Source

SOURCE_WEIGHT = {"news": 12, "government": 22, "police": 20, "citizen": 4, "social": 6}


def score_verification(
    sources: List[Source], report_count: int, severity: str
) -> Tuple[int, str]:
    score = 20
    for s in sources:
        score += SOURCE_WEIGHT.get(s["type"], 0)
    score += min(report_count, 6) * 4
    score += 6 if severity == "critical" else 3 if severity == "high" else 0
    score = max(4, min(99, score))

    if score >= 80:
        status = "verified"
    elif score >= 55:
        status = "likely_true"
    elif score >= 30:
        status = "unconfirmed"
    else:
        status = "false_report"

    return score, status
