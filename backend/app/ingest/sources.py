"""RSS source adapters. Fetches and normalizes items from Kenyan news outlets.

Feed URLs are best-effort and easy to edit — outlets change RSS paths over time.
The pipeline tolerates a dead feed (logs and skips). Tests run against a
committed fixture, not the live network."""

import html
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Dict, List, Optional

import feedparser


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _strip_html(raw: str) -> str:
    """Strips HTML tags and decodes entities. Feed summaries commonly carry
    markup (e.g. "<p>...</p>") that isn't meant to reach downstream text."""
    # Drop a trailing unterminated tag (e.g. markup truncated mid-attribute) —
    # otherwise HTMLParser treats the dangling "<a href=..." as plain text.
    raw = re.sub(r"<[^>]*$", "", raw)
    parser = _TextExtractor()
    parser.feed(raw)
    parser.close()
    text = html.unescape("".join(parser.parts))
    return re.sub(r"\s+", " ", text).strip()


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
    Feed("Citizen Digital", "https://www.citizen.digital/feed.xml", "news",
         "https://www.citizen.digital"),
    Feed("Nation Africa", "https://nation.africa/kenya/rss.xml", "news",
         "https://nation.africa/kenya"),
    Feed("NTV Kenya", "https://ntvkenya.co.ke/feed/", "news",
         "https://ntvkenya.co.ke"),
    Feed("K24", "https://k24.digital/feed", "news",
         "https://k24.digital"),
    Feed("KBC", "https://www.kbc.co.ke/feed/", "news",
         "https://www.kbc.co.ke"),
    Feed("Nairobi News", "https://nairobinews.co.ke/feed/", "news",
         "https://nairobinews.co.ke"),
    Feed("TV47", "https://tv47.co.ke/feed/", "news",
         "https://tv47.co.ke"),
    Feed("Business Daily", "https://www.businessdailyafrica.com/bd/rss.xml", "news",
         "https://www.businessdailyafrica.com/bd"),
    Feed("People Daily", "https://peopledaily.digital/feed", "news",
         "https://peopledaily.digital"),
    # The Star: no working RSS feed as of 2026-08 (Next.js SPA, no discoverable feed URL).
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
        summary = _strip_html(getattr(entry, "summary", ""))
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
                    "summary": _strip_html(getattr(entry, "summary", "")),
                    "link": link,
                    "published": _published_iso(entry),
                    "source": feed.name,
                    "source_type": feed.source_type,
                    "homepage": feed.homepage,
                }
            )
    return items


if __name__ == "__main__":
    # Feed health check: python -m app.ingest.sources
    for feed in FEEDS:
        count = len(fetch_items([feed]))
        print(feed.name, count)
