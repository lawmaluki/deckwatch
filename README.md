<div align="center">

# Deckwatch Kenya

**Public safety intelligence for Kenya. What happened, where it happened, and how sure we are.**

[![CI](https://github.com/lawmaluki/deckwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/lawmaluki/deckwatch/actions/workflows/ci.yml)
[![Ingestion](https://github.com/lawmaluki/deckwatch/actions/workflows/ingest.yml/badge.svg)](https://github.com/lawmaluki/deckwatch/actions/workflows/ingest.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-PostGIS-009688?logo=fastapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Live site](https://deckwatch.vercel.app) · [Monthly report](https://deckwatch.vercel.app/dashboard/reports) · [API docs](https://deckwatch.vercel.app/api-docs) · [Why Deckwatch](https://deckwatch.vercel.app/why) · [Privacy](https://deckwatch.vercel.app/privacy) · [Terms](https://deckwatch.vercel.app/terms)

</div>

---
<img width="1919" height="958" alt="image" src="https://github.com/user-attachments/assets/b7337bd3-f9cb-4ab1-897d-072b76231afe" />

Kenyans deciding whether it is safe to travel, commute or attend an event mostly rely on scattered news alerts, group chats and word of mouth. Deckwatch replaces that guesswork with one map-first view of what is happening and where, built from 13 Kenyan newsrooms, scored for how well each report is corroborated, and summed up in a monthly safety report.

## Features

- **Live incident map.** Every incident on a map of Kenya's 47 counties, with marker clustering, a heat map, and a timeline to replay how a day or week unfolded.
- **Hourly news ingestion.** RSS feeds from 21 Kenyan outlets are filtered, classified into 11 incident categories, placed in a county, and merged with earlier coverage of the same event.
- **Verification scoring.** Each incident carries a status (verified, likely true, unconfirmed) based on how many independent outlets reported it, with links to every source.
- **National and county dashboards.** A 24-hour picture, 14-day trends, category mix, and a risk score for each county. Every figure links through to the incidents behind it.
- **Monthly safety report.** Published on the last day of each month. The month's coverage is consolidated into distinct incidents, so the same crash reported 20 times counts once, and the report covers hotspots, county briefs, what changed, and what remains uncertain.
- **Alerts.** Subscribe to counties, categories or a distance around you and get notified in the app, and on your desktop if you allow it.
- **Intel Feed.** A running list of the latest incidents, opened beside the map.
- **Public API.** JSON endpoints for incidents, counties and monthly reports, documented at [`/api-docs`](https://deckwatch.vercel.app/api-docs).

## Data and limitations

Deckwatch reports what Kenyan media publishes. That shapes what it can and cannot tell you:

- **Coverage follows newsrooms.** Most sources are Nairobi-based, so remote counties are under-represented. A county with more incidents may simply have more reporters.
- **Many locations are approximate.** When an article names only a county, the incident is placed at the county's centre.
- **The live map counts reports, not events.** Automatic merging of duplicate coverage is limited. The monthly report does this consolidation properly, which is why its numbers are lower and more reliable.
- **Unverified is the default.** Most incidents come from a single outlet. Check the sources before acting on any one report.

In an emergency, contact the National Police Service on **999**, **112** or **911**.

## Documentation

| | |
|---|---|
| [Technical architecture](docs/architecture.md) | How the pieces fit, the data model and the dependencies |
| [Public API](docs/api.md) | Endpoints, fields and examples ([live reference](https://deckwatch.vercel.app/api-docs)) |
| [Deployment](docs/deployment.md) | Running locally and in production |
| [Data governance](docs/data-governance.md) | How incidents are collected, verified, stored and shared |
| [Privacy and safety](docs/privacy-and-safety.md) | How personal data and sensitive locations are protected |
| [Governance](docs/governance.md) | Ownership, principles and accountability |

## Run it locally

You need Node.js 20 or newer. For the backend, you also need Docker, or Python 3.9+ with a PostgreSQL database that has PostGIS.

**Website only, with sample data:**

```bash
npm install
npm run dev          # http://localhost:3000
```

**Full stack, with the API and database:**

```bash
cd backend
docker compose up --build              # PostGIS + API on http://localhost:8000
```

Then, back in the repository root, create `.env.local` with these two lines and run `npm run dev` again:

```bash
API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DATA_SOURCE=api
```

**Real incidents from the news:** with the database running, ingest the feeds once. The default rule classifier needs no API key.

```bash
cd backend
pip install -e ".[dev]"
python -m app.ingest
```

**Tests:** `npm test`, `npm run typecheck` and `npm run lint` at the root, and `pytest` in `backend/`.

Every environment variable is described in [`.env.example`](.env.example) and [`backend/.env.example`](backend/.env.example). The backend's own [README](backend/README.md) covers ingestion, the classifiers and the monthly report. [`backend/DEPLOY.md`](backend/DEPLOY.md) is the step-by-step guide to deploying on Supabase, Render, GitHub Actions and Vercel.

## Architecture and dependencies

A Next.js website (which also serves the public API) reads from a FastAPI backend over PostgreSQL/PostGIS. A scheduled job ingests news every hour and builds the monthly report. Every hosted service below can be swapped for an open or self-hosted equivalent without code changes, and no proprietary component is required.

| Component | Used for | Licence | Replaceable by |
|---|---|---|---|
| Next.js 16, React 19 | Website and public API | MIT | n/a |
| FastAPI, SQLAlchemy | Backend API | MIT | n/a |
| PostgreSQL + PostGIS | Incident database | PostgreSQL / GPL-2.0 | Any PostGIS host. Production uses Supabase; `docker compose` runs `postgis/postgis` |
| Leaflet + county GeoJSON | Map (no basemap tiles) | BSD-2-Clause | n/a |
| fastembed | Local embeddings for duplicate merging and the RAG classifier | Apache-2.0 | n/a |
| openrouteservice / OSRM | Route Watch directions (OpenStreetMap data, ODbL) | Open source | A self-hosted OSRM (`ROUTING_URL`) |
| Vercel | Website hosting | Proprietary service | Any Node.js host (`npm run build && npm start`) |
| Render | Backend hosting | Proprietary service | Any Docker host (`backend/Dockerfile`) |
| GitHub Actions | Hourly ingestion, monthly report | Proprietary service | Any scheduler running `python -m app.ingest` and `python -m app.monthly` |
| Anthropic Claude | **Optional.** LLM classifier and written monthly summaries | Proprietary API | Not needed: the default rule classifier and the automatic monthly report run without it |
| Google Analytics | **Optional.** Visitor statistics | Proprietary service | Remove `GA_MEASUREMENT_ID` in `src/app/layout.tsx` |

## Privacy, corrections and terms

Deckwatch has no accounts and stores no data about visitors. Settings and location stay in the browser. The [Privacy Policy](https://deckwatch.vercel.app/privacy) lists exactly what is collected, which is visitor statistics through Google Analytics. Anyone can ask for an incident to be corrected or removed through **Report a problem** on the incident, or by email, and the maintainer replies within 72 hours (see [Terms of Use](https://deckwatch.vercel.app/terms#corrections)). Removals are done with `python -m app.takedown`, which also stops ingestion from bringing the incident back.

Contact: [lukip2019@gmail.com](mailto:lukip2019@gmail.com)

## License

The code is released under the [MIT License](LICENSE). Copyright in the news headlines and summaries that Deckwatch links to stays with their publishers.
