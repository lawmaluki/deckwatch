"""RSS source adapters. Fetches and normalizes items from Kenyan news outlets.

Feed URLs are best-effort and easy to edit — outlets change RSS paths over time.
The pipeline tolerates a dead feed (logs and skips). Tests run against a
committed fixture, not the live network."""

import gzip
import html
import re
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple, Union

import feedparser

# Fetched by us, not by feedparser: feedparser has no timeout, and one outlet
# that stops answering (Kenya News Agency did, Oct 2026) held a run until
# GitHub killed it. The headers are the ones feedparser sends, which outlets
# answer: K24 and People Daily refuse an agent containing "Bot", and Business
# Daily returns 404 without A-IM and Accept-Encoding.
FETCH_TIMEOUT_S = 15
REQUEST_HEADERS = {
    "User-Agent": "Deckwatch/1.0 (+https://deckwatch.vercel.app)",
    "Accept": "application/atom+xml,application/rdf+xml,application/rss+xml,application/xml;q=0.9,text/xml;q=0.2,*/*;q=0.1",
    "Accept-Encoding": "gzip, deflate",
    "A-IM": "feed",
}


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
    def __init__(self, name: str, url: str, source_type: str, homepage: str,
                 timeout_s: float = FETCH_TIMEOUT_S):
        self.name = name
        self.url = url
        self.source_type = source_type  # matches Source.type ("news", ...)
        self.homepage = homepage
        # For a feed known to be slow but worth waiting for. Feeds are
        # fetched in parallel, so one slow feed doesn't delay the rest.
        self.timeout_s = timeout_s


