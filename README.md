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

## Project structure

- `src/app/` — routes: live map (`/`), national dashboard, counties index,
  per-county dashboard, `/why`, `/api-docs`
- `src/components/map/` — Leaflet map, clustering, heatmap, timeline controls
- `src/components/incidents/` — incident detail panel, Intel Feed drawer, badges
- `src/components/dashboard/` — stat cards and charts
- `src/lib/data/` — mock incident generator, Kenya counties/categories data
- `src/store/` — Zustand stores for filters, UI state, and notification prefs
