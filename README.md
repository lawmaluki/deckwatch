# Deckwatch Kenya

AI-powered public safety and incident intelligence platform for Kenya —
a map-first and modern live-event visualizations.

Deckwatch aggregates incidents (crime, road accidents, floods, fires,
protests, missing persons, terror alerts, disease outbreaks, infrastructure
failures, wildlife conflicts, election violence) onto a live interactive map
of Kenya, with per-incident verification scoring, AI-style summaries, county
risk dashboards, a timeline playback mode, and an Intel Feed drawer.

**Current status:** this is a working frontend prototype running on
deterministic seeded mock data - real news ingestion, or deployed AI pipeline yet. 
See the `/why` and `/api-docs` pagesin the app for more on where this is headed.

## Tech stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Framer Motion
- **Map:** Leaflet + react-leaflet, CARTO dark basemap tiles, real Kenya county
  boundaries (GeoJSON), Supercluster for marker clustering, leaflet.heat for
  heatmaps
- **State:** Zustand
- **Charts:** Recharts

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the live map.

## Data source

The client reads incident data one of two ways, selected by the
`NEXT_PUBLIC_DATA_SOURCE` environment variable:

- **unset / `mock`** (default) — a synchronous read of the seeded, deterministic
  dataset anchored to a fixed reference time. Fully static, ideal for local dev.
- **`api`** — the client fetches from this app's own `/api/incidents` route on
  load and re-polls every 60s. The dataset is re-anchored to real time on each
  request (`asOf` in the response), so relative times and 24h counts stay live.
  See `.env.example`.

The `/api/*` route handlers exist and serve seeded data in **both** modes; the
flag only changes how the browser reads them. See `/api-docs` in the app.

## Deployment

This is a standard Next.js 16 App Router app and deploys to Vercel with no
config file:

1. Push to GitHub (already at `github.com/lawmaluki/deckwatch`).
2. In Vercel, **Add New → Project** and import the repo. The framework preset,
   build command (`next build`), and output are detected automatically.
3. To get the live-feeling demo, add an environment variable
   `NEXT_PUBLIC_DATA_SOURCE=api` (Project → Settings → Environment Variables),
   then deploy. Leave it unset for the static seeded view.

`npm run build` must pass locally first (it does). Any host that runs a Node
Next.js server works too; a static export does **not**, because `api` mode uses
dynamic route handlers.

## Project structure

- `src/app/` — routes: live map (`/`), national dashboard, counties index,
  per-county dashboard, `/why`, `/api-docs`
- `src/components/map/` — Leaflet map, clustering, heatmap, timeline controls
- `src/components/incidents/` — incident detail panel, Intel Feed drawer, badges
- `src/components/dashboard/` — stat cards and charts
- `src/lib/data/` — mock incident generator, Kenya counties/categories data
- `src/store/` — Zustand stores for filters, UI state, and notification prefs
