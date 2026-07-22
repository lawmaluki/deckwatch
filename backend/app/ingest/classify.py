"""Selects the classifier the pipeline uses, based on INGEST_CLASSIFIER:
  - "rule" (default): the free, key-free keyword classifier (rules.classify)
  - "llm": Claude Haiku 4.5 (classifier.classify) — needs ANTHROPIC_API_KEY

Returns a plain callable `item -> Optional[candidate]`, so the pipeline neither
knows nor cares which one is active, and rule mode never imports/constructs the
Anthropic client."""

from typing import Any, Callable, Mapping, Optional

from ..config import settings

Classifier = Callable[[Mapping[str, str]], Optional[dict]]


def build_classifier() -> Classifier:
    if settings.ingest_classifier == "llm":
        from anthropic import Anthropic

        from . import classifier

        client = Anthropic()  # reads ANTHROPIC_API_KEY

        def _llm(item: Mapping[str, str]) -> Optional[dict]:
            return classifier.classify(item, client)

        return _llm

    from . import rules

    def _rule(item: Mapping[str, str]) -> Optional[dict]:
        return rules.classify(item)

    return _rule
