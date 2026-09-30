from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import repository
from ..deps import get_session
from ..monthly import report as monthly

router = APIRouter()


# Not /reports: that path is the citizen report submission endpoint.
@router.get("/monthly-reports")
def list_monthly_reports(session: Session = Depends(get_session)):
    results = [monthly.summary(r) for r in repository.list_monthly_reports(session)]
    return {"count": len(results), "results": results}


@router.get("/monthly-reports/{month}")
def get_monthly_report(month: str, session: Session = Depends(get_session)):
    try:
        monthly.parse_month(month)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    data = repository.get_monthly_report(session, month)
    if data is None:
        return JSONResponse({"error": "Report not found"}, status_code=404)
    return data
