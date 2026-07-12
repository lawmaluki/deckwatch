"""Idempotent seed from the committed JSON fixtures (exported from the TS seed
via `npm run export-seed`), so the DB holds byte-identical data to the
frontend's deterministic dataset."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from .db import SessionLocal
from .models import County, Incident

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _point(lng: float, lat: float):
    return func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)


def _parse_dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _upsert(session, model, values: Dict[str, Any], conflict_col: str) -> None:
    stmt = insert(model).values(**values)
    update = {k: v for k, v in values.items() if k != conflict_col}
    stmt = stmt.on_conflict_do_update(index_elements=[conflict_col], set_=update)
    session.execute(stmt)


def seed() -> None:
    incidents = json.loads((FIXTURES / "incidents.json").read_text())
    counties = json.loads((FIXTURES / "counties.json").read_text())

    with SessionLocal() as session:
        for c in counties:
            lat, lng = c["center"]  # CountyInfo.center is [lat, lng]
            _upsert(
                session,
                County,
                {
                    "name": c["name"],
                    "slug": c["slug"],
                    "code": c["code"],
                    "center": _point(lng, lat),
                },
                conflict_col="slug",
            )

        for idx, i in enumerate(incidents):
            _upsert(
                session,
                Incident,
                {
                    "id": i["id"],
                    "ordinal": idx,
                    "title": i["title"],
                    "category": i["category"],
                    "severity": i["severity"],
                    "county_name": i["county"],
                    "location_name": i["locationName"],
                    "geom": _point(i["lng"], i["lat"]),
                    "reported_at": _parse_dt(i["reportedAt"]),
                    "verification_score": i["verificationScore"],
                    "verification_status": i["verificationStatus"],
                    "report_count": i["reportCount"],
                    "ai_summary": i["aiSummary"],
                    "recommended_actions": i["recommendedActions"],
                    "sources": i["sources"],
                    "has_image": i["hasImage"],
                    "is_citizen_report": i["isCitizenReport"],
                },
                conflict_col="id",
            )

        session.commit()

    print(f"Seeded {len(counties)} counties and {len(incidents)} incidents.")


if __name__ == "__main__":
    seed()
