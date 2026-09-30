# Deckwatch Kenya — API

FastAPI + PostgreSQL/PostGIS backend implementing the incident API documented
at `/api-docs` in the frontend. It serves the same seeded sample dataset as the
Next.js app (exported via `npm run export-seed` at the repo root), re-anchored
to real time on every read so the feed reads as live.

## Run the full stack (Docker)

```bash
docker compose up --build
```

This starts PostGIS, creates the schema + PostGIS extension, seeds 47 counties
and 360 incidents, and serves the API on http://localhost:8000. Try:

```bash
curl localhost:8000/incidents | jq '.count, .asOf'
curl localhost:8000/counties/nairobi
curl -X POST localhost:8000/reports -H 'content-type: application/json' \
  -d '{"category":"crime","description":"test","lat":-1.29,"lng":36.82}'
```

Interactive docs (Swagger UI) are at http://localhost:8000/docs.

## Point the frontend at it (BFF)

The Next.js `/api/*` routes proxy to this service when `API_BASE_URL` is set:

```bash
# repo root
API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_DATA_SOURCE=api npm run dev
```

The browser still calls the same-origin Next routes; they forward to FastAPI
server-side (no CORS, backend URL stays private).

## Endpoints

| Method | Path                | Notes                                            |
|--------|---------------------|--------------------------------------------------|
| GET    | `/incidents`        | `category, severity, county, verification, since, limit`; `{count, asOf, results}` |
| GET    | `/incidents/{id}`   | full incident or 404                             |
| GET    | `/counties/{slug}`  | `{name, slug, riskScore, activeLast24h, topCategory}` |
| POST   | `/reports`          | validated stateless echo → `201 {id, status}`    |
| GET    | `/health`           | liveness                                         |

## Architecture

- `app/domain.py` — pure, DB-free logic (filtering, validation, time-shift,
  risk score) ported 1:1 from the frontend's `src/lib`. Fully unit tested.
- `app/repository.py` — thin SQLAlchemy reads → camelCase dicts.
- `app/routers/*` — thin HTTP layer over domain + repository.
- `app/models.py` — SQLAlchemy ORM with PostGIS `geometry(Point,4326)`.
- `fixtures/*.json` — canonical seed data (committed).

## Tests

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest tests/test_domain.py         # pure logic, no DB

# integration (needs a running PostGIS):
TEST_DATABASE_URL=postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch \
  .venv/bin/pytest tests/test_api.py
```

## Ingestion — real incidents from the news (Phase 5)

`python -m app.ingest` pulls Kenyan news RSS feeds, uses **Claude Haiku 4.5** to
decide which items are real public-safety incidents and extract structured
fields (category, severity, county, location, summary, recommended actions),
geocodes them against a hotspot gazetteer, dedupes against existing incidents
(multiple outlets covering one event merge and raise its verification score),
and writes them into the same `incidents` table the API serves. Ingested
incidents then appear on the map automatically.

```bash
# needs the DB running (docker compose up) and an Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...
export DATABASE_URL=postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch
.venv/bin/python -m app.ingest
# → ingest complete: fetched=90, relevant=46, classified=31, inserted=27, merged=4, skipped=0
```

Pipeline stages live in `app/ingest/` (`sources` → `prefilter` → `classifier` →
`geocode` → `dedup`/`verification` → `pipeline`). A cheap keyword pre-filter
drops obviously-irrelevant items before the paid LLM call. New incidents are
stored re-anchored to the seed's reference time, so the API's time-shift renders
them as "N hours ago" consistently with the seed.

Run it on a schedule with cron (every 15 minutes):

```cron
*/15 * * * * cd /path/to/deckwatch/backend && ANTHROPIC_API_KEY=sk-ant-... \
  DATABASE_URL=postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch \
  .venv/bin/python -m app.ingest >> /var/log/deckwatch-ingest.log 2>&1
```

Feed URLs are in `app/ingest/sources.py` — outlets change RSS paths over time; a
dead feed is skipped, not fatal. The pure stages and classifier mapping are
covered DB-free in `tests/test_ingest.py` (the Anthropic client is stubbed).

## Monthly safety report

`python -m app.monthly` builds the month's safety report (shown at
`/dashboard/reports/<YYYY-MM>`) and stores it in the `monthly_reports` table.
It reads the month's ingested incidents (on the Kenyan calendar), has
**Claude Opus 5.5** (`REPORT_MODEL`) consolidate them — merge duplicate
coverage into one incident, correct counties, set aside context and off-topic
articles, and write the hotspots, "why it matters" notes and watch list — then
computes every figure from the articles themselves (`app/monthly/report.py`).
Without `ANTHROPIC_API_KEY` it stores an automatic report (one incident per
article) that the page labels as unreviewed.

```bash
.venv/bin/python -m app.monthly --month 2026-09            # generate + store
.venv/bin/python -m app.monthly --month 2026-09 --no-store --out r.json   # dry run
.venv/bin/python -m app.monthly --import r.json            # store a hand-edited report
```

It runs on the last day of every month at 23:30 EAT from
`.github/workflows/monthly-report.yml` (needs the `DATABASE_URL` and
`ANTHROPIC_API_KEY` repo secrets; each run's report is kept as a workflow
artifact). Served by `GET /monthly-reports` and `GET /monthly-reports/{month}`.
September 2026 was reviewed by hand; its report is bundled with the frontend at
`src/lib/data/monthly-reports/2026-09.json` and stored with `--import`.

## Deploying

Target stack: **Render** (API service + cron job) + **Supabase** (managed
Postgres with PostGIS) + **Vercel** (frontend), source on **GitHub**. See
[`DEPLOY.md`](DEPLOY.md) for the full runbook and the `render.yaml` Blueprint
at the repo root.
