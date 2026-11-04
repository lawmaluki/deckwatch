# Data governance

How Deckwatch Kenya collects incident information, how it judges how reliable each incident is, where the data is stored, who it is shared with, and how it is corrected or removed.

Every statement here describes what the code does today. Where a safeguard is planned rather than built, it is marked **Planned**.

## 1. What Deckwatch holds

Deckwatch holds **public safety incidents derived from published Kenyan news**, plus a monthly report built from them. It holds no user accounts, no visitor profiles and no reports submitted by the public. See [privacy-and-safety.md](privacy-and-safety.md) for visitor data.

| Data | Origin | Stored in |
|---|---|---|
| Incidents | Headlines, RSS summaries and links from 21 news and official feeds | `incidents` table |
| County reference data | Kenya's 47 counties, with names, codes and centres | `counties` table |
| Monthly safety reports | Built from a month's incidents, optionally reviewed by hand | `monthly_reports` table, plus the reviewed issues in `src/lib/data/monthly-reports/` |
| Takedown record | Source links of incidents removed on request | `removed_articles` table |

## 2. Collection

Ingestion runs every hour as a scheduled GitHub Actions job (`.github/workflows/ingest.yml`, `python -m app.ingest`). Each run goes through these steps.

1. **Fetch.** It reads the RSS feeds listed in [`backend/app/ingest/sources.py`](../backend/app/ingest/sources.py): 21 sources, comprising Kenyan newsrooms plus the National Police Service, the Ministry of Health and the Kenya News Agency. From each item it keeps only the **headline, the feed's own summary (truncated to 400 characters), the link and the publish time**. It never downloads full articles, photos or video.
2. **Skip what it has seen.** An article whose link is already stored, or whose link was removed on request (`removed_articles`), is skipped.
3. **Pre-filter.** A broad list of safety keywords ([`prefilter.py`](../backend/app/ingest/prefilter.py)) drops items that are clearly unrelated, such as sport, business and entertainment.
4. **Classify.** A classifier decides whether the item describes a real incident and assigns its category (11 types), its severity and its county. The default is a deterministic, keyword-and-rule classifier ([`rules.py`](../backend/app/ingest/rules.py)) that needs no external service. Optional modes send the headline and summary to an LLM (`llm`), add similar hand-labelled examples first (`rag`), or use the LLM only when the rules are unsure (`hybrid`). The mode is set by `INGEST_CLASSIFIER`.
5. **Locate.** The place named in the text is matched against two offline gazetteers: about 70 curated hotspots and about 9,000 GeoNames places ([`geocode.py`](../backend/app/ingest/geocode.py)). No external geocoding service is called. Each point carries a **precision**:

   | Precision | Means |
   |---|---|
   | `local` | a village, estate or neighbourhood |
   | `town` | a town |
   | `road` | somewhere along a named road |
   | `area` | an administrative location or region |
   | `county` | the county centre, because no place was found |

   An ambiguous place name falls back to the county centre, because a wrong point is worse than an imprecise one.
6. **Merge duplicates.** An article that describes an incident already stored is merged into that incident as an extra source, instead of becoming a new pin. Two rules are tried in order ([`dedup.py`](../backend/app/ingest/dedup.py)):
   - the same category within 2 km and 72 hours;
   - headlines that say the same thing within 72 hours, compared by local embeddings or by word overlap.
7. **Score and store.** The incident's verification score is computed (§3), and the incident is written to the database.

### Severity rubric

| Severity | Criteria |
|---|---|
| Critical | Three or more people killed |
| High | One or two killed, or a shooting, stabbing or kidnapping |
| Medium | Injuries, a missing person or serious disruption |
| Low | No one hurt, or coverage of past events |

## 3. Verification

Deckwatch does **not** decide whether a story is true. That is an editorial judgement it has no basis to make. The score measures **independent corroboration** ([`verification.py`](../backend/app/ingest/verification.py)):

- **Each owner group counts once.** For example, Nation Africa, NTV and Nairobi News are all Nation Media Group, so three of their mastheads are one newsroom, not three confirmations.
- **Aggregators count weakly.** Outlets that mostly rewrite other newsrooms' reporting, such as Tuko and Kenyans.co.ke, add little.
- **Official sources weigh more.** Police and government feeds carry more weight than a single news report.
- **Severity and raw article counts are excluded.** A dramatic story is not more credible than a mundane one.

