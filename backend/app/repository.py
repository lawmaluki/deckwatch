"""Thin SQLAlchemy read layer. Returns plain camelCase dicts (matching
src/lib/types.ts) so the pure domain layer can operate on them uniformly."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import ARRAY, Text, bindparam, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import domain
from .models import County, Incident, MonthlyReport, RemovedArticle


def _to_dict(inc: Incident, lat: float, lng: float, detail: bool = True) -> domain.Incident:
    """`detail=False` omits aiSummary and recommendedActions.

    Together they are ~35% of a list response and are read only for the one
    incident a reader opens, which /incidents/{id} serves. Nothing filters or
    aggregates on them — free-text search covers title, location and county —
    so leaving them out of the list costs no behaviour.
    """
    out: domain.Incident = {
        "id": inc.id,
        "title": inc.title,
        "category": inc.category,
        "severity": inc.severity,
        "county": inc.county_name,
        "locationName": inc.location_name,
        "locationPrecision": inc.location_precision,
        "lat": lat,
        "lng": lng,
        "reportedAt": domain.to_iso_z(round(inc.reported_at.timestamp() * 1000)),
        "verificationScore": inc.verification_score,
        "verificationStatus": inc.verification_status,
        "sources": inc.sources,
        "reportCount": inc.report_count,
        "hasImage": inc.has_image,
        "isCitizenReport": inc.is_citizen_report,
        # Ingested incidents are id-prefixed "ing-" (see pipeline.build_incident);
        # computed rather than stored so no migration was needed to add this.
        "isLive": inc.id.startswith("ing-"),
    }
    if detail:
        out["aiSummary"] = inc.ai_summary
        out["recommendedActions"] = inc.recommended_actions
    return out


def _select_with_coords():
    return select(
        Incident, func.ST_Y(Incident.geom), func.ST_X(Incident.geom)
    ).order_by(Incident.ordinal)


# --- summary reads --------------------------------------------------------------
#
# Every byte a query returns leaves Supabase as billed egress, and the free plan
# allows 5 GB a month. Selecting the whole Incident entity pulled ai_summary and
# recommended_actions for every row only for _to_dict(detail=False) to drop them
# in Python, so list reads name their columns instead. Detail reads (one
# incident, the monthly report) still load the full row.

_SUMMARY_COLUMNS = (
    Incident.id,
    Incident.title,
    Incident.category,
    Incident.severity,
    Incident.county_name,
    Incident.location_name,
    Incident.location_precision,
    func.ST_Y(Incident.geom).label("lat"),
    func.ST_X(Incident.geom).label("lng"),
    Incident.reported_at,
    Incident.verification_score,
    Incident.verification_status,
    Incident.sources,
    Incident.report_count,
    Incident.has_image,
    Incident.is_citizen_report,
)


def _select_summaries():
    return select(*_SUMMARY_COLUMNS).order_by(Incident.ordinal)


def _summary_to_dict(row: Any) -> domain.Incident:
    return {
        "id": row.id,
        "title": row.title,
        "category": row.category,
        "severity": row.severity,
        "county": row.county_name,
        "locationName": row.location_name,
        "locationPrecision": row.location_precision,
        "lat": row.lat,
        "lng": row.lng,
        "reportedAt": domain.to_iso_z(round(row.reported_at.timestamp() * 1000)),
        "verificationScore": row.verification_score,
        "verificationStatus": row.verification_status,
        "sources": row.sources,
        "reportCount": row.report_count,
        "hasImage": row.has_image,
        "isCitizenReport": row.is_citizen_report,
        "isLive": row.id.startswith("ing-"),
    }


def get_all_incidents(session: Session, detail: bool = False) -> List[domain.Incident]:
    """Summaries by default: every caller is a list or an aggregate."""
    if detail:
        rows = session.execute(_select_with_coords()).all()
        return [_to_dict(inc, lat, lng) for inc, lat, lng in rows]
    return [_summary_to_dict(r) for r in session.execute(_select_summaries())]


def get_incident(session: Session, incident_id: str) -> Optional[domain.Incident]:
    row = session.execute(
        _select_with_coords().where(Incident.id == incident_id)
    ).first()
    if row is None:
        return None
    inc, lat, lng = row
    return _to_dict(inc, lat, lng)


def get_incidents_by_county(
    session: Session, county_name: str
) -> List[domain.Incident]:
    rows = session.execute(
        _select_summaries().where(Incident.county_name == county_name)
    )
    return [_summary_to_dict(r) for r in rows]


def get_live_incidents_by_county(
    session: Session, county_name: str
) -> List[domain.Incident]:
    """Return only news-ingested incidents, excluding synthetic seed records."""
    rows = session.execute(
        _select_summaries().where(
            Incident.county_name == county_name,
            Incident.id.startswith("ing-"),
        )
    )
    return [_summary_to_dict(r) for r in rows]


# --- ingestion reads -------------------------------------------------------------
#
# Ingestion runs hourly. It used to download the whole table each run
# to answer two questions that need a sliver of it; these answer them directly.

def find_ingested(
    session: Session, ids: Sequence[str], links: Sequence[str]
) -> Tuple[Set[str], Set[str]]:
    """Which of these article ids are stored as incidents, and which of these
    links are already listed as a source on one. Only matches come back, so the
    cost is the size of the feed, not of the table."""
    if not ids and not links:
        return set(), set()
    found_ids = set(
        session.execute(
            select(Incident.id).where(Incident.id.in_(list(ids)))
        ).scalars()
    ) if ids else set()
    found_links: Set[str] = set()
    if links:
        stmt = text(
            "SELECT DISTINCT s->>'url' FROM incidents, "
            "jsonb_array_elements(incidents.sources) AS s "
            "WHERE s->>'url' = ANY(:links)"
        ).bindparams(bindparam("links", type_=ARRAY(Text)))
        found_links = set(session.execute(stmt, {"links": list(links)}).scalars())
        # A taken-down article counts as seen, or the next run would rebuild it.
        found_links |= set(
            session.execute(
                select(RemovedArticle.url).where(RemovedArticle.url.in_(list(links)))
            ).scalars()
        )
    return found_ids, found_links


def get_dedup_candidates(session: Session, since: datetime) -> List[domain.Incident]:
    """Ingested incidents a new article published at or after `since` + the
    dedup window could still merge into: reported since then, or carrying a
    source article published since then (a story followed for days keeps
    absorbing follow-ups; see dedup.find_same_story). Seed rows are excluded —
    real articles must never merge onto fictional incidents."""
    since_iso = domain.to_iso_z(round(since.timestamp() * 1000))
    has_recent_source = text(
        "EXISTS (SELECT 1 FROM jsonb_array_elements(incidents.sources) AS s "
        "WHERE s->>'publishedAt' >= :since_iso)"
    ).bindparams(since_iso=since_iso)
    rows = session.execute(
        _select_summaries().where(
            Incident.id.startswith("ing-"),
            or_(Incident.reported_at >= since, has_recent_source),
        )
    )
    return [_summary_to_dict(r) for r in rows]


def get_county_by_slug(session: Session, slug: str) -> Optional[County]:
    return session.execute(
        select(County).where(County.slug == slug)
    ).scalar_one_or_none()


def get_county_names(session: Session) -> Set[str]:
    return set(session.execute(select(County.name)).scalars().all())


# --- write layer (ingestion) -------------------------------------------------

def next_ordinal(session: Session) -> int:
    highest = session.execute(select(func.max(Incident.ordinal))).scalar()
    return (highest if highest is not None else -1) + 1


def _parse_dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def insert_incident(session: Session, inc: Dict[str, Any]) -> None:
    """Insert an ingested incident. No-op if the id already exists (same article
    re-ingested), so runs are idempotent per source article."""
    stmt = (
        insert(Incident)
        .values(
            id=inc["id"],
            ordinal=inc["ordinal"],
            title=inc["title"],
            category=inc["category"],
            severity=inc["severity"],
            county_name=inc["county"],
            location_name=inc["locationName"],
            location_precision=inc.get("locationPrecision"),
            geom=func.ST_SetSRID(func.ST_MakePoint(inc["lng"], inc["lat"]), 4326),
            reported_at=_parse_dt(inc["reportedAt"]),
            verification_score=inc["verificationScore"],
            verification_status=inc["verificationStatus"],
            report_count=inc["reportCount"],
            ai_summary=inc["aiSummary"],
            recommended_actions=inc["recommendedActions"],
            sources=inc["sources"],
            has_image=inc["hasImage"],
            is_citizen_report=inc["isCitizenReport"],
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    session.execute(stmt)


def merge_incident(
    session: Session,
    incident_id: str,
    sources: List[domain.Source],
    report_count: int,
    verification_score: int,
    verification_status: str,
) -> None:
    """Fold a corroborating source into an existing incident."""
    obj = session.get(Incident, incident_id)
    if obj is None:
        return
    obj.sources = sources
    obj.report_count = report_count
    obj.verification_score = verification_score
    obj.verification_status = verification_status


def relocate_incident(
    session: Session,
    incident_id: str,
    county: str,
    location_name: str,
    lat: float,
    lng: float,
    precision: str,
) -> None:
    """Move an incident to a better-resolved place (ingest/relocate.py).
    Never called by live ingestion."""
    obj = session.get(Incident, incident_id)
    if obj is None:
        return
    obj.county_name = county
    obj.location_name = location_name
    obj.geom = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
    obj.location_precision = precision


def take_down_incident(session: Session, incident_id: str, reason: str) -> List[str]:
    """Delete an incident at someone's request and record its source links in
    removed_articles, so ingestion won't rebuild it. Returns those links."""
    obj = session.get(Incident, incident_id)
    if obj is None:
        return []
    urls = list(dict.fromkeys(s["url"] for s in obj.sources or [] if s.get("url")))
    now = datetime.now(timezone.utc)
    for url in urls:
        session.merge(RemovedArticle(url=url, incident_id=incident_id, reason=reason, removed_at=now))
    session.delete(obj)
    return urls


