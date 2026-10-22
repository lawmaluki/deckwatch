/** Shared time-unit constants so duration math is consistent across the app. */
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** How often live views re-read incidents. Shared so the client poller and the
 * server-rendered dashboard can't drift into different ideas of "live".
 *
 * Five minutes, not one: ingestion only writes hourly and the API
 * serves incident lists from a 5-minute cache, so polling faster re-downloads
 * the same data — and every read of it is billed as database egress. */
export const POLL_INTERVAL_MS = 5 * MS_PER_MINUTE;

/** How many Kenyan news and official sources ingestion reads: the length of
 * FEEDS in backend/app/ingest/sources.py. Quoted on the share image, in the
 * site description, on the API page and on Why Deckwatch. A backend test
 * (tests/test_ingest.py) fails if the two disagree. */
export const NEWS_SOURCE_COUNT = 21;
