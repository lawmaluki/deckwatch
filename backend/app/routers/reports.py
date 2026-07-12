import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import domain

router = APIRouter()


@router.post("/reports")
async def create_report(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"error": "Request body must be valid JSON"}, status_code=400
        )

    validated = domain.validate_report(body)
    if not validated["ok"]:
        return JSONResponse({"error": validated["error"]}, status_code=400)

    # Stateless echo — submissions are not persisted until the moderation
    # queue lands (Phase 6).
    report_id = f"rpt_{secrets.token_hex(2)}"
    return JSONResponse(
        {"id": report_id, "status": "pending_review"}, status_code=201
    )
