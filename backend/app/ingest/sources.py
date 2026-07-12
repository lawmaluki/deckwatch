"""RSS source adapters. Fetches and normalizes items from Kenyan news outlets.

Feed URLs are best-effort and easy to edit — outlets change RSS paths over time.
The pipeline tolerates a dead feed (logs and skips). Tests run against a
committed fixture, not the live network."""

from datetime import datetime, timezone
from typing import Dict, List, Optional

import feedparser


class Feed:
    def __init__(self, name: str, url: str, source_type: str, homepage: str):
        self.name = name
        self.url = url
        self.source_type = source_type  # matches Source.type ("news", ...)
        self.homepage = homepage


# Curated Kenyan outlet feeds. `source_type` feeds verification scoring; the
# homepage populates Source.url on ingested incidents.
FEEDS: List[Feed] = [
    Feed("The Standard", "https://www.standardmedia.co.ke/rss/kenya.php", "news",
         "https://www.standardmedia.co.ke"),
    Feed("Capital FM News", "https://www.capitalfm.co.ke/news/feed/", "news",
         "https://www.capitalfm.co.ke/news"),
    Feed("Tuko News", "https://www.tuko.co.ke/rss/all.rss", "news",
         "https://www.tuko.co.ke"),
    Feed("Kenyans.co.ke", "https://www.kenyans.co.ke/feeds/news", "news",
         "https://www.kenyans.co.ke"),
]


def _published_iso(entry) -> str:
    """ISO-8601 UTC. Falls back to now when the feed omits a parseable date."""
    parsed = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if parsed:
        dt = datetime(*parsed[:6], tzinfo=timezone.utc)
    else:
        dt = datetime.now(tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def parse_feed(content: str, feed: Feed) -> List[Dict[str, str]]:
    """Parse raw RSS/Atom text into normalized items (used directly in tests)."""
    parsed = feedparser.parse(content)
    items = []
    for entry in parsed.entries:
        title = getattr(entry, "title", "").strip()
        summary = getattr(entry, "summary", "").strip()
        link = getattr(entry, "link", "").strip()
        if not title or not link:
            continue
        items.append(
            {
                "title": title,
                "summary": summary,
                "link": link,
                "published": _published_iso(entry),
                "source": feed.name,
                "source_type": feed.source_type,
                "homepage": feed.homepage,
            }
        )
    return items


def fetch_items(feeds: Optional[List[Feed]] = None) -> List[Dict[str, str]]:
    """Fetch and normalize items across all feeds. Network failures per feed are
    swallowed so one dead outlet doesn't sink the run."""
    items: List[Dict[str, str]] = []
    for feed in feeds if feeds is not None else FEEDS:
        try:
            parsed = feedparser.parse(feed.url)
        except Exception:
            continue
        for entry in parsed.entries:
            title = getattr(entry, "title", "").strip()
            link = getattr(entry, "link", "").strip()
            if not title or not link:
                continue
            items.append(
                {
                    "title": title,
                    "summary": getattr(entry, "summary", "").strip(),
                    "link": link,
                    "published": _published_iso(entry),
                    "source": feed.name,
                    "source_type": feed.source_type,
                    "homepage": feed.homepage,
                }
            )
    return items
