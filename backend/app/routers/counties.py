from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import domain, repository
from ..deps import get_session

router = APIRouter()


@router.get("/counties/{slug}")
def get_county(slug: str, session: Session = Depends(get_session)):
    as_of = domain.now_ms()
    county = repository.get_county_by_slug(session, slug)
    if county is None:
        return JSONResponse({"error": "County not found"}, status_code=404)

    incidents = domain.shift_incidents(
        repository.get_incidents_by_county(session, county.name), as_of
    )
    breakdown = domain.category_breakdown(incidents)

    return {
        "name": county.name,
        "slug": county.slug,
        "riskScore": domain.county_risk_score(incidents, as_of),
        "activeLast24h": sum(
            1 for i in incidents if domain.within_hours(i, 24, as_of)
        ),
        "topCategory": breakdown[0]["category"] if breakdown else None,
    }
