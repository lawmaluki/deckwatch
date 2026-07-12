from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import ARRAY, Boolean, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class County(Base):
    __tablename__ = "counties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    code: Mapped[int] = mapped_column(Integer, nullable=False)
    center = mapped_column(Geometry("POINT", srid=4326), nullable=False)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Preserves the seed order so API responses match the frontend seed exactly.
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    severity: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    county_name: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    location_name: Mapped[str] = mapped_column(Text, nullable=False)
    geom = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    verification_score: Mapped[int] = mapped_column(Integer, nullable=False)
    verification_status: Mapped[str] = mapped_column(Text, nullable=False)
    report_count: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_actions: Mapped[list] = mapped_column(ARRAY(Text), nullable=False)
    sources = mapped_column(JSONB, nullable=False)
    has_image: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_citizen_report: Mapped[bool] = mapped_column(Boolean, nullable=False)