| Status | Score | Meaning |
|---|---|---|
| `verified` | 80 or more | Several independent newsrooms, or official sources, reported it |
| `likely_true` | 55–79 | Some independent corroboration |
| `unconfirmed` | 30–54 | Usually a single outlet |
| `false_report` | (never assigned automatically) | Kept only for editorial use |

Every incident links to all its sources, so readers can check for themselves. The site and the API say plainly that "verified" means corroborated, not confirmed by Deckwatch or any authority.

### Quality measurement

The classifier is measured against a hand-labelled sample, [`backend/eval/labels.csv`](../backend/eval/labels.csv), using `python -m app.ingest.evaluate`. The evaluation reports each stage separately: the pre-filter, incident detection, category, severity, location and duplicate merging. A change to the classifier is compared on the same labels before it is adopted.

### Monthly reports

At the end of each month (`.github/workflows/monthly-report.yml`), the month's incidents are consolidated into distinct events, so one crash covered 20 times counts once. Each report records how it was made in its `method` field:

| Method | How it was made |
|---|---|
| `editorial` | Consolidated and reviewed by hand: counties corrected, background coverage and off-topic items set aside, notes written by the editor |
| `claude` | Consolidated by an LLM, not reviewed |
| `automatic` | Grouped by rules only, used when no LLM is available |

The method is shown on the report, and a reviewed bundled report takes precedence over an unreviewed one. Every figure in a report is computed from the stored articles, so it can be traced back to its sources.

## 4. Storage

- **Database.** PostgreSQL with PostGIS, hosted on Supabase. The tables are `counties`, `incidents`, `monthly_reports` and `removed_articles`. There are no tables for users, sessions or submissions.
- **Access.** Only the backend API (Render), the scheduled jobs (GitHub Actions) and the maintainer hold the database credentials. They are kept in each platform's secret store and never committed. The website never connects to the database; it reads through the backend.
- **Code and configuration** are public on GitHub. Secrets are not.
- **Retention.** Incidents are kept as a historical record, because trend charts and monthly reports depend on them. Removal happens on request (§6).

## 5. Sharing

| Channel | Who | What |
|---|---|---|
| Website | Anyone | Map, dashboards, county pages, monthly reports |
| Public API (`/api/*`) | Anyone, with no key, readable from any website (CORS) | Incidents, counties and monthly reports, as JSON. See [api.md](api.md) |
| OpenAPI spec (`/api/openapi.json`) | Anyone | A machine-readable description of the API |

Everything shared is already public: headlines, short summaries, links to the publisher, a category, a severity, a gazetteer point and a score. Nothing is shared privately with third parties, sold or used for advertising. Reusers are asked to credit Deckwatch Kenya and link to the original articles ([Terms of Use](https://deckwatch.vercel.app/terms#api)).

Copyright in headlines and summaries stays with the publishers. The MIT licence covers Deckwatch's code, not their content.

## 6. Corrections and removal

Anyone can ask for an incident to be corrected or removed:
- through **Report a problem** on any incident, which opens an email with the incident already identified;
- by emailing [lukip2019@gmail.com](mailto:lukip2019@gmail.com).

The process is set out in the [Terms of Use](https://deckwatch.vercel.app/terms#corrections).

- **What qualifies:** wrong facts or location, not a real incident, a duplicate, exposing someone to danger, or unlawful content.
- **Review:** the maintainer reviews every request by hand and replies within **72 hours**. A report that someone is at risk is handled first.
- **Removal:** `python -m app.takedown <id> --reason "…"` deletes the incident and records its source links in `removed_articles`, so the next hourly ingestion does not rebuild it from the same articles. It previews by default and applies only with `--yes`.
- **Correction:** fields are corrected in the database directly. A monthly report that counted the incident is rebuilt and re-imported.

**Planned:** a public log of corrections and removals, with counts per month and no personal details.

## 7. Roles

Deckwatch is maintained by one person, Lawrence Maluki, who is the data controller and reviews every correction. Changes to data handling are made in public commits, and the Privacy Policy and Terms change in the same commit as the code they describe. See [governance.md](governance.md).
