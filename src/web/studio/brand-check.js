// The brand check. Automates the checklist for a post plus what the
// studio itself knows: limits per channel, facts, alt text, UTM. Pure; the overflow
// measurement (which needs a real browser) comes in as input.
//
// "error" stops a post at Scheduled (the server then refuses); "attention" stops nothing;
// "ok" is a confirmation the panel shows so that you can see what was checked.
import { countEmphasis, fieldsOf, template as templateOf, withoutEmphasis } from "./templates.js";
import { pagesOf } from "./slides.js";
import { checkCaption, CHANNEL_RULES } from "./caption.js";
import { uncoveredNumbers } from "./numbers.js";
import { contrastOn } from "./color.js";
import { format } from "./formats.js";

const WORD_BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}])";
const WORD_BOUNDARY_AFTER = "(?![\\p{L}\\p{N}])";

function escapeRegex(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a word or phrase occurs as a whole in a text (case-insensitive). */
export function containsWord(text, word) {
  const w = String(word ?? "").trim();
  if (!w) return false;
  const before = /^[\p{L}\p{N}]/u.test(w) ? WORD_BOUNDARY_BEFORE : "";
  const after = /[\p{L}\p{N}]$/u.test(w) ? WORD_BOUNDARY_AFTER : "";
  return new RegExp(`${before}${escapeRegex(w)}${after}`, "iu").test(String(text ?? ""));
}

/**
 * The fields of a post per slide: `{ fields, content, slide, missing }`. `slide` is the index,
 * or null for a post that is one image (its findings then read as before). A slide whose own
 * template no longer exists has no fields and `missing: true`.
 */
function fieldSetsOf(post, s) {
  if (s.kind === "carousel")
    return (post.slides ?? []).map((d, i) => ({
      fields: fieldsOf(s, d.kind),
      content: d.content ?? {},
      slide: i,
      missing: false,
    }));
  const pages = pagesOf(post);
  return pages.map((p, i) => {
    const t = i === 0 ? s : templateOf(p.template);
    return { fields: t?.fields ?? [], content: p.content ?? {}, slide: pages.length > 1 ? i : null, missing: !t };
  });
}

/**
 * All texts of a post with their location: the fields (per slide when a post has more than one), the
 * captions and the alt text. The choice fields and media ids do not count: that is not text
 * anyone reads.
 */
export function textsOf(post, s) {
  const out = [];
  const fields = (list, content, slide) => {
    for (const v of list) {
      if (v.kind === "choice" || v.kind === "media") continue;
      const text = content?.[v.id] ?? v.defaultValue ?? "";
      if (String(text).trim())
        out.push({
          where: slide === null ? v.label : `Slide ${slide + 1}, ${v.label.toLowerCase()}`,
          field: v.id,
          slide,
          text: String(text),
        });
    }
  };
  for (const set of fieldSetsOf(post, s)) fields(set.fields, set.content, set.slide);
  for (const [channel, text] of Object.entries(post.caption ?? {})) {
    if (String(text ?? "").trim())
      out.push({
        where: `Caption ${CHANNEL_RULES[channel]?.name ?? channel}`,
        field: null,
        slide: null,
        channel,
        text: String(text),
      });
  }
  if (String(post.altText ?? "").trim())
    out.push({ where: "Alt-text", field: "altText", slide: null, text: post.altText });
  return out;
}

/**
 * Whether a fact is usable on `today` (YYYY-MM-DD): active and not expired. A fact that
 * only takes effect later ("from 1 January the price rises to …") is allowed: the
 * announcement is correct now. Same rule as `factUnusable` in src/server/routes.ts.
 */
export function factUsable(f, today) {
  return f.status === "active" && (!f.validUntil || f.validUntil >= today);
}

/**
 * @param {{
 *   post: { template: string, formats: string[], content: Record<string,string>, slides?: Array<{kind:string, content:Record<string,string>}>, moreSlides?: Array<{template:string, content:Record<string,string>}>, caption?: Record<string,string>, altText?: string, link?: string, facts?: string[], brandVersion?: string },
 *   template: object,
 *   settings: { channels: string[], bannedWords: string[] },
 *   facts?: Array<{ id: string, text: string, kind?: string, status: string, validFrom: string|null, validUntil: string|null }> | null,
 *   today: string,
 *   brandVersion?: string,
 *   brand?: { grounds } | null,   // the brand whose contrast is checked; without a brand there is no contrast check
 *   overflow?: Array<{ format: string, slide?: number|null, field: string, kind: string }>,
 * }} input
 * @returns {{ findings: Array<{ level: "error"|"attention"|"ok", code: string, text: string, field?: string|null, slide?: number|null, channel?: string }>, errors: number, attention: number }}
 */
export function runCheck({
  post,
  template: s,
  settings,
  facts = null,
  today,
  brandVersion = null,
  brand = null,
  overflow = [],
}) {
  const b = [];
  const add = (level, code, text, extra = {}) => b.push({ level, code, text, ...extra });

  if (!post.formats?.length) add("error", "no-format", "Choose at least one format");

  // Fields: required, length, emphasis.
  const fieldSets = fieldSetsOf(post, s);
  let emphasisOk = true;
  for (const { fields, content, slide, missing } of fieldSets) {
    if (missing) {
      add("error", "missing-template", `Slide ${slide + 1}: its template no longer exists; delete this slide`, {
        slide,
      });
      continue;
    }
    const position = (v) => (slide === null ? v.label : `Slide ${slide + 1}: ${v.label.toLowerCase()}`);
    for (const v of fields) {
      const value = String(content[v.id] ?? v.defaultValue ?? "");
      if (v.required && !value.trim()) {
        add(
          "error",
          "required",
          v.kind === "media" ? `Choose a ${v.label.toLowerCase()}` : `Fill in ${position(v).toLowerCase()} first`,
          { field: v.id, slide },
        );
        continue;
      }
      if (v.max && value.length > v.max)
        add("error", "too-long", `${position(v)} is ${value.length} characters; at most ${v.max}`, {
          field: v.id,
          slide,
        });
      if (v.emphasis === "exactly-one" && value.trim()) {
        const n = countEmphasis(value);
        if (n !== 1) {
          emphasisOk = false;
          add(
            "error",
            "emphasis",
            n === 0
              ? `${position(v)}: put one phrase between *asterisks* for the accent colour`
              : `${position(v)}: exactly one coloured phrase, now ${n}`,
            { field: v.id, slide },
          );
        }
      }
    }
  }
  if (emphasisOk) add("ok", "emphasis", "Exactly one coloured phrase per headline");

  // Carousel: number of slides and the cover first.
  if (s.kind === "carousel") {
    const slides = post.slides ?? [];
    if (slides.length < 2) add("error", "too-few-slides", "A carousel has at least two slides");
    if (slides.length > (s.maxSlides ?? 20)) add("error", "too-many-slides", `At most ${s.maxSlides ?? 20} slides`);
    if (slides.length && slides[0].kind !== "cover") add("attention", "no-cover", "The first slide is not a cover");
  }

  // Texts: exclamation marks and banned words.
  const snippets = textsOf(post, s);
  for (const t of snippets) {
    if (t.text.includes("!"))
      add("attention", "exclamation", `${t.where}: an exclamation mark. The tone is plain and calm`, {
        field: t.field,
        slide: t.slide,
        channel: t.channel,
      });
    for (const w of settings.bannedWords ?? []) {
      if (containsWord(t.text, w))
        add("attention", "banned-word", `${t.where}: "${w}" is on the banned words list`, {
          field: t.field,
          slide: t.slide,
          channel: t.channel,
        });
    }
  }

  // Contrast on the chosen ground(s).
  const grounds = new Set(
    fieldSets.map((v) => v.content.ground ?? v.fields.find((x) => x.id === "ground")?.defaultValue).filter(Boolean),
  );
  for (const ground of brand ? grounds : []) {
    const c = contrastOn(brand, ground);
    if (!c) continue;
    if (c.ratio < c.threshold)
      add("error", "contrast", `Contrast of the text on ${ground} is ${c.ratio}:1; minimum ${c.threshold}:1`);
    else add("ok", "contrast", `Contrast on ${ground}: ${c.ratio}:1`);
  }

  // Caption per active channel, link and alt text.
  for (const channel of settings.channels ?? []) {
    for (const r of checkCaption(channel, post.caption?.[channel])) b.push(r);
  }
  if (!String(post.altText ?? "").trim())
    add("attention", "alt-text", "No alt text yet: a short description of the image for people who cannot see it", {
      field: "altText",
    });

  // Facts: linked facts must be usable, and every number must appear in such a fact. Without
  // a facts list that check has not been done; the check then fails closed instead of
  // opening the gate to Scheduled with "0 errors".
  if (!facts) {
    add(
      "error",
      "facts-unknown",
      "The fact bank could not be loaded, so the numbers were not checked. Reload the page",
    );
  } else {
    const byId = new Map(facts.map((f) => [f.id, f]));
    const linked = [];
    for (const id of post.facts ?? []) {
      const f = byId.get(id);
      if (!f) {
        add("error", "fact-missing", "A linked fact no longer exists; unlink it");
        continue;
      }
      if (!factUsable(f, today)) {
        const reason =
          f.status === "draft" ? "is still a draft" : f.status === "withdrawn" ? "is withdrawn" : "is expired";
        add(
          "error",
          "fact-unusable",
          `The fact "${f.text.length > 50 ? `${f.text.slice(0, 47)}…` : f.text}" ${reason}`,
        );
        continue;
      }
      linked.push(f);
    }
    const reported = new Set();
    for (const t of snippets) {
      for (const g of uncoveredNumbers(t.text, linked)) {
        if (reported.has(g.value)) continue;
        reported.add(g.value);
        add("error", "number-without-fact", `${t.where}: "${g.text}" is in no linked, active fact`, {
          field: t.field,
          slide: t.slide,
          channel: t.channel,
        });
      }
    }
    if (!reported.size && snippets.length)
      add("ok", "facts", linked.length ? "Every number is in a linked fact" : "No numbers that need a source");
  }

  // Overflow, measured in the real image.
  for (const o of overflow) {
    const f = format(o.format);
    const where = `${f.name}${o.slide !== null && o.slide !== undefined ? `, slide ${o.slide + 1}` : ""}`;
    const text =
      o.kind === "safe-zone"
        ? `${where}: ${o.field} is in the zone of the ${o.reason ?? "platform controls"}`
        : o.kind === "overlap"
          ? `${where}: ${o.field} overlaps ${o.with ?? "another text block"}`
          : `${where}: ${o.field} runs outside the image`;
    add("error", "overflow", text, { field: o.fieldId ?? null, slide: o.slide ?? null });
  }

  if (brandVersion && post.brandVersion && post.brandVersion !== brandVersion) {
    add(
      "attention",
      "brand-version",
      `Created with brand version ${post.brandVersion}; the studio now uses ${brandVersion}. Look at the image again`,
    );
  }

  const order = { error: 0, attention: 1, ok: 2 };
  b.sort((x, y) => order[x.level] - order[y.level]);
  return {
    findings: b,
    errors: b.filter((x) => x.level === "error").length,
    attention: b.filter((x) => x.level === "attention").length,
  };
}

/** A short, readable title for a post without a title: the headline without asterisks. */
export function titleFrom(post, s) {
  const source = s.kind === "carousel" ? post.slides?.[0]?.content?.headline : post.content?.headline;
  return (
    withoutEmphasis(source ?? s.name)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || s.name
  );
}
