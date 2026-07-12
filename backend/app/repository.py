"""Thin SQLAlchemy read layer. Returns plain camelCase dicts (matching
src/lib/types.ts) so the pure domain layer can operate on them uniformly."""

from typing import List, Optional, Set

from sqlalchemy import func, select
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
