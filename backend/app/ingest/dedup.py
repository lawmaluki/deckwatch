"""Deduplication: recognize when a freshly-ingested item describes the same
real-world event as an existing incident, so multiple outlets covering one event
merge (raising the verification score) instead of piling up duplicate map pins.

Two independent rules, tried in order:
  1. same place: both pinned to a specific location within 8 km and 72 hours
     (is_same_event);
  2. same story: the headlines say the same thing, within 72 hours
     (find_same_story), which also covers articles that only name a county."""

import functools
import math
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence

from ..domain import Incident, parse_iso_ms
from .geocode import is_county_centroid

EARTH_RADIUS_KM = 6371
SIMILAR_MAX_DISTANCE_KM = 8.0
SIMILAR_MAX_HOURS_APART = 72.0
MS_PER_HOUR = 3_600_000


def haversine_km(a: tuple, b: tuple) -> float:
    lat1, lng1 = a
    lat2, lng2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    s = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(s))


# Precisions whose point holds many unrelated incidents at once (see
# geocode.locate): all of Eldoret, anywhere on Thika Road, the whole county.
_TOO_WIDE_TO_MATCH = frozenset({"town", "road", "area", "county"})


def _pinned(incident: Incident) -> bool:
    """Whether the incident's point is one spot, close enough to another's to
    say they are the same event.

    A county centroid means the geocoder found no specific place. Every vague
    report in the county sits on that identical point, so comparing distance
    says "same place" for stories that merely happened in the same county. A
    town or a road is the same problem at a smaller scale: two crashes in
    Eldoret in three days are not one crash. Those are left to the story rule.
    Incidents stored before precision was recorded fall back to the centroid
    test alone."""
    if incident.get("locationPrecision") in _TOO_WIDE_TO_MATCH:
        return False
    return not is_county_centroid(incident["county"], incident["lat"], incident["lng"])


def is_same_event(
    candidate: Incident, existing: Incident
) -> bool:
    """Whether two reports describe one real-world event, and should merge.

    Deliberately stricter than geo.ts's findSimilarIncidents, which this once
    mirrored. That function answers "show me related things nearby", where a
    loose match is harmless. This one *fuses records*, so a loose match is
    destructive: it welds unrelated stories into a single incident and, because
    each merged outlet raises the verification score, stamps the result as
    corroborated.
    """
    if not _pinned(candidate) or not _pinned(existing):
        return False

    distance = haversine_km(
        (candidate["lat"], candidate["lng"]),
        (existing["lat"], existing["lng"]),
    )
    if distance > SIMILAR_MAX_DISTANCE_KM:
        return False

    # Time proximity is now required. The old "or same category" branch had no
    # time bound, so two robberies at the same hotspot months apart counted as
    # one event — and kept absorbing every later one, forever.
    hours_apart = abs(
        parse_iso_ms(candidate["reportedAt"]) - parse_iso_ms(existing["reportedAt"])
    ) / MS_PER_HOUR
    return hours_apart <= SIMILAR_MAX_HOURS_APART


def find_duplicate(candidate: Incident, existing: list) -> Optional[Incident]:
    """Return the nearest existing incident that describes the same event, or None."""
    matches = [e for e in existing if is_same_event(candidate, e)]
    if not matches:
        return None
    return min(
        matches,
        key=lambda e: haversine_km(
            (candidate["lat"], candidate["lng"]), (e["lat"], e["lng"])
        ),
    )


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# --- same story, by what the articles say ---------------------------------------
#
# The location rule above can only merge articles the geocoder pinned to a
# specific place. Most Kenyan coverage names only a county, so in September
# 2026 it merged 10 of the duplicates: the Kajiado aircraft crash was stored as
# 23 separate incidents. These rules compare the headlines instead.
#
# Thresholds were chosen by replaying September's 212 incident articles in
# publish order against the hand review of which article belongs to which
# event (pairwise precision = merges that were right, recall = duplicates
# caught; location rule alone: 100% / 0%):
#
#   embedding: >= 0.82 anywhere, or >= 0.75 in the same county   95% / 46%
#   lexical:   >= 0.50 anywhere, or >= 0.25 in the same county   93% / 33%
#
# Precision comes first: a wrong merge welds two events into one record and
# raises its verification score as if one outlet had confirmed the other.
# Tuned and scored on the same month, on headlines alone, so re-check with
# `python -m app.ingest.evaluate` (its dedup section) on fresh labels.

STORY_WINDOW_HOURS = 72.0

_STOPWORDS = frozenset("""a an the and or of in on at to for from by with as is are was were be been
after before over into amid during against its it his her their this that these those who what how
why when where says say said new more than not no up out off down about one two three four five six
seven eight nine ten man woman men women people person kenya kenyan kenyans county police""".split())