def delete_incident(session: Session, incident_id: str) -> None:
    """Remove an incident whose sources have been merged elsewhere
    (ingest/merge_duplicates.py). Never called by live ingestion."""
    obj = session.get(Incident, incident_id)
    if obj is not None:
        session.delete(obj)


# --- monthly reports -----------------------------------------------------------

def get_live_incidents_between(
    session: Session, start: datetime, end: datetime
) -> List[domain.Incident]:
    """Real ingested incidents published in [start, end). Seed rows are
    excluded: their timestamps are synthetic, so they belong to no month."""
    rows = session.execute(
        _select_with_coords().where(
            Incident.id.startswith("ing-"),
            Incident.reported_at >= start,
            Incident.reported_at < end,
        )
    ).all()
    return [_to_dict(inc, lat, lng) for inc, lat, lng in rows]


def upsert_monthly_report(session: Session, report: Dict[str, Any]) -> None:
    values = dict(
        month=report["month"],
        generated_at=_parse_dt(report["generatedAt"]),
        method=report["method"],
        data=report,
    )
    stmt = insert(MonthlyReport).values(**values)
    session.execute(
        stmt.on_conflict_do_update(
            index_elements=["month"],
            set_={k: stmt.excluded[k] for k in ("generated_at", "method", "data")},
        )
    )


def get_monthly_report(session: Session, month: str) -> Optional[Dict[str, Any]]:
    row = session.get(MonthlyReport, month)
    return row.data if row is not None else None


def list_monthly_reports(session: Session) -> List[Dict[str, Any]]:
    """Every stored report, newest month first."""
    return list(
        session.execute(
            select(MonthlyReport.data).order_by(MonthlyReport.month.desc())
        ).scalars()
    )
