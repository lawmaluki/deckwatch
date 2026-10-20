<div align="center">

# Deckwatch Kenya

**Public safety intelligence for Kenya. What happened, where it happened, and how sure we are.**

[![CI](https://github.com/lawmaluki/deckwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/lawmaluki/deckwatch/actions/workflows/ci.yml)
[![Ingestion](https://github.com/lawmaluki/deckwatch/actions/workflows/ingest.yml/badge.svg)](https://github.com/lawmaluki/deckwatch/actions/workflows/ingest.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-PostGIS-009688?logo=fastapi)

[Live site](https://deckwatch.vercel.app) · [Monthly report](https://deckwatch.vercel.app/dashboard/reports) · [API docs](https://deckwatch.vercel.app/api-docs) · [Why Deckwatch](https://deckwatch.vercel.app/why)

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

## License

No open-source license has been chosen yet, so all rights are reserved by the author. Please open an issue before reusing the code or data.
