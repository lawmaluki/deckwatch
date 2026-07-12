from typing import Iterator

from sqlalchemy.orm import Session

from .db import SessionLocal


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
