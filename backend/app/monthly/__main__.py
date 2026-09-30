"""CLI entrypoint: python -m app.monthly

Generates and stores the monthly safety report.

  python -m app.monthly                     # the current month (EAT), so far
  python -m app.monthly --month 2026-09     # a specific month
  python -m app.monthly --only-last-day     # scheduled run: the month that is
                                            # due (report.month_due), else no-op
  python -m app.monthly --month 2026-09 --out report.json --no-store
                                            # dry run: write the file only
  python -m app.monthly --import report.json
                                            # store a hand-reviewed report
  python -m app.monthly --month 2026-09 --articles incidents.json --no-store --out r.json
                                            # generate from a saved GET /incidents
                                            # payload instead of the database

Needs DATABASE_URL. Uses Claude (REPORT_MODEL, ANTHROPIC_API_KEY) for the
editorial consolidation; without a key it stores an automatic, unreviewed
report and says so."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from ..config import settings
from ..db import SessionLocal
from .. import repository
from . import report as monthly


def _consolidate(month: str, articles, model: str):
    if not settings.anthropic_api_key:
        print("ANTHROPIC_API_KEY not set: building an automatic (unreviewed) report")
        return monthly.automatic_consolidation(articles), "automatic", None

    import anthropic

    from .consolidate import consolidate

    label = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    raw = consolidate(label, articles, anthropic.Anthropic(), model)
    return raw, "claude", model


def _load_articles(month: str, articles_path):
    start, end = monthly.month_window(month)
    if articles_path is None:
        with SessionLocal() as session:
            return repository.get_live_incidents_between(session, start, end)
    body = json.loads(Path(articles_path).read_text(encoding="utf-8"))
    rows = body["results"] if isinstance(body, dict) else body
    lo, hi = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    return [
        a for a in rows
        if str(a["id"]).startswith("ing-")
        and lo <= datetime.fromisoformat(a["reportedAt"].replace("Z", "+00:00")) < hi
    ]


def generate(month: str, now: datetime, articles_path=None) -> dict:
    _, end = monthly.month_window(month)
    articles = _load_articles(month, articles_path)
    print(f"{month}: {len(articles)} articles captured")
    if not articles:
        raise SystemExit(f"no captured articles for {month}; nothing to report")
    raw, method, model = _consolidate(month, articles, settings.report_model)
    cleaned = monthly.clean_consolidation(raw, articles, month)
    return monthly.build_report(
        month,
        articles,
        cleaned,
        as_of=min(now, end),
        generated_at=now,
        method=method,
        model=model,
    )


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="python -m app.monthly")
    p.add_argument("--month", help="YYYY-MM (default: the current month in EAT)")
    p.add_argument("--only-last-day", action="store_true", help="scheduled mode: report the month that is due, else do nothing")
    p.add_argument("--out", type=Path, help="also write the report JSON here")
    p.add_argument("--no-store", action="store_true", help="don't write to the database")
    p.add_argument("--import", dest="import_path", type=Path, help="store an existing report JSON file")
    p.add_argument("--articles", type=Path, help="read articles from a saved GET /incidents response, not the database")
    args = p.parse_args(argv)
    now = datetime.now(tz=timezone.utc)

    if args.import_path:
        report = json.loads(args.import_path.read_text(encoding="utf-8"))
        monthly.parse_month(report["month"])
    else:
        if args.only_last_day:
            due = monthly.month_due(now)
            if due is None:
                print("no month is due (not the evening of a month's last day in Kenya); nothing to do")
                return
            month = due
        else:
            month = args.month or monthly.current_month(now)
        monthly.parse_month(month)
        report = generate(month, now, args.articles)

    if args.out:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {args.out}")
    if not args.no_store:
        with SessionLocal() as session:
            repository.upsert_monthly_report(session, report)
            session.commit()
        print(f"stored report {report['month']} ({report['method']})")
    s = monthly.summary(report)
    print(", ".join(f"{k}={v}" for k, v in s.items() if k != "headline"))


if __name__ == "__main__":
    main(sys.argv[1:])
