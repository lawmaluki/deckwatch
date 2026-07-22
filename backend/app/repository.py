"""Thin SQLAlchemy read layer. Returns plain camelCase dicts (matching
src/lib/types.ts) so the pure domain layer can operate on them uniformly."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import domain
from .models import County, Incident


def _to_dict(inc: Incident, lat: float, lng: float) -> domain.Incident:
    return {
        "id": inc.id,
        "title": inc.title,
        "category": inc.category,
        "severity": inc.severity,
        "county": inc.county_name,
        "locationName": inc.location_name,
        "lat": lat,
        "lng": lng,
        "reportedAt": domain.to_iso_z(round(inc.reported_at.timestamp() * 1000)),
        "verificationScore": inc.verification_score,
        "verificationStatus": inc.verification_status,
        "sources": inc.sources,
        "reportCount": inc.report_count,
        "aiSummary": inc.ai_summary,
        "recommendedActions": inc.recommended_actions,
        "hasImage": inc.has_image,
        "isCitizenReport": inc.is_citizen_report,
        # Ingested incidents are id-prefixed "ing-" (see pipeline.build_incident);
        # computed rather than stored so no migration was needed to add this.
        "isLive": inc.id.startswith("ing-"),
    }


def _select_with_coords():
    return select(
        Incident, func.ST_Y(Incident.geom), func.ST_X(Incident.geom)
    ).order_by(Incident.ordinal)


def get_all_incidents(session: Session) -> List[domain.Incident]:
    rows = session.execute(_select_with_coords()).all()
    return [_to_dict(inc, lat, lng) for inc, lat, lng in rows]


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
        _select_with_coords().where(Incident.county_name == county_name)
    ).all()
    return [_to_dict(inc, lat, lng) for inc, lat, lng in rows]


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
