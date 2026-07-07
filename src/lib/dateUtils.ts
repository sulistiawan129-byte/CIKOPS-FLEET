/**
 * Formats a local Date as YYYY-MM-DD WITHOUT going through UTC.
 *
 * `.toISOString()` converts to UTC first, which silently shifts the
 * calendar date backward by a day for any timezone ahead of UTC — e.g.
 * WIB (Indonesia, UTC+7): for roughly 7 hours every day (midnight to
 * 7am local time), `new Date().toISOString().split("T")[0]` still
 * reports YESTERDAY's date, because UTC hasn't crossed midnight yet.
 *
 * This bug was found in several places during a pre-deployment audit —
 * most seriously in getDriverTasksToday(), where it could make a
 * driver's "Today" task list appear empty right when they start their
 * morning shift. Always use this helper instead of
 * `date.toISOString().slice(0, 10)` / `.split("T")[0]` for any value
 * that represents a calendar date (not a precise timestamp).
 *
 * Timestamps (submitted_at, created_at, etc.) are NOT affected by this
 * bug and should keep using plain `.toISOString()` — they store an
 * exact instant, not a "which calendar day" concept.
 */
export function toLocalISODate(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

/** Today's date as YYYY-MM-DD, in the browser/server's local timezone. */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}
