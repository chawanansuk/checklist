/**
 * Recurrence engine.
 *
 * All calendar math is done on Bangkok wall-clock dates, then each occurrence
 * is converted to a UTC instant for storage. See lib/tz.ts.
 */
import { bangkokDateTimeToUtc, toBangkok } from "./tz";
import type { RecurFreq, TaskTemplate } from "./types";

interface CalDate {
  y: number;
  m: number; // 1-based
  d: number;
}

function daysInMonth(y: number, m: number): number {
  // m is 1-based; day 0 of next month = last day of this month.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDay(y: number, m: number, d: number): number {
  return Math.min(d, daysInMonth(y, m));
}

function parseAnchor(anchor: string): CalDate {
  const [y, m, d] = anchor.split("-").map((n) => parseInt(n, 10));
  return { y, m, d };
}

/** Whole days between two calendar dates (b - a). */
function dayDiff(a: CalDate, b: CalDate): number {
  const ta = Date.UTC(a.y, a.m - 1, a.d);
  const tb = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((tb - ta) / 86_400_000);
}

/** JS weekday (0=Sun..6=Sat) for a calendar date. */
function jsWeekday(c: CalDate): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
}

/** Shift a date back to the Monday of its week. */
function mondayOf(c: CalDate): CalDate {
  const wd = jsWeekday(c); // 0=Sun..6=Sat
  const backToMonday = (wd + 6) % 7; // Sun->6, Mon->0, ...
  const t = Date.UTC(c.y, c.m - 1, c.d) - backToMonday * 86_400_000;
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Convert app weekday (0=Mon..6=Sun) to JS weekday (0=Sun..6=Sat). */
function appWeekdayToJs(w: number): number {
  return (w + 1) % 7;
}

function monthsBetween(a: CalDate, b: CalDate): number {
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/** Does calendar date `c` match the template's recurrence rule (ignoring time)? */
function matches(c: CalDate, tpl: TaskTemplate, anchor: CalDate): boolean {
  const interval = Math.max(1, tpl.interval || 1);
  switch (tpl.freq) {
    case "once":
      return c.y === anchor.y && c.m === anchor.m && c.d === anchor.d;
    case "daily": {
      const diff = dayDiff(anchor, c);
      return diff >= 0 && diff % interval === 0;
    }
    case "weekly": {
      const weekdays =
        tpl.byweekday && tpl.byweekday.length
          ? tpl.byweekday.map(appWeekdayToJs)
          : [jsWeekday(anchor)];
      if (!weekdays.includes(jsWeekday(c))) return false;
      const weeksDiff = Math.round(dayDiff(mondayOf(anchor), mondayOf(c)) / 7);
      return weeksDiff >= 0 && weeksDiff % interval === 0;
    }
    case "monthly":
    case "quarterly": {
      const effInterval = tpl.freq === "quarterly" ? interval * 3 : interval;
      const target = tpl.bymonthday ?? anchor.d;
      if (c.d !== clampDay(c.y, c.m, target)) return false;
      const md = monthsBetween(anchor, c);
      return md >= 0 && md % effInterval === 0;
    }
    case "yearly": {
      const targetMonth = tpl.month ?? anchor.m;
      const targetDay = tpl.bymonthday ?? anchor.d;
      if (c.m !== targetMonth) return false;
      if (c.d !== clampDay(c.y, targetMonth, targetDay)) return false;
      const yd = c.y - anchor.y;
      return yd >= 0 && yd % interval === 0;
    }
    default:
      return false;
  }
}

/**
 * Return due-date instants (UTC) for a FIXED-basis template that fall on or
 * after `from` and within `horizonDays`. Occurrences are matched on the
 * Bangkok calendar and include the whole day of `from` (so a task due at 09:00
 * today is still returned at 14:00).
 */
export function nextDueDates(
  tpl: TaskTemplate,
  from: Date,
  horizonDays: number,
): Date[] {
  if (tpl.schedule_basis === "from_completion") return [];
  const anchor = parseAnchor(tpl.anchor_date);
  const startBkk = toBangkok(from);
  const start: CalDate = {
    y: startBkk.getFullYear(),
    m: startBkk.getMonth() + 1,
    d: startBkk.getDate(),
  };
  const results: Date[] = [];
  const totalDays = Math.max(1, Math.ceil(horizonDays));
  let cursorMs = Date.UTC(start.y, start.m - 1, start.d);
  for (let i = 0; i <= totalDays; i++) {
    const cd = new Date(cursorMs);
    const c: CalDate = {
      y: cd.getUTCFullYear(),
      m: cd.getUTCMonth() + 1,
      d: cd.getUTCDate(),
    };
    if (matches(c, tpl, anchor)) {
      results.push(bangkokDateTimeToUtc(c.y, c.m, c.d, tpl.time_of_day));
    }
    cursorMs += 86_400_000;
    if (tpl.freq === "once" && results.length) break;
  }
  return results;
}

const FREQ_TO_MONTHS: Partial<Record<RecurFreq, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/**
 * For `from_completion` templates: given the instant a task was completed,
 * compute the next due instant = completed_at + interval (unit per freq),
 * anchored to the template's time_of_day in Bangkok.
 */
export function nextDueFromCompletion(
  tpl: TaskTemplate,
  completedAt: Date,
): Date {
  const interval = Math.max(1, tpl.interval || 1);
  const bkk = toBangkok(completedAt);
  let y = bkk.getFullYear();
  let m = bkk.getMonth() + 1; // 1-based
  let d = bkk.getDate();

  if (tpl.freq === "daily") {
    const t = Date.UTC(y, m - 1, d) + interval * 86_400_000;
    const nd = new Date(t);
    return bangkokDateTimeToUtc(
      nd.getUTCFullYear(),
      nd.getUTCMonth() + 1,
      nd.getUTCDate(),
      tpl.time_of_day,
    );
  }
  if (tpl.freq === "weekly") {
    const t = Date.UTC(y, m - 1, d) + interval * 7 * 86_400_000;
    const nd = new Date(t);
    return bangkokDateTimeToUtc(
      nd.getUTCFullYear(),
      nd.getUTCMonth() + 1,
      nd.getUTCDate(),
      tpl.time_of_day,
    );
  }

  const monthsPerUnit = FREQ_TO_MONTHS[tpl.freq] ?? 1;
  const addMonths = monthsPerUnit * interval;
  const total = (y * 12 + (m - 1)) + addMonths;
  y = Math.floor(total / 12);
  m = (total % 12) + 1;
  d = clampDay(y, m, d);
  return bangkokDateTimeToUtc(y, m, d, tpl.time_of_day);
}
