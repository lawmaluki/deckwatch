"""Short-lived in-process cache for the incident list.

Every /incidents poll, county page and county summary used to read the
incidents table from Supabase, and every byte read leaves Supabase as billed
egress (5 GB a month on the free plan). The data only changes when the ingest
cron runs, hourly, so the API keeps one copy for
INCIDENT_CACHE_SECONDS and serves every request from it: a thousand page views
in that window cost one database read instead of a thousand.

The cron writes from GitHub Actions, not through this API, so the cache can't
be invalidated on write; the TTL is how stale a reader can see the data. On
Render's free plan the instance also sleeps when idle, which empties the cache.

Callers must treat the returned list as read-only: it is shared.
"""

import threading
import time
from typing import Callable, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from . import domain, repository
from .config import settings

_lock = threading.Lock()
_incidents: Optional[Tuple[float, List[domain.Incident]]] = None
_county_names: Optional[Tuple[float, Set[str]]] = None


def _ttl() -> float:
    return float(settings.incident_cache_seconds)


def _get(slot: str, load: Callable[[], object]):
    now = time.monotonic()
    entry = globals()[slot]
    if entry is not None and entry[0] > now:
        return entry[1]
    with _lock:
        entry = globals()[slot]  # another request may have refreshed it
        if entry is not None and entry[0] > time.monotonic():
            return entry[1]
        value = load()
        if _ttl() > 0:
            globals()[slot] = (time.monotonic() + _ttl(), value)
        return value


def incidents(session: Session) -> List[domain.Incident]:
    """All incident summaries, as repository.get_all_incidents returns them."""
    return _get("_incidents", lambda: repository.get_all_incidents(session))


def county_names(session: Session) -> Set[str]:
    return _get("_county_names", lambda: repository.get_county_names(session))


def incidents_in_county(session: Session, county_name: str, live_only: bool = False) -> List[domain.Incident]:
    return [
        i for i in incidents(session)
        if i["county"] == county_name and (not live_only or i["id"].startswith("ing-"))
    ]


def clear() -> None:
    """Drop everything cached (tests, or after a manual data fix)."""
    global _incidents, _county_names
    with _lock:
        _incidents = None
        _county_names = None