def _tokens(text: str) -> frozenset:
    out = set()
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in _STOPWORDS or len(w) < 3:
            continue
        out.add(w[:-1] if w.endswith("s") and len(w) > 4 else w)
    return frozenset(out)


class LexicalSimilarity:
    """Word overlap (Jaccard) between headlines. Free and dependency-free: the
    fallback when the embedding model isn't installed."""

    name = "lexical"
    strong = 0.50
    moderate = 0.25

    def score(self, text: str, others: Sequence[str]) -> float:
        a = _tokens(text)
        best = 0.0
        for o in others:
            b = _tokens(o)
            if a and b:
                best = max(best, len(a & b) / len(a | b))
        return best


class EmbeddingSimilarity:
    """Cosine similarity of sentence embeddings, the same local model the RAG
    classifier uses. Catches rewordings word overlap misses ("aircraft crash
    kills two" / "pilot and student killed near Ngong"). The model loads on
    first use, so a run with nothing recent to compare never loads it."""

    name = "embedding"
    strong = 0.82
    moderate = 0.75

    def __init__(self, make_embedder: Callable[[], Callable[[Sequence[str]], Any]]):
        self._make = make_embedder
        self._embed = None
        self._vectors: Dict[str, Any] = {}

    def prefetch(self, texts: Sequence[str]) -> None:
        """Embed every not-yet-seen text in one model call."""
        from .examples import unit_vectors

        missing = [t for t in dict.fromkeys(texts) if t not in self._vectors]
        if missing:
            if self._embed is None:
                self._embed = self._make()
            self._vectors.update(zip(missing, unit_vectors(self._embed(missing))))

    def _vecs(self, texts: Sequence[str]):
        self.prefetch(texts)
        return [self._vectors[t] for t in texts]

    def score(self, text: str, others: Sequence[str]) -> float:
        if not others:
            return 0.0
        q, *rest = self._vecs([text, *others])
        return max(float(q @ v) for v in rest)


Similarity = Any  # LexicalSimilarity | EmbeddingSimilarity


def build_similarity(mode: str, embed_model: str) -> Optional[Similarity]:
    """"auto" uses embeddings when fastembed is installed (the "rag" extra) and
    word overlap otherwise; "embedding", "lexical" force one; "off" disables
    story matching, leaving only the location rule."""
    if mode == "off":
        return None
    if mode == "lexical":
        return LexicalSimilarity()
    try:
        import fastembed  # noqa: F401
    except ImportError:
        if mode == "embedding":
            raise RuntimeError('DEDUP_TEXT=embedding needs the embedding model: pip install ".[rag]"')
        return LexicalSimilarity()
    from .examples import default_embedder

    return EmbeddingSimilarity(lambda: default_embedder(embed_model))


def story_texts(incident: Incident) -> List[str]:
    """Every headline on record for an incident: its own and each merged
    source's (older sources stored no title)."""
    return [incident["title"]] + [s["title"] for s in incident.get("sources", []) if s.get("title")]


# Called for every stored incident on every new article; the same few thousand
# timestamps recur, so parse each string once per process.
_parse_ms = functools.lru_cache(maxsize=65536)(parse_iso_ms)


def _story_times_ms(incident: Incident) -> List[int]:
    times = [_parse_ms(incident["reportedAt"])]
    times += [_parse_ms(s["publishedAt"]) for s in incident.get("sources", []) if s.get("publishedAt")]
    return times


def find_same_story(candidate: Incident, existing: Sequence[Incident], similarity: Similarity) -> Optional[Incident]:
    """The existing incident whose coverage tells the same story, or None.

    Compared against every headline already merged into an incident, and timed
    against its latest article, so a story followed for days keeps absorbing
    its follow-ups ("death toll rises", "victims named")."""
    t = _parse_ms(candidate["reportedAt"])
    window_ms = STORY_WINDOW_HOURS * MS_PER_HOUR
    recent = [e for e in existing if any(abs(t - u) <= window_ms for u in _story_times_ms(e))]
    if hasattr(similarity, "prefetch"):  # one model call for the whole window
        similarity.prefetch([candidate["title"], *(h for e in recent for h in story_texts(e))])
    best: Optional[Incident] = None
    best_score = 0.0
    for e in recent:
        s = similarity.score(candidate["title"], story_texts(e))
        same_county = e["county"] == candidate["county"]
        if (s >= similarity.strong or (s >= similarity.moderate and same_county)) and s > best_score:
            best, best_score = e, s
    return best


def find_match(candidate: Incident, existing: Sequence[Incident], similarity: Optional[Similarity]):
    """The incident a new report belongs to and the rule that matched, or
    (None, None): same place first, then same story. The one definition of
    "same event" shared by ingestion and the duplicate cleanup."""
    found = find_duplicate(candidate, list(existing))
    if found is not None:
        return found, "place"
    if similarity is not None:
        found = find_same_story(candidate, existing, similarity)
        if found is not None:
            return found, "story"
    return None, None
