// Marketing studio: recognising numbers in a text, for the fact bank (no number in a post
// without a fact with a source). Pure.
//
// Known limit, also explained in the interface: numbers in words ("eight percent") are not
// recognised. The check helps, but does not replace proofreading.

/**
 * A number in English notation to a number: "1,250" → 1250, "62.75" → 62.75.
 * A comma followed by exactly three digits is a thousands separator; the point is the decimal.
 */
function toNumber(text) {
  const n = Number(text.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Digits that end cleanly: "12,50" (comma decimals) is not read as "12" or "50".
const DIGITS = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?!\d|,\d)`;
const START = String.raw`(?<![\d.,])`;
const AMOUNT = new RegExp(
  String.raw`[€$£]\s?${DIGITS}|${START}${DIGITS}\s?(?:EUR|USD|GBP|euros?|dollars?|pounds?)\b`,
  "gi",
);
const PERCENT = /(?<![\d.,])(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi;
// A run of digits with separators. English notation ("1,250.75") is read normally; a version
// or date ("1.2.3", "01.10.2026") is not a claim; everything else ("12,50", "10.000",
// "1,23,456") is a number in some other notation and is reported as "unclear", so the
// brand check fails closed instead of letting it through.
const RUN = /(?<![\p{L}\p{N}.,])\d+(?:[.,]\d+)+(?![\p{L}\p{N}])/gu;
const ENGLISH = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const DOTS = /^\d{1,3}(?:\.\d{3})+$/; // dots as thousands separators: "10.000"
const NOT_A_CLAIM = /^\d+(?:\.\d+){2,}$/;
const NUMBER = /(?<![\p{L}\p{N}.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\p{L}\p{N}]|[.,]\d)/gu;

/**
 * The numbers in a text, normalised: `{ kind, value, text }`. Amounts and percentages always;
 * bare numbers from two digits upwards or with decimals (a lone 1 or 4 is usually just a
 * numeral, not a claim). A number in another notation ("€ 12,50", "10.000") is `kind: "unclear"`
 * with its text as value, so it needs a fact too. Years (1900–2100) without decimals do not
 * count: "from 1 July 2026" is a date, not a claim that needs a source.
 */
export function getNumbers(text) {
  // Strip links first: a UTM link with a post id (p-3fa2c1d0-7731-4821-…) or a date in a
  // path is not a claim. Replacing them with spaces keeps the positions the same.
  const t = String(text ?? "").replace(/\b(?:https?:\/\/|www\.)[^\s<>"]+/gi, (l) => " ".repeat(l.length));
  const out = [];
  const occupied = [];
  const free = (i, j) => !occupied.some(([a, b]) => i < b && a < j);
  for (const m of t.matchAll(RUN)) {
    if (!DOTS.test(m[0]) && (ENGLISH.test(m[0]) || NOT_A_CLAIM.test(m[0]))) continue;
    out.push({ kind: "unclear", value: m[0], text: m[0] });
    occupied.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(AMOUNT)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const integer = m[1] ?? m[3];
    const dec = m[2] ?? m[4];
    const value = toNumber(dec ? `${integer}.${dec}` : integer);
    if (value === null) continue;
    out.push({ kind: "amount", value, text: m[0].trim() });
    occupied.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(PERCENT)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const value = toNumber(m[1]);
    if (value === null) continue;
    out.push({ kind: "percent", value, text: m[0].trim() });
    occupied.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(NUMBER)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const raw = m[1];
    const value = toNumber(raw);
    if (value === null) continue;
    const decimal = raw.includes(".");
    if (!decimal && value < 10) continue;
    if (!decimal && Number.isInteger(value) && value >= 1900 && value <= 2100) continue;
    out.push({ kind: "number", value, text: raw });
  }
  return out;
}

/**
 * The numbers from `text` that are in none of the `facts`. Compares by value, not by
 * notation: "€ 62.75" in the fact covers "62.75 per hour" in the post.
 */
export function uncoveredNumbers(text, facts) {
  const covered = new Set(facts.flatMap((f) => getNumbers(f.text).map((g) => g.value)));
  return getNumbers(text).filter((g) => !covered.has(g.value));
}
