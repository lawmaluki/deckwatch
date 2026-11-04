# Deployment

How to run Deckwatch Kenya on your own machine, and how to deploy your own copy. The production setup is step by step in [`backend/DEPLOY.md`](../backend/DEPLOY.md). This page is the overview, and covers what to set where.

## Requirements

- Node.js 20 or newer
- Docker, or Python 3.9+ with PostgreSQL 14+ and PostGIS
- No paid services. Every API key is optional.

## 1. Run locally

**Website only, with sample data:**

```bash
npm install
npm run dev                      # http://localhost:3000
```

**Full stack, with the database and API in Docker:**

```bash
cd backend
docker compose up --build        # PostGIS on :5432, API on http://localhost:8000
```

This creates the schema, loads the 47 counties and a sample dataset, and serves the API, with Swagger UI at `/docs`. Then, in the repository root, create `.env.local`:

```bash
API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DATA_SOURCE=api
```

and run `npm run dev`.

**Ingest real news once**, with the database running:

```bash
cd backend
pip install -e ".[dev]"          # add ".[rag]" for local embeddings
python -m app.ingest             # rule classifier: no API key needed
```

**Run the checks:**

```bash
npm run lint && npm run typecheck && npm test && npm run build
cd backend && pytest
```

## 2. Production topology

| Piece | Runs on | Can be replaced by |
|---|---|---|
| Database | Supabase (PostgreSQL + PostGIS) | Any PostGIS host |
| Backend API | Render, from `backend/Dockerfile` (Blueprint: `render.yaml`) | Any Docker host |
| Hourly ingestion and month-end report | GitHub Actions (`.github/workflows/ingest.yml`, `monthly-report.yml`) | Any scheduler that runs `python -m app.ingest` and `python -m app.monthly` |
| Website and public API | Vercel | Any Node.js host (`npm run build && npm start`) |

The order matters: database, then backend, then jobs, then website. [`backend/DEPLOY.md`](../backend/DEPLOY.md) walks through each step, including the Supabase connection-pooler setting the backend needs.

## 3. Configuration

Secrets go in each platform's secret store and are never committed. `.env*` files are gitignored.

**Backend (Render)**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostGIS connection string |
| `SEED_ON_START` | no | `false` in production, so only ingested incidents are kept |

**Scheduled jobs (GitHub Actions)**

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | secret | yes | The same database |
| `INGEST_CLASSIFIER` | variable | no | `rule` (the default and free), `llm`, `rag` or `hybrid` |
| `ANTHROPIC_API_KEY` | secret | only for `llm`, `hybrid` or written monthly summaries | Claude access |
| `REPORT_MODEL`, `RAG_EMBED_MODEL` | variable | no | Model overrides |
| `DEV_DATABASE_URL` | secret | no | The separate dev database used by `ingest-dev.yml` |

**Website (Vercel)**

| Variable | Required | Purpose |
|---|---|---|
| `API_BASE_URL` | yes | The backend's URL. Server-side only, never sent to browsers |
| `NEXT_PUBLIC_DATA_SOURCE` | yes | `api` to serve live data |
| `NEXT_PUBLIC_SITE_URL` | no | The public URL, used for links, the sitemap and social cards |
| `ORS_API_KEY` | no | openrouteservice key for Route Watch. Without it, the public OSRM servers are used |
| `ROUTING_URL`, `ROUTING_FOOT_URL` | no | Self-hosted OSRM servers |

Every variable is described in [`.env.example`](../.env.example) and [`backend/.env.example`](../backend/.env.example).

Google Analytics is set by `GA_MEASUREMENT_ID` in [`src/app/layout.tsx`](../src/app/layout.tsx). A fork should change it to its own ID or remove it.

## 4. Environments

`main` deploys to production. The `dev` branch has its own database, its own backend service, a Vercel preview and its own ingestion job, so changes can be tested on live data before they are merged. See "Dev environment" in [`backend/DEPLOY.md`](../backend/DEPLOY.md#dev-environment-branch-dev).

## 5. Operating it

| Task | Command (in `backend/`, with `DATABASE_URL` set) |
|---|---|
| Create or upgrade tables | `python -m app.init_db` (runs automatically on boot and before each ingestion) |
| Ingest now | `python -m app.ingest`, or run the "Scheduled ingestion" workflow by hand |
| Build a month's report | `python -m app.monthly --month 2026-10` |
| Import a reviewed report | `python -m app.monthly --import report.json` |
| Remove an incident on request | `python -m app.takedown <id> --reason "…" --yes` |
| Merge old duplicates | `python -m app.ingest.merge_duplicates`, then `--apply` |
| Remove sample data | `python -m app.purge_seed --yes` |

Health check: `GET /health` on the backend returns `{"status":"ok"}`.

## 6. Adapting Deckwatch to another country

- The feed list is in [`backend/app/ingest/sources.py`](../backend/app/ingest/sources.py), and outlet ownership groups are in `verification.py`.
- The administrative areas and gazetteers are in `backend/fixtures/` and `src/lib/data/`. The scripts in `scripts/` rebuild them from GeoNames and boundary files.
- The category vocabulary and severity rules are in `backend/app/ingest/rules.py`.