# Curated Kenyan outlet feeds. `source_type` feeds verification scoring; the
# homepage populates Source.url on ingested incidents.
FEEDS: List[Feed] = [
    # headlines.php, not kenya.php: by Oct 2026 the Kenya feed's newest item
    # was four days old while headlines still moved daily.
    Feed("The Standard", "https://www.standardmedia.co.ke/rss/headlines.php", "news",
         "https://www.standardmedia.co.ke"),
    Feed("Capital FM News", "https://www.capitalfm.co.ke/news/feed/", "news",
         "https://www.capitalfm.co.ke/news"),
    Feed("Tuko News", "https://www.tuko.co.ke/rss/all.rss", "news",
         "https://www.tuko.co.ke"),
    Feed("Kenyans.co.ke", "https://www.kenyans.co.ke/feeds/news", "news",
         "https://www.kenyans.co.ke"),
    Feed("Citizen Digital", "https://www.citizen.digital/feed.xml", "news",
         "https://www.citizen.digital"),
    # www. since Oct 2026: the bare domain's feed started returning 404.
    Feed("Nation Africa", "https://www.nation.africa/kenya/rss.xml", "news",
         "https://nation.africa/kenya"),
    Feed("NTV Kenya", "https://ntvkenya.co.ke/feed/", "news",
         "https://ntvkenya.co.ke"),
    Feed("K24", "https://k24.digital/feed", "news",
         "https://k24.digital"),
    Feed("KBC", "https://www.kbc.co.ke/feed/", "news",
         "https://www.kbc.co.ke"),
    Feed("Nairobi News", "https://nairobinews.co.ke/feed/", "news",
         "https://nairobinews.co.ke"),
    Feed("Business Daily", "https://www.businessdailyafrica.com/bd/rss.xml", "news",
         "https://www.businessdailyafrica.com/bd"),
    Feed("People Daily", "https://peopledaily.digital/feed", "news",
         "https://peopledaily.digital"),
    Feed("The Kenya Times", "https://thekenyatimes.com/feed/", "news",
         "https://thekenyatimes.com"),
    Feed("Kahawa Tungu", "https://www.kahawatungu.com/feed/", "news",
         "https://www.kahawatungu.com"),
    # Added Oct 2026 after checking ~120 Kenyan sites: Nairobi and North
    # Eastern local news, the busiest safety feed found (~65 of 150 items).
    Feed("The Eastleigh Voice", "https://eastleighvoice.co.ke/rss", "news",
         "https://eastleighvoice.co.ke"),
    Feed("Business Today", "https://businesstoday.co.ke/feed/", "news",
         "https://businesstoday.co.ke"),
    # Official sources: rarely updated, but they weigh more in verification
    # (verification.SOURCE_WEIGHT) than any single newsroom.
    Feed("Ministry of Health", "https://www.health.go.ke/rss.xml", "government",
         "https://www.health.go.ke"),
    Feed("National Police Service", "https://www.kenyapolice.go.ke/rss.xml", "police",
         "https://www.kenyapolice.go.ke"),
    # The government news agency: answers in 20-30 s, so it gets longer.
    Feed("Kenya News Agency", "https://www.kenyanews.go.ke/feed/", "government",
         "https://www.kenyanews.go.ke", timeout_s=45),
    # From Media Cloud's Kenyan collections (Oct 2026, app.ingest.discover_feeds):
    # 164 outlets not already read, 45 with a working dated feed, and these two
    # the credible general-news ones among them.
    Feed("Ebru TV", "https://ebru.co.ke/feed/", "news", "https://ebru.co.ke"),
    Feed("Radio Kaya", "https://radiokaya.co.ke/feed/", "news", "https://radiokaya.co.ke"),
    # The Star: no working RSS feed as of 2026-08 (Next.js SPA, no discoverable feed URL).
    # TV47: dropped Oct 2026, its feed errors or serves items weeks old.
    # Mwakilishi: its feed carries no publish dates, so every item would read
    # as happening at ingest time.
    # Left out on purpose (Oct 2026): gossip, tabloid and partisan blogs with
    # working feeds (Kenya Today, KDRTV, Nairobi Wire, Kenyan-Post, Ghafla).
    # Verification counts every outlet as independent corroboration, so they
    # would make rumours look confirmed. Also Google News search feeds: mostly
    # foreign outlets, and links point at Google, not the article.
    # Also from the Media Cloud check: allAfrica (republishes other outlets,
    # so it would double-count one article as two sources), Swahili outlets
    # such as Taifa Leo (the keyword classifier reads English only; worth
    # adding once ingestion uses Claude), The EastAfrican (mostly other
    # countries), and tech, business, sport and lifestyle sites.
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


def parse_feed(content: Union[str, bytes], feed: Feed) -> List[Dict[str, str]]:
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


def _fetch_one(feed: Feed) -> Tuple[List[Dict[str, str]], Optional[str]]:
    """One feed's items, and why it gave none if it failed."""
    try:
        req = urllib.request.Request(feed.url, headers=REQUEST_HEADERS)
        with urllib.request.urlopen(req, timeout=feed.timeout_s) as res:
            body = res.read()
            encoding = (res.headers.get("Content-Encoding") or "").lower()
        if encoding == "gzip":
            body = gzip.decompress(body)
        elif encoding == "deflate":
            # Servers send either zlib-wrapped or raw deflate under this name.
            try:
                body = zlib.decompress(body)
            except zlib.error:
                body = zlib.decompress(body, -zlib.MAX_WBITS)
    except Exception as e:  # network, HTTP status, timeout: skip this outlet
        return [], f"{type(e).__name__}: {e}"
    items = parse_feed(body, feed)
    return items, None if items else "no items"


def fetch_items(feeds: Optional[List[Feed]] = None) -> List[Dict[str, str]]:
    """Fetch and normalize items across all feeds, in parallel. A feed that
    fails is skipped so one dead outlet doesn't sink the run, but is named in
    the run log: until Oct 2026 failures were silent, and a feed could be dead
    for weeks unnoticed."""
    chosen = feeds if feeds is not None else FEEDS
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_fetch_one, chosen))
    items: List[Dict[str, str]] = []
    for feed, (feed_items, problem) in zip(chosen, results):
        if problem:
            print(f"feed skipped: {feed.name} ({problem})")
        items.extend(feed_items)
    return items


if __name__ == "__main__":
    # Feed health check: python -m app.ingest.sources
    for feed in FEEDS:
        items, problem = _fetch_one(feed)
        print(f"{feed.name:<18} {len(items):>4}  {problem or ''}")
