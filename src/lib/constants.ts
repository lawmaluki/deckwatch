/** Shared time-unit constants so duration math is consistent across the app. */
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** How often live views re-read incidents. Shared so the client poller and the
 * server-rendered dashboard can't drift into different ideas of "live". */
export const POLL_INTERVAL_MS = 60_000;
