// The text that tells a model or an agent how to make an own template: the rules, the shape of
// the tree, the worked example, the base classes, the brand and the user's material. Route A
// (`ai/template.ts`) and route B (`template-prompt.ts`) both use it, and the rules are written
// from the same constants that `checkTemplate` judges with, so they cannot drift apart.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_VARIABLES,
  AS_VALUES,
  CSS_FUNCTIONS,
  CSS_SELECTORS,
  DENIED_PROPERTIES,
  ICONS,
  LIMITS,
  TAGS,
} from "../web/studio/own-template.js";
import { FORMATS, type FormatKey } from "../web/studio/formats.js";
import type { Brand } from "./brand.js";
import { LOGO_MODES } from "./brand-proposal.js";
import type { CompanyProfile } from "./schema.js";

/** What both routes know about the project: the user's material and the brand. */
export interface GuideContext {
  kind: "image" | "carousel";
  formats: FormatKey[];
  texts: string[];
  brief: string;
  brand: Brand;
  profile: Partial<CompanyProfile> | null;
  tone: string;
  bannedWords: string[];
}

export const exampleJson = () =>
  readFileSync(fileURLToPath(new URL("./template-example.json", import.meta.url)), "utf8").trim();

/** The classes of the base CSS that a template may use, with what they do. `.media` is made by the engine. */
export const BASE_CLASSES: Array<[string, string]> = [
  [".image", "the canvas of one image; the studio writes it (padding 8rem, flex column, the ground as background)"],
  [
    ".headline",
    "a large headline; `.headline.medium` and `.headline.small` are smaller (put it on the node with `headlineOf`)",
  ],
  [".text", "body text in the soft colour, at most 32 characters wide"],
  [".footer", "a flex row with a hairline above it and small text"],
  [".headline-row", "a flex row to put a logo and something else on one line"],
  [".logo", "the logo (the `logo` slot makes it)"],
  [".icon", "a small outlined icon (the `icon` slot makes it)"],
  [".route", "the zigzag watermark (the `route` slot makes it)"],
  [".paper", "a white sheet with rounded corners and a soft shadow"],
  [".ring", "a hairline ring, as a decoration"],
  [".chain", "a row of small steps joined by a line"],
  [".amount", "a large number that does not wrap"],
  [".media", "the picture of the `image` slot; `.media.empty` is the placeholder"],
];

const list = (items: readonly string[]) => items.map((i) => `\`${i}\``).join(", ");

/** The rules that `checkTemplate` enforces. */
export function rulesText(): string {
  return [
    "A template that breaks one of these rules is refused as a whole; nothing is repaired.",
    "",
    `- **Elements.** Only these tags: ${list(TAGS)}. An element has \`class\` and \`data-field\` and nothing else: no other attributes, no links, no scripts.`,
    "- **What may sit where.** `p`, `h1`, `h2`, `h3`, `span` and `strong` hold only `span`, `strong`, text, literals and icons. A `ul` holds only `li`, and an `li` sits directly in a `ul`.",
    `- **Size.** At most ${LIMITS.fields} fields, ${LIMITS.nodes} nodes in a tree, ${LIMITS.depth} levels deep, ${LIMITS.classes} classes on an element, ${LIMITS.literal} characters in a literal, ${LIMITS.css} characters and ${LIMITS.rules} rules of CSS, and a name of at most ${LIMITS.name} characters.`,
    `- **CSS that is refused outright.** The characters \`@\` (so no \`@import\`, \`@font-face\`, \`@media\`), \`/*\`, a backslash, \`<\`, \`#\` and \`[\`, quotes (the one exception is \`content: ""\`), \`!important\`, and anything that is not plain ASCII. The properties ${list(DENIED_PROPERTIES)} are refused too, and so is defining your own custom properties.`,
    `- **CSS functions.** Only ${list(CSS_FUNCTIONS)}. \`color-mix\` must start with \`in srgb,\`. Everything else is refused, among them \`url()\`, \`image-set()\`, \`src()\`, \`attr()\`, \`expression()\`, \`rgb()\`, \`hsl()\`, \`oklch()\` and \`color()\`.`,
    `- **Colours.** No hex values, no named colours (\`red\`) and no system colours (\`Canvas\`). Use \`transparent\`, \`currentcolor\` and \`var()\` of exactly these variables: ${list(ALLOWED_VARIABLES)}. A shadow is \`color-mix(in srgb, var(--ink) 25%, transparent)\`.`,
    `- **Selectors.** Classes (\`.name\`), the tags above, \`*\`, the combinators \`>\` \`+\` \`~\` and the comma, and these pseudo selectors: ${list(CSS_SELECTORS)}. The classes in the list of base classes may be reused.`,
    "- **Units.** Use `rem` for sizes: one rem is 10 px on a canvas 1080 px wide, and it scales with the width of the format. The size of the canvas is `var(--width)` by `var(--height)`. A format with the class `.shape-story` (vertical), `.shape-landscape`, `.shape-square` or `.shape-portrait` is on the wrapper, so `.shape-landscape .image { ... }` can change the layout per shape.",
  ].join("\n");
}

