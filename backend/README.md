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
| GET    | `/counties/{slug}/summary?days=30` | Real ingested incidents only; current/prior period totals, category and severity counts, and daily trend (`days`: 7, 30, or 90) |
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

If the Claude API can't be reached (bad or missing key, no credit, outage) the
article is counted under `errors` and left for the next run rather than dropped
as "not an incident". Three failures in a row abort the run with a non-zero
exit, so the scheduled job shows as failed.

Run it on a schedule with cron (every 15 minutes):

```cron
*/15 * * * * cd /path/to/deckwatch/backend && ANTHROPIC_API_KEY=sk-ant-... \
  DATABASE_URL=postgresql+psycopg://deckwatch:deckwatch@localhost:5432/deckwatch \
  .venv/bin/python -m app.ingest >> /var/log/deckwatch-ingest.log 2>&1
```

Feed URLs are in `app/ingest/sources.py` — outlets change RSS paths over time; a
dead feed is skipped, not fatal. The pure stages and classifier mapping are
covered DB-free in `tests/test_ingest.py` (the Anthropic client is stubbed).

### Measuring ingestion accuracy

`app/ingest/snapshot.py` and `app/ingest/evaluate.py` score the classifier
against a hand-labelled sample, so the keyword rules, the LLM and any later RAG
variant are compared on identical data.

```bash
.venv/bin/python -m app.ingest.snapshot --out eval/labels.csv   # run daily; appends new links
# fill in is_incident / category / severity / county / location_name / event_id
.venv/bin/python -m app.ingest.evaluate --labels eval/labels.csv --errors errors.csv
.venv/bin/python -m app.ingest.evaluate --labels eval/labels.csv --classifier llm
.venv/bin/python -m app.ingest.evaluate --labels eval/labels.csv --classifier rag
```

The snapshot keeps items *before* the keyword pre-filter, so articles it wrongly
drops can be found. Each stage (pre-filter, incident detection, category,
severity, location, dedup) is reported separately; `--skip-prefilter` isolates
the classifier. Hold back ~30% of labels untouched when tuning prompts.

### RAG classifier (`INGEST_CLASSIFIER=rag`)

The keyword rules pick the first category whose keywords appear; the plain LLM
reads the article but has never seen how *this* project's editors file things.
`rag` adds a retrieval step: the article is embedded with a small local model
(`fastembed`, `BAAI/bge-small-en-v1.5` — no key, runs on CPU), the most similar
**reviewed** articles are looked up, and
Claude classifies with those verdicts in view (`app/ingest/rag.py`). Schema,
validation and model are the plain LLM classifier's, so `--classifier llm` vs
`--classifier rag` isolates what retrieval adds.

```bash
.venv/bin/pip install -e ".[rag]"          # adds fastembed; first run downloads the model (~130 MB)
.venv/bin/python -m app.ingest.examples check    # retrieval-only sanity check, no API key
INGEST_CLASSIFIER=rag .venv/bin/python -m app.ingest

# grow the store as you label more (hand labels override the report):
.venv/bin/python -m app.ingest.examples build \
  --report ../src/lib/data/monthly-reports/2026-09.json --labels eval/labels.csv
```

**Where the examples come from.** Each run builds the store from two sources:

- **Every reviewed monthly report in the database** (`RAG_EXAMPLES_FROM_DB`,
  on by default). Each report's incidents become incident examples, and every
  article the review set aside (court cases over old crimes, warnings,
  politics, off-topic items) becomes a *not an incident* example with the
  reason attached. A new month counts as soon as its report is stored; no file
  needs rebuilding. Reports marked `automatic` are skipped: they were never
  reviewed, so their labels are only the keyword classifier's own guesses.
- **`fixtures/rag-examples.jsonl`**: the offline fallback when the database
  can't be reached, and the place for hand labels, which override what a report
  said about the same article.

The file currently holds the hand-reviewed September 2026 report: 380 examples,
157 of them not-an-incident. Floods, terror and wildlife are still thin, and
election violence has none, until labelled rows are added. Examples below `RAG_MIN_SCORE` similarity are left out, and with nothing
to retrieve it behaves exactly like `llm`. An article never retrieves itself, but
score `rag` on labels that were *not* used to build the store.

### Hybrid classifier (`INGEST_CLASSIFIER=hybrid`)

The keyword rules decide the articles they can be trusted on, for free, and
send everything else to `rag` (`app/ingest/hybrid.py`). An article goes to
`rag` when the rules find no category or no county, when several categories
match, when the category is one metaphors and politics often trigger (fire,
missing person, collapse, unrest, terror, flood, wildlife, health), or when it
reads like a follow-up (court, burial, autopsy, "months after", a rally).

Replayed against September 2026's hand review, the rules decided 16% of
articles and were right on 92% of them; the other 84% went to `rag`. Those
triggers were tuned on that same month, so re-check with
`evaluate --classifier hybrid` on fresh labels. If Claude is unavailable, the
rule answer is used where there is one, so ingestion keeps going; each run
prints how many articles each path decided. Same setup as `rag`.

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
