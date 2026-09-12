# Deploying the backend (Render + Supabase) + going live

This deploys the FastAPI service and a scheduled ingestion job to **Render**,
backed by a **Supabase** Postgres database, then points the **Vercel**
frontend at the API so the public site serves real, continuously-ingested
data. Source lives on **GitHub**; both Render and Vercel deploy automatically
on push to `main`.

> Platform UIs change. The **requirements** are stable even if the exact
> clicks aren't: (a) a Postgres with the **PostGIS** extension, (b) the API
> built from `backend/Dockerfile` with `DATABASE_URL` set and listening on
> `$PORT`, and (c) a scheduled `python -m app.ingest` sharing that
> `DATABASE_URL`. Follow Render's and Supabase's current docs where they
> differ from this file.

## Prerequisites
- A Render account with this GitHub repo connected.
- A Supabase account (separate from Render — Supabase just hosts the DB).
- (Optional) Anthropic credits, only if you want AI classification instead of
  the free rule-based default.

## 1. Supabase: the PostGIS database
- New project at supabase.com → pick a region, set a DB password.
- **SQL Editor** → run `create extension if not exists postgis;` (Supabase
  ships the extension but doesn't enable it by default).
- **Project Settings → Database → Connection string**. Use the **Session
  pooler** (port 6543) connection string for the API service — Render web
  services can churn through direct-connection limits fast; the pooler
  handles that. The cron job (short-lived, one connection) can use either.
- The app's `config.py` already rewrites a bare `postgresql://` or
  `postgres://` URL to `postgresql+psycopg://`, so paste Supabase's string as
  given — no manual edits needed.

## 2. Render: API service + cron job
The repo root has a `render.yaml` Blueprint. In Render: **New → Blueprint**,
connect this repo, and it creates both services below from that file. If you'd
rather click through manually instead of using the Blueprint:

**API service**
- New → **Web Service** → this repo → **Root Directory:** `backend` (builds
  `backend/Dockerfile`).
- Env vars: `DATABASE_URL` (Supabase pooler string from step 1),
  `SEED_ON_START=true` (keeps the map non-empty before the first ingest; set
  `false` once you want a clean prod DB filled only by ingestion).
- Render injects `$PORT`; `entrypoint.sh` already listens on it, runs schema
  init + seed, then serves.
- Once deployed, verify: `curl https://<your-service>.onrender.com/health` →
  `{"status":"ok"}`, and `/incidents` returns data.

**Ingestion cron job**
- New → **Cron Job** → same repo → **Root Directory:** `backend`.
- **Docker Command:** `python -m app.ingest` (overrides the API's serve
  command — this job only ingests).
- Env vars: `DATABASE_URL` (same Supabase string) and
  `INGEST_CLASSIFIER=rule` (free, no key).
- **Schedule:** `*/15 * * * *` (every 15 minutes).
- Each run logs `ingest complete: fetched=…, inserted=…, merged=…`. The API's
  incident count grows as real news is classified and stored.

Render's free web-service plan spins the API down after ~15 minutes idle, so
the first request after a quiet spell is slow to wake it — expected, not a
bug. The cron job runs on its own schedule regardless.

## 3. Point the Vercel frontend at it
On the **Vercel** project (already linked — `.vercel/project.json`):
- Settings → Environment Variables → add:
  - `API_BASE_URL` = the Render API's public URL (no trailing slash).
  - `NEXT_PUBLIC_DATA_SOURCE` = `api`.
- Redeploy. The Next.js `/api/*` routes proxy to it **server-side**, so no
  CORS config is needed. The deployed site now serves real, ingested
  incidents.

## Upgrading to Claude classification
The rule-based classifier is free but coarse (keyword-driven, no context
reasoning). To use Claude Haiku 4.5 instead, on the **cron job** service:
- Add `ANTHROPIC_API_KEY=sk-ant-...` (needs credits at console.anthropic.com).
- Set `INGEST_CLASSIFIER=llm`.
No redeploy of the API service is needed — the next cron run uses Claude.

## Notes
- **Feeds drift.** Outlets change RSS paths; a dead feed is skipped, not
  fatal. Feed URLs live in `app/ingest/sources.py`.
- **Cost.** The rule-based path is free. Supabase's and Render's free tiers
  cover this workload; Render cron jobs bill per run once past any free
  allotment — check current pricing. Claude Haiku 4.5 is ~$1/$5 per M tokens;
  a 15-minute cadence over the tracked feeds is a few cents a day at most.
- **Seed vs real.** Ingested incidents (`ing-*` ids) coexist with the seed.
  For a pure real-data site, set `SEED_ON_START=false` and let ingestion
  populate.
