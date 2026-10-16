"""Find Kenyan news feeds worth adding to sources.FEEDS, using Media Cloud.

    python -m app.ingest.discover_feeds                    # print the ranked report
    python -m app.ingest.discover_feeds --out feeds.json   # ...and save it

Media Cloud (search.mediacloud.org) keeps a directory of news sources by
collection. This reads every source in its Kenyan collections, drops ones
that have stopped publishing and outlets already in sources.FEEDS, finds
each remaining outlet's feed from its homepage (the <link rel="alternate">
tag, then the usual paths), fetches it the way ingestion does and scores it
on what ingestion would actually get from it: how many incidents the
keyword classifier finds in its last week.

Media Cloud is asked only for the source list, about seven requests,
paced to the account's rate limit (2 a minute for a free account in
Oct 2026, read from its api-params endpoint). Asking it for every source's
feeds would take over an hour at that rate. Plain HTTP rather than the
mediacloud client: the client's limiter carried waits over between runs
and could stall for longer than the whole job takes.
The keyword pre-filter alone is no guide: it matches "road" and "police"
in business and sports stories alike.

Nothing is added automatically. Each outlet's credibility still needs a
human look before it goes in sources.FEEDS: verification counts every
outlet as independent corroboration.

Needs MEDIACLOUD_API_KEY (backend/.env). Read-only: touches no database."""

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import settings
from . import prefilter, rules, sources

# Media Cloud's directory has no country filter, so collections are found by
# name. All four Kenyan ones as of Oct 2026 overlap heavily; sources are
# de-duplicated by id.
COLLECTION_NAME = "Kenya"
# A source with no story in this long has stopped publishing.
STALE_AFTER_DAYS = 30
# Feeds are judged on their last week, the most a busy feed holds.
WINDOW_DAYS = 7
API_BASE = "https://search.mediacloud.org/api/"
# Used when the account's limit can't be read; the lowest Media Cloud has set.
DEFAULT_PER_MINUTE = 2
FEED_PATHS = ("/feed/", "/feed", "/rss", "/rss.xml", "/feed.xml", "/index.xml", "/?feed=rss2")
_LINK = re.compile(r"<link[^>]+>", re.I)


def _host(url: str) -> str:
    host = urllib.parse.urlsplit(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


class _Directory:
    """Media Cloud's source directory over plain HTTP, never faster than the
    account's rate limit: its terms forbid exceeding it."""

    def __init__(self, key: str):
        self._headers = {"Authorization": f"Token {key}", "User-Agent": sources.REQUEST_HEADERS["User-Agent"]}
        self._last = 0.0
        self._gap = 60.0 / DEFAULT_PER_MINUTE
        try:
            rate = self._get("search/api-params")["params"]["query-rate"]  # e.g. "2/m"
            count, unit = rate.split("/")
            self._gap = {"s": 1, "m": 60, "h": 3600}[unit[0]] / int(count) + 1
        except Exception:
            pass
        print(f"Media Cloud: one request every {self._gap:.0f}s")

    def _get(self, path: str, **params: Any) -> Dict[str, Any]:
        wait = self._last + self._gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        url = API_BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=self._headers), timeout=60) as res:
                return json.loads(res.read())
        finally:
            self._last = time.monotonic()

    def pages(self, path: str, **params: Any) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        offset = 0
        while True:
            page = self._get(path, limit=100, offset=offset, **params)
            results = page.get("results", [])
            out.extend(results)
            if not page.get("next") or not results:
                return out
            offset += len(results)


def kenyan_sources(api: _Directory) -> List[Dict[str, Any]]:
    collections = [
        c for c in api.pages("sources/collections/", name=COLLECTION_NAME) if c.get("platform") == "online_news"
    ]
    by_id: Dict[int, Dict[str, Any]] = {}
    for c in collections:
        for src in api.pages("sources/sources/", collection_id=c["id"]):
            by_id.setdefault(src["id"], src)
        print(f"  {c['name']}: {len(by_id)} sources so far")
    print(f"{len(collections)} Kenyan collections, {len(by_id)} distinct sources")
    return list(by_id.values())


def _recent(source: Dict[str, Any]) -> bool:
    last = source.get("last_story")
    if not last:
        return True  # unknown: let the feed check decide
    try:
        when = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
    except ValueError:
        return True
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - when <= timedelta(days=STALE_AFTER_DAYS)


