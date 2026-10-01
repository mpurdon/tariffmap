/** The weekly curation check's timing, shared by the header and the how-it-works status panel. */

/** Past this many days since the last completed check, the data is flagged as overdue. */
export const STALE_DAYS = 9;

/** The routine runs Mondays at 12:00 UTC. */
const CHECK_DAY = 1;
const CHECK_HOUR_UTC = 12;

const DAY_MS = 86_400_000;

/** Whole days from an ISO date to now (0 = today, UTC). */
export function daysSince(iso: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - Date.parse(iso)) / DAY_MS);
}

export const isStale = (iso: string, now = new Date()) => daysSince(iso, now) > STALE_DAYS;

/** The next scheduled check after `now`. */
export function nextCheck(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CHECK_HOUR_UTC));
  d.setUTCDate(d.getUTCDate() + ((CHECK_DAY - d.getUTCDay() + 7) % 7));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}
