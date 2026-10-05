// Marketing studio: the brand check. Automates the checklist for a post plus what the
// studio itself knows: limits per channel, facts, alt text, UTM. Pure; the overflow
// measurement (which needs a real browser) comes in as input.
//
// "error" stops a post at Scheduled (the server then refuses); "attention" stops nothing;
// "ok" is a confirmation the panel shows so that you can see what was checked.
import { countEmphasis, fieldsOf, withoutEmphasis } from "./templates.js";
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
 * All texts of a post with their location: the fields (per slide for a carousel), the
 * captions and the alt text. The choice fields and media ids do not count: that is not text
 * anyone reads.
 */
export function textsOf(post, s) {
  const off = [];
  const fields = (list, content, slide) => {
    for (const v of list) {
      if (v.kind === "choice" || v.kind === "media") continue;
      const text = content?.[v.id] ?? v.defaultValue ?? "";
      if (String(text).trim())
        off.push({
          where: slide === null ? v.label : `Slide ${slide + 1}, ${v.label.toLowerCase()}`,
          field: v.id,
          slide,
          text: String(text),
        });
    }
  };
  if (s.kind === "carousel") {
    (post.slides ?? []).forEach((d, i) => fields(fieldsOf(s, d.kind), d.content, i));
  } else fields(s.fields, post.content, null);
  for (const [channel, text] of Object.entries(post.caption ?? {})) {
    if (String(text ?? "").trim())
      off.push({
        where: `Caption ${CHANNEL_RULES[channel]?.name ?? channel}`,
        field: null,
        slide: null,
        channel,
        text: String(text),
      });
  }
  if (String(post.altText ?? "").trim())
    off.push({ where: "Alt-text", field: "altText", slide: null, text: post.altText });
  return off;
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
 *   post: { template: string, formats: string[], content: Record<string,string>, slides?: Array<{kind:string, content:Record<string,string>}>, caption?: Record<string,string>, altText?: string, link?: string, facts?: string[], brandVersion?: string },
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
  const fieldSets =
    s.kind === "carousel"
      ? (post.slides ?? []).map((d, i) => ({ fields: fieldsOf(s, d.kind), content: d.content ?? {}, slide: i }))
      : [{ fields: s.fields, content: post.content ?? {}, slide: null }];
  let emphasisOk = true;
  for (const { fields, content, slide } of fieldSets) {
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
    else add("ok", "contrast", `Contrast on ${ground}: ${String(c.ratio).replace(".", ",")}:1`);
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
        add("error", "fact-remove", "A linked fact no longer exists; unlink it");
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
          ? `${where}: ${o.field} touches ${o.with ?? "another text block"}`
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
