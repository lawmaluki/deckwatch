# Deploying the backend (Render + Supabase) + going live

This deploys the FastAPI service to **Render**, backed by a **Supabase**
Postgres database, runs scheduled ingestion on a **GitHub Actions** cron
workflow, then points the **Vercel** frontend at the API so the public site
serves real, continuously-ingested data. Render and Vercel deploy
automatically on push to `main`.

Ingestion runs on GitHub Actions rather than a Render Cron Job because Render
has no free tier for Cron Jobs — it requires payment info on file even for
the smallest plan. Actions' free scheduled workflows cover a
`python -m app.ingest` call every 15 minutes at no cost.

> Platform UIs change. The **requirements** are stable even if the exact
> clicks aren't: (a) a Postgres with the **PostGIS** extension, (b) the API
> built from `backend/Dockerfile` with `DATABASE_URL` set and listening on
> `$PORT`, and (c) a scheduled `python -m app.ingest` sharing that
> `DATABASE_URL`. Follow Render's, Supabase's, and GitHub's current docs where
> they differ from this file.

## Prerequisites
- A Render account with this GitHub repo connected.
- A Supabase account (separate from Render — Supabase just hosts the DB).
- (Optional) Anthropic credits, only if you want AI classification instead of
  the free rule-based default.

## 1. Supabase: the PostGIS database
- New project at supabase.com → pick a region, set a DB password.
- **SQL Editor** → run `create extension if not exists postgis;` (Supabase
  ships the extension but doesn't enable it by default).
- **Project Settings → Database → Connection string**. Use the **Transaction
  pooler** (port 6543) connection string — Render web services and GitHub
  Actions runners can both churn through direct-connection limits fast; the
  pooler handles that.
- Transaction mode hands each statement whichever backend is free, so
  server-side prepared statements can't be used. `db.py` disables them
  (`prepare_threshold=None`); without that, boot dies on
  `DuplicatePreparedStatement: prepared statement "_pg3_0" already exists`.
- The app's `config.py` already rewrites a bare `postgresql://` or
  `postgres://` URL to `postgresql+psycopg://`, so paste Supabase's string as
  given — no manual edits needed.

## 2. Render: the API service
The repo root has a `render.yaml` Blueprint. In Render: **New → Blueprint**,
connect this repo, and it creates the service below from that file. If you'd
rather click through manually instead of using the Blueprint:

- New → **Web Service** → this repo → **Root Directory:** `backend` (builds
  `backend/Dockerfile`).
- Env vars: `DATABASE_URL` (Supabase pooler string from step 1),
  `SEED_ON_START=true` (keeps the map non-empty before the first ingest; set
  `false` once you want a clean prod DB filled only by ingestion).
- Render injects `$PORT`; `entrypoint.sh` already listens on it, runs schema
  init + seed, then serves.
- Once deployed, verify: `curl https://<your-service>.onrender.com/health` →
  `{"status":"ok"}`, and `/incidents` returns data.

Render's free plan spins the API down after ~15 minutes idle, so the first
request after a quiet spell is slow to wake it — expected, not a bug.

## 3. GitHub Actions: scheduled ingestion
`.github/workflows/ingest.yml` runs `python -m app.ingest` every 15 minutes
via `workflow_dispatch`-enabled cron, independent of Render.

- In the GitHub repo: **Settings → Secrets and variables → Actions**.
- Add secret `DATABASE_URL` = the same Supabase pooler string used above.
- (Optional) Add secret `ANTHROPIC_API_KEY` and a repo **variable**
  `INGEST_CLASSIFIER=llm` to use Claude instead of the free rule-based
  default (see "Upgrading to Claude classification" below).
- The workflow is also runnable on demand: **Actions tab → Scheduled
  ingestion → Run workflow** — useful for testing before waiting on the
  cron.
- Each run logs `ingest complete: fetched=…, inserted=…, merged=…` in the
  Actions log. The API's incident count grows as real news is classified and
  stored in the same Supabase DB the API reads from.

GitHub's scheduled workflows can lag a few minutes past the exact cron time
under load, and are disabled automatically on repos with no activity for 60
days (a commit or manual run re-enables them) — fine for this workload.

## 4. Point the Vercel frontend at it
On the **Vercel** project (already linked — `.vercel/project.json`):
- Settings → Environment Variables → add:
  - `API_BASE_URL` = the Render API's public URL (no trailing slash).
  - `NEXT_PUBLIC_DATA_SOURCE` = `api`.
- Redeploy. The Next.js `/api/*` routes proxy to it **server-side**, so no
  CORS config is needed. The deployed site now serves real, ingested
  incidents.

## Upgrading to Claude classification
The rule-based classifier is free but coarse (keyword-driven, no context
reasoning). To use Claude Haiku 4.5 instead, in the GitHub repo's Actions
secrets/variables (not on Render — the API service doesn't classify):
- Add secret `ANTHROPIC_API_KEY=sk-ant-...` (needs credits at
  console.anthropic.com).
- Add repo variable `INGEST_CLASSIFIER=llm`.
No redeploy of anything is needed — the next scheduled Actions run uses
Claude.

## Notes
- **Feeds drift.** Outlets change RSS paths; a dead feed is skipped, not
  fatal. Feed URLs live in `app/ingest/sources.py`.
- **Cost.** The rule-based path is free. Supabase's and Render's free tiers
  and GitHub Actions' free scheduled-workflow minutes all cover this
  workload at $0. Claude Haiku 4.5 is ~$1/$5 per M tokens; a 15-minute
  cadence over the tracked feeds is a few cents a day at most.
- **Seed vs real.** Ingested incidents (`ing-*` ids) coexist with the seed.
  For a pure real-data site, set `SEED_ON_START=false` and let ingestion
  populate.
