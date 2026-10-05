// Building and updating a recipe (the post as the server stores it),
// plus the time helpers for planning and calendar. Pure, so that vitest tests it without a
// browser.
import { template as templateOf, defaultContent, fieldsOf } from "./templates.js";
import { titleFrom } from "./brand-check.js";

const LOCAL_DATE = new Intl.DateTimeFormat("sv-SE");

/** The calendar date (YYYY-MM-DD) on this computer. */
export function localToday(now = new Date()) {
  return LOCAL_DATE.format(now);
}

const LOCAL_CLOCK = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The local clock time of a timestamp as "YYYY-MM-DDTHH:MM:SS". */
function localClock(ms) {
  return LOCAL_CLOCK.format(ms).replace(" ", "T");
}

/**
 * A clock time from a `datetime-local` field ("2026-10-06T08:30") as an ISO timestamp with
 * the local offset ("2026-10-06T08:30:00+02:00" in a zone two hours ahead of UTC). That way
 * the server stores both the intended clock time and the correct moment, even across a
 * daylight saving change.
 */
export function withOffset(local) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  if (!m) return null;
  const wall = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  if (Number.isNaN(wall)) return null;
  const offsetAt = (ms) => Math.round((Date.parse(`${localClock(ms)}Z`) - ms) / 60000);
  let min = offsetAt(wall);
  min = offsetAt(wall - min * 60000);
  const render = min >= 0 ? "+" : "-";
  const p = (n) => String(Math.abs(n)).padStart(2, "0");
  return `${m[1]}T${m[2]}:${m[3]}:00${render}${p(Math.trunc(min / 60))}:${p(min % 60)}`;
}

/** An ISO timestamp back to the value of a `datetime-local` field, in local time. */
export function toLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localClock(d.getTime()).slice(0, 16);
}

/** Date and time readable, in local time: "Tue 6 Oct 2026, 08:30". */
export function readableMoment(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * A new recipe for a template. The formats are those of the template that are switched on
 * in the settings (and otherwise the template's first format).
 */
export function newRecipe(id, { enabledFormats = [], brandVersion = "" } = {}) {
  const s = templateOf(id);
  if (!s) throw new Error(`Unknown template: ${id}`);
  const formats = s.formats.filter((f) => enabledFormats.includes(f));
  const slides = s.kind === "carousel" ? structuredClone(s.defaultSlides) : [];
  const recipe = {
    title: "",
    kind: s.kind,
    template: s.id,
    formats: formats.length ? formats : [s.formats[0]],
    content: s.kind === "carousel" ? {} : defaultContent(s),
    slides,
    caption: {},
    altText: "",
    link: "",
    facts: [],
    campaign: null,
    brandVersion,
  };
  recipe.title = titleFrom(recipe, s);
  return recipe;
}

/**
 * The part of a post that goes to the server on save: only the fields of the schema, only
 * fields that the template (or the slide kind) knows, and no empty captions.
 */
export function toInput(post, s, check) {
  const only = (content, fields) =>
    Object.fromEntries(fields.map((v) => [v.id, String(content?.[v.id] ?? v.defaultValue ?? "")]));
  return {
    title:
      String(post.title ?? "")
        .trim()
        .slice(0, 120) || titleFrom(post, s),
    kind: s.kind,
    template: s.id,
    formats: [...new Set(post.formats)].filter((f) => s.formats.includes(f)),
    content: s.kind === "carousel" ? {} : only(post.content, s.fields),
    slides:
      s.kind === "carousel"
        ? (post.slides ?? []).map((d) => ({ kind: d.kind, content: only(d.content, fieldsOf(s, d.kind)) }))
        : [],
    caption: Object.fromEntries(Object.entries(post.caption ?? {}).filter(([, t]) => String(t ?? "").trim())),
    altText: String(post.altText ?? ""),
    link: String(post.link ?? "").trim(),
    facts: [...new Set(post.facts ?? [])],
    campaign: post.campaign || null,
    brandVersion: post.brandVersion,
    check,
  };
}

/**
 * Moves a slide (`direction` −1 or +1) and returns the new index; outside the list nothing
 * happens.
 */
export function moveSlide(slides, index, direction) {
  const goal = index + direction;
  if (index < 0 || index >= slides.length || goal < 0 || goal >= slides.length) return index;
  const [slide] = slides.splice(index, 1);
  slides.splice(goal, 0, slide);
  return goal;
}

const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

/**
 * Values that fit in `fields`: same id, a choice only as an option, an image only as a
 * media id.
 */
function takeOver(source, fields, goal) {
  for (const v of fields) {
    const w = source?.[v.id];
    if (typeof w !== "string" || !w.trim()) continue;
    if (v.kind === "choice" && !v.options.some((o) => o.value === w)) continue;
    if (v.kind === "media" && !MEDIA_ID.test(w)) continue;
    goal[v.id] = w;
  }
}

/**
 * A post as a new recipe in a different template ("Convert"). To and from a carousel goes
 * via the cover slide. The original is left untouched: everything that goes along is a
 * copy.
 */
export function convert(post, targetId, { enabledFormats = [], brandVersion = "" } = {}) {
  const source = templateOf(post.template);
  const goal = templateOf(targetId);
  if (!source || !goal) throw new Error(`Unknown template: ${source ? targetId : post.template}`);
  const r = newRecipe(targetId, { enabledFormats, brandVersion });
  const values = source.kind === "carousel" ? (post.slides?.[0]?.content ?? {}) : (post.content ?? {});
  if (goal.kind === "carousel") takeOver(values, fieldsOf(goal, r.slides[0].kind), r.slides[0].content);
  else takeOver(values, goal.fields, r.content);
  return Object.assign(r, {
    title: `${post.title} (${goal.name})`.slice(0, 120),
    caption: structuredClone(post.caption ?? {}),
    altText: post.altText ?? "",
    link: post.link ?? "",
    facts: [...(post.facts ?? [])],
    campaign: post.campaign ?? null,
  });
}

/**
 * A new recipe from an idea: the headline in the headline field (on the cover for a
 * carousel), plus facts, campaign and title.
 */
export function ideaToRecipe(idea, { enabledFormats = [], brandVersion = "" } = {}) {
  const r = newRecipe(idea.template, { enabledFormats, brandVersion });
  const s = templateOf(idea.template);
  if (idea.headline) {
    const carousel = s.kind === "carousel";
    const goal = carousel ? r.slides[0]?.content : r.content;
    if (goal && fieldsOf(s, carousel ? r.slides[0]?.kind : null).some((v) => v.id === "headline"))
      goal.headline = idea.headline;
  }
  r.title = String(idea.title ?? "").slice(0, 120) || r.title;
  r.facts = [...(idea.facts ?? [])];
  r.campaign = idea.campaign ?? null;
  return r;
}
