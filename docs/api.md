# Public API

Deckwatch Kenya publishes its incident data as a free JSON API.

- **Base URL:** `https://deckwatch.vercel.app`
- **Interactive reference**, with a "Try it" button on every endpoint: <https://deckwatch.vercel.app/api-docs>
- **OpenAPI 3.1 spec** (for Postman, Swagger UI and client generators): <https://deckwatch.vercel.app/api/openapi.json>
- **PDF guide:** [deckwatch-api-guide.pdf](deckwatch-api-guide.pdf)

The interactive reference and the OpenAPI spec are both generated from one list, [`src/lib/api-spec.ts`](../src/lib/api-spec.ts), so they cannot disagree. This page summarises them.

## Access

- **No key and no sign-up.**
- **CORS:** every `GET` endpoint can be called from any website's browser.
- **Format:** JSON. Timestamps are ISO 8601 in UTC; coordinates are WGS 84 decimal degrees.
- **Fair use:** cache on your side and keep request volumes reasonable. For bulk access, email [lukip2019@gmail.com](mailto:lukip2019@gmail.com). Use is covered by the [Terms of Use](https://deckwatch.vercel.app/terms#api).
- **Credit:** credit "Deckwatch Kenya", and link to the original articles in `sources` when you show an incident.

## Endpoints

| Method | Path | Returns | Cached for |
|---|---|---|---|
| GET | `/api/incidents` | Incidents, newest first. Filters: `category`, `severity`, `county`, `verification`, `since`, `limit` | 5 min |
| GET | `/api/incidents/{id}` | One incident, plus `aiSummary` and `recommendedActions` | 5 min |
| GET | `/api/counties/{slug}` | A county's risk score, incidents in the last 24 hours, and top category | 5 min |
| GET | `/api/counties/{slug}/summary?days=7\|30\|90` | A county's breakdown by category and severity, and its daily trend | 5 min |
| GET | `/api/monthly-reports` | Every published monthly report, as a summary | 10 min |
| GET | `/api/monthly-reports/{month}` | One month's full report (`YYYY-MM`) | 1 hour |
| POST | `/api/reports` | Validates a citizen report and returns an id. **Nothing is stored**, and it is not open to other websites' browsers | none |

County slugs are lower-case names with hyphens, for example `nairobi`, `homa-bay` and `elgeyo-marakwet`.

## Incident fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id, such as `ing-cd5b3213` |
| `title` | string | The headline of the first article |
| `category` | string | One of 11 types, such as `crime`, `traffic_accident` or `flood` |
| `severity` | string | `low`, `medium`, `high` or `critical` ([rubric](data-governance.md#severity-rubric)) |
| `county` | string | One of Kenya's 47 counties |
| `locationName` | string | The place named in the article |
| `locationPrecision` | string | How much ground `lat`/`lng` stands for: `local`, `town`, `road`, `area` or `county` (the county centre only, so not a real place) |
| `lat`, `lng` | number | Gazetteer point. Never a street address |
| `reportedAt` | string | Publish time of the earliest article |
| `verificationScore` | integer | 4–99, measuring independent corroboration ([how](data-governance.md#3-verification)) |
| `verificationStatus` | string | `verified`, `likely_true` or `unconfirmed` |
| `sources` | array | Each article: `name`, `type` (`news`, `police` or `government`) and `url` |
| `reportCount` | integer | Number of articles merged into this incident |
| `aiSummary` | string | Detail endpoint only: a summary from the feed, or a model-written one |
| `recommendedActions` | string[] | Detail endpoint only: general safety advice for the category |

## Examples

```bash
# The three most recent incidents
curl "https://deckwatch.vercel.app/api/incidents?limit=3"

# Critical incidents in Nakuru since 1 October 2026
curl "https://deckwatch.vercel.app/api/incidents?county=Nakuru&severity=critical&since=2026-10-01"

# One incident in full
curl "https://deckwatch.vercel.app/api/incidents/ing-cd5b3213"

# Nairobi over the last 7 days
curl "https://deckwatch.vercel.app/api/counties/nairobi/summary?days=7"

# The October 2026 monthly report
curl "https://deckwatch.vercel.app/api/monthly-reports/2026-10"
```

```js
const res = await fetch("https://deckwatch.vercel.app/api/incidents?verification=verified&limit=20");
const { count, asOf, results } = await res.json();
```

## Errors

Errors return `{ "error": "<message>" }`:
- **400** for an invalid parameter or body;
- **404** for an unknown incident, county or month.

Errors are never cached.

## What the API does not contain

The API contains no personal data beyond what news headlines already published. It has no visitor data, no submitted reports and no addresses. See [privacy-and-safety.md](privacy-and-safety.md).

## Stability

The aim is to add fields rather than change or remove them. A breaking change will be announced on the site's [What's new](https://deckwatch.vercel.app/whats-new) page before it ships. There is no uptime guarantee: the backend runs on a free tier that sleeps when idle, so the first request after a quiet spell can take a few seconds.
