// Marketing studio: the template engine. From a recipe (template + fields + format) to an
// HTML fragment plus CSS that the preview iframe and the export (foreignObject → canvas)
// both use literally as is: what you see is what you download.
//
// Pure: no DOM and no fetch. The brand (colours, logos as data URIs, the font) comes in as
// an argument; in the browser `brand.js` loads it, in the tests it comes from disk.
//
// All escaping happens here, in `escapeHtml` and `withEmphasis`. A template gets its fields
// only through `c.t()` (text with emphasis) and `c.e()` (plain text) and never puts raw
// input in the markup itself; tests/templates.test.ts tries injection for every template
// and every field.
import { format as formatOf, shapeOf } from "./formats.js";
import { BASE_CSS } from "./template-css.js";
import statement from "./templates/statement.js";
import question from "./templates/question.js";
import steps from "./templates/steps.js";
import productImage from "./templates/product-image.js";
import statistic from "./templates/statistic.js";
import linkPreview from "./templates/link-preview.js";
import profileBanner from "./templates/profile-banner.js";
import companyCover from "./templates/company-cover.js";
import carousel from "./templates/carousel.js";

/** All templates, in the order of the gallery. */
export const TEMPLATES = [
  statement,
  question,
  steps,
  productImage,
  statistic,
  carousel,
  linkPreview,
  profileBanner,
  companyCover,
];

const BY_ID = new Map(TEMPLATES.map((s) => [s.id, s]));

/** The template for an id, or null. */
export function template(id) {
  return BY_ID.get(id) ?? null;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text made safe as HTML text or attribute value. */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (t) => ESCAPES[t]);
}

/**
 * A phrase between asterisks is the coloured emphasis of the headline (`*clear story.*`).
 * The asterisk has to touch a word, so that "€ 5*" or "3 * 4" simply stay asterisks.
 */
const EMPHASIS = /\*(?=\S)([^*\n]*?\S)\*/g;

/** How many phrases have emphasis. */
export function countEmphasis(text) {
  return (String(text ?? "").match(EMPHASIS) ?? []).length;
}

/** Text as HTML: first escape, then `*…*` as <em>, then line breaks as <br>. */
export function withEmphasis(text) {
  return escapeHtml(text).replace(EMPHASIS, "<em>$1</em>").replace(/\r?\n/g, "<br>");
}

/**
 * Sets the emphasis around a selection (`begin`..`end`) and removes an earlier emphasis:
 * there is exactly one. Whitespace at the edges of the selection stays outside the
 * asterisks; a double-click on Windows includes the space after the word, and that must
 * not disappear. Returns null for an empty selection or only whitespace.
 */
export function emphasiseSelection(text, begin, end) {
  const value = String(text ?? "");
  const starsFor = (i) => (value.slice(0, i).match(/\*/g) ?? []).length;
  const without = value.replace(/\*/g, "");
  let a = begin - starsFor(begin);
  let b = end - starsFor(end);
  while (a < b && /\s/.test(without[a])) a++;
  while (b > a && /\s/.test(without[b - 1])) b--;
  if (a >= b) return null;
  return { text: `${without.slice(0, a)}*${without.slice(a, b)}*${without.slice(b)}`, begin: a, end: b + 2 };
}

/** Text without the emphasis asterisks, e.g. for an alt text or a title. */
export function withoutEmphasis(text) {
  return String(text ?? "").replace(EMPHASIS, "$1");
}

