from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import domain, repository
from ..deps import get_session

router = APIRouter()


# Results are full incident objects (a deliberate superset of the /api-docs
# list example) so clients can render detail without a per-incident fetch.
# Data is re-anchored to request time (asOf) for the live feel.
@router.get("/incidents")
def list_incidents(request: Request, session: Session = Depends(get_session)):
    as_of = domain.now_ms()
    parsed = domain.parse_incident_query(
        dict(request.query_params), repository.get_county_names(session), as_of
    )
    if not parsed["ok"]:
        return JSONResponse({"error": parsed["error"]}, status_code=400)

    incidents = domain.shift_incidents(repository.get_all_incidents(session), as_of)
    results = domain.filter_incidents(incidents, parsed["value"]["filter"], as_of)
    limit = parsed["value"]["limit"]
    if limit is not None:
        results = results[:limit]

    return {"count": len(results), "asOf": domain.to_iso_z(as_of), "results": results}


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: str, session: Session = Depends(get_session)):
    as_of = domain.now_ms()
    incident = repository.get_incident(session, incident_id)
    if incident is None:
        return JSONResponse({"error": "Incident not found"}, status_code=404)
    return domain.shift_incidents([incident], as_of)[0]