/** The shape of fields, nodes and slides. */
export function shapeText(): string {
  return [
    "### Fields",
    "",
    "`fields` is a list (at most 12) of the things the user fills in. Ids are camelCase letters and digits, at most 24 characters, and unique.",
    "",
    '- `{ "id": "headline", "label": "Headline", "kind": "headline", "max": 90, "defaultValue": "A *phrase* in the accent colour." }`. The id must be `headline`. The default has exactly one phrase between asterisks and fits `max`.',
    '- `{ "id": "text", "label": "Text", "kind": "text" | "line", "max": 160, "defaultValue": "...", "help": "..." }`. `text` can hold several lines; `line` is one line. `help` is optional.',
    '- `{ "id": "mood", "label": "Mood", "kind": "choice", "options": [{ "value": "calm", "text": "Calm" }, ...], "defaultValue": "calm" }`. Two to eight options; a value is a class name (lowercase letters, digits, hyphens).',
    '- `{ "id": "photo", "label": "Photo", "kind": "media", "required": true }`. A picture the user adds.',
    '- `{ "preset": "ground", "defaultValue": "accent" }`: the choice between the three grounds light, ink and accent. `{ "preset": "headlineSize" }`: automatic, large, medium or small, used together with `headlineOf`.',
    "",
    "The default of each field is the sample content of the template: write it for this business, in its tone, and make it fit.",
    "",
    "### The tree",
    "",
    'Every node is one of these. The studio writes the outer `<div class="image">` itself (for a carousel slide: `<section class="image slide">`), with the class of the chosen ground, so the tree starts inside it.',
    "",
    "| Node | What it makes |",
    "| --- | --- |",
    `| \`{ "tag": "div", "classes": ["card"], "classFrom": "mood", "headlineOf": "headline", "dataField": "text", "showIf": "text", "children": [...] }\` | An element. Every key but \`tag\` is optional. \`classFrom\` adds the value of a choice field as a class. \`headlineOf\` adds the headline classes (\`headline\`, \`headline medium\`, \`headline small\`) for the size chosen. \`dataField\` marks the element so the brand check can see whether the text of that field runs out of the image. \`showIf\` leaves the element out while that field is empty. |`,
    `| \`{ "field": "text", "as": ${AS_VALUES.map((a) => `"${a}"`).join(" | ")} }\` | The value of a field as text. \`rich\` (a headline or text field) turns *asterisks* into the accent colour and line breaks into \`<br>\`; \`plain\` is plain text; \`footer\` (a line field) shows the brand's website when the field is empty. |`,
    '| `{ "literal": "Swipe" }` | Fixed text, at most 80 characters. |',
    '| `{ "slot": "logo" }` | The brand logo that fits the ground. |',
    '| `{ "slot": "route" }` | The zigzag watermark of the brand, behind everything. |',
    '| `{ "slot": "image", "field": "photo" }` | The picture of a media field, or a placeholder. |',
    `| \`{ "slot": "icon", "name": ${ICONS.map((i) => `"${i}"`).join(" | ")} }\` | A small icon. |`,
    "",
    "### A carousel",
    "",
    'A carousel has `slides` instead of `fields` and `tree`: exactly three slide kinds in this order, `cover`, `content` and `closing`, each `{ "kind", "name", "fields", "tree" }`. `defaultSlides` is the sample carousel: 3 to 8 slides, the first a `cover`, each `{ "kind": "content", "content": { "<field id>": "text" } }` with values for fields of that slide kind. The `content` slides are counted as steps.',
  ].join("\n");
}