/** Every rem becomes pixels: one rem is a hundred-and-eighth of the width. */
export function remToPx(css, width) {
  return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${Number(((Number(n) * width) / 108).toFixed(3))}px`);
}

/** The defaults of a template (or of one slide kind of the carousel). */
export function defaultContent(s, slideKind = null) {
  const fields = slideKind ? (s.slides.find((d) => d.kind === slideKind)?.fields ?? []) : s.fields;
  return Object.fromEntries(fields.map((v) => [v.id, v.defaultValue ?? ""]));
}

/** The fields of a template or slide kind. */
export function fieldsOf(s, slideKind = null) {
  return slideKind ? (s.slides.find((d) => d.kind === slideKind)?.fields ?? []) : s.fields;
}

/** The icons the templates use, as symbols in the image itself. */
const SYMBOLS =
  '<svg class="symbols" aria-hidden="true">' +
  '<symbol id="arrow" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>' +
  '<symbol id="tick" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>' +
  "</svg>";

/**
 * The route: the zigzag of the W from the logo at large scale, as a watermark (same path as
 * brand/motifs/route.svg).
 */
const ROUTE =
  '<svg class="route" viewBox="5.5 7.5 21 17" aria-hidden="true"><path d="M7 9l5 14 4-10 4 10 5-14"/></svg>';

/** The name of a font family as a CSS string; quotes and backslashes are dropped. */
const fontName = (family) => String(family).replace(/["\\]/g, "");

/** The colours, the grounds and the font of the brand, on the wrapper of the image. */
function brandCss(brand) {
  const variables = [
    ...Object.entries(brand.css).map(([k, v]) => `${k}: ${v};`),
    ...Object.entries(brand.grounds).flatMap(([g, k]) => [
      `--ground-${g}: ${k.background};`,
      `--ground-${g}-text: ${k.text};`,
    ]),
  ].join(" ");
  return `${brand.fontCss ?? ""}
.brand { ${variables} font-family: "${fontName(brand.font.family)}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); font-synthesis: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
.brand figure { margin: 0; }`;
}

/**
 * The image of one recipe in one format. `content` may lack fields (the default applies
 * then); an unknown field is ignored. For a carousel, `slide` says which slide (0-based).
 *
 * @returns {{ html: string, css: string, width: number, height: number, shape: string, title: string }}
 */
export function buildImage({ template: id, content = {}, slides = [], slide = 0, format: key, brand, media = {} }) {
  const s = template(id);
  if (!s) throw new Error(`Unknown template: ${id}`);
  if (!s.formats.includes(key)) throw new Error(`Template ${id} has no format ${key} defined`);
  const f = formatOf(key);
  const shape = shapeOf(f);

  let fields = s.fields;
  let values = content;
  let slideInfo = null;
  let render = s.html;
  let customCss = s.css ?? "";
  if (s.kind === "carousel") {
    const list = slides.length ? slides : s.defaultSlides;
    const current = list[Math.min(Math.max(slide, 0), list.length - 1)];
    const kind = s.slides.find((d) => d.kind === current.kind);
    if (!kind) throw new Error(`Unknown slide kind: ${current.kind}`);
    fields = kind.fields;
    values = current.content ?? {};
    render = kind.html;
    customCss = `${s.css ?? ""}\n${kind.css ?? ""}`;
    const steps = list.filter((d) => s.slides.find((x) => x.kind === d.kind)?.counts);
    slideInfo = {
      index: slide,
      count: list.length,
      step: steps.indexOf(current) + 1,
      steps: steps.length,
    };
  }
  const v = Object.fromEntries(
    fields.map((field) => {
      const w = values[field.id];
      return [field.id, typeof w === "string" ? w : String(field.defaultValue ?? "")];
    }),
  );
  // A choice field can only be one of its options; anything else becomes the default. That
  // way a choice value (which ends up as a class name in the markup) never reaches the image
  // unchecked.
  for (const field of fields) {
    if (field.kind === "choice" && !field.options.some((o) => o.value === v[field.id]))
      v[field.id] = field.defaultValue;
  }

  const c = {
    format: f,
    shape,
    slide: slideInfo,
    t: (name) => withEmphasis(v[name]),
    e: (name) => escapeHtml(v[name]),
    empty: (name) => !String(v[name] ?? "").trim(),
    logoSource: (mode) => {
      const source = brand.logos[mode];
      if (!source) throw new Error(`Unknown logo mode: ${mode}`);
      return source;
    },
    logo: (mode, className = "logo") =>
      `<img class="${className}" src="${c.logoSource(mode)}" alt="${escapeHtml(brand.name)}">`,
    /** The brand's website without protocol, for a footer. */
    brandUrl: escapeHtml(brand.url.replace(/^https?:\/\//, "").replace(/\/$/, "")),
    /** A footer field; empty means the brand's website. */
    footer: (name) => (c.empty(name) ? c.brandUrl : c.e(name)),
    /** An uploaded image as a data URI; only ids that the server handed out, so no free URL. */
    media: (name) => {
      const id = v[name];
      return /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(id) ? (media[id] ?? null) : null;
    },
    icon: (name) => `<svg class="icon"><use href="#${name}"/></svg>`,
    route: () => ROUTE,
    symbols: SYMBOLS,
  };

  const html = `<div class="brand shape-${shape} template-${s.id}" style="--width:${f.width}px;--height:${f.height}px">${render(v, c)}</div>`;
  const css = remToPx(`${brandCss(brand)}\n${BASE_CSS}\n${customCss}`, f.width);
  const title = withoutEmphasis(v.headline ?? s.name);
  return { html, css, width: f.width, height: f.height, shape, title };
}

/** How many images a recipe yields in one format (a carousel: one per slide). */
export function imageCount(s, slides) {
  return s.kind === "carousel" ? slides.length || s.defaultSlides.length : 1;
}
