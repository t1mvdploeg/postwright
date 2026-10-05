// The calculation side of the planning: month grid (Monday first), ISO
// week numbers and moving a post to another day with the same clock time. Pure.
import { withOffset, toLocal, localToday } from "./recipe.js";
// `realDate`/`plusDays` live in the shared, DOM-free `web/date.js` (no second
// implementation) and are only passed on here, for routes.ts, ideas.ts and the planning
// screens.
export { realDate, plusDays } from "../date.js";

const p2 = (n) => String(n).padStart(2, "0");

/** YYYY-MM-DD of a local date. */
function day(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * The weeks of a month (month 0–11), each seven days from Monday to Sunday, padded with the
 * days of the previous and next month.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - shift);
  const weeks = [];
  const d = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: day(d), inMonth: d.getMonth() === month });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  } while (d.getMonth() === month);
  return weeks;
}

/** The ISO week number (week 1 contains the first Thursday of the year) of a YYYY-MM-DD. */
export function isoWeek(date) {
  const [j, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(j, m - 1, d));
  const weekday = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - yearStart) / 86400000 + 1) / 7) };
}

/** The local calendar day of a moment. */
export function dayOf(iso) {
  return localToday(new Date(iso));
}

/**
 * How many calendar days the moment `iso` lies before `now`: yesterday
 * at 23:00 is one day ago at 08:00, not zero. Computed on dates via UTC noon, so daylight
 * saving changes shift nothing.
 */
export function daysAgo(iso, now = new Date()) {
  return Math.round((Date.parse(`${localToday(now)}T12:00:00Z`) - Date.parse(`${dayOf(iso)}T12:00:00Z`)) / 86400000);
}

/** Same clock time, different day: for dragging in the month view. */
export function rescheduleToDay(iso, newDay) {
  const time = toLocal(iso).slice(11, 16) || "09:00";
  return withOffset(`${newDay}T${time}`);
}

/** A month forward or back, as { year, month }. */
export function nextMonth(year, month, step) {
  const d = new Date(year, month + step, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * The next `n` ISO weeks from the week of `today` (YYYY-MM-DD), each with its Monday and
 * Sunday. Computes on dates (UTC noon), so daylight saving changes shift nothing.
 */
export function upcomingWeeks(today, n) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weeks = [];
  for (let i = 0; i < n; i++) {
    const monday = d.toISOString().slice(0, 10);
    const sunday = new Date(d.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    weeks.push({ ...isoWeek(monday), monday, sunday });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

/**
 * The period choice in the month view. First click: start. Second click: end (the order
 * does not matter). A click while a full period is already set: start over. With `extend`
 * (shift-click) the existing period grows to this day. The choice is independent of the
 * month shown, so paging between two clicks works.
 */
export function choosePeriod(current, date, { extend = false } = {}) {
  const { from, to } = current;
  if (extend && from) {
    const row = [from, to ?? from, date].sort();
    return { from: row[0], to: row[2] };
  }
  if (from && !to) return date < from ? { from: date, to: from } : { from, to: date };
  return { from: date, to: null };
}

/** Default number of ideas for a period: two per week, at least one, at most twenty. */
export function defaultCount(from, to) {
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  return Math.min(20, Math.max(1, Math.round((days / 7) * 2)));
}

/**
 * The number of workdays (Monday to Friday) from `from` to `to` inclusive; on dates,
 * without a loop over the whole period.
 */
export function workdayCount(from, to) {
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  if (!(days > 0)) return 0;
  const start = new Date(`${from}T12:00:00Z`).getUTCDay();
  let n = Math.floor(days / 7) * 5;
  for (let i = 0; i < days % 7; i++) if ((start + i) % 7 !== 0 && (start + i) % 7 !== 6) n++;
  return n;
}
