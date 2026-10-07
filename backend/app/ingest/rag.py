"""RAG classifier: retrieve similar human-reviewed articles, then let Claude
classify with them in view. Selected via INGEST_CLASSIFIER=rag.

Same contract as classifier.classify() and rules.classify() — a candidate dict
or None — so the pipeline and the eval harness treat all three alike. It reuses
the plain LLM classifier's schema and validation; the only difference is the
retrieved examples added to the prompt, which is what makes a like-for-like
comparison (`evaluate --classifier llm` vs `--classifier rag`) meaningful.

If the example store is empty or retrieval fails, it degrades to the plain LLM
classifier rather than dropping the article."""

from typing import Any, Dict, List, Mapping, Optional, Tuple

from ..config import settings
from . import classifier
from .examples import Example, ExampleIndex, text_of

RAG_GUIDANCE = (
    " You will also be shown previously reviewed Kenyan news articles that are "
    "similar to this one, each with the verdict a human editor confirmed. Use "
    "them to see how categories are applied and where the line between an "
    "incident and ordinary news falls. They are different articles: judge this "
    "item on its own facts, take the county, location and severity only from "
    "this item, and ignore an example that is not actually comparable."
)


def format_examples(hits: List[Tuple[Example, float]]) -> str:
    lines = []
    for n, (ex, _score) in enumerate(hits, 1):
        if ex.get("is_incident"):
            verdict = f"incident, category={ex['category']}"
            if ex.get("county"):
                verdict += f", county={ex['county']}"
        else:
            verdict = "not an incident"
        lines.append(f"{n}. {text_of(ex)}\n   Reviewed verdict: {verdict}")
    return "\n".join(lines)


def build_prompt(item: Mapping[str, str], hits: List[Tuple[Example, float]]) -> str:
    article = classifier._user_prompt(item)
    if not hits:
        return article
    return (
        "Similar articles already reviewed by an editor:\n"
        f"{format_examples(hits)}\n\n"
        "Now classify this article:\n"
        f"{article}"
    )


def retrieve(
    item: Mapping[str, str], index: Optional[ExampleIndex], k: int, min_score: float
) -> List[Tuple[Example, float]]:
    """Similar examples above the similarity floor. A weak match is worse than
    none: it would present an unrelated story as a precedent."""
    if index is None or len(index) == 0:
        return []
    try:
        hits = index.search(text_of(item), k=k, exclude_url=item.get("link"))
    except Exception:
        return []
    return [(ex, s) for ex, s in hits if s >= min_score]


def classify(
    item: Mapping[str, str],
    client: Any,
    index: Optional[ExampleIndex],
    k: Optional[int] = None,
    min_score: Optional[float] = None,
    model: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    hits = retrieve(
        item,
        index,
        settings.rag_top_k if k is None else k,
        settings.rag_min_score if min_score is None else min_score,
    )
    return classifier.classify(
        item,
        client,
        model=model,
        system=classifier.SYSTEM_PROMPT + RAG_GUIDANCE if hits else None,
        user_prompt=build_prompt(item, hits),
    )
