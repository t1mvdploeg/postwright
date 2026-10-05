// Shared, DOM-free calendar-date helpers (YYYY-MM-DD), separate from
// `web/studio/calendar.js` so that anyone who only needs a date does not drag in the whole
// studio module graph (`recipe.js`, `templates.js`, `brand-check.js`). `calendar.js` passes
// these two functions on to the server and the planning screens; this is the single
// source, not a second implementation.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An existing calendar date YYYY-MM-DD. The pattern alone lets through 2026-13-01 (an
 * invalid Date, and `toISOString` then throws) and 2026-02-30 (silently rolls over to
 * 2 March).
 */
export function realDate(d) {
  if (!DATE.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/**
 * `n` calendar days further (or back), by dates and not by clocks: no shift around
 * daylight saving changes.
 */
export function plusDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const AMSTERDAM_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * FT-26: the Amsterdam calendar day (YYYY-MM-DD) of an ISO timestamp; the list shows that
 * day, so filters use it too.
 */
export function amsterdamDay(iso) {
  return AMSTERDAM_DAY.format(new Date(iso));
}
