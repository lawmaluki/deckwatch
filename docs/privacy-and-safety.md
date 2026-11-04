# Privacy and safety

How Deckwatch Kenya protects personal information, sensitive reports and location data that could put someone in danger. It covers the system as it runs today. Safeguards that are not yet built are marked **Planned**, and safeguards that must exist before a feature launches are marked **Required before launch**.

The public-facing version for visitors is the [Privacy Policy](https://deckwatch.vercel.app/privacy). The legal framework is Kenya's Data Protection Act, 2019, and the Data Protection (General) Regulations, 2021.

## 1. Principles

1. **Collect nothing we don't need.** There are no accounts, sign-ups or contact forms.
2. **Add nothing to what was published.** Deckwatch republishes headlines and short summaries that newsrooms have already made public, with a link to the source. It does not enrich them with names, photos, addresses or cross-references.
3. **Prefer an imprecise point to a dangerous one.** Locations are place-level at most, never addresses.
4. **Anyone can make it stop.** A person named or endangered by an incident can have it removed, and removal is permanent.

## 2. Personal data inventory

| Data | Example | Where it lives | Who can see it | Protection |
|---|---|---|---|---|
| Names in news headlines | A victim or suspect named by the outlet | `incidents` table, website, API | Public, as already published by the outlet | No extraction or indexing of people; removal on request (§5) |
| Alert settings, saved routes | "Alerts for Nakuru, crime" | Visitor's browser (`localStorage`) | Only that browser | Never sent to Deckwatch |
| Visitor location | Phone GPS position | Visitor's browser memory | Only that browser | Opt-in only, after a browser permission prompt; not stored, even in the browser |
| Route start and end points | Two coordinates | Sent once to a routing service | openrouteservice or OSRM | Not linked to any identity; results cached up to 24 hours |
| Analytics | Pages viewed, device, approximate location from IP | Google Analytics | Maintainer (aggregate reports) | No Deckwatch cookies; opt-out described in the Privacy Policy |
| Request logs | IP address, user agent, time | Vercel, Render, Supabase, GitHub | Those providers, and the maintainer for troubleshooting | Provider retention; not used to identify visitors |
| Incident reports submitted to `POST /api/reports` | A description and a point | **Nowhere**: validated, then discarded | No one | Nothing is stored (see §6) |

Deckwatch has no tables for users, sessions, submissions or contact details.

## 3. People named in news reports

Kenyan news coverage of crime and accidents often names victims, suspects and witnesses. Deckwatch:

- stores only the outlet's **headline**, its **feed summary** (at most 400 characters) and a **link**. Full articles, photos and video are never copied;
- does **not** extract names, build profiles of people, or offer any search or filter by person. The API filters by category, severity, county, verification status and date only;
- shows every incident with its sources, so the original publisher stays accountable for what it published;
- removes an incident on request. Removal also blocks the same articles from being ingested again (§5).

**Planned:** automatically flagging incidents that may name a child or a victim of sexual violence, so the maintainer can review them before or soon after they appear. Today these are handled through removal requests.

## 4. Location information that could cause harm

A precise point can expose where a victim lives, where a witness can be found, or where a vulnerable group is sheltering. Deckwatch limits this by design:

- **Points come from place-name gazetteers, never addresses.** The geocoder ([`geocode.py`](../backend/app/ingest/geocode.py)) matches place names against about 70 curated hotspots and about 9,000 GeoNames places. The most precise point it can produce is the centre of a village, estate or neighbourhood. It cannot resolve a street address, a plot or a building, and it calls no external geocoding service.
- **Every point says how precise it is** (`locationPrecision`: `local`, `town`, `road`, `area` or `county`). The site and the API tell readers not to read a county-centre point as a place.
- **Ambiguity falls back to the county centre.** A place name that matches more than one location in the county, or is also a common word or a person's name, is not used. A wrong point is treated as worse than an imprecise one.
- **Nothing beyond the publisher's own wording.** A place reaches the map only if the published headline or summary named it.
- **Removal covers location.** "Reveals where someone at risk lives" is an explicit ground for takedown in the Terms of Use, and such reports are handled first.

**Planned:** coarsening `local` points to `town` or `area` precision for categories where a victim's home is the likely location, such as domestic violence and sexual offences.

## 5. Takedown

Requests arrive through **Report a problem** on an incident, or by email to [lukip2019@gmail.com](mailto:lukip2019@gmail.com).

1. The maintainer reviews the request by hand and replies within 72 hours. A report that someone is at risk is handled first.
2. `python -m app.takedown <id> --reason "…" --yes` deletes the incident and records its source links in `removed_articles`.
3. Ingestion treats those links as already seen, so the incident is not rebuilt from the same articles while they remain in the outlets' feeds.
4. API caches expire within five minutes. A monthly report that counted the incident is rebuilt and re-imported.

## 6. Reports from the public

Citizen reporting is **not live**. `POST /api/reports` validates the shape of a submission and returns an id, but stores nothing. Unlike the read endpoints, it is not open to other websites' browsers (no cross-origin access).

**Required before launch.** Deckwatch will not store public submissions until all of the following exist, and the Privacy Policy will be updated before launch:

- a moderation queue. Nothing submitted is published before a person has reviewed it;
- contact details, if collected at all, kept separate from the report and never published or returned by the API;
- names, phone numbers and other identifiers removed from report text before publication;
- submitted locations coarsened to place level before publication, under the same rules as §4;
- access to unreviewed submissions restricted to named moderators, with access logged;
- a defined retention period, after which raw submissions are deleted;
- protection for reporters, so that reports cannot be traced back to who sent them;
- a way for a reporter to withdraw a submission.

## 7. Security

- All traffic uses HTTPS (TLS), and hosting providers encrypt stored data at rest.
- The public API is read-only. The only write endpoint (`POST /api/reports`) stores nothing.
- Database credentials, the Anthropic key and the routing key live in the secret stores of GitHub Actions, Render and Vercel. They are never committed, and `.env*` files are gitignored.
- The website reaches the backend only from its server. The backend's address is not exposed to browsers.
- Every push runs the frontend and backend test suites, typechecking and lint in CI (`.github/workflows/ci.yml`).
- **Breach response.** If personal data were affected, the maintainer would notify the Office of the Data Protection Commissioner within 72 hours, as section 43 of the Act requires, and notify affected people without undue delay.
- **Reporting a vulnerability.** Email [lukip2019@gmail.com](mailto:lukip2019@gmail.com) rather than opening a public issue.

## 8. Data subject rights

Under the Data Protection Act, anyone can ask:
- what data concerns them;
- to correct it;
- to delete it;
- to object to its processing.

Requests go to [lukip2019@gmail.com](mailto:lukip2019@gmail.com), and the aim is to respond within seven days. Unresolved complaints can go to the [Office of the Data Protection Commissioner](https://www.odpc.go.ke).

## 9. Children

Deckwatch has no accounts and collects nothing from visitors, so it does not knowingly collect data from children. Incidents involving children are shown as the outlet reported them. A request to remove details that identify a child qualifies for priority handling.