def _feed_urls(homepage: str) -> List[str]:
    """Feed URLs to try for a site: those its homepage advertises, then the
    usual paths. Fetched with ingestion's headers and timeout."""
    urls: List[str] = []
    base = homepage
    try:
        req = urllib.request.Request(homepage, headers={**sources.REQUEST_HEADERS, "Accept": "text/html,*/*;q=0.8"})
        with urllib.request.urlopen(req, timeout=sources.FETCH_TIMEOUT_S) as res:
            page = res.read(400_000)
            base = res.geturl()
            if (res.headers.get("Content-Encoding") or "").lower() == "gzip":
                import gzip

                page = gzip.decompress(page)
        text = page.decode("utf-8", "ignore")
        for tag in _LINK.findall(text):
            if re.search(r"rel=[\"']?alternate", tag, re.I) and re.search(r"(rss|atom)\+xml", tag, re.I):
                m = re.search(r"href=[\"']([^\"']+)", tag, re.I)
                if m and "comments" not in m.group(1):
                    urls.append(urllib.parse.urljoin(base, html.unescape(m.group(1))))
    except Exception:
        pass  # no homepage: the usual paths may still answer
    root = "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(base))
    urls += [root + p for p in FEED_PATHS]
    return list(dict.fromkeys(urls))


def candidate_sites(all_sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    known_hosts = {_host(f.url) for f in sources.FEEDS} | {_host(f.homepage) for f in sources.FEEDS}
    live = [s for s in all_sources if _recent(s) and s.get("homepage")]
    fresh = [s for s in live if _host(s["homepage"]) not in known_hosts]
    print(f"{len(live)} still publishing, {len(fresh)} not already read")
    return [
        {"source": s.get("label") or s.get("name"), "homepage": s["homepage"],
         "language": s.get("primary_language"), "media_type": s.get("media_type"),
         "stories_per_week": s.get("stories_per_week")}
        for s in fresh
    ]


def best_feed(site: Dict[str, Any]) -> Dict[str, Any]:
    """The site's first feed that answers with dated items, scored."""
    tried = None
    for url in _feed_urls(site["homepage"]):
        result = score({**site, "feed": url})
        if result["ok"] and result["items"]:
            return result
        tried = tried or result
    return tried or {**site, "feed": None, "ok": False, "problem": "no feed found", "items": 0,
                     "all_now": False, "newest_days": None, "recent_items": 0, "incidents_week": 0, "examples": []}


def score(candidate: Dict[str, Any]) -> Dict[str, Any]:
    feed = sources.Feed(candidate["source"] or "?", candidate["feed"], "news", candidate.get("homepage") or "")
    items, problem = sources._fetch_one(feed)
    now = datetime.now(timezone.utc)

    def age_days(item: Dict[str, str]) -> float:
        return (now - datetime.fromisoformat(item["published"].replace("Z", "+00:00"))).total_seconds() / 86400

    recent = [i for i in items if age_days(i) <= WINDOW_DAYS]
    incidents = [i for i in recent if prefilter.is_relevant(i) and rules.classify(i)]
    ages = sorted(age_days(i) for i in items)
    return {
        **candidate,
        "ok": problem is None,
        "problem": problem,
        "items": len(items),
        # Undated items all read as "now", so a feed of them looks fresh.
        "all_now": bool(items) and ages[-1] < 0.01,
        "newest_days": round(ages[0], 1) if ages else None,
        "recent_items": len(recent),
        "incidents_week": len(incidents),
        "examples": [i["title"][:100] for i in incidents[:3]],
    }


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--out", type=Path, help="write every scored feed as JSON")
    args = ap.parse_args(argv)
    if not settings.mediacloud_api_key:
        raise SystemExit("MEDIACLOUD_API_KEY is not set (backend/.env)")

    sites = candidate_sites(kenyan_sources(_Directory(settings.mediacloud_api_key)))
    print(f"looking for a feed on {len(sites)} sites…")
    with ThreadPoolExecutor(max_workers=12) as pool:
        scored = list(pool.map(best_feed, sites))

    best = {_host(r["homepage"]): r for r in scored}
    usable = [r for r in best.values() if r["ok"] and r["recent_items"] and not r["all_now"]]
    usable.sort(key=lambda r: (-r["incidents_week"], -r["recent_items"]))

    print(f"\n{len(usable)} outlets with a working, dated feed that published in the last {WINDOW_DAYS} days")
    print(f"{'incidents/wk':>12} {'items/wk':>8} {'newest':>7}  {'lang':<5} outlet  feed")
    for r in usable:
        print(f"{r['incidents_week']:>12} {r['recent_items']:>8} {r['newest_days']:>6}d  {(r['language'] or '-'):<5} "
              f"{r['source']}  {r['feed']}")
        for t in r["examples"]:
            print(f"{'':>36}- {t}")
    dead = [r for r in best.values() if r not in usable]
    print(f"\n{len(dead)} outlets left out: feed failed, empty, undated, or nothing in {WINDOW_DAYS} days")

    if args.out:
        args.out.write_text(json.dumps(scored, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