/** The brand as the model needs to know it: colours with their use, grounds, font, logo modes. */
export function brandText(b: Brand): string {
  const css = Object.entries(b.css)
    .map(([k, v]) => `\`${k}\` ${v}`)
    .join(", ");
  const colours = b.colors.map((c) => `- ${c.name} ${c.hex}: ${c.usage}`).join("\n");
  const grounds = Object.entries(b.grounds)
    .map(([k, g]) => `- ${k}: background ${g.background}, text ${g.text}`)
    .join("\n");
  return [
    `Brand: **${b.name}** (${b.url}). Font: ${b.font.family}.`,
    "",
    `The variables you may use in CSS, with the brand's value (never write the values themselves): ${css}.`,
    "",
    "Colours:",
    colours,
    "",
    "Grounds (the three backgrounds a post can have):",
    grounds,
    "",
    `The logo exists in ${LOGO_MODES.length} versions that the studio picks by ground; a template only uses the \`logo\` slot.`,
  ].join("\n");
}

/** Who the company is, how it sounds and which words it does not use. */
export function voiceText(c: Pick<GuideContext, "profile" | "tone" | "bannedWords">): string {
  const profile = c.profile
    ? Object.entries(c.profile)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "- (the company profile is empty; keep the sample content generic)";
  return [
    "Company profile:",
    profile,
    "",
    `Tone of voice: ${c.tone.trim() || "(not described)"}`,
    "",
    `Words the brand does not use: ${c.bannedWords.length ? c.bannedWords.join(", ") : "(none)"}`,
  ].join("\n");
}

/** What the user asked for. */
export function requestText(c: GuideContext): string {
  const formats = c.formats
    .map((k) => FORMATS.find((f) => f.key === k))
    .map((f) => `${f?.name} (${f?.width}x${f?.height})`);
  const texts = c.texts.length
    ? c.texts.map((t, i) => `Old post text ${i + 1}:\n\n> ${t.replace(/\n/g, "\n> ")}`).join("\n\n")
    : "No texts of old posts were given.";
  return [
    `Make a ${c.kind === "carousel" ? "carousel (a document post of several slides)" : "single image"} template for these formats: ${formats.join(", ")}.`,
    "",
    c.brief.trim() ? `Brief from the user: ${c.brief.trim()}` : "There is no brief.",
    "",
    texts,
  ].join("\n");
}

/** Everything but the request, in one block of markdown. */
export function guideText(c: GuideContext): string {
  const classes = BASE_CLASSES.map(([k, d]) => `- \`${k}\`: ${d}`).join("\n");
  return [
    "## Rules",
    "",
    rulesText(),
    "",
    "## How a template is written",
    "",
    "A template is JSON: `name` (at most 40 characters), `goal` (one sentence, at most 140), `fields`, `tree` and `css` (a carousel: `slides` and `defaultSlides` instead of `fields` and `tree`).",
    "",
    shapeText(),
    "",
    "## Base classes",
    "",
    "The studio's base CSS is already in every image, so a template adds only what is its own:",
    "",
    classes,
    "",
    "## Worked example",
    "",
    "A statement, as a template (an image template; `kind`, `version` and `formats` are filled in by the studio):",
    "",
    "```json",
    exampleJson(),
    "```",
    "",
    "## The brand",
    "",
    brandText(c.brand),
    "",
    voiceText(c),
    "",
    "## What to do",
    "",
    "Take the style and the structure from the old posts: how the text is placed, how big the headline is, where the logo and footer go, whether there is a picture. Copy no text and no numbers from them. Write the sample content for this business. Use only the variables and slots described above. Let the `ground` preset decide the background, text colour, logo and accent: do not set `background` or `color` on `.image` yourself.",
  ].join("\n");
}
