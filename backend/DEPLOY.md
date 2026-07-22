# Deploying the backend (Railway) + going live

This deploys three things to **Railway** — a PostGIS database, the FastAPI
service, and a scheduled ingestion job — then points the Vercel frontend at the
API so the public site serves real, continuously-ingested data.

> Platform UIs change. The **requirements** are stable even if the exact clicks
> aren't: (a) a Postgres with the **PostGIS** extension, (b) the API built from
> `backend/Dockerfile` with `DATABASE_URL` set and listening on `$PORT`, and
> (c) a scheduled `python -m app.ingest` sharing that `DATABASE_URL`. Follow
> Railway's current docs where they differ.

## Prerequisites
- A Railway account with this GitHub repo connected.
- (Optional) Anthropic credits, only if you want AI classification instead of
  the free rule-based default.

## 1. PostGIS database
Railway's managed Postgres does **not** include PostGIS, so deploy the PostGIS
image as a service instead:
- New service → **Deploy a Docker image** → `postgis/postgis:16-3.4`.
- Variables: `POSTGRES_USER=deckwatch`, `POSTGRES_PASSWORD=<pick one>`,
  `POSTGRES_DB=deckwatch`.
- Add a **Volume** mounted at `/var/lib/postgresql/data` so data survives redeploys.
- Note its private hostname (e.g. `postgis.railway.internal`). The connection
  string other services use is:
  `postgresql://deckwatch:<password>@postgis.railway.internal:5432/deckwatch`
  (the app rewrites the scheme to `postgresql+psycopg://` automatically).

## 2. API service
- New service → **Deploy from the repo**.
- Settings → **Root Directory:** `backend` (so it builds `backend/Dockerfile`).
- Variables:
  - `DATABASE_URL` = the connection string from step 1.
  - `SEED_ON_START=true` (keeps the sample data so the map isn't blank before the
    first ingest; set `false` for a clean prod DB filled only by ingestion).
- Railway injects `$PORT`; the entrypoint already listens on it, runs schema
  init + seed, then serves.
- **Networking → Generate Domain** to get a public URL (e.g.
  `https://deckwatch-api.up.railway.app`). Verify:
  `curl https://<domain>/health` → `{"status":"ok"}`, and `/incidents` returns data.

## 3. Scheduled ingestion
- New service → same repo, **Root Directory:** `backend`.
- **Custom Start Command:** `python -m app.ingest` (overrides the API entrypoint —
  this service only ingests, it doesn't serve).
- Variables: `DATABASE_URL` (same as the API) and `INGEST_CLASSIFIER=rule`
  (free, no key).
- Set a **Cron Schedule**: `*/15 * * * *` (every 15 minutes).
- Each run logs `ingest complete: fetched=…, inserted=…, merged=…`. The API's
  incident count grows as real news is classified and stored.

## 4. Point the frontend at it
On the **Vercel** project (deckwatch):
- Settings → Environment Variables → add `API_BASE_URL` = the API domain from
  step 2 (no trailing slash).
- Redeploy. The Next.js `/api/*` routes proxy to it **server-side**, so no CORS
  config is needed. `deckwatch.vercel.app` now serves real, ingested incidents.

## Upgrading to Claude classification
The rule-based classifier is free but coarse (keyword-driven, no context
reasoning). To use Claude Haiku 4.5 instead, on the **ingestion service**:
- Add `ANTHROPIC_API_KEY=sk-ant-...` (needs credits at console.anthropic.com).
- Set `INGEST_CLASSIFIER=llm`.
No redeploy of the API is needed — the next cron run uses Claude.

## Notes
- **Feeds drift.** Outlets change RSS paths; a dead feed is skipped, not fatal.
  Feed URLs live in `app/ingest/sources.py`.
- **Cost.** The rule-based path is free. Claude Haiku 4.5 is ~$1/$5 per M tokens;
  a 15-minute cadence over the four feeds is a few cents a day at most.
- **Seed vs real.** Ingested incidents (`ing-*` ids) coexist with the seed. For a
  pure real-data site, set `SEED_ON_START=false` and let ingestion populate.
