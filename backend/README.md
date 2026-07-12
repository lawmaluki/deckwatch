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

## Deploying (not yet done)

Any host that runs a container + managed Postgres with PostGIS works
(Railway, Render, Fly.io, or Supabase for the DB). Build the `Dockerfile`,
set `DATABASE_URL` to the managed PostGIS instance, and the entrypoint runs
`init_db` + `seed` on boot. Then set `API_BASE_URL` on the Vercel frontend to
the deployed API URL.
