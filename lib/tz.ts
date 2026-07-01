/**
 * Timezone helpers.
 *
 * Rule of the system: everything is stored as `timestamptz` (UTC) in the
 * database, but every calculation and display happens in Asia/Bangkok.
 */
import { format as fnsFormat } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TZ = "Asia/Bangkok";

/** Wall-clock time in Bangkok, expressed as a Date whose fields are Bangkok-local. */
export function toBangkok(instant: Date): Date {
  return toZonedTime(instant, APP_TZ);
}

/** Convert a Bangkok wall-clock Date back into a UTC instant. */
export function fromBangkok(wallClock: Date): Date {
  return fromZonedTime(wallClock, APP_TZ);
}

/**
 * Build a UTC instant from Bangkok-local calendar parts.
 * `month` is 1-based (1 = January). `time` is "HH:mm" or "HH:mm:ss".
 */
export function bangkokDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  time: string,
): Date {
  const [h, m, s] = time.split(":").map((n) => parseInt(n, 10));
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m || 0)}:${pad(
    s || 0,
  )}`;
  return fromZonedTime(iso, APP_TZ);
}

/** Format an instant in Bangkok time using a date-fns pattern. */
export function formatBangkok(instant: Date, pattern: string): string {
  return fnsFormat(toBangkok(instant), pattern);
}
