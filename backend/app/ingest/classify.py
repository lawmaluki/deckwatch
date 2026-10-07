"""Selects the classifier the pipeline uses, based on INGEST_CLASSIFIER:
  - "rule" (default): the free, key-free keyword classifier (rules.classify)
  - "llm": Claude Haiku 4.5 (classifier.classify) — needs ANTHROPIC_API_KEY
  - "rag": the same model, shown similar human-reviewed articles first
    (rag.classify) — needs ANTHROPIC_API_KEY and the "rag" extra (fastembed)

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

    if settings.ingest_classifier == "rag":
        from anthropic import Anthropic

        from . import examples, rag

        client = Anthropic()
        # Built once per run: loading the model and embedding the store takes a
        # second or two, classifying each article then costs one small embed.
        # The store is the example file plus every reviewed monthly report in
        # the database, so it grows by itself each month.
        reports = examples.reports_from_db() if settings.rag_examples_from_db else []
        store = examples.collect(
            examples.load(examples.FIXTURES.parent / settings.rag_examples_path), reports
        )
        print(f"rag: {len(store)} examples ({len(reports)} monthly reports)")
        index = examples.ExampleIndex(store, examples.default_embedder(settings.rag_embed_model))

        def _rag(item: Mapping[str, str]) -> Optional[dict]:
            return rag.classify(item, client, index)

        return _rag

    from . import rules

    def _rule(item: Mapping[str, str]) -> Optional[dict]:
        return rules.classify(item)

    return _rule
