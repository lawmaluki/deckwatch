from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# prepare_threshold=None turns off psycopg 3's automatic server-side prepared
# statements. It otherwise prepares a statement as "_pg3_N" once it has run a
# few times, but Supabase's pooler is transaction-mode: consecutive statements
# land on whichever backend is free, so the name collides with one prepared
# there earlier and the query dies with DuplicatePreparedStatement. It killed
# the seed on boot, and would hit ingestion the same way. Nothing here runs hot
# enough for the lost plan caching to matter.
engine = create_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
