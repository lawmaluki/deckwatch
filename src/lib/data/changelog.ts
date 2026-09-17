export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  /** ISO date the change reached production. */
  date: string;
  title: string;
  kind: ChangeKind;
  /** Part of the product this touches. Omitted where it touches everything. */
  area?: string;
  body: string;
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  new: "NEW",
  improved: "IMPROVED",
  fixed: "FIXED",
};

export const CHANGE_KIND_COLOR: Record<ChangeKind, string> = {
  new: "var(--brand)",
  improved: "var(--muted)",
  fixed: "var(--medium)",
};

/** Newest first. Only changes a reader could notice — plumbing, deploy and
 * build work stays in the commit history where it belongs. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-09-17",
    kind: "new",
    area: "Alerts",
    title: "Alerts that actually reach you",
    body: "Subscribing to counties and categories now does something. When a matching incident arrives you get an alert in the app, and on your desktop too if you allow it — so it reaches you even when Deckwatch isn't the tab you're looking at. Alerts land within a minute of an incident being ingested, and only for incidents that arrive while you're here: opening the site won't replay everything already on the map. You can also ask to hear about anything within a set distance of where you are, whichever county it falls in.",
  },
  {
    date: "2026-09-17",
    kind: "improved",
    area: "Dashboard",
    title: "The dashboard is a way into the map",
    body: "Every figure on the National Dashboard is now a way through to what it describes. Press a stat card, a bar in the category breakdown, or a recent incident, and the map opens showing exactly that. The dashboard also keeps pace while you leave it open, rather than freezing at the moment you arrived.",
  },
  {
    date: "2026-09-17",
    kind: "improved",
    area: "Map",
    title: "The map opens on the whole country",
    body: "The map used to open at one fixed zoom, which left Kenya marooned in empty space on a large screen and running off the edges on a phone. It now sizes itself to your window, so you start with the whole country in view whatever you are on.",
  },
  {
    date: "2026-09-17",
    kind: "improved",
    title: "Faster moving between pages",
    body: "Switching between the map, the dashboard and counties no longer waits on a fresh round trip to the API each time. Pages also draw their layout straight away instead of appearing to hang on the page you just left.",
  },
  {
    date: "2026-09-14",
    kind: "improved",
    area: "Intel Feed",
    title: "Read an incident without losing the feed",
    body: "Opening an incident from the Intel Feed now keeps the feed open beside it on a wide screen, with the one you are reading marked in the list, so following a run of related reports no longer means reopening the feed and hunting for your place. The map stays fully interactive while both panels are open — pan, zoom and click other markers without closing anything.",
  },
  {
    date: "2026-09-14",
    kind: "fixed",
    area: "Map",
    title: "The map takes you to the incident you opened",
    body: "Selecting an incident now always moves the map to it, and puts it in the part of the map you can actually see rather than behind an open panel. Before this, opening an incident the map's filters happened to exclude moved nothing at all.",
  },
  {
    date: "2026-09-14",
    kind: "improved",
    area: "Incidents",
    title: "Sources you can read at a glance",
    body: "An incident's sources are now shown three at a time with the rest one tap away. Most incidents carry more than two and some carry eight, so the list routinely ran longer than the report it belonged to. Each source is a single tap through to the article it came from.",
  },
  {
    date: "2026-09-14",
    kind: "fixed",
    area: "Incidents",
    title: "Summaries in plain text",
    body: "Summaries drawn from news feeds sometimes arrived with raw markup left in — stray tags and character codes in the middle of a sentence, occasionally a half-finished link. They are cleaned now before they reach you.",
  },
  {
    date: "2026-09-14",
    kind: "fixed",
    area: "Mobile",
    title: "Built for a phone",
    body: "Several panels sat underneath the bottom navigation on small screens, hiding their last few rows. Opening an incident on a phone also left the map buried under two stacked panels, so the one thing you were looking for was the one thing you could not see. Both fixed.",
  },
  {
    date: "2026-08-20",
    kind: "fixed",
    area: "Incidents",
    title: "Unrelated stories stay separate",
    body: "Ingestion was merging distinct events that happened to share a place and a category, and re-merging the same article on every run — which quietly inflated the number of reports shown against some incidents. Each event stands on its own again.",
  },
  {
    date: "2026-08-20",
    kind: "fixed",
    title: "Similar incidents nearby means real ones",
    body: "The list of similar incidents near an event could put sample data alongside genuine reporting. It now draws only on real incidents.",
  },
  {
    date: "2026-08-20",
    kind: "improved",
    title: "Newest first",
    body: "Incidents are ordered by when they were reported rather than the order they happened to be stored in, so the top of a list is the most recent thing that happened.",
  },
  {
    date: "2026-08-18",
    kind: "improved",
    area: "Verification",
    title: "Confidence that tracks the reporting",
    body: "Confidence is calibrated against how Kenyan media actually works. Mastheads under one owner — Nation Africa, NTV, Business Daily and Nairobi News share a newsroom, as do The Standard and KTN — now count once between them rather than as separate confirmations, because one newsroom's copy in two places is not two people checking. Outlets that mostly republish other newsrooms' reporting count for less than those doing the reporting.",
  },
  {
    date: "2026-08-18",
    kind: "new",
    area: "Sources",
    title: "Nine more Kenyan newsrooms",
    body: "Ingestion now reads 13 Kenyan outlets, up from four — among them Citizen Digital, Nation Africa, KBC, Capital FM and Business Daily.",
  },
  {
    date: "2026-08-18",
    kind: "fixed",
    area: "Incidents",
    title: "Real dates on real incidents",
    body: "Incidents drawn from news reporting carry the article's own publish time, so the date you see matches the source you can go and check for yourself.",
  },
];
