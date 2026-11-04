# Governance

Covers who runs Deckwatch Kenya, the principles it is built on, how decisions are made, and how anyone can hold it to them.

## 1. Purpose

Deckwatch gives people in Kenya one place to see what public safety incidents have been reported, where, and how well corroborated each one is. It supports UN Sustainable Development Goals 11 (safe, resilient communities) and 16 (access to information). It is a **public information tool, not an emergency or law enforcement service**.

## 2. Ownership and roles

| Role | Who | Responsibilities |
|---|---|---|
| Owner and maintainer | Lawrence Maluki (Kenya) | Code, infrastructure, data quality, editorial review of monthly reports, corrections and takedowns |
| Data controller (Kenya Data Protection Act) | The maintainer | Privacy requests, breach notification |
| Contributors | Anyone, through GitHub | Code, feeds, labels and documentation, under the MIT licence |

Contact for all roles: [lukip2019@gmail.com](mailto:lukip2019@gmail.com).

The code is MIT-licensed ([LICENSE](../LICENSE)). Copyright in the news content Deckwatch links to stays with its publishers.

## 3. Principles

1. **Do no harm.** If publishing something could put a person at risk, protecting the person comes first. Requests reporting danger are handled before any other work. See [privacy-and-safety.md](privacy-and-safety.md).
2. **Corroboration, not truth.** Deckwatch measures how independently an incident is reported. It never claims an incident is true or false. Labels say exactly that, on the site and in the API.
3. **Show the sources.** Every incident links to every article behind it, so any reader can check, and publishers remain accountable for what they published.
4. **Collect the minimum.** There are no accounts and no visitor profiles, and settings and location stay on the device. A feature that would collect personal data needs the privacy review in §5 before it ships.
5. **Be honest about limits.** Coverage follows newsrooms, locations are often approximate, and automated classification makes mistakes. The site, the API documentation and the monthly reports say so wherever the numbers appear.
6. **Human judgement for editorial output.** A monthly report is marked `editorial` only after a person has reviewed it, and a reviewed report takes precedence over an automatic one. Automated outputs are labelled as automated.
7. **AI is optional and accountable.** The default pipeline is a deterministic rule classifier that anyone can read. AI models may assist with classification and summaries, but their output is labelled, measured against hand labels, and never the only basis for calling an incident verified.
8. **Open by default.** The code, the feed list, the classification rules, the scoring weights, the evaluation labels and this documentation are public. A change to any of them is a public commit.
9. **Independent.** Deckwatch carries no advertising and sells no data. Funding or partnerships will be listed in the README, and none will change how incidents are scored or shown.

## 4. Decisions and changes

- Changes go through a `dev` branch, with its own database and preview site. Changes merge to `main` only after the test suites pass in CI.
- Changes to **what data is collected, how it is scored, or how long it is kept** are made in the same commit as the matching update to the [Privacy Policy](https://deckwatch.vercel.app/privacy), the [Terms of Use](https://deckwatch.vercel.app/terms) or these documents. Each policy page shows its last-updated date, and its full history is in git.
- Classifier changes are compared against the hand-labelled evaluation set (`backend/eval/labels.csv`) before they are adopted.
- User-visible changes are announced on [What's new](https://deckwatch.vercel.app/whats-new).

## 5. Privacy review for new features

A feature that would collect, store or publish personal data, or publish more precise locations, needs a written privacy review before it ships. The review answers:
- what is collected and why;
- who can see it;
- how long it is kept;
- how it is removed;
- what could go wrong for the people involved.

Citizen reporting is the main example. Its required safeguards are already listed in [privacy-and-safety.md §6](privacy-and-safety.md#6-reports-from-the-public), and it will not launch without them.

## 6. Accountability

- **Corrections and takedowns:** use **Report a problem** on any incident, or email. Every request is reviewed by hand, with a reply within 72 hours, and reports of danger are handled first. See [data-governance.md §6](data-governance.md#6-corrections-and-removal).
- **Privacy rights:** access, correction, deletion and objection under the Data Protection Act. The aim is to reply within seven days. Unresolved complaints can go to the [Office of the Data Protection Commissioner](https://www.odpc.go.ke).
- **Security issues:** report them privately by email, not in a public issue.
- **Bugs and suggestions:** open an issue on [GitHub](https://github.com/lawmaluki/deckwatch/issues).

## 7. Contributing

Contributions are welcome under the MIT licence. Before opening a pull request:
- run the checks in [deployment.md](deployment.md#1-run-locally);
- keep changes to data handling paired with the policy updates in §4;
- for a new news feed, include the outlet's owner group in `verification.py`, so corroboration stays honest.

Contributors are expected to be respectful and constructive. Harassment of anyone, including people named in incidents, is not tolerated, and the maintainer may remove comments or block accounts that break this.

## 8. Continuity

All code, configuration and documentation are public, and every hosted service has a documented replacement ([architecture.md §5](architecture.md#5-dependencies-and-replaceability)). If the maintainer could no longer run Deckwatch, anyone could deploy it again from this repository by following [deployment.md](deployment.md).

**Planned:** naming a second maintainer with access to the production accounts.
