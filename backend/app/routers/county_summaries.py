from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import domain, repository
from ..deps import get_session

router = APIRouter()


@router.get("/counties/{slug}/summary")
def get_county_summary(
    slug: str,
    days: int = Query(default=30, description="Comparison window: 7, 30, or 90 days"),
    session: Session = Depends(get_session),
):
    if days not in (7, 30, 90):
        return JSONResponse(
            {"error": 'Invalid days. Expected one of: 7, 30, 90.'}, status_code=400
        )

    county = repository.get_county_by_slug(session, slug)
    if county is None:
        return JSONResponse({"error": "County not found"}, status_code=404)

    as_of = domain.now_ms()
    incidents = repository.get_live_incidents_by_county(session, county.name)
    return {
        "county": county.name,
        "slug": county.slug,
        "asOf": domain.to_iso_z(as_of),
        **domain.county_incident_summary(incidents, as_of, days),
    }
