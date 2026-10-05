# AI-made templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project can make its own post templates from its old posts (screenshots, pasted texts, a brief); Claude, or an agent running a downloaded prompt, proposes one; the user previews it in every chosen format and keeps or discards it; a kept template behaves like a built-in one.

**Architecture:** A template is data: fields, a tree of nodes and some CSS, in one JSON file per template (`data/projects/<slug>/templates/own-<8 hex>.json`). One shared module, `src/web/studio/own-template.js`, holds the only judge (`checkTemplate`, which refuses and never repairs) and the engine (`compileTemplate`, which turns a checked file into an object shaped like a built-in `Template`). The server stores, lists and generates (route A: one paid vision call behind `runPaid`; route B: a downloadable prompt and `npm run template:check`); the browser registers the saved templates with `templates.js` so the editor, Convert, the library filter and the idea planner see them next to the built-in ones.

**Tech Stack:** Node 22 and TypeScript on the server (run through `tsx`), plain ES modules in the browser, zod, `@anthropic-ai/sdk`, vitest, `playwright-core` with the installed Chrome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-ai-templates-design.md` (approved by the owner). Read it first; this plan argues from it. Where the plan departs from the spec or fills a gap, the section "Spec gaps and how this plan resolves them" says so.

## Global Constraints

- **Language:** English everywhere in the repo (code, comments, UI text, docs). `tests/public.test.ts` scans every tracked file: no Dutch word, no path of a computer, no e-mail address and no key-like string. This plan file is tracked and obeys the same rules.
- **Checks:** tests are vitest (`npm test`), plus `npm run typecheck` and `npm run format:check`. Run `npm run format` before every commit.
- **No new dependencies.** Allowed: `@anthropic-ai/sdk`, `tsx`, `zod`, `@types/node`, `fflate`, `prettier`, `typescript`, `vitest`, `playwright-core`.
- **Never make a real paid API call**, in a test or in a manual check. Tests use fake clients (`tests/helpers/brand-ai.ts`). To start the app by hand use `env -u ANTHROPIC_API_KEY ...`, so that "Generate" can only return the fixed sample.
- **Commits:** as the configured git user, no `Co-Authored-By` line, no "Generated with" line; do not push; stay on branch `fase-5`.
- **Ids and files:** a template id is `own-` plus 8 hex characters, made by the server, never by the model; built-in ids never start with `own-`. Files are `templates/own-<8 hex>.json`; paths go through `path()` of `files.ts`.
- **Limits (copy of the spec):** name 1 to 40 characters, goal 1 to 140; at most 12 fields per template or slide kind; a tree has at most 60 nodes and depth 6; at most 6 classes per element; a literal at most 80 characters; CSS at most 6,000 characters and 80 rules; a file at most 60 kB; at most 30 own templates per project; carousel `defaultSlides` 3 to 8, the first a `cover`; at most 6 screenshots (png, jpg, webp, 3 MB each, 8,000 px at most), texts at most 8,000 characters (posts separated by a line `---`), brief at most 600.
- **Formats:** a carousel uses exactly `["li-carousel"]`; an image template uses formats other than `li-carousel`, `li-profile` and `li-company`.
- **CSS rules (spec):** refused outright: `@`, `/*`, `\`, `<`, `#`, `[`, control characters, quotes (except `content: ""`), the properties `font-family`, `animation*`, `transition*`. Functions only: `var`, `calc`, `min`, `max`, `clamp`, `color-mix(in srgb, ...)`, `translate*`, `scale`, `rotate`, `minmax`, `repeat`, `linear-gradient`, `radial-gradient`. No hex, no `rgb/hsl/hwb/lab/lch/oklab/oklch/color()`, no named or system colour; `var()` only of the 14 brand variables plus `--ground-{light,ink,accent}` (and `-text`), `--emphasis`, `--soft`, `--hairline`, `--width`, `--height`. Selectors: classes, the allowed tags, `* > + ~ ,` and `:first-child :last-child :not() :nth-child() ::before ::after`.
- **Model call (route A):** client and model from `chooseBrandClient()` (`BRAND_MODEL` = `claude-opus-5-5`, `POSTWRIGHT_BRAND_MODEL`); `runPaid` with `TEMPLATE_RESERVE_USD = 1`, booked as `template:<slug>` also on failure; structured output through `zodOutputFormat`; `max_tokens` 24,000; adaptive thinking at effort `medium`; no web tool; no automatic retry.
- **Screen:** `Templates` under "Your foundation" (`NAV_GROUPS`, `MODULES`, `SCREEN_ICON` in `src/web/studio.js`, icon `layers`). Buttons that cannot work are disabled with the reason beside them.

## Spec gaps and how this plan resolves them

1. **`routes.ts` uses the template list in three places, not two, and one cannot await.** The idea check (`listRoutes(... runCheck ...)`) is synchronous and runs inside a locked list update, with no project in reach. Resolution: `listRoutes` gets an optional async `beforeSave(s, input)` hook that runs before the update; the idea check moves there and also accepts `loadOwnTemplates(s.dir)`. The planner list uses built-ins plus own templates. `fillPosts` (sample posts) stays built-in only, on purpose.
2. **Where do `notes` and the "made without a model" flag live?** The spec says a proposal is a template without `id` and `created`, which leaves no room for them. Resolution: an optional sidecar `template-input/proposal/extras.json` (`{ "notes": string[], "sample": boolean }`), like `extras.json` of a brand kit; `GET /api/template-proposal` returns it as `notes` and `sample`. The spec's `sample` in the `ready` answer therefore means "the proposal is the fixed sample".
3. **Structured output has little room for optional keys, and zod strips unknown keys.** Resolution: `template-schema.ts` defines an answer shape in which every key is present (an empty string or list means "not used"), made with `z.strictObject` so that nothing is dropped quietly, unrolled to depth 6; `answerToFile` drops the empty keys and takes `kind` and `formats` from the user. That is a change of format, not a repair; `checkTemplate` still judges the result. `checkTemplate` is also the only judge on read, so the file schema is not duplicated in zod (the spec's "validated with zod and checkTemplate on read" reduces to `checkTemplate`).
4. **The engine needs details the spec leaves open:** the `headline` field must have the id `headline` (the editor, the brand check and idea-to-recipe look for it); slide kinds `cover`, `content`, `closing` get `counts: false, true, false`; the image slot emits `<img class="media">` or `<div class="media empty">` (the model is told); `p`, `h1`-`h3`, `span` and `strong` may only hold inline content, `ul` only `li`, so that the HTML parser (also used by the PNG export) cannot re-nest the tree; CSS refuses all non-ASCII characters and `!important`.
5. **`toSvg` (the export path) needs a DOM, vitest runs in Node.** The "export path" test of the spec runs in real Chrome instead (`tests/own-template-browser.test.ts`), through `renderToBlob`, for an image and for every slide of a carousel.
6. **Small additions:** `textDialog` gets a `value` option (to rename); an invalid proposal (route B) gets a Discard button, since the user otherwise cannot clear it; the shared gallery card moves to `src/web/studio/template-card.js`; the texts for both routes live in `src/server/template-guide.ts`, so the rules are generated from the same constants as the validator.
7. **Without an API key route A still works** (it returns the fixed sample), so "Generate with Claude" is enabled without a key and says what it will give.

## Review Focus

The inputs the spec implies but the main tests do not exercise, most likely first. Each has a test in the task named.

1. **A post whose own template is gone** (a file removed by hand). The library and overview must still list the post and the editor must say which template is unknown, not crash. (Task 7, `own-template-browser.test.ts`.)
2. **Names, goals and labels with markup** (`<img src=x onerror=...>` as a template name). They must show as plain text in the gallery, the pickers and the proposal. (Task 7.)
3. **A damaged `input.json` or `template.json`.** A plain 500 or "invalid" naming the file, never a stack trace or a silent default. (Task 3 for `input.json`, Task 6 for `template.json` and `extras.json`.)
4. **Two clicks or two tabs:** two generations at once must run one after the other and two "Use this template" clicks must give one template and one clear message. (Task 4 serialisation test, Task 6 second apply.)
5. **A proposal whose text does not fit one of the chosen formats.** The card must list the findings and still let the user decide. (Task 8.)

Not covered by any test and left to the real-key trial (open point 1 of the spec): the real cost, and whether structured output accepts the depth-6 schema. If it refuses it, the fallback is JSON in a normal reply, checked by the same `checkTemplate`.

## File structure

**New**

| File | Responsibility |
| --- | --- |
| `src/web/studio/own-template.js` (+ `.d.ts`) | `checkTemplate`, the CSS rules, `compileTemplate`; shared by browser and server |
| `src/server/template-example.json` | The worked example (a statement as a tree); also the prompt's example and the test fixture |
| `src/server/template-schema.ts` | Zod answer schema for structured output, `answerToFile` |
| `src/server/template-store.ts` | Own templates on disk: read, save, rename, delete, usage count |
| `src/server/template-routes.ts` | `GET/PUT/DELETE /api/templates` |
| `src/server/template-input.ts` | Material: screenshots, texts, brief, kind, formats; routes |
| `src/server/template-guide.ts` | The rules, node guide, brand and request as text, for both routes |
| `src/server/ai/template.ts` | Route A: the Claude call |
| `src/server/template-generate.ts` | Route A: `POST /api/template-generate` |
| `src/server/template-prompt.ts` | Route B: `GET /api/template-prompt` |
| `src/server/template-check-cli.ts` | `npm run template:check -- <project>` |
| `src/server/template-proposal.ts` | Proposal on disk, `checkProposal`, apply, discard, routes |
| `src/web/studio/template-card.js` | The shared gallery card and its lazy thumbnails |
| `src/web/studio/template-list.js`, `template-create.js`, `template-proposal.js` | The Templates screen |
| `tests/helpers/template.ts`, `tests/helpers/templates-api.ts` | Fixtures and a studio with a fake model client |
| `tests/template-check.test.ts`, `own-template.test.ts`, `template-schema.test.ts`, `template-store.test.ts`, `template-routes.test.ts`, `template-input.test.ts`, `template-ai.test.ts`, `template-prompt.test.ts`, `own-template-browser.test.ts` | Tests |

**Modified:** `src/web/studio/templates.js` and `.d.ts`, `src/server/routes.ts`, `src/server/app.ts`, `src/server/brand-input.ts` (exports), `src/server/ai/brand.ts` (exports), `src/server/ai/sample.ts`, `src/web/studio.js`, `src/web/studio/editor.js`, `library.js`, `ideas-ui.js`, `src/web/ui.js`, `src/web/studio.css`, `package.json`, `tests/mobile.test.ts`, `README.md`, `DESIGN.md`, `docs/phase-5-handover.md`.

**Order of work:** tasks 1 to 6 are the server side and end at a natural stop point; tasks 7 to 9 are the browser and the documents. Each task ends green (`npm run typecheck`, `npm run format:check`, `npm test`) and with one commit.

---

### Task 1: The validator and the engine

**Files:**
- Create: `src/web/studio/own-template.js`, `src/web/studio/own-template.d.ts`, `src/server/template-schema.ts`, `src/server/template-example.json`
- Modify: `src/web/studio/templates.js` (`buildImage` accepts a template object), `src/web/studio/templates.d.ts`
- Test: `tests/template-check.test.ts`, `tests/own-template.test.ts`, `tests/template-schema.test.ts`, `tests/helpers/template.ts`

**Interfaces:**
- Consumes: `FORMATS` (`formats.js`), `countEmphasis`, `escapeHtml` (`templates.js`), `ground`, `HEADLINE_SIZE`, `groundClass`, `headlineClass`, `logoMode` (`templates/fields.js`).
- Produces (later tasks rely on these exact names):
  - `checkTemplate(raw: unknown, options?: { mode?: "proposal" | "saved" | "either" }): { ok: true; template: TemplateProposal | TemplateFile } | { ok: false; problems: string[] }`. `"proposal"` forbids `id` and `created`; `"saved"` requires both; `"either"` (default) allows both or neither. At most 30 problems, then `…and N more`. Never throws.
  - `compileTemplate(file: unknown): Template` (shape of `Template` in `templates.d.ts`, plus `own: true`; id `own-proposal` for a proposal). Throws `Error('The template "<name>" was refused: <first problem>')`.
  - `expandField(f: FieldDef): Field`; constants `TAGS`, `AS_VALUES`, `ICONS`, `PRESETS`, `SLIDE_KINDS`, `IMAGE_FORMATS`, `BRAND_VARIABLES`, `ALLOWED_VARIABLES`, `CSS_FUNCTIONS`, `CSS_SELECTORS`, `DENIED_PROPERTIES`, `LIMITS`; types `FieldDef`, `NodeDef`, `SlideDef`, `TemplateProposal`, `TemplateFile`.
  - `buildImage({ template: string | Template, ... })`: a template object works like an id.
  - `template-schema.ts`: `ImageAnswerSchema`, `CarouselAnswerSchema`, `answerSchema(kind)`, `answerToFile(answer, kind, formats): unknown`.
  - Test helpers: `exampleTemplate()`, `carouselExample()`, `saved(t, id?)`, `fieldToAnswer(f)`, `answerOf(file, notes?)`.

The engine and the validator are in one module because the engine must only run what the validator passed. `own-template.js` and `templates.js` import each other; that is safe because neither calls the other while loading, only from inside functions.

- [ ] **Step 1: Write the fixtures and the tests**

The example is the statement template in tree form. It is also the worked example in the prompts and the base of every fixture.

`src/server/template-example.json`:

````json
{
  "version": 1,
  "name": "Statement",
  "goal": "One statement with a coloured phrase, on light, ink or accent.",
  "kind": "image",
  "formats": ["li-square", "li-portrait", "ig-square", "ig-portrait", "story", "wide"],
  "fields": [
    { "preset": "ground", "defaultValue": "accent" },
    {
      "id": "headline",
      "label": "Headline",
      "kind": "headline",
      "max": 90,
      "defaultValue": "On-brand posts, *without the design tool.*"
    },
    { "preset": "headlineSize" },
    {
      "id": "text",
      "label": "Text",
      "kind": "text",
      "max": 160,
      "defaultValue": "Pick a template, fill in the fields and export. Everything runs on your own computer."
    },
    { "id": "footerLeft", "label": "Footer left", "kind": "line", "max": 60, "defaultValue": "Try it yourself" },
    {
      "id": "footerRight",
      "label": "Footer right",
      "kind": "line",
      "max": 40,
      "defaultValue": "",
      "help": "Empty: the website of the brand."
    }
  ],
  "tree": [
    { "slot": "route" },
    { "slot": "logo" },
    {
      "tag": "main",
      "children": [
        {
          "tag": "h1",
          "headlineOf": "headline",
          "dataField": "headline",
          "children": [{ "field": "headline", "as": "rich" }]
        },
        {
          "tag": "p",
          "classes": ["text"],
          "showIf": "text",
          "dataField": "text",
          "children": [{ "field": "text", "as": "rich" }]
        }
      ]
    },
    {
      "tag": "footer",
      "classes": ["footer"],
      "dataField": "footerLeft",
      "children": [
        { "tag": "span", "children": [{ "field": "footerLeft", "as": "plain" }] },
        { "tag": "strong", "children": [{ "field": "footerRight", "as": "footer" }] }
      ]
    }
  ],
  "css": "main { margin-block: auto 7rem; }\n.text { margin-top: 4.4rem; }\n.shape-landscape .image { padding: 6rem 7rem; }\n.shape-landscape .headline { font-size: 7.6rem; }\n.shape-landscape .headline.medium { font-size: 6.2rem; }\n.shape-landscape .headline.small { font-size: 5rem; }\n.shape-landscape .text { margin-top: 3rem; max-width: 48ch; font-size: 2.6rem; }\n.shape-landscape main { margin-block: auto 4rem; }\n.shape-landscape .footer { padding-top: 2.4rem; font-size: 2rem; }"
}
````

`tests/helpers/template.ts` (this task's part; later tasks add to it):

````ts
// The example template and variants of it, as plain data that a test can break.
import { readFileSync } from "node:fs";

/** The worked example: a statement in tree form, as a proposal (no id, no created). */
export function exampleTemplate(): any {
  return JSON.parse(readFileSync("src/server/template-example.json", "utf8"));
}

/** The same fields and tree as a three-slide-kind carousel. */
export function carouselExample(): any {
  const e = exampleTemplate();
  const kind = (k: string, name: string) => ({ kind: k, name, fields: e.fields, tree: e.tree });
  return {
    version: 1,
    name: "Tour",
    goal: "A short tour in slides.",
    kind: "carousel",
    formats: ["li-carousel"],
    css: e.css,
    slides: [kind("cover", "Cover"), kind("content", "Step"), kind("closing", "Closing")],
    defaultSlides: [
      { kind: "cover", content: { headline: "Start *here.*" } },
      { kind: "content", content: { headline: "One *step.*" } },
      { kind: "content", content: { headline: "Another *step.*" } },
      { kind: "closing", content: { headline: "Try it *now.*" } },
    ],
  };
}

/** A proposal as a saved file. */
export const saved = (t: any, id = "own-0123abcd"): any => ({ ...t, id, created: "2026-10-05T10:00:00.000Z" });

const emptyField = {
  preset: "",
  id: "",
  label: "",
  kind: "",
  max: 0,
  defaultValue: "",
  help: "",
  required: false,
  options: [],
};
const emptyElement = { classes: [], classFrom: "", headlineOf: "", dataField: "", showIf: "" };

function nodeToAnswer(n: any): any {
  if (!("tag" in n)) return n;
  return { ...emptyElement, ...n, ...(n.children ? { children: n.children.map(nodeToAnswer) } : {}) };
}
/** A field of a template file as the model's answer writes it: every key present. */
export const fieldToAnswer = (f: any): any => ({ ...emptyField, ...f });

/** A template file as the structured answer of the model: every key present, empty where unused. */
export function answerOf(file: any, notes: string[] = []): any {
  const common = { name: file.name, goal: file.goal, css: file.css };
  if (file.kind === "image") {
    return {
      template: { ...common, fields: file.fields.map(fieldToAnswer), tree: file.tree.map(nodeToAnswer) },
      notes,
    };
  }
  return {
    template: {
      ...common,
      slides: file.slides.map((s: any) => ({
        kind: s.kind,
        name: s.name,
        fields: s.fields.map(fieldToAnswer),
        tree: s.tree.map(nodeToAnswer),
      })),
      defaultSlides: file.defaultSlides.map((d: any) => ({
        kind: d.kind,
        content: Object.entries(d.content).map(([id, value]) => ({ id, value })),
      })),
    },
    notes,
  };
}
````

`tests/template-check.test.ts` (the judge: every attack the spec lists, plus limits, references, ids and the carousel):

````ts
// `checkTemplate`: the judge of every own template. It refuses and never repairs, and each
// message names the place and the problem. The attacks are the ones a model (or a file on
// disk) could bring: markup, script, remote loads, colours outside the brand.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_VARIABLES,
  BRAND_VARIABLES,
  CSS_FUNCTIONS,
  IMAGE_FORMATS,
  TAGS,
  checkTemplate,
} from "../src/web/studio/own-template.js";
import { CSS_VARIABLES } from "../src/server/brand-proposal.js";
import { FORMAT_KEYS } from "../src/server/schema.js";
import { carouselExample, exampleTemplate, saved } from "./helpers/template.js";

function problems(raw: unknown, mode: "proposal" | "saved" | "either" = "proposal"): string[] {
  const r = checkTemplate(raw, { mode });
  return r.ok ? [] : r.problems;
}
const withCss = (css: string) => ({ ...exampleTemplate(), css });
const withTree = (tree: unknown) => ({ ...exampleTemplate(), tree });
const withFields = (fields: unknown) => ({ ...exampleTemplate(), fields });

describe("the example", () => {
  it("is a valid proposal and a valid saved template, and an image and a carousel both pass", () => {
    expect(problems(exampleTemplate())).toEqual([]);
    expect(problems(saved(exampleTemplate()), "saved")).toEqual([]);
    expect(problems(carouselExample())).toEqual([]);
  });

  it("lists its brand variables like the brand kit does, and knows only formats the studio has", () => {
    expect([...BRAND_VARIABLES]).toEqual([...CSS_VARIABLES]);
    expect(ALLOWED_VARIABLES).toHaveLength(BRAND_VARIABLES.length + 11);
    for (const f of IMAGE_FORMATS) expect(FORMAT_KEYS).toContain(f);
    expect(IMAGE_FORMATS).not.toContain("li-carousel");
    expect(IMAGE_FORMATS).not.toContain("li-profile");
    expect(IMAGE_FORMATS).not.toContain("li-company");
  });
});

describe("css that is refused outright", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["url(", ".a { background: url(x); }", /rule 1 \(\.a\).*url\(\) is not allowed/],
    ["URL(", ".a { background: URL(x); }", /URL\(\) is not allowed/],
    ["url (", ".a { background: url (x); }", /url\(\) is not allowed/],
    ["a url with an escape", ".a { background: u\\72l(x); }", /backslashes/],
    ["image-set(", ".a { background: image-set(x 1x); }", /image-set\(\) is not allowed/],
    ["src(", ".a { background: src(x); }", /src\(\) is not allowed/],
    ["attr(", ".a { width: attr(x); }", /attr\(\) is not allowed/],
    ["expression(", ".a { width: expression(alert(1)); }", /expression\(\) is not allowed/],
    ["@import", "@import 'x.css';", /"@"/],
    ["@font-face", "@font-face { font-family: x; }", /"@"/],
    ["@media", "@media print { .a { color: var(--ink); } }", /"@"/],
    ["a comment", ".a { } /* x */", /comments/],
    ["a closing style tag", ".a { } </style><script>", /"<"/],
    ["an id selector", "#a { margin: 0; }", /"#"/],
    ["an attribute selector", '.a[href^="x"] { margin: 0; }', /"\["/],
    ["a control character", ".a { margin: 0;\u0001 }", /plain ASCII/],
    ["a hex colour", ".a { color: #fff; }", /"#"/],
    ["rgb()", ".a { color: rgb(0 0 0); }", /rgb\(\) is not allowed/],
    ["hsl()", ".a { color: hsl(10 10% 10%); }", /hsl\(\) is not allowed/],
    ["oklch()", ".a { color: oklch(0.5 0.1 10); }", /oklch\(\) is not allowed/],
    ["color()", ".a { color: color(srgb 1 0 0); }", /color\(\) is not allowed/],
    ["a named colour", ".a { color: red; }", /colour "red" is not allowed/],
    ["a system colour", ".a { color: Canvas; }", /colour "Canvas" is not allowed/],
    ["a named colour in a fallback", ".a { color: var(--ink, red); }", /colour "red"/],
    ["a colour space other than srgb", ".a { color: color-mix(in oklch, var(--ink), transparent); }", /in srgb/],
    ["a variable that is not the brand's", ".a { color: var(--brand-pink); }", /--brand-pink is not a brand variable/],
    ["a variable outside var()", ".a { color: --ink; }", /only be used inside var\(\)/],
    ["font-family", ".a { font-family: Arial; }", /font-family is not allowed/],
    ["font", ".a { font: 12px Arial; }", /font is not allowed/],
    ["animation", ".a { animation: spin 1s; }", /animation is not allowed/],
    ["animation-name", ".a { animation-name: spin; }", /animation-name is not allowed/],
    ["transition", ".a { transition: all 1s; }", /transition is not allowed/],
    ["quotes", '.a::before { content: "x"; }', /content may only be/],
    ["a quote in a value", ".a { margin: 'x'; }", /quotes/],
    ["!important", ".a { margin: 0 !important; }", /"!"/],
    ["a non-ASCII character", ".a { margin: 0\u2028; }", /plain ASCII/],
    ["a tag that is not allowed", "table { margin: 0; }", /tag "table"/],
    ["a pseudo class that is not allowed", ".a:hover { margin: 0; }", /":hover"/],
    ["a nested rule", ".a { .b { margin: 0; } }", /nested rules/],
    ["a missing brace", ".a { margin: 0;", /not closed/],
    ["text after the last rule", ".a { margin: 0; } .b", /text after the last rule/],
    ["a custom property", ".a { --x: 1; }", /"--x: 1" is not a declaration|not allowed/],
    ["a leading combinator", "> .a { margin: 0; }", /combinator/],
  ];
  it.each(cases)("%s", (_name, css, expected) => {
    const found = problems(withCss(css));
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toMatch(expected);
  });

  it("names the rule and the property", () => {
    expect(problems(withCss(".a { margin: 0; }\n.hero { background: url(x); }"))).toEqual([
      "css rule 2 (.hero) (background): url() is not allowed",
    ]);
  });

  it("refuses too long a stylesheet and too many rules", () => {
    expect(problems(withCss(`.a { margin: ${"0 ".repeat(3001)}; }`))).toEqual(["css: longer than 6000 characters"]);
    expect(problems(withCss(".a { margin: 0; }\n".repeat(81)))).toEqual(["css: more than 80 rules"]);
  });
});

describe("css that is allowed", () => {
  it("accepts layout, brand variables, calc, gradients, transforms and a shadow made with color-mix", () => {
    const css = [
      ".card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; padding: 4rem 6rem; }",
      ".card > .a + .b ~ .c, li:nth-child(2n+1):not(.x), h2:first-child::after { margin: -2rem auto; width: calc(100% - 2rem); }",
      ".badge { background: var(--accent-soft); color: var(--ink); border: .2rem solid var(--hairline); border-radius: 1rem; }",
      ".paper { box-shadow: 0 2rem 4rem color-mix(in srgb, var(--ink) 25%, transparent); transform: translateX(-2rem) rotate(-2deg) scale(1.1); }",
      ".bar { background: linear-gradient(to right, var(--accent), transparent); height: clamp(2rem, 4vw, 6rem); }",
      '.dot::before { content: ""; width: 1.4rem; height: 1.4rem; background: currentcolor; }',
      ".tall { height: var(--height); max-width: 48ch; aspect-ratio: 16 / 9; -webkit-line-clamp: 3; }",
    ].join("\n");
    expect(problems(withCss(css))).toEqual([]);
  });
});

describe("the tree", () => {
  const section = (extra: object) => withTree([{ tag: "div", ...extra }]);

  it.each<[string, unknown, RegExp]>([
    ["script", withTree([{ tag: "script", children: [] }]), /tree\[0\]\.tag: "script" is not an allowed tag/],
    ["iframe", withTree([{ tag: "iframe" }]), /"iframe" is not an allowed tag/],
    ["a link", withTree([{ tag: "a" }]), /"a" is not an allowed tag/],
    ["an onclick key", section({ onclick: "x()" }), /unknown key "onclick"/],
    ["a style key", section({ style: "color: red" }), /unknown key "style"/],
    ["an href key", section({ href: "x" }), /unknown key "href"/],
    ["a class with a space", section({ classes: ["a b"] }), /classes\[0\]/],
    ["a class with a quote", section({ classes: ['a"x'] }), /classes\[0\]/],
    ["seven classes", section({ classes: ["a", "b", "c", "d", "e", "f", "g"] }), /at most 6/],
    ["a classFrom that is not a field", section({ classFrom: "nope" }), /classFrom: "nope" is not a field/],
    ["a classFrom on a text field", section({ classFrom: "text" }), /classFrom: "text" is not a choice field/],
    ["a headlineOf on a text field", section({ headlineOf: "text" }), /headlineOf: "text" is not the headline field/],
    ["a dataField on a choice", section({ dataField: "ground" }), /dataField: "ground" is not a text or image field/],
    ["a showIf that is missing", section({ showIf: "gone" }), /showIf: "gone" is not a field/],
    [
      "rich on a line",
      withTree([{ field: "footerLeft", as: "rich" }]),
      /field: "footerLeft" is not a headline or text field/,
    ],
    ["footer on a text", withTree([{ field: "text", as: "footer" }]), /field: "text" is not a line field/],
    ["an unknown as", withTree([{ field: "text", as: "html" }]), /as: must be rich, plain or footer/],
    [
      "an image slot on a text field",
      withTree([{ slot: "image", field: "text" }]),
      /field: "text" is not an image field/,
    ],
    ["an unknown slot", withTree([{ slot: "script" }]), /slot: must be logo, route, image or icon/],
    ["an unknown icon", withTree([{ slot: "icon", name: "skull" }]), /name: must be arrow or tick/],
    [
      "a literal that is too long",
      withTree([{ literal: "x".repeat(81) }]),
      /literal: must be text of 1 to 80 characters/,
    ],
    ["a node that is nothing", withTree([{ foo: 1 }]), /not a valid node/],
    ["an empty tree", withTree([]), /tree: must be a list with at least one node/],
    ["a block inside a paragraph", withTree([{ tag: "p", children: [{ tag: "div" }] }]), /<div> cannot sit inside <p>/],
    [
      "a logo inside a heading",
      withTree([{ tag: "h1", children: [{ slot: "logo" }] }]),
      /logo slot cannot sit inside <h1>/,
    ],
    ["a list item outside a list", withTree([{ tag: "li" }]), /<li> must sit directly inside a <ul>/],
    ["a div inside a list", withTree([{ tag: "ul", children: [{ tag: "div" }] }]), /<ul> may only hold <li>/],
  ])("refuses %s", (_name, raw, expected) => {
    expect(problems(raw).join("\n")).toMatch(expected);
  });

  it("refuses a tree nested deeper than six levels and one with more than 60 nodes", () => {
    let node: any = { tag: "span" };
    for (let i = 0; i < 6; i++) node = { tag: "div", children: [node] };
    expect(problems(withTree([node])).join("\n")).toMatch(/nested deeper than 6 levels/);
    const many = Array.from({ length: 61 }, () => ({ tag: "div" }));
    expect(problems(withTree(many)).join("\n")).toMatch(/more than 60 nodes/);
  });

  it("accepts a list, an icon in a span, and six levels", () => {
    const tree = [
      {
        tag: "ul",
        children: [
          { tag: "li", children: [{ tag: "span", children: [{ slot: "icon", name: "tick" }, { literal: "x" }] }] },
        ],
      },
      {
        tag: "div",
        children: [
          {
            tag: "div",
            children: [
              { tag: "div", children: [{ tag: "div", children: [{ tag: "div", children: [{ tag: "span" }] }] }] },
            ],
          },
        ],
      },
    ];
    expect(problems(withTree(tree))).toEqual([]);
  });
});

describe("the fields", () => {
  const field = (extra: object) => ({
    id: "extra",
    label: "Extra",
    kind: "line",
    max: 40,
    defaultValue: "x",
    ...extra,
  });
  const plus = (f: object) => withFields([...exampleTemplate().fields, f]);

  it.each<[string, unknown, RegExp]>([
    ["a duplicate id", plus(field({ id: "text" })), /"text" is defined twice/],
    ["a reserved id", plus(field({ id: "ground" })), /reserved for the ground preset/],
    ["an id with a dash", plus(field({ id: "a-b" })), /camelCase/],
    ["an unknown key", plus(field({ onclick: "x" })), /unknown key "onclick"/],
    ["an unknown kind", plus(field({ kind: "html" })), /kind must be/],
    [
      "a headline with another id",
      plus(field({ id: "title", kind: "headline", max: 50, defaultValue: "A *b*" })),
      /id "headline"/,
    ],
    [
      "a default over the max",
      plus(field({ max: 5, defaultValue: "toolong" })),
      /defaultValue: must be text of at most 5/,
    ],
    [
      "a headline without emphasis",
      withFields([{ id: "headline", label: "H", kind: "headline", max: 50, defaultValue: "No emphasis" }]),
      /exactly one \*emphasised\* phrase/,
    ],
    [
      "a headline with two emphases",
      withFields([{ id: "headline", label: "H", kind: "headline", max: 50, defaultValue: "*A* and *b*" }]),
      /exactly one/,
    ],
    [
      "a choice value that is not a class name",
      plus(
        field({
          id: "mood",
          kind: "choice",
          options: [
            { value: "a b", text: "A" },
            { value: "b", text: "B" },
          ],
          defaultValue: "b",
          max: undefined,
        }),
      ),
      /options\[0\]\.value/,
    ],
    [
      "a choice default outside its options",
      plus(
        field({
          id: "mood",
          kind: "choice",
          options: [
            { value: "a", text: "A" },
            { value: "b", text: "B" },
          ],
          defaultValue: "c",
          max: undefined,
        }),
      ),
      /defaultValue: must be one of the options/,
    ],
    [
      "thirteen fields",
      withFields(Array.from({ length: 13 }, (_, i) => field({ id: `f${i}` }))),
      /more than 12 fields/,
    ],
    ["an unknown preset", plus({ preset: "font" }), /preset must be/],
    [
      "a preset default outside its options",
      withFields([{ preset: "ground", defaultValue: "pink" }]),
      /defaultValue must be one of/,
    ],
  ])("refuses %s", (_name, raw, expected) => {
    expect(problems(raw).join("\n")).toMatch(expected);
  });
});

describe("the file", () => {
  it("refuses unknown keys, a wrong version, and the wrong kind of formats", () => {
    expect(problems({ ...exampleTemplate(), onload: "x" })).toEqual(['template: unknown key "onload"']);
    expect(problems({ ...exampleTemplate(), version: 2 })).toEqual(["version: must be 1"]);
    expect(problems({ ...exampleTemplate(), formats: ["li-carousel"] }).join()).toMatch(/formats\[0\]/);
    expect(problems({ ...exampleTemplate(), formats: ["li-profile"] }).join()).toMatch(/formats\[0\]/);
    expect(problems({ ...exampleTemplate(), formats: [] }).join()).toMatch(/at least one format/);
    expect(problems({ ...carouselExample(), formats: ["li-square"] }).join()).toMatch(/exactly \["li-carousel"\]/);
  });

  it("refuses text that is too long or empty", () => {
    expect(problems({ ...exampleTemplate(), name: "x".repeat(41) }).join()).toMatch(/name: must be text of 1 to 40/);
    expect(problems({ ...exampleTemplate(), name: "  " }).join()).toMatch(/name/);
    expect(problems({ ...exampleTemplate(), goal: "x".repeat(141) }).join()).toMatch(/goal/);
  });

  it("makes ids the server's business: a proposal must not carry one, a saved file must", () => {
    expect(problems(saved(exampleTemplate()))[0]).toMatch(/must not have them/);
    expect(problems(exampleTemplate(), "saved")[0]).toMatch(/both are needed/);
    expect(problems(saved(exampleTemplate(), "p-123"), "saved").join()).toMatch(/id: must be own- and 8 hex/);
    expect(problems(saved(exampleTemplate(), "own-0123ABCD"), "saved").join()).toMatch(/id: must be own-/);
    expect(problems({ ...exampleTemplate(), id: "own-0123abcd" }, "either").join()).toMatch(/both are needed/);
  });

  it("refuses a file over 60 kB and values that are not objects", () => {
    expect(problems({ ...exampleTemplate(), goal: "x".repeat(70_000) })).toEqual([
      "template: the file is larger than 60 kB",
    ]);
    for (const raw of [null, undefined, 5, "x", [], [exampleTemplate()]])
      expect(problems(raw)).toEqual(["template: must be an object"]);
  });

  it("lists at most 30 problems", () => {
    const tree = Array.from({ length: 50 }, () => ({ tag: "script" }));
    const found = problems(withTree(tree));
    expect(found).toHaveLength(31);
    expect(found[30]).toMatch(/^…and \d+ more$/);
  });

  it("does not mutate what it checks and never throws on odd input", () => {
    const t = exampleTemplate();
    const before = JSON.stringify(t);
    checkTemplate(t);
    expect(JSON.stringify(t)).toBe(before);
    const odd: any = exampleTemplate();
    odd.tree = [null, 5, "x", [], { tag: null }, { slot: 3 }, { field: {}, as: [] }];
    odd.fields = [null, 5, "x", { preset: {} }, { kind: {} }];
    expect(() => checkTemplate(odd)).not.toThrow();
    const circular: any = {};
    circular.self = circular;
    expect(problems(circular)).toEqual(["template: cannot be read as JSON"]);
  });
});

describe("the carousel", () => {
  it("needs the three slide kinds in order and three to eight default slides", () => {
    const c = carouselExample();
    expect(problems({ ...c, slides: c.slides.slice(0, 2) }).join()).toMatch(/exactly three slide kinds/);
    expect(problems({ ...c, slides: [c.slides[1], c.slides[0], c.slides[2]] }).join()).toMatch(/in this order/);
    expect(problems({ ...c, defaultSlides: c.defaultSlides.slice(0, 2) }).join()).toMatch(/3 to 8 slides/);
    expect(
      problems({ ...c, defaultSlides: [...c.defaultSlides, ...c.defaultSlides, ...c.defaultSlides] }).join(),
    ).toMatch(/3 to 8 slides/);
    expect(problems({ ...c, defaultSlides: [c.defaultSlides[1], ...c.defaultSlides] }).join()).toMatch(
      /first slide must be a cover/,
    );
  });

  it("refuses default content that does not fit the fields of its slide kind", () => {
    const c = carouselExample();
    c.defaultSlides[1].content = { nope: "x", ground: "pink", headline: "No emphasis" };
    const found = problems(c).join("\n");
    expect(found).toMatch(/defaultSlides\[1\]\.content\.nope/);
    expect(found).toMatch(/content\.ground: must be one of/);
    expect(found).toMatch(/content\.headline: a headline needs exactly one/);
  });

  it("refuses top-level fields and tree, and an image template with slides", () => {
    expect(problems({ ...carouselExample(), tree: [] }).join()).toMatch(/tree: a carousel has them per slide kind/);
    expect(problems({ ...exampleTemplate(), slides: [] }).join()).toMatch(/slides: only a carousel has them/);
  });

  it("names the slide kind in the place of a problem", () => {
    const c = carouselExample();
    c.slides[1].tree = [{ tag: "script" }];
    expect(problems(c)).toEqual(['slides.content.tree[0].tag: "script" is not an allowed tag']);
  });
});

describe("the lists of allowed things", () => {
  it("only knows tags and functions that the rules above rely on", () => {
    expect(TAGS).toHaveLength(14);
    expect(CSS_FUNCTIONS).toContain("color-mix");
    expect(CSS_FUNCTIONS).not.toContain("url");
  });
});
````

`tests/own-template.test.ts` (the engine: compile, render every format, escaping on every field, only `class` and `data-field` on tree elements, choice, image and icon, carousel):

````ts
// The engine for own templates: a checked file becomes a template that `buildImage` draws like a
// built-in one. Escaping is tried on every field, and nothing but `class` and `data-field` can
// end up on an element of the tree.
import { describe, expect, it } from "vitest";
import { TEMPLATES, buildImage, defaultContent, fieldsOf, template } from "../src/web/studio/templates.js";
import { FORMATS } from "../src/web/studio/formats.js";
import { IMAGE_FORMATS, TAGS, compileTemplate } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { carouselExample, exampleTemplate, saved } from "./helpers/template.js";

const brand = brandFromDisk();
const EVIL = `<img src=x onerror=alert(1)></style><script>alert(1)</script>"'&`;

describe("compileTemplate", () => {
  it("turns the example into a template shaped like a built-in one", () => {
    const t = compileTemplate(saved(exampleTemplate()));
    expect(t).toMatchObject({ id: "own-0123abcd", name: "Statement", kind: "image", own: true });
    expect(t.formats).toEqual(exampleTemplate().formats);
    expect(t.fields.map((f) => f.id)).toEqual([
      "ground",
      "headline",
      "headlineSize",
      "text",
      "footerLeft",
      "footerRight",
    ]);
    expect(defaultContent(t)).toMatchObject({ ground: "accent", headlineSize: "automatic", footerRight: "" });
    const headline = t.fields.find((f) => f.id === "headline")!;
    expect(headline).toMatchObject({ kind: "headline", required: true, emphasis: "exactly-one", max: 90 });
    expect(t.fields.find((f) => f.id === "ground")!.options!.map((o) => o.value)).toEqual(["light", "ink", "accent"]);
  });

  it("gives a proposal a stand-in id, and refuses a bad file with the first problem", () => {
    expect(compileTemplate(exampleTemplate()).id).toBe("own-proposal");
    const bad = { ...exampleTemplate(), css: ".a { background: url(x); }" };
    expect(() => compileTemplate(bad)).toThrow(
      /"Statement" was refused: css rule 1 \(\.a\) \(background\): url\(\) is not allowed/,
    );
  });

  it("compiles a carousel with three slide kinds, step counting on the content kind, and full default content", () => {
    const t = compileTemplate(saved(carouselExample()));
    expect(t).toMatchObject({ kind: "carousel", formats: ["li-carousel"], maxSlides: 20, fields: [] });
    expect(t.slides!.map((s) => [s.kind, s.counts])).toEqual([
      ["cover", false],
      ["content", true],
      ["closing", false],
    ]);
    expect(fieldsOf(t, "content").some((f) => f.id === "text")).toBe(true);
    expect(t.defaultSlides).toHaveLength(4);
    expect(t.defaultSlides![1].content.text).toBe(exampleTemplate().fields[3].defaultValue);
    expect(t.defaultSlides![1].content.headline).toBe("One *step.*");
  });

  it("never takes a built-in id", () => {
    for (const s of TEMPLATES) expect(s.id.startsWith("own-")).toBe(false);
  });
});

describe("buildImage with an own template", () => {
  const own = compileTemplate(saved(exampleTemplate()));

  it("draws every format, at the size of the format, with only data sources", () => {
    expect(own.formats).toEqual(expect.arrayContaining(["li-square", "story", "wide"]));
    for (const f of own.formats) {
      const b = buildImage({ template: own, format: f, brand });
      const format = FORMATS.find((x) => x.key === f)!;
      expect([b.width, b.height]).toEqual([format.width, format.height]);
      expect(b.html).toContain("template-own-0123abcd");
      expect(b.html).toContain('data-field="headline"');
      for (const [, source] of b.html.matchAll(/\ssrc="([^"]*)"/g)) expect(source.startsWith("data:")).toBe(true);
      expect(b.css).not.toMatch(/\d(rem)\b/);
    }
    expect(IMAGE_FORMATS.length).toBeGreaterThan(5);
  });

  it("also works once registered by id, through the template object only", () => {
    expect(template("own-0123abcd")).toBeNull();
    expect(() => buildImage({ template: "own-0123abcd", format: "li-square", brand })).toThrow(/Unknown template/);
    expect(() => buildImage({ template: own, format: "li-carousel", brand })).toThrow(/has no format li-carousel/);
  });

  it("escapes malicious input in every field", () => {
    for (const f of own.fields) {
      const b = buildImage({ template: own, content: { [f.id]: EVIL }, format: "li-square", brand });
      expect(b.html, f.id).not.toContain("<img src=x");
      expect(b.html, f.id).not.toContain("<script");
      expect(b.html, f.id).not.toContain("</style>");
      expect(b.html, f.id).not.toMatch(/<[^>]*\sonerror=/);
    }
  });

  it("puts only class and data-field on the elements of the tree", () => {
    const tree = exampleTemplate().tree;
    const html = buildImage({ template: own, format: "li-square", brand }).html;
    const tags = html.match(new RegExp(`<(${TAGS.join("|")})(\\s[^>]*)?>`, "g"))!.slice(1); // the first is the wrapper
    expect(tags.length).toBeGreaterThan(4);
    for (const tag of tags) {
      const names = [...tag.matchAll(/\s([a-z-]+)=/g)].map((m) => m[1]);
      for (const n of names) expect(["class", "data-field"], tag).toContain(n);
    }
    expect(tree).toBeTruthy();
  });

  it("hides an element whose showIf field is empty, and sizes the headline by length or by choice", () => {
    expect(buildImage({ template: own, content: { text: "" }, format: "li-square", brand }).html).not.toContain(
      'data-field="text"',
    );
    const long = "A very long headline that goes on and on so that it needs a smaller size *indeed.*";
    expect(buildImage({ template: own, content: { headline: long }, format: "li-square", brand }).html).toContain(
      'class="headline small"',
    );
    expect(
      buildImage({ template: own, content: { headline: long, headlineSize: "large" }, format: "li-square", brand })
        .html,
    ).toContain('class="headline"');
  });

  it("takes the ground from the field, and the logo with it", () => {
    const light = buildImage({ template: own, content: { ground: "light" }, format: "li-square", brand }).html;
    const ink = buildImage({ template: own, content: { ground: "ink" }, format: "li-square", brand }).html;
    expect(light).toMatch(/class="image "/);
    expect(ink).toContain('class="image ground-ink"');
    expect(ink).not.toBe(light);
    expect(
      buildImage({ template: own, content: { ground: 'x" onclick="y' }, format: "li-square", brand }).html,
    ).toContain('class="image ground-accent"');
  });

  it("uses the footer field's own text, or the brand's website when it is empty", () => {
    expect(buildImage({ template: own, format: "li-square", brand }).html).toContain(
      `<strong>${brand.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</strong>`,
    );
    expect(buildImage({ template: own, content: { footerRight: "mine" }, format: "li-square", brand }).html).toContain(
      "<strong>mine</strong>",
    );
  });

  it("is deterministic", () => {
    const a = buildImage({ template: own, content: { headline: "A *b*" }, format: "li-portrait", brand });
    expect(buildImage({ template: own, content: { headline: "A *b*" }, format: "li-portrait", brand })).toEqual(a);
  });
});

describe("choice, image and icon", () => {
  const file = () => {
    const e = exampleTemplate();
    return {
      ...e,
      fields: [
        ...e.fields,
        {
          id: "mood",
          label: "Mood",
          kind: "choice",
          options: [
            { value: "calm", text: "Calm" },
            { value: "loud", text: "Loud" },
          ],
          defaultValue: "calm",
        },
        { id: "photo", label: "Photo", kind: "media", required: true },
      ],
      tree: [
        {
          tag: "div",
          classes: ["wrap"],
          classFrom: "mood",
          children: [
            { slot: "image", field: "photo" },
            { slot: "icon", name: "tick" },
          ],
        },
        ...e.tree,
      ],
    };
  };

  it("adds the chosen option as a class, and falls back to the default for a value that is not an option", () => {
    const t = compileTemplate(file());
    expect(buildImage({ template: t, content: { mood: "loud" }, format: "li-square", brand }).html).toContain(
      'class="wrap loud"',
    );
    expect(buildImage({ template: t, content: { mood: 'x" onclick="y' }, format: "li-square", brand }).html).toContain(
      'class="wrap calm"',
    );
  });

  it("shows a placeholder without an image and the image when the id is known", () => {
    const t = compileTemplate(file());
    expect(buildImage({ template: t, format: "li-square", brand }).html).toContain(
      '<div class="media empty">Choose an image</div>',
    );
    const id = "0123456789abcdef0123456789abcdef.png";
    const html = buildImage({
      template: t,
      content: { photo: id },
      media: { [id]: "data:image/png;base64,AAAA" },
      format: "li-square",
      brand,
    }).html;
    expect(html).toContain('<img class="media" src="data:image/png;base64,AAAA" alt="">');
    expect(
      buildImage({ template: t, content: { photo: "http://evil.example/x.png" }, format: "li-square", brand }).html,
    ).not.toContain("evil.example");
  });

  it("adds the icon symbols only when an icon is used", () => {
    expect(buildImage({ template: compileTemplate(file()), format: "li-square", brand }).html).toContain(
      '<svg class="symbols"',
    );
    expect(buildImage({ template: compileTemplate(exampleTemplate()), format: "li-square", brand }).html).not.toContain(
      "symbols",
    );
  });
});

describe("a carousel", () => {
  const t = compileTemplate(saved(carouselExample()));

  it("renders each slide as a section, with the slide kind's own content", () => {
    t.defaultSlides!.forEach((d, i) => {
      const b = buildImage({ template: t, slides: t.defaultSlides, slide: i, format: "li-carousel", brand });
      expect(b.html).toContain('<section class="image slide');
      expect(b.html).toContain(d.content.headline.replace(/\*(.*)\*/, "<em>$1</em>"));
      expect([b.width, b.height]).toEqual([1080, 1350]);
    });
  });

  it("escapes input on every slide kind", () => {
    for (const kind of ["cover", "content", "closing"]) {
      for (const f of fieldsOf(t, kind)) {
        const b = buildImage({
          template: t,
          slides: [{ kind, content: { [f.id]: EVIL } }],
          slide: 0,
          format: "li-carousel",
          brand,
        });
        expect(b.html, `${kind}.${f.id}`).not.toMatch(/<[^>]*\sonerror=|<script/);
      }
    }
  });

  it("counts steps for the content kind only", () => {
    const c = t as any;
    expect(c.slides.filter((s: any) => s.counts).map((s: any) => s.kind)).toEqual(["content"]);
  });
});
````

`tests/template-schema.test.ts` (the answer schema is a valid output format and refuses extra keys; `answerToFile` gives back the file the answer was made from):

````ts
// The schema for the model's answer: it can be sent as an output format, an answer that fills
// every key turns into the template file, and `checkTemplate` still has the last word.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { CarouselAnswerSchema, ImageAnswerSchema, answerSchema, answerToFile } from "../src/server/template-schema.js";
import { checkTemplate } from "../src/web/studio/own-template.js";
import { answerOf, carouselExample, exampleTemplate } from "./helpers/template.js";

describe("the answer schema", () => {
  it("is a valid output format, small enough to send, for both kinds", () => {
    for (const kind of ["image", "carousel"] as const) {
      const format = zodOutputFormat(answerSchema(kind));
      expect(format.type).toBe("json_schema");
      expect(JSON.stringify(format.schema).length).toBeLessThan(60_000);
    }
  });

  it("accepts a full answer and refuses an unknown tag or a missing key", () => {
    expect(ImageAnswerSchema.safeParse(answerOf(exampleTemplate())).success).toBe(true);
    expect(CarouselAnswerSchema.safeParse(answerOf(carouselExample())).success).toBe(true);
    const bad = answerOf(exampleTemplate());
    bad.template.tree[2].tag = "script";
    expect(ImageAnswerSchema.safeParse(bad).success).toBe(false);
    const missing = answerOf(exampleTemplate());
    delete missing.template.fields[1].label;
    expect(ImageAnswerSchema.safeParse(missing).success).toBe(false);
  });

  it("refuses an extra key instead of dropping it quietly", () => {
    const extra = answerOf(exampleTemplate());
    extra.template.tree[2].onclick = "x()";
    expect(ImageAnswerSchema.safeParse(extra).success).toBe(false);
    const top = answerOf(exampleTemplate());
    top.template.slides = [];
    expect(ImageAnswerSchema.safeParse(top).success).toBe(false);
  });

  it("allows a tree six levels deep and not seven", () => {
    const deep = (levels: number): any =>
      levels === 1 ? { tag: "span" } : { tag: "div", children: [deep(levels - 1)] };
    const make = (levels: number) => {
      const a = answerOf(exampleTemplate());
      a.template.tree = [answerOf({ ...exampleTemplate(), tree: [deep(levels)] }).template.tree[0]];
      return a;
    };
    expect(ImageAnswerSchema.safeParse(make(6)).success).toBe(true);
    expect(ImageAnswerSchema.safeParse(make(7)).success).toBe(false);
  });
});

describe("answerToFile", () => {
  it("gives back the template file that the answer was made from, for an image and a carousel", () => {
    const image = exampleTemplate();
    expect(answerToFile(answerOf(image), "image", image.formats)).toEqual(image);
    const carousel = carouselExample();
    expect(answerToFile(answerOf(carousel), "carousel", ["li-carousel"])).toEqual(carousel);
  });

  it("takes kind and formats from the user, not from the model", () => {
    const file: any = answerToFile(answerOf(exampleTemplate()), "image", ["story"]);
    expect(file).toMatchObject({ version: 1, kind: "image", formats: ["story"] });
  });

  it("leaves what is wrong for checkTemplate to refuse: an empty field kind, a ref to nothing", () => {
    const a = answerOf(exampleTemplate());
    a.template.fields[1].kind = "";
    a.template.tree[2].children[0].dataField = "nope";
    const file = answerToFile(a, "image", ["li-square"]);
    const r = checkTemplate(file, { mode: "proposal" });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.problems.join("\n")).toMatch(/kind must be headline, text, line, choice or media/);
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-check.test.ts tests/own-template.test.ts tests/template-schema.test.ts`
Expected: FAIL, `Cannot find module '../src/web/studio/own-template.js'` (and `template-schema.js`).

- [ ] **Step 3: Write `own-template.js` and its types**

The module has four parts: the CSS judge (an outright-refusal pass for characters, then rule, selector and value tokenizers, so that `url (`, `URL(`, `u\72l(` and `image-set(` all fail for a reason), the field and tree checks (references must exist and fit; content model; limits), `checkTemplate`, and the engine (`render` walks the tree and emits only through `TemplateContext`).

````js
// Own templates: a template made from data (fields, a tree of nodes and some CSS) instead of
// code. One module for the browser and the server. `checkTemplate` is the only judge: it runs on
// every proposal, before saving, when a file is read, and again in `compileTemplate`. It refuses
// and never repairs; every message names the place and the problem. `compileTemplate` turns a
// checked file into an object shaped like a built-in `Template` (templates.d.ts).
//
// The model that proposes a template is not trusted, and neither is a file on disk. A template
// can only produce what the engine emits: elements from a fixed list with `class` and
// `data-field`, text through `c.t`, `c.e` and `c.footer`, and the slots (logo, route, image, icon).
// The CSS is limited to plain layout and the brand's own variables.
//
// This module and templates.js import each other; that is safe because neither calls the
// other while it loads, only from inside functions.
import { FORMATS } from "./formats.js";
import { countEmphasis, escapeHtml } from "./templates.js";
import { HEADLINE_SIZE, ground, groundClass, headlineClass, logoMode } from "./templates/fields.js";

export const TAGS = [
  "div",
  "section",
  "main",
  "header",
  "footer",
  "figure",
  "h1",
  "h2",
  "h3",
  "p",
  "span",
  "strong",
  "ul",
  "li",
];
export const AS_VALUES = ["rich", "plain", "footer"];
export const ICONS = ["arrow", "tick"];
export const PRESETS = ["ground", "headlineSize"];
export const SLIDE_KINDS = ["cover", "content", "closing"];
export const IMAGE_FORMATS = FORMATS.map((f) => f.key).filter(
  (k) => !["li-carousel", "li-profile", "li-company"].includes(k),
);
/** The 14 variables of every brand (the same list as `CSS_VARIABLES` in brand-proposal.ts; a test keeps them equal). */
export const BRAND_VARIABLES = [
  "--ink",
  "--accent",
  "--accent-hover",
  "--accent-light",
  "--accent-soft",
  "--accent-pale",
  "--background",
  "--white",
  "--muted",
  "--stroke",
  "--success",
  "--warning",
  "--soft-warning",
  "--error",
];
/** What `var()` may name: the brand variables, the grounds, and the ones the base CSS sets per ground and format. */
export const ALLOWED_VARIABLES = [
  ...BRAND_VARIABLES,
  "--ground-light",
  "--ground-light-text",
  "--ground-ink",
  "--ground-ink-text",
  "--ground-accent",
  "--ground-accent-text",
  "--emphasis",
  "--soft",
  "--hairline",
  "--width",
  "--height",
];
/** The CSS functions a template may use (the names as shown to the model). */
export const CSS_FUNCTIONS = [
  "var",
  "calc",
  "min",
  "max",
  "clamp",
  "color-mix",
  "translate",
  "translateX",
  "translateY",
  "scale",
  "rotate",
  "minmax",
  "repeat",
  "linear-gradient",
  "radial-gradient",
];
export const CSS_SELECTORS = [":first-child", ":last-child", ":not()", ":nth-child()", "::before", "::after"];
export const DENIED_PROPERTIES = ["font", "font-family", "animation*", "transition*"];
export const LIMITS = {
  name: 40,
  goal: 140,
  slideName: 30,
  label: 40,
  help: 160,
  fields: 12,
  options: 8,
  depth: 6,
  nodes: 60,
  classes: 6,
  literal: 80,
  css: 6000,
  rules: 80,
  file: 60_000,
  templates: 30,
  minSlides: 3,
  maxSlides: 8,
};

const FUNCTION_SET = new Set(CSS_FUNCTIONS.map((f) => f.toLowerCase()));
const VARIABLE_SET = new Set(ALLOWED_VARIABLES);
const NAMED_COLOURS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen " +
    "canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext " +
    "activeborder activecaption appworkspace background buttonhighlight buttonshadow captiontext inactiveborder inactivecaption inactivecaptiontext infobackground infotext menu menutext scrollbar threeddarkshadow threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext"
  ).split(" "),
);

const ID = /^[a-z][A-Za-z0-9]{0,23}$/;
const CLASS = /^[a-z][a-z0-9-]{0,30}$/;
const TEMPLATE_ID = /^own-[0-9a-f]{8}$/;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const PHRASING_PARENTS = ["p", "h1", "h2", "h3", "span", "strong"];
const MAX_PROBLEMS = 30;

// ---------------------------------------------------------------------------------------------
// The CSS
// ---------------------------------------------------------------------------------------------

const OUTRIGHT = [
  [/@/, 'the character "@" is not allowed (no @import, @font-face or @media)'],
  [/\/\*/, "comments are not allowed"],
  [/\\/, "backslashes are not allowed"],
  [/</, 'the character "<" is not allowed'],
  [/#/, 'the character "#" is not allowed (no hex colours, no ids)'],
  [/\[/, 'the character "[" is not allowed (no attribute selectors)'],
  [/[^\u0009\u000a\u000d\u0020-\u007e]/, "only plain ASCII text is allowed (no control or special characters)"],
];
const SELECTOR_TOKEN = new RegExp(
  [
    String.raw`\s*([>+~])\s*`,
    String.raw`\s+`,
    String.raw`\.([a-z][a-z0-9-]{0,30})(?![A-Za-z0-9_-])`,
    String.raw`\*`,
    String.raw`([a-z][a-z0-9]*)(?![A-Za-z0-9_-])`,
    String.raw`:(?:first-child|last-child)(?![A-Za-z0-9_-])`,
    String.raw`::(?:before|after)(?![A-Za-z0-9_-])`,
    String.raw`:not\(([^()]*)\)`,
    String.raw`:nth-child\(([^()]*)\)`,
  ].join("|"),
  "y",
);
const NOT_ARGUMENT = /^(\.[a-z][a-z0-9-]{0,30}|[a-z][a-z0-9]*|:first-child|:last-child)$/;
const NTH_ARGUMENT = /^\s*(odd|even|-?\d+|-?\d*n(\s*[+-]\s*\d+)?)\s*$/;
const VALUE_TOKEN =
  /\s+|(--[a-z0-9-]+)|(-?[A-Za-z_][A-Za-z0-9_-]*)(\s*\()?|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?|[(),/*+-]/y;
const DENIED_PROPERTY = /^(font|font-family|(-webkit-)?animation(-[a-z-]+)?|(-webkit-)?transition(-[a-z-]+)?)$/;

/** Splits on top-level commas (not inside parentheses). */
function splitSelectors(text) {
  const parts = [];
  let depth = 0;
  let begin = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(begin, i));
      begin = i + 1;
    }
  }
  parts.push(text.slice(begin));
  return parts;
}

/** The problem with one selector, or null. */
function selectorProblem(selector) {
  const text = selector.trim();
  if (!text) return "the selector is empty";
  let pos = 0;
  let last = "start";
  while (pos < text.length) {
    SELECTOR_TOKEN.lastIndex = pos;
    const m = SELECTOR_TOKEN.exec(text);
    if (!m) return `"${text.slice(pos, pos + 12)}" is not allowed in a selector`;
    if (m[3] !== undefined && !TAGS.includes(m[3])) return `the tag "${m[3]}" is not allowed in a selector`;
    if (m[4] !== undefined && !NOT_ARGUMENT.test(m[4]))
      return `:not() takes one class, tag or :first-child / :last-child`;
    if (m[4] !== undefined && /^[a-z]/.test(m[4]) && !TAGS.includes(m[4]))
      return `the tag "${m[4]}" is not allowed in a selector`;
    if (m[5] !== undefined && !NTH_ARGUMENT.test(m[5]))
      return `:nth-child() takes odd, even, a number or an expression like 2n+1`;
    const combinator = m[1] !== undefined;
    if (combinator && (last === "start" || last === "combinator")) return "a combinator needs a selector on both sides";
    last = combinator ? "combinator" : "simple";
    pos = SELECTOR_TOKEN.lastIndex;
  }
  return last === "combinator" ? "a combinator needs a selector on both sides" : null;
}

/** The problem with the value of one declaration, or null. */
function valueProblem(prop, value) {
  if (/^"{2}$/.test(value)) return prop === "content" ? null : 'quotes are not allowed (only content: "")';
  if (prop === "content") return 'content may only be ""';
  if (/["']/.test(value)) return "quotes are not allowed";
  let pos = 0;
  let depth = 0;
  let previous = "";
  while (pos < value.length) {
    VALUE_TOKEN.lastIndex = pos;
    const m = VALUE_TOKEN.exec(value);
    if (!m) return `the character "${value[pos]}" is not allowed in a value`;
    pos = VALUE_TOKEN.lastIndex;
    if (/^\s+$/.test(m[0])) continue;
    if (m[1] !== undefined) {
      if (previous !== "var(") return `${m[1]} may only be used inside var()`;
      if (!VARIABLE_SET.has(m[1])) return `${m[1]} is not a brand variable (see the list of variables)`;
    } else if (m[2] !== undefined) {
      const name = m[2].toLowerCase();
      if (m[3] !== undefined) {
        if (!FUNCTION_SET.has(name)) return `${m[2]}() is not allowed`;
        depth++;
        previous = `${name}(`;
        continue;
      }
      if (NAMED_COLOURS.has(name))
        return `the colour "${m[2]}" is not allowed (use var(--accent) and the other brand variables, or color-mix)`;
    } else if (m[0] === "(") {
      depth++;
    } else if (m[0] === ")") {
      if (--depth < 0) return "unbalanced parentheses";
    }
    previous = m[0];
  }
  if (depth !== 0) return "unbalanced parentheses";
  const mixes = (value.match(/color-mix\s*\(/gi) ?? []).length;
  const good = (value.match(/color-mix\(\s*in\s+srgb\s*,/gi) ?? []).length;
  if (mixes !== good) return "color-mix() must start with in srgb,";
  return null;
}

/** Every problem of a template's CSS. */
function cssProblems(css) {
  if (typeof css !== "string") return ["css: must be text"];
  if (css.length > LIMITS.css) return [`css: longer than ${LIMITS.css} characters`];
  const problems = [];
  for (const [pattern, text] of OUTRIGHT) if (pattern.test(css)) problems.push(`css: ${text}`);
  if (problems.length) return problems;
  const rules = [];
  let i = 0;
  while (css.slice(i).trim() !== "") {
    const open = css.indexOf("{", i);
    const close = css.indexOf("}", i);
    if (open === -1) return [...problems, 'css: text after the last rule (a "{" is missing)'];
    if (close !== -1 && close < open) return [...problems, 'css: a "}" without a matching "{"'];
    const end = css.indexOf("}", open);
    if (end === -1) return [...problems, 'css: a rule is not closed (a "}" is missing)'];
    const body = css.slice(open + 1, end);
    const selector = css.slice(i, open).trim();
    if (body.includes("{"))
      return [...problems, `css rule ${rules.length + 1} (${selector.slice(0, 40)}): nested rules are not allowed`];
    rules.push({ selector, body });
    i = end + 1;
  }
  if (rules.length > LIMITS.rules) problems.push(`css: more than ${LIMITS.rules} rules`);
  rules.forEach(({ selector, body }, n) => {
    const where = `css rule ${n + 1} (${selector.slice(0, 40)})`;
    for (const part of splitSelectors(selector)) {
      const p = selectorProblem(part);
      if (p) problems.push(`${where}: ${p}`);
    }
    for (const declaration of body.split(";")) {
      const d = declaration.trim();
      if (!d) continue;
      const colon = d.indexOf(":");
      const prop = colon > 0 ? d.slice(0, colon).trim() : "";
      if (!/^-?[a-z][a-z-]*$/.test(prop)) {
        problems.push(`${where}: "${d.slice(0, 30)}" is not a declaration`);
        continue;
      }
      if (DENIED_PROPERTY.test(prop)) {
        problems.push(`${where}: the property ${prop} is not allowed`);
        continue;
      }
      const p = valueProblem(prop, d.slice(colon + 1).trim());
      if (p) problems.push(`${where} (${prop}): ${p}`);
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Fields and the tree
// ---------------------------------------------------------------------------------------------

function unknownKeys(o, allowed, where, problems) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) problems.push(`${where}: unknown key "${k}"`);
}

function text(v, where, min, max, problems) {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) {
    problems.push(`${where}: must be text of ${min === max ? max : `${min} to ${max}`} characters`);
    return false;
  }
  return true;
}

/** One field as the engine uses it (the shape of `Field` in templates.d.ts). */
export function expandField(f) {
  if (f.preset === "ground") return ground(f.defaultValue ?? "light");
  if (f.preset === "headlineSize")
    return { ...HEADLINE_SIZE, defaultValue: f.defaultValue ?? HEADLINE_SIZE.defaultValue };
  if (f.kind === "headline") {
    return {
      ...f,
      required: true,
      emphasis: "exactly-one",
      help: "Put exactly one phrase between *asterisks*; it gets the accent colour.",
    };
  }
  if (f.kind === "media") return { ...f, defaultValue: "" };
  return { ...f };
}

/** Checks a list of fields; returns a map from id to the expanded field. */
function checkFields(fields, where, problems) {
  const byId = new Map();
  if (!Array.isArray(fields)) {
    problems.push(`${where}: must be a list`);
    return byId;
  }
  if (fields.length > LIMITS.fields) problems.push(`${where}: more than ${LIMITS.fields} fields`);
  fields.slice(0, LIMITS.fields).forEach((f, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(f)) return problems.push(`${at}: must be an object`);
    if ("preset" in f) {
      unknownKeys(f, ["preset", "defaultValue"], at, problems);
      if (!PRESETS.includes(f.preset)) return problems.push(`${at}: preset must be "ground" or "headlineSize"`);
      if (byId.has(f.preset)) return problems.push(`${at}: the field "${f.preset}" is defined twice`);
      const expanded = expandField({ preset: f.preset });
      if ("defaultValue" in f && !expanded.options.some((o) => o.value === f.defaultValue)) {
        problems.push(`${at}: defaultValue must be one of ${expanded.options.map((o) => o.value).join(", ")}`);
      }
      return byId.set(f.preset, expandField(f));
    }
    const keys = {
      headline: ["id", "label", "kind", "max", "defaultValue"],
      text: ["id", "label", "kind", "max", "defaultValue", "help"],
      line: ["id", "label", "kind", "max", "defaultValue", "help"],
      choice: ["id", "label", "kind", "options", "defaultValue"],
      media: ["id", "label", "kind", "required", "help"],
    }[f.kind];
    if (!keys) return problems.push(`${at}: kind must be headline, text, line, choice or media`);
    unknownKeys(f, keys, at, problems);
    if (typeof f.id !== "string" || !ID.test(f.id))
      return problems.push(`${at}: id must be camelCase letters and digits, at most 24 characters`);
    if (PRESETS.includes(f.id)) return problems.push(`${at}: the id "${f.id}" is reserved for the ${f.id} preset`);
    if (f.kind === "headline" && f.id !== "headline")
      return problems.push(`${at}: the headline field must have the id "headline"`);
    if (byId.has(f.id)) return problems.push(`${at}: the field "${f.id}" is defined twice`);
    text(f.label, `${at}.label`, 1, LIMITS.label, problems);
    if ("help" in f && typeof f.help !== "string") problems.push(`${at}.help: must be text`);
    else if (typeof f.help === "string" && f.help.length > LIMITS.help)
      problems.push(`${at}.help: longer than ${LIMITS.help} characters`);
    if (f.kind === "choice") {
      const options = f.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > LIMITS.options) {
        problems.push(`${at}.options: must be a list of 2 to ${LIMITS.options} options`);
      } else {
        const seen = new Set();
        options.forEach((o, n) => {
          if (!isObject(o)) return problems.push(`${at}.options[${n}]: must be an object`);
          unknownKeys(o, ["value", "text"], `${at}.options[${n}]`, problems);
          if (typeof o.value !== "string" || !CLASS.test(o.value))
            problems.push(`${at}.options[${n}].value: must be a class name (lowercase letters, digits and hyphens)`);
          else if (seen.has(o.value)) problems.push(`${at}.options[${n}].value: "${o.value}" appears twice`);
          else seen.add(o.value);
          text(o.text, `${at}.options[${n}].text`, 1, 30, problems);
        });
        if (!options.some((o) => isObject(o) && o.value === f.defaultValue))
          problems.push(`${at}.defaultValue: must be one of the options`);
      }
    } else if (f.kind === "media") {
      if ("required" in f && typeof f.required !== "boolean") problems.push(`${at}.required: must be true or false`);
    } else {
      const [low, high] = { headline: [10, 120], text: [10, 400], line: [5, 120] }[f.kind];
      if (!Number.isInteger(f.max) || f.max < low || f.max > high)
        problems.push(`${at}.max: must be a whole number from ${low} to ${high}`);
      else if (typeof f.defaultValue !== "string" || f.defaultValue.length > f.max)
        problems.push(`${at}.defaultValue: must be text of at most ${f.max} characters`);
      else if (f.kind === "headline" && countEmphasis(f.defaultValue) !== 1)
        problems.push(`${at}.defaultValue: a headline needs exactly one *emphasised* phrase`);
    }
    byId.set(f.id, expandField(f));
  });
  return byId;
}

const kindOf = (fields, id) => fields.get(id)?.kind;

/** Checks a tree of nodes against the fields it may refer to. */
function checkTree(tree, fields, where, problems) {
  if (!Array.isArray(tree) || tree.length === 0)
    return problems.push(`${where}: must be a list with at least one node`);
  let count = 0;
  const need = (at, key, id, kinds, what) => {
    if (typeof id !== "string" || !fields.has(id))
      problems.push(`${at}.${key}: "${String(id)}" is not a field of this template`);
    else if (!kinds.includes(kindOf(fields, id))) problems.push(`${at}.${key}: "${id}" is not ${what}`);
  };
  const visit = (node, depth, parent, at) => {
    count++;
    if (depth > LIMITS.depth) return problems.push(`${at}: nested deeper than ${LIMITS.depth} levels`);
    if (!isObject(node)) return problems.push(`${at}: must be an object`);
    const inPhrasing = parent && PHRASING_PARENTS.includes(parent.tag);
    if ("slot" in node) {
      if (inPhrasing && node.slot !== "icon")
        return problems.push(`${at}: a ${node.slot} slot cannot sit inside <${parent.tag}>`);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (node.slot === "logo" || node.slot === "route") return unknownKeys(node, ["slot"], at, problems);
      if (node.slot === "image") {
        unknownKeys(node, ["slot", "field"], at, problems);
        return need(at, "field", node.field, ["media"], "an image field");
      }
      if (node.slot === "icon") {
        unknownKeys(node, ["slot", "name"], at, problems);
        if (!ICONS.includes(node.name)) problems.push(`${at}.name: must be arrow or tick`);
        return;
      }
      return problems.push(`${at}.slot: must be logo, route, image or icon`);
    }
    if ("tag" in node) {
      unknownKeys(node, ["tag", "classes", "classFrom", "headlineOf", "dataField", "showIf", "children"], at, problems);
      if (!TAGS.includes(node.tag)) return problems.push(`${at}.tag: "${String(node.tag)}" is not an allowed tag`);
      if (inPhrasing && !["span", "strong"].includes(node.tag))
        problems.push(`${at}: <${node.tag}> cannot sit inside <${parent.tag}>`);
      if (parent?.tag === "ul" && node.tag !== "li") problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (node.tag === "li" && parent?.tag !== "ul") problems.push(`${at}: <li> must sit directly inside a <ul>`);
      if ("classes" in node) {
        if (!Array.isArray(node.classes) || node.classes.length > LIMITS.classes)
          problems.push(`${at}.classes: must be a list of at most ${LIMITS.classes} class names`);
        else {
          node.classes.forEach((c, n) => {
            if (typeof c !== "string" || !CLASS.test(c))
              problems.push(`${at}.classes[${n}]: must be a class name (lowercase letters, digits and hyphens)`);
          });
        }
      }
      if ("classFrom" in node) need(at, "classFrom", node.classFrom, ["choice"], "a choice field");
      if ("headlineOf" in node) need(at, "headlineOf", node.headlineOf, ["headline"], "the headline field");
      if ("dataField" in node)
        need(at, "dataField", node.dataField, ["headline", "text", "line", "media"], "a text or image field");
      if ("showIf" in node)
        need(at, "showIf", node.showIf, ["headline", "text", "line", "media"], "a text or image field");
      if ("children" in node) {
        if (!Array.isArray(node.children)) problems.push(`${at}.children: must be a list`);
        else node.children.forEach((child, n) => visit(child, depth + 1, node, `${at}.children[${n}]`));
      }
      return;
    }
    if ("literal" in node) {
      unknownKeys(node, ["literal"], at, problems);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      return void text(node.literal, `${at}.literal`, 1, LIMITS.literal, problems);
    }
    if ("field" in node) {
      unknownKeys(node, ["field", "as"], at, problems);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (!AS_VALUES.includes(node.as)) return problems.push(`${at}.as: must be rich, plain or footer`);
      const kinds = { rich: ["headline", "text"], plain: ["headline", "text", "line"], footer: ["line"] }[node.as];
      return need(at, "field", node.field, kinds, `a ${kinds.join(" or ")} field (needed for "${node.as}")`);
    }
    problems.push(`${at}: not a valid node (it needs tag, field, literal or slot)`);
  };
  tree.forEach((node, n) => visit(node, 1, null, `${where}[${n}]`));
  if (count > LIMITS.nodes) problems.push(`${where}: more than ${LIMITS.nodes} nodes`);
}

/** Checks that a default content object fits its fields. */
function checkContent(content, fields, at, problems) {
  if (!isObject(content)) return problems.push(`${at}: must be an object`);
  for (const [id, value] of Object.entries(content)) {
    const f = fields.get(id);
    if (!f || f.kind === "media") problems.push(`${at}.${id}: not a text or choice field of this slide kind`);
    else if (typeof value !== "string") problems.push(`${at}.${id}: must be text`);
    else if (f.kind === "choice" && !f.options.some((o) => o.value === value))
      problems.push(`${at}.${id}: must be one of ${f.options.map((o) => o.value).join(", ")}`);
    else if (f.max !== undefined && value.length > f.max) problems.push(`${at}.${id}: longer than ${f.max} characters`);
    else if (f.kind === "headline" && countEmphasis(value) !== 1)
      problems.push(`${at}.${id}: a headline needs exactly one *emphasised* phrase`);
  }
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

/**
 * `mode`: "proposal" (no id or created, as the model or an agent writes it), "saved" (both
 * required, as in a file in the project) or "either".
 * @returns {{ ok: true, template: object } | { ok: false, problems: string[] }}
 */
export function checkTemplate(raw, { mode = "either" } = {}) {
  const problems = [];
  const refuse = () => ({
    ok: false,
    problems:
      problems.length > MAX_PROBLEMS
        ? [...problems.slice(0, MAX_PROBLEMS), `…and ${problems.length - MAX_PROBLEMS} more`]
        : problems,
  });
  if (!isObject(raw)) return { ok: false, problems: ["template: must be an object"] };
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return { ok: false, problems: ["template: cannot be read as JSON"] };
  }
  if (size > LIMITS.file) return { ok: false, problems: ["template: the file is larger than 60 kB"] };
  unknownKeys(
    raw,
    ["version", "id", "created", "name", "goal", "kind", "formats", "css", "fields", "tree", "slides", "defaultSlides"],
    "template",
    problems,
  );
  if (raw.version !== 1) problems.push("version: must be 1");
  const hasId = "id" in raw;
  const hasCreated = "created" in raw;
  if (mode === "proposal" && (hasId || hasCreated))
    problems.push("id, created: a proposal must not have them; the studio makes them when you use the template");
  else if ((mode === "saved" || hasId || hasCreated) && !(hasId && hasCreated))
    problems.push("id, created: both are needed in a saved template");
  if (hasId && !(typeof raw.id === "string" && TEMPLATE_ID.test(raw.id)))
    problems.push("id: must be own- and 8 hex characters");
  if (hasCreated && !(typeof raw.created === "string" && !Number.isNaN(Date.parse(raw.created))))
    problems.push("created: must be a date and time");
  text(raw.name, "name", 1, LIMITS.name, problems);
  text(raw.goal, "goal", 1, LIMITS.goal, problems);
  if (raw.kind !== "image" && raw.kind !== "carousel") problems.push('kind: must be "image" or "carousel"');
  if (!Array.isArray(raw.formats) || raw.formats.length === 0)
    problems.push("formats: must be a list with at least one format");
  else if (raw.kind === "carousel") {
    if (raw.formats.length !== 1 || raw.formats[0] !== "li-carousel")
      problems.push('formats: a carousel uses exactly ["li-carousel"]');
  } else if (raw.kind === "image") {
    raw.formats.forEach(
      (f, n) =>
        IMAGE_FORMATS.includes(f) ||
        problems.push(`formats[${n}]: "${String(f)}" is not a format an image template can have`),
    );
    if (new Set(raw.formats).size !== raw.formats.length) problems.push("formats: a format appears twice");
  }
  problems.push(...cssProblems(raw.css));

  if (raw.kind === "image") {
    for (const k of ["slides", "defaultSlides"]) if (k in raw) problems.push(`${k}: only a carousel has them`);
    const fields = checkFields(raw.fields, "fields", problems);
    checkTree(raw.tree, fields, "tree", problems);
  } else if (raw.kind === "carousel") {
    for (const k of ["fields", "tree"])
      if (k in raw) problems.push(`${k}: a carousel has them per slide kind, in slides`);
    const kinds = new Map();
    if (!Array.isArray(raw.slides) || raw.slides.map((s) => s?.kind).join() !== SLIDE_KINDS.join()) {
      problems.push("slides: must be exactly three slide kinds, in this order: cover, content, closing");
    } else {
      raw.slides.forEach((s, n) => {
        const at = `slides.${s.kind}`;
        unknownKeys(s, ["kind", "name", "fields", "tree"], at, problems);
        text(s.name, `${at}.name`, 1, LIMITS.slideName, problems);
        const fields = checkFields(s.fields, `${at}.fields`, problems);
        checkTree(s.tree, fields, `${at}.tree`, problems);
        kinds.set(s.kind, fields);
      });
    }
    if (
      !Array.isArray(raw.defaultSlides) ||
      raw.defaultSlides.length < LIMITS.minSlides ||
      raw.defaultSlides.length > LIMITS.maxSlides
    ) {
      problems.push(`defaultSlides: must be a list of ${LIMITS.minSlides} to ${LIMITS.maxSlides} slides`);
    } else {
      raw.defaultSlides.forEach((d, n) => {
        const at = `defaultSlides[${n}]`;
        if (!isObject(d)) return problems.push(`${at}: must be an object`);
        unknownKeys(d, ["kind", "content"], at, problems);
        if (!SLIDE_KINDS.includes(d.kind)) return problems.push(`${at}.kind: must be cover, content or closing`);
        if (n === 0 && d.kind !== "cover") problems.push(`${at}.kind: the first slide must be a cover`);
        if (kinds.has(d.kind)) checkContent(d.content ?? {}, kinds.get(d.kind), `${at}.content`, problems);
      });
    }
  }
  return problems.length ? refuse() : { ok: true, template: raw };
}

// ---------------------------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------------------------

/** One node as HTML. Everything that comes from the user goes through `c.t`, `c.e`, `c.footer` or `escapeHtml`. */
function render(node, v, c) {
  if ("slot" in node) {
    if (node.slot === "logo") return c.logo(logoMode(v.ground));
    if (node.slot === "route") return c.route();
    if (node.slot === "icon") return c.icon(node.name);
    const source = c.media(node.field);
    return source ? `<img class="media" src="${source}" alt="">` : '<div class="media empty">Choose an image</div>';
  }
  if ("tag" in node) {
    if (node.showIf && c.empty(node.showIf)) return "";
    const classes = [
      node.headlineOf ? headlineClass(v.headlineSize ?? "automatic", v[node.headlineOf]) : "",
      ...(node.classes ?? []),
      node.classFrom ? v[node.classFrom] : "",
    ].filter(Boolean);
    const attributes =
      (classes.length ? ` class="${escapeHtml(classes.join(" "))}"` : "") +
      (node.dataField ? ` data-field="${escapeHtml(node.dataField)}"` : "");
    return `<${node.tag}${attributes}>${(node.children ?? []).map((child) => render(child, v, c)).join("")}</${node.tag}>`;
  }
  if ("literal" in node) return escapeHtml(node.literal);
  return node.as === "rich" ? c.t(node.field) : node.as === "plain" ? c.e(node.field) : c.footer(node.field);
}

const usesIcon = (nodes) => nodes.some((n) => ("slot" in n && n.slot === "icon") || usesIcon(n.children ?? []));

function renderer(tree, root) {
  const icons = usesIcon(tree);
  return (v, c) =>
    `${icons ? c.symbols : ""}<${root} class="${root === "section" ? "image slide" : "image"} ${groundClass(v.ground)}">${tree.map((n) => render(n, v, c)).join("")}</${root}>`;
}

const defaults = (fields) => Object.fromEntries(fields.map((f) => [f.id, f.defaultValue ?? ""]));

/**
 * A checked template file as the object the engine uses (the shape of `Template` in
 * templates.d.ts, plus `own: true`). Throws, naming the first problem, if the file is refused.
 */
export function compileTemplate(file) {
  const r = checkTemplate(file);
  if (!r.ok) throw new Error(`The template "${file?.name ?? "?"}" was refused: ${r.problems[0]}`);
  const base = {
    id: file.id ?? "own-proposal",
    name: file.name,
    goal: file.goal,
    kind: file.kind,
    formats: [...file.formats],
    css: file.css,
    own: true,
  };
  if (file.kind === "image") {
    return { ...base, fields: file.fields.map(expandField), html: renderer(file.tree, "div") };
  }
  const slides = file.slides.map((s) => ({
    kind: s.kind,
    name: s.name,
    counts: s.kind === "content",
    fields: s.fields.map(expandField),
    html: renderer(s.tree, "section"),
  }));
  const byKind = new Map(slides.map((s) => [s.kind, s]));
  return {
    ...base,
    fields: [],
    maxSlides: 20,
    slides,
    defaultSlides: file.defaultSlides.map((d) => ({
      kind: d.kind,
      content: { ...defaults(byKind.get(d.kind).fields), ...d.content },
    })),
  };
}
````

`src/web/studio/own-template.d.ts`:

````ts
// Type declaration next to own-template.js (plain browser ESM, no build step).
import type { FormatKey } from "./formats.js";
import type { Field, Template } from "./templates.js";

export const TAGS: readonly [
  "div",
  "section",
  "main",
  "header",
  "footer",
  "figure",
  "h1",
  "h2",
  "h3",
  "p",
  "span",
  "strong",
  "ul",
  "li",
];
export const AS_VALUES: readonly ["rich", "plain", "footer"];
export const ICONS: readonly ["arrow", "tick"];
export const PRESETS: readonly ["ground", "headlineSize"];
export const SLIDE_KINDS: readonly ["cover", "content", "closing"];
export const IMAGE_FORMATS: FormatKey[];
export const BRAND_VARIABLES: readonly string[];
export const ALLOWED_VARIABLES: readonly string[];
export const CSS_FUNCTIONS: readonly string[];
export const CSS_SELECTORS: readonly string[];
export const DENIED_PROPERTIES: readonly string[];
export const LIMITS: {
  name: number;
  goal: number;
  slideName: number;
  label: number;
  help: number;
  fields: number;
  options: number;
  depth: number;
  nodes: number;
  classes: number;
  literal: number;
  css: number;
  rules: number;
  file: number;
  templates: number;
  minSlides: number;
  maxSlides: number;
};

export type FieldDef =
  | { id: string; label: string; kind: "headline"; max: number; defaultValue: string }
  | { id: string; label: string; kind: "text" | "line"; max: number; defaultValue: string; help?: string }
  | { id: string; label: string; kind: "choice"; options: { value: string; text: string }[]; defaultValue: string }
  | { id: string; label: string; kind: "media"; required?: boolean; help?: string }
  | { preset: "ground" | "headlineSize"; defaultValue?: string };

export type NodeDef =
  | {
      tag: (typeof TAGS)[number];
      classes?: string[];
      classFrom?: string;
      headlineOf?: string;
      dataField?: string;
      showIf?: string;
      children?: NodeDef[];
    }
  | { field: string; as: (typeof AS_VALUES)[number] }
  | { literal: string }
  | { slot: "logo" }
  | { slot: "route" }
  | { slot: "image"; field: string }
  | { slot: "icon"; name: (typeof ICONS)[number] };

export interface SlideDef {
  kind: (typeof SLIDE_KINDS)[number];
  name: string;
  fields: FieldDef[];
  tree: NodeDef[];
}

/** A template as the model or an agent proposes it: no id, no created. */
export type TemplateProposal = {
  version: 1;
  name: string;
  goal: string;
  formats: FormatKey[];
  css: string;
} & (
  | { kind: "image"; fields: FieldDef[]; tree: NodeDef[] }
  | {
      kind: "carousel";
      slides: SlideDef[];
      defaultSlides: { kind: (typeof SLIDE_KINDS)[number]; content: Record<string, string> }[];
    }
);
/** A template as saved in `templates/<id>.json` of a project. */
export type TemplateFile = TemplateProposal & { id: string; created: string };

export function checkTemplate(
  raw: unknown,
  options?: { mode?: "proposal" | "saved" | "either" },
): { ok: true; template: TemplateProposal | TemplateFile } | { ok: false; problems: string[] };
export function compileTemplate(file: unknown): Template;
export function expandField(f: FieldDef): Field;
````

- [ ] **Step 4: Let `buildImage` take a template object, and type it**

In `src/web/studio/templates.js` and `templates.d.ts`:

````diff
diff --git a/src/web/studio/templates.d.ts b/src/web/studio/templates.d.ts
index e01921d..da2c8e8 100644
--- a/src/web/studio/templates.d.ts
+++ b/src/web/studio/templates.d.ts
@@ -60,6 +60,8 @@ export interface Template {
   slides?: SlideKind[];
   defaultSlides?: Slide[];
   maxSlides?: number;
+  /** An own template of the project (see own-template.js); built-in ones do not have it. */
+  own?: boolean;
 }
 
 export interface Brand {
@@ -98,7 +100,8 @@ export function remToPx(css: string, width: number): string;
 export function defaultContent(s: Template, slideKind?: string | null): Record<string, string>;
 export function fieldsOf(s: Template, slideKind?: string | null): Field[];
 export function buildImage(o: {
-  template: string;
+  /** An id, or a template object (a proposal that is not saved yet). */
+  template: string | Template;
   content?: Record<string, string>;
   slides?: Slide[];
   slide?: number;
diff --git a/src/web/studio/templates.js b/src/web/studio/templates.js
index 19270e0..dc0512b 100644
--- a/src/web/studio/templates.js
+++ b/src/web/studio/templates.js
@@ -150,9 +150,10 @@ function brandCss(brand) {
  * @returns {{ html: string, css: string, width: number, height: number, shape: string, title: string }}
  */
 export function buildImage({ template: id, content = {}, slides = [], slide = 0, format: key, brand, media = {} }) {
-  const s = template(id);
+  // A template object (a proposal that has not been saved yet) works like an id.
+  const s = typeof id === "object" && id !== null ? id : template(id);
   if (!s) throw new Error(`Unknown template: ${id}`);
-  if (!s.formats.includes(key)) throw new Error(`Template ${id} has no format ${key} defined`);
+  if (!s.formats.includes(key)) throw new Error(`Template ${s.id} has no format ${key} defined`);
   const f = formatOf(key);
   const shape = shapeOf(f);
 
````

- [ ] **Step 5: Write the answer schema**

`src/server/template-schema.ts` (it imports `own-template.js` for the same constants the validator uses):

````ts
// What the model decides when it makes a template, as a schema for structured output. The
// model fills in every key (an empty string or list means "not used"; a structured-output
// schema has no room for dozens of optional keys), and `answerToFile` drops the empty ones to
// get the shape of a template file. That is a change of format and nothing else: the result goes
// through `checkTemplate`, which refuses what is wrong and never repairs it.
//
// A tree of nodes is recursive, and a schema for structured output is not, so it is unrolled to
// the depth that `checkTemplate` allows (`LIMITS.depth`).
import { z } from "zod";
import {
  AS_VALUES,
  ICONS,
  LIMITS,
  PRESETS,
  SLIDE_KINDS,
  TAGS,
  type NodeDef,
  type TemplateProposal,
} from "../web/studio/own-template.js";
import type { FormatKey } from "../web/studio/formats.js";

const id = z.string().max(24);

const FieldAnswerSchema = z.strictObject({
  preset: z.enum(["", ...PRESETS]),
  id,
  label: z.string().max(LIMITS.label),
  kind: z.enum(["", "headline", "text", "line", "choice", "media"]),
  max: z.number().int().min(0).max(400),
  defaultValue: z.string().max(400),
  help: z.string().max(LIMITS.help),
  required: z.boolean(),
  options: z.array(z.strictObject({ value: z.string().max(31), text: z.string().max(30) })).max(LIMITS.options),
});
const FieldsSchema = z.array(FieldAnswerSchema).max(LIMITS.fields);

const leaves = [
  z.strictObject({ field: id, as: z.enum(AS_VALUES) }),
  z.strictObject({ literal: z.string().max(LIMITS.literal) }),
  z.strictObject({ slot: z.literal("logo") }),
  z.strictObject({ slot: z.literal("route") }),
  z.strictObject({ slot: z.literal("image"), field: id }),
  z.strictObject({ slot: z.literal("icon"), name: z.enum(ICONS) }),
] as const;

/** A node that may have `levels - 1` more levels below it. */
function nodeSchema(levels: number): z.ZodType {
  const element = {
    tag: z.enum(TAGS),
    classes: z.array(z.string().max(31)).max(LIMITS.classes),
    classFrom: id,
    headlineOf: id,
    dataField: id,
    showIf: id,
  };
  return z.union([
    z.strictObject(levels > 1 ? { ...element, children: z.array(nodeSchema(levels - 1)).max(LIMITS.nodes) } : element),
    ...leaves,
  ]);
}
const TreeSchema = z.array(nodeSchema(LIMITS.depth)).max(LIMITS.nodes);

const Common = {
  name: z.string().max(LIMITS.name),
  goal: z.string().max(LIMITS.goal),
  css: z.string().max(LIMITS.css),
};
const Notes = z.array(z.string().max(300)).max(10);

export const ImageAnswerSchema = z.strictObject({
  template: z.strictObject({ ...Common, fields: FieldsSchema, tree: TreeSchema }),
  notes: Notes,
});
export const CarouselAnswerSchema = z.strictObject({
  template: z.strictObject({
    ...Common,
    slides: z
      .array(
        z.strictObject({
          kind: z.enum(SLIDE_KINDS),
          name: z.string().max(LIMITS.slideName),
          fields: FieldsSchema,
          tree: TreeSchema,
        }),
      )
      .max(SLIDE_KINDS.length),
    defaultSlides: z
      .array(
        z.strictObject({
          kind: z.enum(SLIDE_KINDS),
          content: z.array(z.strictObject({ id, value: z.string().max(400) })).max(LIMITS.fields),
        }),
      )
      .max(LIMITS.maxSlides),
  }),
  notes: Notes,
});
/** The schema for the kind of template that is asked for. */
export const answerSchema = (kind: "image" | "carousel") =>
  kind === "image" ? ImageAnswerSchema : CarouselAnswerSchema;

type AnswerField = z.infer<typeof FieldAnswerSchema>;

function fieldToFile(f: AnswerField): unknown {
  if (f.preset) return f.defaultValue ? { preset: f.preset, defaultValue: f.defaultValue } : { preset: f.preset };
  const base = { id: f.id, label: f.label, kind: f.kind };
  const help = f.help ? { help: f.help } : {};
  switch (f.kind) {
    case "headline":
      return { ...base, max: f.max, defaultValue: f.defaultValue };
    case "text":
    case "line":
      return { ...base, max: f.max, defaultValue: f.defaultValue, ...help };
    case "choice":
      return { ...base, options: f.options, defaultValue: f.defaultValue };
    case "media":
      return { ...base, ...(f.required ? { required: true } : {}), ...help };
    default:
      return base; // an empty kind: checkTemplate refuses it and says so
  }
}

function nodeToFile(n: any): NodeDef {
  if (!("tag" in n)) return n; // a leaf already has the shape of the file
  const out: Record<string, unknown> = { tag: n.tag };
  if (n.classes.length) out.classes = n.classes;
  for (const k of ["classFrom", "headlineOf", "dataField", "showIf"]) if (n[k] !== "") out[k] = n[k];
  if (n.children?.length) out.children = n.children.map(nodeToFile);
  return out as NodeDef;
}

/** A model's answer as a template proposal (not yet checked). `kind` and `formats` are the user's choice, not the model's. */
export function answerToFile(
  answer: z.infer<typeof ImageAnswerSchema> | z.infer<typeof CarouselAnswerSchema>,
  kind: "image" | "carousel",
  formats: FormatKey[],
): unknown {
  const t: any = answer.template;
  const common = { version: 1, name: t.name, goal: t.goal, kind, formats, css: t.css };
  if (kind === "image") return { ...common, fields: t.fields.map(fieldToFile), tree: t.tree.map(nodeToFile) };
  return {
    ...common,
    slides: t.slides.map((s: any) => ({
      kind: s.kind,
      name: s.name,
      fields: s.fields.map(fieldToFile),
      tree: s.tree.map(nodeToFile),
    })),
    defaultSlides: t.defaultSlides.map((d: any) => ({
      kind: d.kind,
      content: Object.fromEntries(d.content.map((c: { id: string; value: string }) => [c.id, c.value])),
    })),
  };
}

export type { TemplateProposal };
````

- [ ] **Step 6: Run the tests and the checks**

Run: `npx vitest run tests/template-check.test.ts tests/own-template.test.ts tests/template-schema.test.ts`
Expected: all pass (about 130 tests).

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 7: Commit**

```bash
git add src/web/studio/own-template.js src/web/studio/own-template.d.ts src/web/studio/templates.js src/web/studio/templates.d.ts src/server/template-schema.ts src/server/template-example.json tests/template-check.test.ts tests/own-template.test.ts tests/template-schema.test.ts tests/helpers/template.ts
git commit -m "Add the validator and engine for own templates"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 2: Storage and the list, rename and delete routes

**Files:**
- Create: `src/server/template-store.ts`, `src/server/template-routes.ts`, `tests/helpers/templates-api.ts`
- Modify: `src/server/app.ts`, `src/server/routes.ts` (idea check, planner list), `tests/helpers/template.ts` (add `writeOwn`)
- Test: `tests/template-store.test.ts`, `tests/template-routes.test.ts`

**Interfaces:**
- Consumes: `checkTemplate`, `LIMITS`, `TemplateFile` (Task 1); `listFolder`, `path`, `readJson`, `reason`, `remove`, `serialize`, `writeJsonAtomic` (`files.ts`); `listPosts` (`store.ts`).
- Produces:
  - `readOwnTemplates(projectDir: string): Promise<{ templates: TemplateFile[]; skipped: { file: string; problem: string }[] }>` (oldest first; a broken file is skipped with `console.warn` and listed, never fails the request); `loadOwnTemplates(projectDir): Promise<TemplateFile[]>`.
  - `saveOwnTemplate(projectDir, proposal: unknown): Promise<TemplateFile>` (checks again in `"proposal"` mode, makes the id and `created`, 409 when invalid or at 30 templates); `renameOwnTemplate(projectDir, id, name)`; `postsUsing(projectDir, id): Promise<number>`; `deleteOwnTemplate(projectDir, id)` (409 with the count when posts use it; a broken file can be deleted); `TEMPLATE_ID`.
  - `templateRoutes(): Route[]`: `GET /api/templates` -> `{ templates, skipped }`, `PUT /api/templates/:id` (`{ name }`, strict, trimmed, 1 to 40), `DELETE /api/templates/:id`. `firstIssue(e: z.ZodError): string`.
  - `listRoutes(..., { beforeSave?: (s: Storage, input) => Promise<void> })` in `routes.ts`.
  - Test helpers: `startTemplates({ replies?, withClient?, client?, provider? })` returns the studio plus `call(path, method?, body?, project?)`, `upload(buffer, project?)`, `usage()`, `calls`; `writeOwn(projectDir, template?, id?)`.

- [ ] **Step 1: Write the tests and helpers**

`tests/helpers/template.ts`: change the first import line to `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";`, add `import { join } from "node:path";` below it, and append:

````ts
/** Writes a saved template into the `templates/` folder of a project and returns its id. */
export function writeOwn(projectDir: string, template: any = exampleTemplate(), id = "own-0123abcd"): string {
  mkdirSync(join(projectDir, "templates"), { recursive: true });
  writeFileSync(join(projectDir, "templates", `${id}.json`), JSON.stringify(saved(template, id), null, 2));
  return id;
}
````

`tests/helpers/templates-api.ts`:

````ts
// A studio with the template routes, a fake model client and small helpers to call them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrandClient } from "../../src/server/ai/brand.js";
import type { AiProvider } from "../../src/server/ai/provider.js";
import { fakeClient } from "./brand-ai.js";
import { startStudio } from "./studio.js";

export async function startTemplates(
  options: {
    replies?: Parameters<typeof fakeClient>[0];
    withClient?: boolean;
    client?: BrandClient;
    provider?: AiProvider;
  } = {},
) {
  const fake = fakeClient(options.replies ?? []);
  const withClient = options.withClient ?? true;
  const s = await startStudio({
    provider: options.provider,
    brand: options.client
      ? { client: options.client, model: "claude-opus-5-5" }
      : withClient
        ? { client: fake.client, model: "claude-opus-5-5" }
        : null,
  });
  const call = async (path: string, method = "GET", body?: unknown, project?: string) => {
    const headers: Record<string, string> = project ? { "x-postwright-project": project } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(s.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: r.status, body: parsed, headers: r.headers };
  };
  const upload = (body: Buffer | string, project?: string) =>
    fetch(`${s.base}/api/template-input/image`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(project ? { "x-postwright-project": project } : {}) },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
  const usage = () =>
    readFileSync(join(s.dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  return { ...s, ...fake, call, upload, usage };
}
````

`tests/template-store.test.ts`:

````ts
// Own templates on disk: a round trip, a broken file that is skipped (with a warning, never a
// failed request), templates that stay in their own project, and a delete that a post blocks.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteOwnTemplate,
  loadOwnTemplates,
  readOwnTemplates,
  renameOwnTemplate,
  saveOwnTemplate,
} from "../src/server/template-store.js";
import { exampleTemplate, saved, writeOwn } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const dirs: string[] = [];
const studios: Array<{ close: () => Promise<void> }> = [];
const project = () => {
  const d = mkdtempSync(join(tmpdir(), "pw-templates-"));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  while (studios.length) await studios.pop()!.close();
});

describe("saving and reading", () => {
  it("round-trips a template: the server makes the id and the time, the file keeps everything else", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    expect(file.id).toMatch(/^own-[0-9a-f]{8}$/);
    expect(Date.parse(file.created)).not.toBeNaN();
    expect(JSON.parse(readFileSync(join(dir, "templates", `${file.id}.json`), "utf8"))).toEqual(file);
    expect(await loadOwnTemplates(dir)).toEqual([file]);
    expect(file).toMatchObject({ ...exampleTemplate(), id: file.id });
  });

  it("refuses a proposal that has an id of its own, or that is not valid", async () => {
    const dir = project();
    await expect(saveOwnTemplate(dir, saved(exampleTemplate()))).rejects.toThrow(/must not have them/);
    await expect(saveOwnTemplate(dir, { ...exampleTemplate(), css: ".a { background: url(x); }" })).rejects.toThrow(
      /url\(\)/,
    );
    expect(await loadOwnTemplates(dir)).toEqual([]);
  });

  it("lists nothing for a project without templates", async () => {
    expect(await readOwnTemplates(project())).toEqual({ templates: [], skipped: [] });
  });

  it("allows 30 templates and refuses the 31st, also when saved at the same time", async () => {
    const dir = project();
    await Promise.all(Array.from({ length: 30 }, () => saveOwnTemplate(dir, exampleTemplate())));
    expect((await loadOwnTemplates(dir)).length).toBe(30);
    expect(new Set((await loadOwnTemplates(dir)).map((t) => t.id)).size).toBe(30);
    await expect(saveOwnTemplate(dir, exampleTemplate())).rejects.toThrow(/at most 30 own templates/);
  });
});

describe("a broken file", () => {
  it("is skipped with a warning and listed with its problem; the others stay", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = project();
    writeOwn(dir, exampleTemplate(), "own-11111111");
    writeOwn(dir, { ...exampleTemplate(), css: ".a { background: url(x); }" }, "own-22222222");
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    writeOwn(dir, exampleTemplate(), "own-44444444");
    writeFileSync(
      join(dir, "templates", "own-44444444.json"),
      JSON.stringify(saved(exampleTemplate(), "own-55555555")),
    );
    writeFileSync(join(dir, "templates", "notes.txt"), "ignored");
    const r = await readOwnTemplates(dir);
    expect(r.templates.map((t) => t.id)).toEqual(["own-11111111"]);
    expect(r.skipped.map((s) => s.file)).toEqual(["own-22222222.json", "own-33333333.json", "own-44444444.json"]);
    expect(r.skipped[0].problem).toMatch(/url\(\) is not allowed/);
    expect(r.skipped[2].problem).toMatch(/does not match the file name/);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.join("\n")).not.toContain(dir);
  });
});

describe("rename and delete", () => {
  it("renames and keeps the rest; a missing or broken template says so", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    const renamed = await renameOwnTemplate(dir, file.id, "Quote");
    expect(renamed).toEqual({ ...file, name: "Quote" });
    expect((await loadOwnTemplates(dir))[0].name).toBe("Quote");
    await expect(renameOwnTemplate(dir, "own-99999999", "x")).rejects.toMatchObject({ status: 404 });
    await expect(renameOwnTemplate(dir, "../x", "x")).rejects.toMatchObject({ status: 400 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    await expect(renameOwnTemplate(dir, "own-33333333", "x")).rejects.toMatchObject({ status: 409 });
  });

  it("deletes a template, and also a broken file", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    await deleteOwnTemplate(dir, file.id);
    expect(await loadOwnTemplates(dir)).toEqual([]);
    await expect(deleteOwnTemplate(dir, file.id)).rejects.toMatchObject({ status: 404 });
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    await deleteOwnTemplate(dir, "own-33333333");
    expect((await readOwnTemplates(dir)).skipped).toEqual([]);
  });

  it("refuses to delete a template that a post uses, with the count, and allows it once the post is gone", async () => {
    const s = await startTemplates({ withClient: false });
    studios.push(s);
    const id = writeOwn(s.projectDir);
    const post = (title: string) => ({
      title,
      kind: "image",
      template: id,
      formats: ["li-square"],
      content: { headline: "A *b*" },
      brandVersion: "v1",
    });
    const one = await s.call("/api/posts", "POST", post("One"));
    expect(one.status).toBe(201);
    await s.call("/api/posts", "POST", post("Two"));
    const blocked = await s.call(`/api/templates/${id}`, "DELETE");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("This template is used by 2 posts; change or delete them first");
    await s.call(`/api/posts/${one.body.id}`, "DELETE");
    const oneLeft = await s.call(`/api/templates/${id}`, "DELETE");
    expect(oneLeft.body.error).toBe("This template is used by 1 post; change or delete it first");
    const rest = (await s.call("/api/posts")).body.posts;
    for (const p of rest) await s.call(`/api/posts/${p.id}`, "DELETE");
    expect((await s.call(`/api/templates/${id}`, "DELETE")).status).toBe(200);
    expect((await s.call("/api/templates")).body).toEqual({ templates: [], skipped: [] });
  });
});

describe("projects", () => {
  it("keeps the templates of one project out of another", async () => {
    const s = await startTemplates({ withClient: false });
    studios.push(s);
    writeOwn(s.projectDir);
    await s.call("/api/projects", "POST", { name: "Beta" });
    expect((await s.call("/api/templates")).body.templates).toHaveLength(1);
    expect((await s.call("/api/templates", "GET", undefined, "beta")).body.templates).toEqual([]);
    expect((await s.call("/api/templates/own-0123abcd", "DELETE", undefined, "beta")).status).toBe(404);
  });
});
````

`tests/template-routes.test.ts` (later tasks append sections to this file):

````ts
// The routes for own templates: list, rename, delete, and where an own template shows up in
// the planner and the ideas. (The routes for the input material, the generation and the
// proposal have their own sections further down.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { plusDays } from "../src/web/studio/calendar.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import type { AiProvider } from "../src/server/ai/provider.js";
import type { IdeasPrompt } from "../src/server/ideas.js";
import { exampleTemplate, writeOwn } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (studios.length) await studios.pop()!.close();
});
async function start(options: Parameters<typeof startTemplates>[0] = { withClient: false }) {
  const s = await startTemplates(options);
  studios.push(s);
  return s;
}

describe("GET /api/templates", () => {
  it("lists the templates and the files that were skipped, and still answers when a file is broken", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { call, projectDir } = await start();
    expect((await call("/api/templates")).body).toEqual({ templates: [], skipped: [] });
    writeOwn(projectDir);
    writeFileSync(join(projectDir, "templates", "own-33333333.json"), "{ not json");
    const r = await call("/api/templates");
    expect(r.status).toBe(200);
    expect(r.body.templates.map((t: any) => [t.id, t.name])).toEqual([["own-0123abcd", "Statement"]]);
    expect(r.body.skipped).toHaveLength(1);
    expect(r.body.skipped[0].file).toBe("own-33333333.json");
  });
});

describe("PUT /api/templates/:id", () => {
  it("renames, trims the name, and refuses anything else in the body", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    const ok = await call(`/api/templates/${id}`, "PUT", { name: "  Quote  " });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe("Quote");
    expect((await call("/api/templates")).body.templates[0].name).toBe("Quote");
    for (const body of [{ name: "" }, { name: "x".repeat(41) }, {}, { name: "A", css: "" }, { name: 5 }]) {
      expect((await call(`/api/templates/${id}`, "PUT", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call("/api/templates/own-99999999", "PUT", { name: "A" })).status).toBe(404);
    expect((await call("/api/templates/nope", "PUT", { name: "A" })).status).toBe(400);
  });
});

describe("DELETE /api/templates/:id", () => {
  it("deletes, and says 404 for one that is gone", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    expect((await call(`/api/templates/${id}`, "DELETE")).status).toBe(200);
    expect((await call(`/api/templates/${id}`, "DELETE")).status).toBe(404);
  });
});

describe("an own template in ideas and in the planner", () => {
  it("accepts the id of an own template on an idea, and still refuses an unknown one", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    const idea = (template: string | null) => ({ date: "2026-10-12", title: "An idea", template });
    expect((await call("/api/ideas", "POST", idea(id))).status).toBe(201);
    expect((await call("/api/ideas", "POST", idea("statement"))).status).toBe(201);
    expect((await call("/api/ideas", "POST", idea(null))).status).toBe(201);
    const unknown = await call("/api/ideas", "POST", idea("own-99999999"));
    expect(unknown).toMatchObject({ status: 400, body: { error: "Unknown template" } });
    const saved = (await call("/api/ideas")).body.ideas.find((i: any) => i.template === id);
    expect((await call(`/api/ideas/${saved.id}`, "PUT", idea(id))).status).toBe(200);
    expect((await call(`/api/ideas/${saved.id}`, "PUT", idea("own-99999999"))).status).toBe(400);
  });

  it("does not let an idea use the template of another project", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    await call("/api/projects", "POST", { name: "Beta" });
    const r = await call("/api/ideas", "POST", { date: "2026-10-12", title: "X", template: id }, "beta");
    expect(r.status).toBe(400);
  });

  it("offers the own templates to the idea planner next to the built-in ones", async () => {
    let seen: IdeasPrompt | null = null;
    const provider: AiProvider = {
      ...sampleProvider,
      suggestIdeas: async (prompt) => {
        seen = prompt;
        return sampleProvider.suggestIdeas(prompt);
      },
    };
    const { call, projectDir } = await start({ withClient: false, provider });
    writeOwn(projectDir, { ...exampleTemplate(), name: "Quote card", goal: "A quote." });
    const from = plusDays(new Date().toISOString().slice(0, 10), 1);
    const r = await call("/api/ideas/suggest", "POST", {
      from,
      to: plusDays(from, 6),
      count: 2,
      channel: "linkedin",
      note: "",
      campaign: null,
    });
    expect(r.status).toBe(200);
    const ids = seen!.templates.map((t) => t.id);
    expect(ids.slice(0, 9)).toContain("statement");
    expect(ids).toHaveLength(10);
    expect(seen!.templates[9]).toEqual({ id: "own-0123abcd", name: "Quote card", goal: "A quote." });
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-store.test.ts tests/template-routes.test.ts`
Expected: FAIL, `Cannot find module '../src/server/template-store.js'`.

- [ ] **Step 3: Write the store and the routes**

`src/server/template-store.ts`:

````ts
// The own templates of a project, one JSON file each in `templates/<id>.json`. Every file is
// checked with `checkTemplate` when it is read: a broken file is skipped with a warning and
// listed, and never fails a request.
import { randomBytes } from "node:crypto";
import { ApiError } from "./http.js";
import { listFolder, path, readJson, reason, remove, serialize, writeJsonAtomic } from "./files.js";
import { listPosts } from "./store.js";
import { LIMITS, checkTemplate, type TemplateFile } from "../web/studio/own-template.js";

const FOLDER = "templates";
export const TEMPLATE_ID = /^own-[0-9a-f]{8}$/;
const TEMPLATE_FILE = /^own-[0-9a-f]{8}\.json$/;

export interface SkippedTemplate {
  file: string;
  problem: string;
}

const key = (projectDir: string) => `templates:${projectDir}`;

/** All own templates of a project, oldest first, and the files that were skipped. */
export async function readOwnTemplates(
  projectDir: string,
): Promise<{ templates: TemplateFile[]; skipped: SkippedTemplate[] }> {
  const s = { dir: projectDir };
  const files = (await listFolder(path(s, FOLDER))).filter((n) => TEMPLATE_FILE.test(n)).sort();
  const templates: TemplateFile[] = [];
  const skipped: SkippedTemplate[] = [];
  for (const file of files) {
    try {
      const checked = checkTemplate(await readJson<unknown>(path(s, FOLDER, file)), { mode: "saved" });
      if (!checked.ok) throw new Error(checked.problems[0]);
      const template = checked.template as TemplateFile;
      if (`${template.id}.json` !== file) throw new Error("id: does not match the file name");
      templates.push(template);
    } catch (e) {
      const problem = reason(e);
      console.warn(`${FOLDER}/${file} skipped: ${problem}`);
      skipped.push({ file, problem });
    }
  }
  return { templates: templates.sort((a, b) => a.created.localeCompare(b.created)), skipped };
}

/** The valid own templates of a project. */
export async function loadOwnTemplates(projectDir: string): Promise<TemplateFile[]> {
  return (await readOwnTemplates(projectDir)).templates;
}

/**
 * Checks a proposal once more, gives it an id (made here, never by the model) and the time, and
 * saves it. At most 30 per project.
 */
export async function saveOwnTemplate(projectDir: string, proposal: unknown): Promise<TemplateFile> {
  const checked = checkTemplate(proposal, { mode: "proposal" });
  if (!checked.ok) throw new ApiError(409, `The template is not valid: ${checked.problems[0]}`);
  const s = { dir: projectDir };
  return serialize(key(projectDir), async () => {
    const files = (await listFolder(path(s, FOLDER))).filter((n) => TEMPLATE_FILE.test(n));
    if (files.length >= LIMITS.templates) {
      throw new ApiError(409, `A project can have at most ${LIMITS.templates} own templates; delete one first`);
    }
    let id: string;
    do id = `own-${randomBytes(4).toString("hex")}`;
    while (files.includes(`${id}.json`));
    const file = { ...checked.template, id, created: new Date().toISOString() } as TemplateFile;
    await writeJsonAtomic(path(s, FOLDER, `${id}.json`), file);
    return file;
  });
}

/** Renames a template; the rest of the file stays as it is. */
export async function renameOwnTemplate(projectDir: string, id: string, name: string): Promise<TemplateFile> {
  if (!TEMPLATE_ID.test(id)) throw new ApiError(400, "Invalid template id");
  const p = path({ dir: projectDir }, FOLDER, `${id}.json`);
  return serialize(key(projectDir), async () => {
    const raw = await readJson<unknown>(p).catch(() => undefined);
    if (raw === null) throw new ApiError(404, "Template not found");
    const checked = checkTemplate(raw, { mode: "saved" });
    if (!checked.ok) throw new ApiError(409, `This template file is broken: ${checked.problems[0]}`);
    const file = { ...(checked.template as TemplateFile), name };
    const again = checkTemplate(file, { mode: "saved" });
    if (!again.ok) throw new ApiError(400, again.problems[0]);
    await writeJsonAtomic(p, file);
    return file;
  });
}

/** How many posts use a template. */
export async function postsUsing(projectDir: string, id: string): Promise<number> {
  return (await listPosts({ dir: projectDir })).filter((p) => p.template === id).length;
}

/** Deletes a template (also a broken file, so that it can be cleaned up); refuses while posts use it. */
export async function deleteOwnTemplate(projectDir: string, id: string): Promise<void> {
  if (!TEMPLATE_ID.test(id)) throw new ApiError(400, "Invalid template id");
  const s = { dir: projectDir };
  return serialize(key(projectDir), async () => {
    if (!(await listFolder(path(s, FOLDER))).includes(`${id}.json`)) throw new ApiError(404, "Template not found");
    const n = await postsUsing(projectDir, id);
    if (n) {
      throw new ApiError(
        409,
        `This template is used by ${n} post${n === 1 ? "" : "s"}; change or delete ${n === 1 ? "it" : "them"} first`,
      );
    }
    await remove(path(s, FOLDER, `${id}.json`));
  });
}
````

`src/server/template-routes.ts`:

````ts
// The own templates of a project: list, rename and delete. Making them is in
// `template-proposal.ts`; this is what happens to them afterwards.
import { z } from "zod";
import { ApiError, route, type Route } from "./http.js";
import { LIMITS } from "../web/studio/own-template.js";
import { deleteOwnTemplate, readOwnTemplates, renameOwnTemplate } from "./template-store.js";

const RenameSchema = z.object({ name: z.string().trim().min(1).max(LIMITS.name) }).strict();

export const firstIssue = (e: z.ZodError) => `${e.issues[0].path.join(".") || "input"}: ${e.issues[0].message}`;

export function templateRoutes(): Route[] {
  return [
    route("GET", "/api/templates", async (c) => readOwnTemplates((await c.project()).dir)),
    route("PUT", "/api/templates/:id", async (c) => {
      const r = RenameSchema.safeParse(await c.readJson());
      if (!r.success) throw new ApiError(400, firstIssue(r.error));
      return renameOwnTemplate((await c.project()).dir, c.params.id, r.data.name);
    }),
    route("DELETE", "/api/templates/:id", async (c) => {
      await deleteOwnTemplate((await c.project()).dir, c.params.id);
      return { ok: true };
    }),
  ];
}
````

- [ ] **Step 4: Register the routes and let ideas and the planner see own templates**

`src/server/app.ts`: add `import { templateRoutes } from "./template-routes.js";` and, in `routes`, put `...templateRoutes(),` just before `...createRoutes(o),`.

`src/server/routes.ts`:

````diff
diff --git a/src/server/routes.ts b/src/server/routes.ts
--- a/src/server/routes.ts
+++ b/src/server/routes.ts
@@ -73,6 +73,7 @@ import { uncoveredNumbers } from "../web/studio/numbers.js";
 import type { AiProvider, AiResult } from "./ai/provider.js";
 import { aiMode, chooseProvider } from "./ai/choose.js";
 import { loadBrand, type Brand } from "./brand.js";
+import { loadOwnTemplates } from "./template-store.js";
 import { runPaid } from "./ai/guard.js";
 import { z } from "zod";
 
@@ -223,6 +224,8 @@ export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Rou
       name: string;
       /** Extra check before saving (uniqueness); throws an ApiError. */
       runCheck?: (input: Record<string, unknown>, lines: T[], id: string | null) => void;
+      /** An asynchronous check before saving that needs the project (not the list); throws an ApiError. */
+      beforeSave?: (s: Storage, input: Record<string, unknown>) => Promise<void>;
       /** Why this entry may not be deleted, or null. */
       isProtected?: (s: Storage, id: string) => Promise<string | null>;
     },
@@ -236,6 +239,7 @@ export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Rou
       route("POST", path, async (c) => {
         const s = await store(c);
         const input = validate(schema, await c.readJson()) as Record<string, unknown>;
+        await options.beforeSave?.(s, input);
         const now = new Date().toISOString();
         const line = await updateList<T, T>(s, list, (lines) => {
           options.runCheck?.(input, lines, null);
@@ -249,6 +253,7 @@ export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Rou
         const s = await store(c);
         const id = idFrom(c);
         const input = validate(schema, await c.readJson()) as Record<string, unknown>;
+        await options.beforeSave?.(s, input);
         const line = await updateList<T, T>(s, list, (lines) => {
           const i = lines.findIndex((r) => r.id === id);
           if (i < 0) throw new ApiError(404, `${options.name[0].toUpperCase()}${options.name.slice(1)} not found`);
@@ -700,8 +705,13 @@ export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Rou
     // -----------------------------------------------------------------------------------------
     ...listRoutes<Idea>("ideas", "/api/ideas", IdeaInputSchema, {
       name: "idea",
-      runCheck: (input) => {
-        if (input.template && !templateOf(String(input.template))) throw new ApiError(400, "Unknown template");
+      // A template is a built-in one or an own template of this project. The server never
+      // registers own templates (that is for the browser), so `templateOf` knows built-ins only.
+      beforeSave: async (s, input) => {
+        if (!input.template) return;
+        const id = String(input.template);
+        if (templateOf(id) || (await loadOwnTemplates(s.dir)).some((t) => t.id === id)) return;
+        throw new ApiError(400, "Unknown template");
       },
     }),
 
@@ -862,7 +872,11 @@ export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Rou
         count: v.count,
         channel: v.channel,
         note: v.note,
-        templates: TEMPLATES.map((s) => ({ id: s.id, name: s.name, goal: s.goal })),
+        templates: [...TEMPLATES, ...(await loadOwnTemplates(s.dir))].map((t) => ({
+          id: t.id,
+          name: t.name,
+          goal: t.goal,
+        })),
         facts: facts
           .filter((f) => !factUnusable(f, today))
           .slice(0, 60)
````

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run tests/template-store.test.ts tests/template-routes.test.ts tests/ideas.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 6: Commit**

```bash
git add src/server/template-store.ts src/server/template-routes.ts src/server/app.ts src/server/routes.ts tests/helpers/template.ts tests/helpers/templates-api.ts tests/template-store.test.ts tests/template-routes.test.ts
git commit -m "Store own templates and add list, rename and delete routes"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 3: The input material routes

**Files:**
- Create: `src/server/template-input.ts`
- Modify: `src/server/app.ts`, `src/server/brand-input.ts` (export `classify` and `checkImage`)
- Test: `tests/template-input.test.ts`

**Interfaces:**
- Consumes: `classify(role, content)` of `brand-input.ts` (content sniffing, the 8,000 px limit, the `image-<hash>.<ext>` name); `IMAGE_FORMATS` (Task 1); `startTemplates` (Task 2).
- Produces:
  - `readTemplateInput(projectDir): Promise<TemplateInput>` with `TemplateInput = { images: { name; bytes }[]; texts: string; brief: string; kind: "image" | "carousel"; formats: FormatKey[] }` (default: no material, `image`, `["li-square"]`; a damaged `input.json` is a 500 that names the file).
  - `saveTemplateText`, `saveTemplateImage(projectDir, content: Buffer)` (409 for a seventh screenshot, the same image twice is one file), `removeTemplateImage(projectDir, name): Promise<boolean>`, `splitTexts(texts: string): string[]` (split on a line with only `---`), `InputTextSchema`, `IMAGE_NAME`, `MAX_IMAGES`, `MAX_IMAGE_BYTES`.
  - `templateInputRoutes({ generate: { available: boolean; model: string | null } }): Route[]`: `GET /api/template-input` (adds `generate`), `PUT /api/template-input`, `POST /api/template-input/image` (raw body), `DELETE /api/template-input/:name`.

- [ ] **Step 1: Write the tests**

````ts
// The material for an own template: screenshots checked on their content, pasted texts, a brief,
// the kind and the formats, per project, and nothing served as a page.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { splitTexts } from "../src/server/template-input.js";
import { SVG, pngHeader, webpHeader } from "./helpers/brand-files.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});
async function start(withClient = true) {
  const s = await startTemplates({ withClient });
  studios.push(s);
  return s;
}

describe("GET and PUT /api/template-input", () => {
  it("starts empty: a single square image, and says whether Claude can generate", async () => {
    const withKey = await start();
    expect((await withKey.call("/api/template-input")).body).toEqual({
      images: [],
      texts: "",
      brief: "",
      kind: "image",
      formats: ["li-square"],
      generate: { available: true, model: "claude-opus-5-5" },
    });
    const noKey = await start(false);
    expect((await noKey.call("/api/template-input")).body.generate).toEqual({ available: false, model: null });
  });

  it("saves the texts, the brief, the kind and the formats, and trims the brief", async () => {
    const { call, projectDir } = await start();
    const body = {
      texts: "One post\n---\nTwo posts",
      brief: "  Quotes from customers  ",
      kind: "image",
      formats: ["li-square", "story"],
    };
    const r = await call("/api/template-input", "PUT", body);
    expect(r.status).toBe(200);
    expect(r.body.brief).toBe("Quotes from customers");
    expect((await call("/api/template-input")).body).toMatchObject({ ...body, brief: "Quotes from customers" });
    expect(JSON.parse(readFileSync(join(projectDir, "template-input", "input.json"), "utf8")).formats).toEqual([
      "li-square",
      "story",
    ]);
    const carousel = await call("/api/template-input", "PUT", { ...body, kind: "carousel", formats: ["li-carousel"] });
    expect(carousel.status).toBe(200);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["texts over 8,000 characters", { texts: "x".repeat(8001) }, /texts/],
    ["a brief over 600 characters", { brief: "x".repeat(601) }, /brief/],
    ["an unknown kind", { kind: "video" }, /kind/],
    ["no formats", { formats: [] }, /formats/],
    ["a banner format", { formats: ["li-profile"] }, /formats/],
    ["a company cover", { formats: ["li-company"] }, /formats/],
    ["li-carousel for a single image", { formats: ["li-carousel"] }, /cannot use li-carousel/],
    ["a carousel with other formats", { kind: "carousel", formats: ["li-square"] }, /exactly "li-carousel"/],
    ["a format twice", { formats: ["story", "story"] }, /twice/],
    ["an unknown key", { extra: 1 }, /Unrecognized key|extra/],
  ])("refuses %s", async (_name, change, expected) => {
    const { call } = await start();
    const r = await call("/api/template-input", "PUT", {
      texts: "",
      brief: "",
      kind: "image",
      formats: ["li-square"],
      ...change,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(expected);
  });

  it("keeps the material of one project apart from another", async () => {
    const { call, upload } = await start();
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", { texts: "mine", brief: "", kind: "image", formats: ["story"] });
    await upload(webpHeader(5, 5));
    expect((await call("/api/template-input", "GET", undefined, "beta")).body).toMatchObject({
      images: [],
      texts: "",
      formats: ["li-square"],
    });
  });
});

describe("a damaged input.json", () => {
  it("is a plain 500 that names the file, not a stack or a silent default", async () => {
    const { call, projectDir } = await start();
    mkdirSync(join(projectDir, "template-input"), { recursive: true });
    writeFileSync(join(projectDir, "template-input", "input.json"), "{ not json");
    const r = await call("/api/template-input");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/^template-input\/input\.json cannot be read: /);
    writeFileSync(join(projectDir, "template-input", "input.json"), JSON.stringify({ texts: 5 }));
    expect((await call("/api/template-input")).body.error).toMatch(/texts/);
  });
});

describe("screenshots", () => {
  it("takes a PNG and a WebP, stores them under a name made from the content, and lists them", async () => {
    const { upload, call, projectDir } = await start();
    const png = pngHeader(40, 30);
    const r = await upload(png);
    expect(r.status).toBe(201);
    const stored = (await r.json()) as { name: string; bytes: number };
    expect(stored.name).toMatch(/^image-[0-9a-f]{8}\.png$/);
    expect(stored.bytes).toBe(png.length);
    expect(existsSync(join(projectDir, "template-input", stored.name))).toBe(true);
    expect((await upload(webpHeader(3, 3))).status).toBe(201);
    expect((await call("/api/template-input")).body.images).toHaveLength(2);
  });

  it("keeps at most six, and the same image twice is one file", async () => {
    const { upload, call } = await start();
    for (let i = 1; i <= 6; i++) expect((await upload(webpHeader(i, 10))).status).toBe(201);
    expect((await upload(webpHeader(3, 10))).status).toBe(201);
    const seventh = await upload(webpHeader(7, 10));
    expect(seventh.status).toBe(409);
    expect(((await seventh.json()) as any).error).toBe("At most 6 screenshots; remove one first");
    expect((await call("/api/template-input")).body.images).toHaveLength(6);
  });

  it.each<[string, Buffer | string, number]>([
    ["an HTML page", "<html><script>alert(1)</script></html>", 400],
    ["an SVG", SVG, 400],
    ["a PNG that is too large in pixels", pngHeader(9000, 10), 400],
    ["an empty body", Buffer.alloc(0), 400],
    ["an image over 3 MB", webpHeader(1, 1, 3 * 1024 * 1024), 413],
  ])("refuses %s", async (_name, body, status) => {
    const { upload, call } = await start();
    expect((await upload(body)).status).toBe(status);
    expect((await call("/api/template-input")).body.images).toEqual([]);
  });

  it("removes a screenshot, and says so for a bad or unknown name", async () => {
    const { upload, call, projectDir } = await start();
    const { name } = (await (await upload(webpHeader(4, 4))).json()) as { name: string };
    expect((await call(`/api/template-input/${name}`, "DELETE")).status).toBe(200);
    expect(existsSync(join(projectDir, "template-input", name))).toBe(false);
    expect((await call(`/api/template-input/${name}`, "DELETE")).status).toBe(404);
    expect((await call("/api/template-input/input.json", "DELETE")).status).toBe(400);
    expect((await call("/api/template-input/..%2Fproject.json", "DELETE")).status).toBe(400);
  });

  it("never serves the material as a page", async () => {
    const { upload, base } = await start();
    const { name } = (await (await upload(webpHeader(4, 4))).json()) as { name: string };
    expect((await fetch(`${base}/template-input/${name}`)).status).toBe(404);
  });
});

describe("splitTexts", () => {
  it("splits on a line with only three dashes, trims, and drops empty pieces", () => {
    expect(splitTexts("One\nline\n---\n  Two  \n---\n\n---\nThree --- not a split")).toEqual([
      "One\nline",
      "Two",
      "Three --- not a split",
    ]);
    expect(splitTexts("")).toEqual([]);
    expect(splitTexts("---")).toEqual([]);
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-input.test.ts`
Expected: FAIL, `Cannot find module '../src/server/template-input.js'`.

- [ ] **Step 3: Export what is reused**

````diff
diff --git a/src/server/brand-input.ts b/src/server/brand-input.ts
--- a/src/server/brand-input.ts
+++ b/src/server/brand-input.ts
@@ -74,14 +74,14 @@ function kindOf(name: string): InputRole {
         : "font";
 }
 
-function checkImage(content: Buffer, kind: "png" | "jpg" | "webp") {
+export function checkImage(content: Buffer, kind: "png" | "jpg" | "webp") {
   const size = mediaDimensions(content, kind);
   if (!size || size.width < 1 || size.height < 1) throw new ApiError(400, "This image is unreadable or damaged");
   if (size.width > 8000 || size.height > 8000) throw new ApiError(400, "This image is larger than 8000 pixels");
 }
 
 /** What the file is, from its content: the stored name and bytes, or a 400. */
-function classify(role: InputRole, content: Buffer): { name: string; stored: Buffer } {
+export function classify(role: InputRole, content: Buffer): { name: string; stored: Buffer } {
   if (role === "logo") {
     if (mediaKind(content) === "png") {
       checkImage(content, "png");
````

- [ ] **Step 4: Write the input module**

`src/server/template-input.ts`:

````ts
// The material for an own template, in `template-input/` of the project: up to six
// screenshots of old posts, pasted post texts, a short brief, and the kind and formats that are
// wanted. Images are checked on their content like those of the brand kit (`classify` of
// `brand-input.ts`). Nothing in here is ever served as a page.
import { stat } from "node:fs/promises";
import { z } from "zod";
import { ApiError, response, route, type Route } from "./http.js";
import { listFolder, path, readJson, reason, remove, serialize, writeBytesAtomic, writeJsonAtomic } from "./files.js";
import { classify } from "./brand-input.js";
import { IMAGE_FORMATS } from "../web/studio/own-template.js";
import type { FormatKey } from "../web/studio/formats.js";

export interface InputImage {
  name: string;
  bytes: number;
}
export interface TemplateInput {
  images: InputImage[];
  texts: string;
  brief: string;
  kind: "image" | "carousel";
  formats: FormatKey[];
}

const FOLDER = "template-input";
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_TEXTS = 8000;
export const MAX_BRIEF = 600;
export const IMAGE_NAME = /^image-[0-9a-f]{8}\.(png|jpg|webp)$/;

const DEFAULT_TEXT = { texts: "", brief: "", kind: "image" as const, formats: ["li-square"] as FormatKey[] };

export const InputTextSchema = z
  .object({
    texts: z.string().max(MAX_TEXTS),
    brief: z.string().trim().max(MAX_BRIEF),
    kind: z.enum(["image", "carousel"]),
    formats: z
      .array(z.enum([...IMAGE_FORMATS, "li-carousel"] as unknown as [FormatKey, ...FormatKey[]]))
      .min(1)
      .max(IMAGE_FORMATS.length),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "carousel" && !(v.formats.length === 1 && v.formats[0] === "li-carousel")) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: 'a carousel uses exactly "li-carousel"' });
    }
    if (v.kind === "image" && v.formats.includes("li-carousel")) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: "a single image cannot use li-carousel" });
    }
    if (new Set(v.formats).size !== v.formats.length) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: "a format appears twice" });
    }
  });

/** The pasted texts as separate posts: they are separated by a line with only `---`. */
export function splitTexts(texts: string): string[] {
  return texts
    .split(/^[ \t]*---[ \t]*$/m)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function listImages(projectDir: string): Promise<InputImage[]> {
  const s = { dir: projectDir };
  const names = (await listFolder(path(s, FOLDER))).filter((n) => IMAGE_NAME.test(n)).sort();
  return Promise.all(names.map(async (name) => ({ name, bytes: (await stat(path(s, FOLDER, name))).size })));
}

export async function readTemplateInput(projectDir: string): Promise<TemplateInput> {
  const images = await listImages(projectDir);
  let text: z.infer<typeof InputTextSchema> = DEFAULT_TEXT;
  try {
    const saved = await readJson<unknown>(path({ dir: projectDir }, FOLDER, "input.json"));
    if (saved !== null) {
      const r = InputTextSchema.safeParse(saved);
      if (!r.success) throw new Error(`${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      text = r.data;
    }
  } catch (e) {
    throw new ApiError(500, `template-input/input.json cannot be read: ${reason(e)}`);
  }
  return { images, ...text };
}

export async function saveTemplateText(projectDir: string, text: z.infer<typeof InputTextSchema>): Promise<void> {
  await writeJsonAtomic(path({ dir: projectDir }, FOLDER, "input.json"), text);
}

export async function saveTemplateImage(projectDir: string, content: Buffer): Promise<InputImage> {
  if (!content.length) throw new ApiError(400, "No file was sent");
  const { name, stored } = classify("image", content);
  return serialize(`template-input:${projectDir}`, async () => {
    const images = await listImages(projectDir);
    // The same image twice is the same file.
    if (!images.some((i) => i.name === name) && images.length >= MAX_IMAGES) {
      throw new ApiError(409, `At most ${MAX_IMAGES} screenshots; remove one first`);
    }
    await writeBytesAtomic(path({ dir: projectDir }, FOLDER, name), stored);
    return { name, bytes: stored.length };
  });
}

export async function removeTemplateImage(projectDir: string, name: string): Promise<boolean> {
  if (!IMAGE_NAME.test(name)) throw new ApiError(400, "Invalid file name");
  return serialize(`template-input:${projectDir}`, async () => {
    const found = (await listImages(projectDir)).some((i) => i.name === name);
    if (found) await remove(path({ dir: projectDir }, FOLDER, name));
    return found;
  });
}

export function templateInputRoutes(o: { generate: { available: boolean; model: string | null } }): Route[] {
  return [
    route("GET", "/api/template-input", async (c) => ({
      ...(await readTemplateInput((await c.project()).dir)),
      generate: o.generate,
    })),
    route("PUT", "/api/template-input", async (c) => {
      const r = InputTextSchema.safeParse(await c.readJson());
      if (!r.success) {
        throw new ApiError(400, `${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      }
      await saveTemplateText((await c.project()).dir, r.data);
      return r.data;
    }),
    route(
      "POST",
      "/api/template-input/image",
      async (c) => {
        const content = await c.read(MAX_IMAGE_BYTES);
        return response({ status: 201, body: await saveTemplateImage((await c.project()).dir, content) });
      },
      { rawBody: true },
    ),
    route("DELETE", "/api/template-input/:name", async (c) => {
      if (!(await removeTemplateImage((await c.project()).dir, c.params.name)))
        throw new ApiError(404, "File not found");
      return { ok: true };
    }),
  ];
}
````

In `src/server/app.ts` add `import { templateInputRoutes } from "./template-input.js";` and, after `...templateRoutes(),`:

````ts
      ...templateInputRoutes({ generate: { available: brand !== null, model: brand?.model ?? null } }),
````

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run tests/template-input.test.ts tests/brand-input.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 6: Commit**

```bash
git add src/server/template-input.ts src/server/brand-input.ts src/server/app.ts tests/template-input.test.ts
git commit -m "Add the input material routes for own templates"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 4: Route A, generating a template with Claude

**Files:**
- Create: `src/server/template-guide.ts`, `src/server/ai/template.ts`, `src/server/template-proposal.ts` (the proposal on disk; apply and routes come in Task 6), `src/server/template-generate.ts`
- Modify: `src/server/ai/brand.ts` (export four helpers), `src/server/ai/sample.ts` (`sampleTemplate`), `src/server/app.ts`, `tests/helpers/template.ts` (add `templateReply`)
- Test: `tests/template-ai.test.ts`

**Interfaces:**
- Consumes: `answerSchema`, `answerToFile` (Task 1), `checkTemplate` (Task 1), `readTemplateInput`, `splitTexts`, `TemplateInput` (Task 3), `runPaid` (`ai/guard.ts`), `BrandClient`, `svgForPrompt`, `image`, `parseAnswer`, `addUsage` (`ai/brand.ts`), `loadBrand`, `brandFolder` (`brand.ts`), `profileForPrompt` (`schema.ts`), `loadSettingsFile`, `readGlobalCap`, `StorageError` (`store.ts`).
- Produces:
  - `template-guide.ts`: `GuideContext` (`{ kind; formats; texts; brief; brand; profile; tone; bannedWords }`), `rulesText()`, `shapeText()`, `brandText(brand)`, `voiceText(ctx)`, `requestText(ctx)`, `guideText(ctx)`, `exampleJson()`, `BASE_CLASSES`. The rules are written from the same constants `checkTemplate` uses.
  - `ai/template.ts`: `TEMPLATE_RESERVE_USD = 1`, `TemplateMaterial` (`GuideContext` plus `images` and `logo`), `templateRequest(m, model)`, `generateTemplate(client, model, m): Promise<{ proposal: TemplateProposal; notes: string[]; model: string; usage: Usage }>`. Parsing and `checkTemplate` run inside the call; every `AiError` carries the tokens spent so far.
  - `ai/sample.ts`: `sampleTemplate(kind, formats): { template: TemplateProposal; notes: string[] }`, a standalone function (not part of `AiProvider`, whose interface serves the Sonnet writing tasks).
  - `template-proposal.ts`: `proposalDir(projectDir)`, `ProposalState` (`none` | `invalid` with `problems` | `ready` with `template`, `notes`, `sample`), `checkProposal(projectDir)`, `writeProposal(projectDir, template, { notes, sample })` (replaces a pending one), `discardProposal(projectDir)`.
  - `template-generate.ts`: `loadContext(projectDir, input): Promise<GuideContext>`, `loadMaterial(projectDir, input): Promise<TemplateMaterial>`, `EMPTY_INPUT`, `templateGenerateRoutes({ dataDir, brand }): Route[]` with `POST /api/template-generate` (returns the proposal state).
  - Test helper `templateReply(file?, notes?)`: a fake model message (100,000 tokens in and 10,000 out, $0.60 at Opus 5.5 prices).

Order inside the route: empty form is a 400 first; no key means the fixed sample (nothing booked, no cap); with a key, `runPaid` checks the cap against the $1 reserve, runs one call at a time, books `template:<slug>` also on failure.

- [ ] **Step 1: Write the tests**

`tests/helpers/template.ts`: add `import { message } from "./brand-ai.js";` below the other imports and append:

````ts
/** The reply of the model that holds a template: 100,000 tokens in and 10,000 out, which is $0.60 at Opus 5.5 prices. */
export const templateReply = (file: any = exampleTemplate(), notes: string[] = ["Based on the statements."]) =>
  message({ text: JSON.stringify(answerOf(file, notes)) });
````

`tests/template-ai.test.ts`:

````ts
// Route A: the call to Claude for a template, with a fake client (no request leaves the
// computer), and POST /api/template-generate: booking, the cap and the reserve, a refused answer,
// and the fixed sample without an API key.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_CLASSES, guideText } from "../src/server/template-guide.js";
import { BRAND_MODEL } from "../src/server/ai/brand.js";
import {
  TEMPLATE_RESERVE_USD,
  generateTemplate,
  templateRequest,
  type TemplateMaterial,
} from "../src/server/ai/template.js";
import { AiError } from "../src/server/ai/provider.js";
import { costUsd, book } from "../src/server/ai/usage.js";
import { ALLOWED_VARIABLES, CSS_FUNCTIONS, TAGS } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { fakeClient, message } from "./helpers/brand-ai.js";
import { SVG, pngHeader, webpHeader } from "./helpers/brand-files.js";
import { answerOf, exampleTemplate, templateReply, carouselExample } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const brandJson = JSON.parse(readFileSync("src/web/brand/brand.json", "utf8"));
const material = (extra: Partial<TemplateMaterial> = {}): TemplateMaterial => ({
  kind: "image",
  formats: ["li-square", "story"],
  texts: ["We just shipped a new feature.", "Our team is growing."],
  brief: "Short statements with one bold phrase",
  brand: brandJson,
  profile: { description: "A planner for temp agencies", audience: "HR managers" },
  tone: "Warm and direct.",
  bannedWords: ["cheap"],
  images: [
    { mediaType: "image/png", data: Buffer.from("ONE") },
    { mediaType: "image/webp", data: Buffer.from("TWO") },
  ],
  logo: { kind: "svg", text: SVG },
  ...extra,
});

describe("templateRequest", () => {
  it("labels the screenshots as old posts, in order, and sends the texts and the brief", () => {
    const r = templateRequest(material(), BRAND_MODEL);
    const blocks = r.messages[0].content as Array<{
      type: string;
      text?: string;
      source?: { data: string; media_type: string };
    }>;
    expect(
      blocks
        .filter((b) => b.type === "text")
        .slice(0, 2)
        .map((b) => b.text),
    ).toEqual(["Old post 1:", "Old post 2:"]);
    expect(blocks.filter((b) => b.type === "image").map((b) => [b.source!.media_type, b.source!.data])).toEqual([
      ["image/png", Buffer.from("ONE").toString("base64")],
      ["image/webp", Buffer.from("TWO").toString("base64")],
    ]);
    const text = blocks.at(-1)!.text!;
    expect(text).toContain("We just shipped a new feature.");
    expect(text).toContain("Our team is growing.");
    expect(text).toContain("Short statements with one bold phrase");
    expect(text).toContain("LinkedIn square (1200x1200), Story");
    expect(text).toContain("single image");
    expect(text).toContain("A planner for temp agencies");
    expect(text).toContain("Warm and direct.");
    expect(text).toContain("cheap");
    expect(text).toContain(brandJson.name);
    expect(text).toContain("<svg xmlns=");
  });

  it("sends a PNG logo as an image block, says when there is no logo or no material, and asks for a carousel", () => {
    const png = templateRequest(material({ logo: { kind: "png", data: Buffer.from("LOGO") } }), BRAND_MODEL);
    const blocks = png.messages[0].content as Array<{ type: string; text?: string }>;
    expect(blocks.some((b) => b.text === "The logo of the brand (PNG):")).toBe(true);
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(3);
    const none = JSON.stringify(
      templateRequest(
        material({ logo: null, images: [], texts: [], brief: "", profile: null, tone: "", bannedWords: [] }),
        BRAND_MODEL,
      ).messages,
    );
    expect(none).toContain("No texts of old posts were given.");
    expect(none).toContain("There is no brief.");
    expect(none).toContain("the company profile is empty");
    expect(
      JSON.stringify(templateRequest(material({ kind: "carousel", formats: ["li-carousel"] }), BRAND_MODEL).messages),
    ).toContain("carousel (a document post of several slides)");
  });

  it("asks for adaptive thinking, medium effort, structured output, 24,000 tokens, and no tools", () => {
    const r = templateRequest(material(), BRAND_MODEL) as unknown as Record<string, any>;
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.thinking).toEqual({ type: "adaptive" });
    expect(r.output_config.effort).toBe("medium");
    expect(r.output_config.format.type).toBe("json_schema");
    expect(r.max_tokens).toBe(24_000);
    expect("tools" in r).toBe(false);
    expect("betas" in r).toBe(false);
  });

  it("lists every allowed tag, variable and function, the base classes and the worked example", () => {
    const text = guideText({ ...material(), brand: brandFromDisk() as any });
    for (const t of TAGS) expect(text).toContain(`\`${t}\``);
    for (const v of ALLOWED_VARIABLES) expect(text).toContain(`\`${v}\``);
    for (const f of CSS_FUNCTIONS) expect(text).toContain(`\`${f}\``);
    for (const [name] of BASE_CLASSES) expect(text).toContain(`\`${name}\``);
    expect(text).toContain(JSON.stringify(exampleTemplate().fields[1].label));
  });

  it("only names base classes that the base CSS has (the engine itself makes .media)", () => {
    const css = readFileSync("src/web/studio/template-css.js", "utf8");
    for (const [name] of BASE_CLASSES.filter(([n]) => n !== ".media")) expect(css, name).toContain(name);
  });

  it("stays under the reserve of $1 even for the most it can send and receive", () => {
    // Six screenshots (about 1,600 tokens each), an SVG logo of 100,000 characters (about 35,000
    // tokens), 8,000 characters of texts, and a prompt of about 10,000 tokens, plus the full 24,000 out.
    expect(costUsd(BRAND_MODEL, { input: 70_000, output: 24_000, cacheRead: 0, cacheWrite: 0 })).toBeLessThan(
      TEMPLATE_RESERVE_USD,
    );
  });
});

describe("generateTemplate", () => {
  it("returns the checked proposal, the notes and the usage of one call", async () => {
    const { client, calls } = fakeClient([templateReply()]);
    const r = await generateTemplate(client, BRAND_MODEL, material());
    // The formats are the user's choice, not the model's.
    expect(r.proposal).toEqual({ ...exampleTemplate(), formats: ["li-square", "story"] });
    expect(r.notes).toEqual(["Based on the statements."]);
    expect(r.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
    expect(r.model).toBe("claude-opus-5-5");
    expect(calls).toHaveLength(1);
  });

  it("builds a carousel from a carousel answer, with the formats of the user", async () => {
    const { client } = fakeClient([templateReply(carouselExample())]);
    const r = await generateTemplate(client, BRAND_MODEL, material({ kind: "carousel", formats: ["li-carousel"] }));
    expect(r.proposal).toMatchObject({ kind: "carousel", formats: ["li-carousel"] });
  });

  async function refused(reply: ReturnType<typeof message> | Error, m = material()) {
    const { client, calls } = fakeClient([reply]);
    const error = await generateTemplate(client, BRAND_MODEL, m).then(
      () => null,
      (e) => e,
    );
    expect(error).toBeInstanceOf(AiError);
    expect(calls).toHaveLength(1); // no automatic retry
    return error as AiError;
  }

  it.each<[string, () => ReturnType<typeof message>, RegExp]>([
    ["a refusal", () => message({ stop: "refusal" }), /declined/],
    ["an answer that was cut off", () => message({ stop: "max_tokens" }), /cut off/],
    ["text that is not JSON", () => message({ text: "Here is your template!" }), /valid JSON/],
    [
      "a missing key",
      () => message({ text: JSON.stringify({ template: { name: "x" }, notes: [] }) }),
      /does not fit the schema/,
    ],
    [
      "an extra key in a node",
      () => {
        const a = answerOf(exampleTemplate());
        a.template.tree[2].onclick = "x()";
        return message({ text: JSON.stringify(a) });
      },
      /does not fit the schema/,
    ],
    [
      "css that is not allowed",
      () => templateReply({ ...exampleTemplate(), css: ".a { background: url(x); }" }),
      /refused \(1 problem\): css rule 1 \(\.a\) \(background\): url\(\) is not allowed/,
    ],
    [
      "a reference to a field that does not exist",
      () => {
        const t = exampleTemplate();
        t.tree[2].children[0].dataField = "nope";
        return templateReply(t);
      },
      /dataField: "nope" is not a field/,
    ],
  ])("refuses %s, and carries the tokens it cost", async (_name, reply, expected) => {
    const e = await refused(reply());
    expect(e.message).toMatch(expected);
    expect(e.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
    expect(e.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
  });

  it("does not repair: a headline without emphasis is a refusal, not a fix", async () => {
    const t = exampleTemplate();
    t.fields[1].defaultValue = "No emphasis here";
    expect((await refused(templateReply(t))).message).toMatch(/exactly one \*emphasised\* phrase/);
  });

  it("passes on a failure of the connection without usage", async () => {
    const e = await refused(new Error("socket hang up"));
    expect(e.message).toBe("socket hang up");
    expect(e.usage).toBeUndefined();
  });
});

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});
async function start(options: Parameters<typeof startTemplates>[0] = {}) {
  const s = await startTemplates(options);
  studios.push(s);
  return s;
}
const input = { texts: "A post\n---\nAnother post", brief: "Quotes", kind: "image", formats: ["li-square"] };
const proposalFile = (dir: string) => join(dir, "template-input", "proposal", "template.json");

describe("POST /api/template-generate", () => {
  it("needs some material, before anything else", async () => {
    const withKey = await start({ replies: [templateReply()] });
    const r = await withKey.call("/api/template-generate", "POST", {});
    expect(r).toMatchObject({
      status: 400,
      body: { error: "Add a screenshot, the text of an old post or a short brief first" },
    });
    expect(withKey.calls).toHaveLength(0);
    const noKey = await start({ withClient: false });
    expect((await noKey.call("/api/template-generate", "POST", {})).status).toBe(400);
  });

  it("makes a proposal, books $0.60 under template:<project>, and shows what was sent", async () => {
    const { call, upload, calls, usage, projectDir } = await start({ replies: [templateReply()] });
    await upload(webpHeader(3, 3));
    await call("/api/template-input", "PUT", input);
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      state: "ready",
      sample: false,
      notes: ["Based on the statements."],
      template: { name: "Statement", kind: "image" },
    });
    expect(JSON.parse(readFileSync(proposalFile(projectDir), "utf8"))).toEqual({
      ...exampleTemplate(),
      formats: ["li-square"],
    });
    const sent = JSON.stringify(calls[0].messages);
    expect(sent).toContain("Old post 1:");
    expect(sent).toContain("Quotes");
    expect(sent).toContain("Another post");
    expect(usage()).toMatchObject([{ task: "template:postwright", model: "claude-opus-5-5", usd: 0.6, ok: true }]);
    // Nothing is applied until the user says so.
    expect((await call("/api/templates")).body.templates).toEqual([]);
  });

  it("replaces a pending proposal with the new one", async () => {
    const second = { ...exampleTemplate(), name: "Second" };
    const { call, upload } = await start({ replies: [templateReply(), templateReply(second)] });
    await upload(pngHeader(4, 4));
    await call("/api/template-generate", "POST", {});
    const r = await call("/api/template-generate", "POST", {});
    expect(r.body.template.name).toBe("Second");
  });

  it("books a refused answer with its tokens, answers 502 with the reason, and keeps the pending proposal", async () => {
    const bad = templateReply({ ...exampleTemplate(), css: ".a { color: red; }" });
    const { call, usage, projectDir } = await start({ replies: [templateReply(), bad] });
    await call("/api/template-input", "PUT", input);
    await call("/api/template-generate", "POST", {});
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(
      /Template generation did not give a usable answer: The template was refused.*colour "red"/,
    );
    expect(usage()).toMatchObject([
      { ok: true, usd: 0.6 },
      { ok: false, usd: 0.6, task: "template:postwright" },
    ]);
    expect(JSON.parse(readFileSync(proposalFile(projectDir), "utf8")).name).toBe("Statement");
  });

  it("books a failure of the connection at zero, and a refusal of the model with its tokens", async () => {
    const { call, usage } = await start({ replies: [new Error("socket hang up"), message({ stop: "refusal" })] });
    await call("/api/template-input", "PUT", input);
    expect((await call("/api/template-generate", "POST", {})).status).toBe(502);
    expect((await call("/api/template-generate", "POST", {})).body.error).toMatch(/declined/);
    expect(usage().map((l) => [l.ok, l.usd])).toEqual([
      [false, 0],
      [false, 0.6],
    ]);
  });

  it("refuses without a call when the reserve of $1 does not fit under the cap, also with room left in the month", async () => {
    const { call, calls, dataDir } = await start({ replies: [templateReply()] });
    await call("/api/template-input", "PUT", input);
    const settings = (await call("/api/settings")).body;
    const cap = (usd: number) =>
      call("/api/settings", "PUT", { ...settings, writingHelp: { ...settings.writingHelp, capUsdPerMonth: usd } });
    await cap(1);
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/up to \$1;/);
    await cap(10);
    await book(dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 9.5, ok: true });
    expect((await call("/api/template-generate", "POST", {})).status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("runs one call at a time", async () => {
    let running = 0;
    let peak = 0;
    const slow = {
      stream: () => ({
        finalMessage: async () => {
          peak = Math.max(peak, ++running);
          await new Promise((ok) => setTimeout(ok, 40));
          running--;
          return templateReply();
        },
      }),
    };
    const { call } = await start({ client: slow });
    await call("/api/template-input", "PUT", input);
    const both = await Promise.all([
      call("/api/template-generate", "POST", {}),
      call("/api/template-generate", "POST", {}),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(peak).toBe(1);
  });

  it("keeps the proposal of one project out of another", async () => {
    const { call } = await start({ replies: [templateReply()] });
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", input);
    await call("/api/template-generate", "POST", {});
    // The route for reading proposals is added with the proposal routes; here the files tell.
    expect((await call("/api/template-input", "GET", undefined, "beta")).body.texts).toBe("");
  });
});

describe("without an API key", () => {
  it("returns the fixed sample template, marked as made without a model, and books nothing", async () => {
    const { call, dataDir, projectDir } = await start({ withClient: false });
    await call("/api/template-input", "PUT", { ...input, formats: ["story", "li-square"] });
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      state: "ready",
      sample: true,
      template: { name: "Sample template", kind: "image", formats: ["story", "li-square"] },
    });
    expect(r.body.notes[0]).toMatch(/Made without a model/);
    expect(existsSync(join(dataDir, "ai-usage.jsonl"))).toBe(false);
    expect(existsSync(proposalFile(projectDir))).toBe(true);
  });

  it("makes a sample carousel when a carousel is asked for", async () => {
    const { call } = await start({ withClient: false });
    await call("/api/template-input", "PUT", { ...input, kind: "carousel", formats: ["li-carousel"] });
    const r = await call("/api/template-generate", "POST", {});
    expect(r.body.template).toMatchObject({ kind: "carousel", formats: ["li-carousel"], name: "Sample template" });
    expect(r.body.template.slides.map((s: any) => s.kind)).toEqual(["cover", "content", "closing"]);
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-ai.test.ts`
Expected: FAIL, `Cannot find module '../src/server/template-guide.js'`.

- [ ] **Step 3: Export four helpers of the brand call, and add the sample**

````diff
diff --git a/src/server/ai/brand.ts b/src/server/ai/brand.ts
--- a/src/server/ai/brand.ts
+++ b/src/server/ai/brand.ts
@@ -56,12 +56,12 @@ const withoutPictures = (svg: string) => svg.replace(BASE64_URI, (m) => `${m.sli
 /** An SVG above this size (after cutting pictures) is not sent: one logo must not cost more than the reserve. */
 const MAX_SVG_PROMPT = 100_000;
 /** The SVG as it goes into the prompt, or `null` when it is too large to send. */
-function svgForPrompt(svg: string): string | null {
+export function svgForPrompt(svg: string): string | null {
   const text = withoutPictures(svg);
   return text.length > MAX_SVG_PROMPT ? null : text;
 }
 
-const image = (mediaType: string, data: Buffer): Content =>
+export const image = (mediaType: string, data: Buffer): Content =>
   ({ type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } }) as Content;
 
 function instructions(m: BrandMaterial, example: string): string {
@@ -154,7 +154,7 @@ export function repairAnswer(raw: unknown): unknown {
   };
 }
 
-function parseAnswer(texts: string[]): unknown {
+export function parseAnswer(texts: string[]): unknown {
   try {
     return JSON.parse(texts[texts.length - 1] ?? "");
   } catch {
@@ -162,7 +162,7 @@ function parseAnswer(texts: string[]): unknown {
   }
 }
 
-function add(total: Usage, u: Message["usage"]) {
+export function addUsage(total: Usage, u: Message["usage"]) {
   total.input += u.input_tokens;
   total.output += u.output_tokens;
   total.cacheRead += u.cache_read_input_tokens ?? 0;
@@ -193,7 +193,7 @@ export async function generateBrand(
     } catch (error) {
       throw new AiError(error instanceof Error ? error.message : String(error), spent());
     }
-    add(usage, reply.usage);
+    addUsage(usage, reply.usage);
     for (const block of reply.content) {
       if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") websiteRead = true;
     }
````

````diff
diff --git a/src/server/ai/sample.ts b/src/server/ai/sample.ts
--- a/src/server/ai/sample.ts
+++ b/src/server/ai/sample.ts
@@ -1,7 +1,11 @@
 // The sample provider: predictable answers without a model, for those without an API key.
 // Every text is recognisable as a sample ("Sample ..."), uses only text from the facts it
 // is given and costs nothing.
+import { readFileSync } from "node:fs";
+import { fileURLToPath } from "node:url";
 import { workdays } from "../ideas.js";
+import type { FormatKey } from "../../web/studio/formats.js";
+import type { TemplateProposal } from "../../web/studio/own-template.js";
 import { EMPTY_USAGE, type AiProvider } from "./provider.js";
 
 const MODEL = "sample";
@@ -46,3 +50,45 @@ export const sampleProvider: AiProvider = {
     return { suggestion: { ideas }, model: MODEL, usage: EMPTY_USAGE, durationMs: Date.now() - begin };
   },
 };
+
+const EXAMPLE = JSON.parse(readFileSync(fileURLToPath(new URL("../template-example.json", import.meta.url)), "utf8"));
+
+/**
+ * The template that route A returns without an API key: the worked example under the name
+ * "Sample template", as a single image or as a carousel. It costs nothing and is not part of
+ * `AiProvider`: that interface serves the writing tasks, route A uses the brand client.
+ */
+export function sampleTemplate(
+  kind: "image" | "carousel",
+  formats: FormatKey[],
+): { template: TemplateProposal; notes: string[] } {
+  const common = {
+    version: 1 as const,
+    name: "Sample template",
+    goal: "A fixed sample, made without a model.",
+    css: EXAMPLE.css,
+  };
+  const notes = [
+    "Made without a model: this is a fixed sample. Set ANTHROPIC_API_KEY to generate from your own material.",
+  ];
+  if (kind === "image") {
+    return { template: { ...common, kind, formats, fields: EXAMPLE.fields, tree: EXAMPLE.tree }, notes };
+  }
+  const slide = (k: string, name: string) => ({ kind: k, name, fields: EXAMPLE.fields, tree: EXAMPLE.tree });
+  const sample = (k: string, headline: string) => ({ kind: k, content: { headline } });
+  return {
+    template: {
+      ...common,
+      kind,
+      formats: ["li-carousel"],
+      slides: [slide("cover", "Cover"), slide("content", "Step"), slide("closing", "Closing")],
+      defaultSlides: [
+        sample("cover", "A sample *carousel.*"),
+        sample("content", "A first *step.*"),
+        sample("content", "A second *step.*"),
+        sample("closing", "A sample *ending.*"),
+      ],
+    } as TemplateProposal,
+    notes,
+  };
+}
````

- [ ] **Step 4: Write the guide (the text for both routes)**

`src/server/template-guide.ts`:

````ts
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
````

- [ ] **Step 5: Write the Claude call**

`src/server/ai/template.ts`:

````ts
// The Claude call that makes an own template: the screenshots of old posts as image blocks,
// the rules and the brand as text, and structured output for what the model decides. One
// streamed request, no tools. The answer is parsed and judged by `checkTemplate` inside this
// call, so that a refused answer is still booked with the tokens it cost.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { checkTemplate, type TemplateProposal } from "../../web/studio/own-template.js";
import { answerSchema, answerToFile } from "../template-schema.js";
import { guideText, requestText, type GuideContext } from "../template-guide.js";
import { AiError, EMPTY_USAGE, type Usage } from "./provider.js";
import { addUsage, image, parseAnswer, svgForPrompt, type BrandClient } from "./brand.js";

/** What one generation may cost at most, in dollars: the cap is checked against this beforehand. */
export const TEMPLATE_RESERVE_USD = 1;
const MAX_TOKENS = 24_000;

type Params = Parameters<BrandClient["stream"]>[0];
type Content = Anthropic.Beta.Messages.BetaContentBlockParam;

export interface TemplateMaterial extends GuideContext {
  images: { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: Buffer }[];
  logo: { kind: "svg"; text: string } | { kind: "png"; data: Buffer } | null;
}

export interface TemplateResult {
  proposal: TemplateProposal;
  notes: string[];
  model: string;
  usage: Usage;
}

const SYSTEM = `You design post templates for Postwright, a tool that turns templates into on-brand social posts. \
You are given screenshots and texts of a company's old posts, a brief and the company's brand. Propose one template as \
the fields of the schema: a name, a goal, the fields the user fills in, a tree of nodes and some CSS (a carousel has \
three slide kinds and default slides instead). The rules in the instructions are checked by code, and a template that \
breaks one is thrown away, so follow them exactly. Put what you want the user to know in \`notes\` (for example what you \
took from the old posts, or what you could not see).`;

export function templateRequest(m: TemplateMaterial, model: string): Params {
  const content: Content[] = [];
  m.images.forEach((img, i) =>
    content.push({ type: "text", text: `Old post ${i + 1}:` }, image(img.mediaType, img.data)),
  );
  if (m.logo?.kind === "png")
    content.push({ type: "text", text: "The logo of the brand (PNG):" }, image("image/png", m.logo.data));
  const logo =
    m.logo?.kind === "svg"
      ? (() => {
          const svg = svgForPrompt(m.logo.text);
          return svg === null
            ? "The logo is an SVG file that is too large to include."
            : `The logo of the brand (SVG source):\n\n\`\`\`svg\n${svg}\n\`\`\``;
        })()
      : "";
  content.push({ type: "text", text: [requestText(m), logo, guideText(m)].filter(Boolean).join("\n\n") });
  return {
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(answerSchema(m.kind)) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  };
}

/**
 * Sends the request and judges the answer: the schema first, then `checkTemplate`. Nothing is
 * repaired and nothing is retried. Every error carries the tokens already spent, so that the
 * caller still books them.
 */
export async function generateTemplate(
  client: BrandClient,
  model: string,
  m: TemplateMaterial,
): Promise<TemplateResult> {
  const usage: Usage = { ...EMPTY_USAGE };
  let reply;
  try {
    reply = await client.stream(templateRequest(m, model)).finalMessage();
  } catch (error) {
    throw new AiError(error instanceof Error ? error.message : String(error));
  }
  addUsage(usage, reply.usage);
  if (reply.stop_reason === "refusal") {
    throw new AiError("The model declined to make a template from this material", { ...usage });
  }
  if (reply.stop_reason === "max_tokens") {
    throw new AiError("The answer was cut off (too long); try again with fewer screenshots or a shorter brief", {
      ...usage,
    });
  }
  const texts = reply.content.flatMap((b) => (b.type === "text" && b.text.trim() ? [b.text.trim()] : []));
  let raw: unknown;
  try {
    raw = parseAnswer(texts);
  } catch {
    throw new AiError("The model did not return valid JSON; try again", { ...usage });
  }
  const parsed = answerSchema(m.kind).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AiError(
      `The answer does not fit the schema (${first?.path.join(".") || "unknown field"}: ${first?.message})`,
      {
        ...usage,
      },
    );
  }
  const checked = checkTemplate(answerToFile(parsed.data, m.kind, m.formats), { mode: "proposal" });
  if (!checked.ok) {
    const n = checked.problems.length;
    const shown = checked.problems.slice(0, 5).join("; ");
    throw new AiError(`The template was refused (${n} problem${n === 1 ? "" : "s"}): ${shown}${n > 5 ? "; …" : ""}`, {
      ...usage,
    });
  }
  return { proposal: checked.template as TemplateProposal, notes: parsed.data.notes, model: reply.model, usage };
}
````

- [ ] **Step 6: Write the proposal module**

`src/server/template-proposal.ts` (this task's part; Task 6 adds apply and the routes):

````ts
// A template proposal: `template.json` (and optionally `extras.json`) in
// `template-input/proposal/`, made by the server (route A) or by an agent from the downloaded
// prompt (route B). `checkProposal` judges both the same way, with `checkTemplate`, and names
// every problem with its place.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { path as inside, reason, serialize, writeJsonAtomic } from "./files.js";
import { checkTemplate, type TemplateProposal } from "../web/studio/own-template.js";

export const proposalDir = (projectDir: string) => join(projectDir, "template-input", "proposal");

const ExtrasSchema = z
  .object({
    notes: z.array(z.string().max(300)).max(10).default([]),
    /** The proposal is the fixed sample, made without a model. */
    sample: z.boolean().default(false),
  })
  .strict();
export type ProposalExtras = z.infer<typeof ExtrasSchema>;

export type ProposalState =
  | { state: "none" }
  | { state: "invalid"; problems: string[] }
  | { state: "ready"; template: TemplateProposal; notes: string[]; sample: boolean };

const invalid = (problems: string[]): ProposalState => ({ state: "invalid", problems });

export async function checkProposal(projectDir: string): Promise<ProposalState> {
  const dir = proposalDir(projectDir);
  let text: string;
  try {
    text = await readFile(inside({ dir }, "template.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { state: "none" };
    return invalid([`template.json: cannot be read (${reason(e)})`]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return invalid(["template.json: not valid JSON"]);
  }
  const checked = checkTemplate(raw, { mode: "proposal" });
  const problems = checked.ok ? [] : [...checked.problems];
  let extras: ProposalExtras = ExtrasSchema.parse({});
  try {
    const r = ExtrasSchema.safeParse(JSON.parse(await readFile(inside({ dir }, "extras.json"), "utf8")));
    if (r.success) extras = r.data;
    else problems.push(`extras.json: ${r.error.issues[0].path.join(".") || "(file)"}: ${r.error.issues[0].message}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") problems.push("extras.json: not valid JSON");
  }
  if (problems.length || !checked.ok) return invalid(problems);
  return { state: "ready", template: checked.template as TemplateProposal, notes: extras.notes, sample: extras.sample };
}

/** Writes a proposal; a pending one is replaced. */
export async function writeProposal(
  projectDir: string,
  template: unknown,
  extras: { notes: string[]; sample: boolean },
): Promise<void> {
  await serialize(`template-proposal:${projectDir}`, async () => {
    const dir = proposalDir(projectDir);
    await rm(dir, { recursive: true, force: true });
    await writeJsonAtomic(join(dir, "template.json"), template);
    await writeJsonAtomic(join(dir, "extras.json"), extras);
  });
}

export async function discardProposal(projectDir: string): Promise<void> {
  await serialize(`template-proposal:${projectDir}`, () =>
    rm(proposalDir(projectDir), { recursive: true, force: true }),
  );
}
````

- [ ] **Step 7: Write the route and register it**

`src/server/template-generate.ts`:

````ts
// Route A: "Generate with Claude". Reads the material of the project, makes one paid call behind
// the guard (cap with a reserve of $1, one call at a time, booking) and writes the answer as a
// proposal. Without an API key it writes the fixed sample template instead, which costs
// nothing and books nothing. Nothing is applied here.
import { readFile } from "node:fs/promises";
import { ApiError, route, type Route } from "./http.js";
import { path } from "./files.js";
import { brandFolder, loadBrand } from "./brand.js";
import { StorageError, loadSettingsFile, readGlobalCap } from "./store.js";
import { profileForPrompt } from "./schema.js";
import { runPaid } from "./ai/guard.js";
import { sampleTemplate } from "./ai/sample.js";
import { TEMPLATE_RESERVE_USD, generateTemplate, type TemplateMaterial } from "./ai/template.js";
import type { BrandClient } from "./ai/brand.js";
import type { GuideContext } from "./template-guide.js";
import { readTemplateInput, splitTexts, type TemplateInput } from "./template-input.js";
import { checkProposal, writeProposal } from "./template-proposal.js";

const IMAGE_TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

/** The same text as an `ApiError` with its status, for a failure of the storage layer. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof StorageError) throw new ApiError(e.status, e.message);
    throw e;
  }
}

/** What both routes know about the project: the brand, the profile, the tone and the user's material. */
export async function loadContext(projectDir: string, input: TemplateInput): Promise<GuideContext> {
  const brand = await loadBrand(projectDir);
  const settings = await guarded(() => loadSettingsFile({ dir: projectDir }));
  return {
    kind: input.kind,
    formats: input.formats,
    texts: splitTexts(input.texts),
    brief: input.brief,
    brand,
    profile: profileForPrompt(settings.profile),
    tone: settings.tone,
    bannedWords: settings.bannedWords,
  };
}

/** The context plus what only the model call needs: the screenshots and the logo. */
export async function loadMaterial(projectDir: string, input: TemplateInput): Promise<TemplateMaterial> {
  const context = await loadContext(projectDir, input);
  const logoRel = context.brand.logos.default;
  let logo: TemplateMaterial["logo"] = null;
  if (logoRel) {
    try {
      const bytes = await readFile(path({ dir: brandFolder(projectDir) }, logoRel));
      logo = logoRel.endsWith(".svg") ? { kind: "svg", text: bytes.toString("utf8") } : { kind: "png", data: bytes };
    } catch {
      logo = null; // a logo that cannot be read only makes the prompt shorter
    }
  }
  return {
    ...context,
    logo,
    images: await Promise.all(
      input.images.map(async (i) => ({
        mediaType: IMAGE_TYPE[i.name.slice(i.name.lastIndexOf(".") + 1) as keyof typeof IMAGE_TYPE],
        data: await readFile(path({ dir: projectDir }, "template-input", i.name)),
      })),
    ),
  };
}

export const EMPTY_INPUT = "Add a screenshot, the text of an old post or a short brief first";

export function templateGenerateRoutes(o: {
  dataDir: string;
  brand: { client: BrandClient; model: string } | null;
}): Route[] {
  return [
    route("POST", "/api/template-generate", async (c) => {
      const project = await c.project();
      const input = await readTemplateInput(project.dir);
      if (!input.images.length && !splitTexts(input.texts).length && !input.brief) throw new ApiError(400, EMPTY_INPUT);
      if (!o.brand) {
        const sample = sampleTemplate(input.kind, input.formats);
        await writeProposal(project.dir, sample.template, { notes: sample.notes, sample: true });
        return checkProposal(project.dir);
      }
      const { client, model } = o.brand;
      const material = await loadMaterial(project.dir, input);
      const paid = await runPaid(
        {
          dataDir: o.dataDir,
          cap: () => guarded(() => readGlobalCap(o.dataDir)),
          label: "Template generation",
          task: `template:${project.slug}`,
          model,
          capped: true,
          reserveUsd: TEMPLATE_RESERVE_USD,
        },
        async () => {
          const r = await generateTemplate(client, model, material);
          return { value: r, model: r.model, usage: r.usage };
        },
      );
      await writeProposal(project.dir, paid.value.proposal, { notes: paid.value.notes, sample: false });
      return checkProposal(project.dir);
    }),
  ];
}
````

In `src/server/app.ts` add `import { templateGenerateRoutes } from "./template-generate.js";` and, after the `templateInputRoutes(...)` line, `...templateGenerateRoutes({ dataDir: o.dataDir, brand }),`.

- [ ] **Step 8: Run the tests and the checks**

Run: `npx vitest run tests/template-ai.test.ts tests/brand-ai.test.ts tests/brand-generate.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 9: Commit**

```bash
git add src/server/template-guide.ts src/server/ai/template.ts src/server/ai/brand.ts src/server/ai/sample.ts src/server/template-proposal.ts src/server/template-generate.ts src/server/app.ts tests/helpers/template.ts tests/template-ai.test.ts
git commit -m "Generate an own template with Claude (route A)"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 5: Route B, the prompt for an agent and `npm run template:check`

**Files:**
- Create: `src/server/template-prompt.ts`, `src/server/template-check-cli.ts`
- Modify: `src/server/app.ts`, `package.json` (script), `tests/helpers/template.ts` (add `writeTemplateProposal`)
- Test: `tests/template-prompt.test.ts`

**Interfaces:**
- Consumes: `guideText`, `requestText`, `GuideContext` (Task 4), `loadContext`, `EMPTY_INPUT` (Task 4), `readTemplateInput`, `splitTexts` (Task 3), `checkProposal` (Task 4), `PROJECT_SLUG`, `projectDir` (`projects.ts`).
- Produces: `buildTemplatePrompt({ slug, input, context, brandFolder }): string`; `templatePromptRoutes(): Route[]` (`GET /api/template-prompt`, a `.md` download named `template-prompt-<slug>.md`, 400 without material); `templateCheck(dataDir, slug): Promise<{ code: number; out: string[] }>` (prints `The template proposal is valid.` and exits 0, or lists every problem and exits 1; 2 for a bad argument); script `npm run template:check -- <project>`; test helper `writeTemplateProposal(projectDir, template?, extras?)`.

The prompt tells the agent to write `data/projects/<slug>/template-input/proposal/template.json` (and optionally `extras.json`), to run the check until it is valid, to write nowhere else and to call no paid API. It holds no absolute path of this computer.

- [ ] **Step 1: Write the tests**

`tests/helpers/template.ts`: append

````ts
/** Writes a proposal as an agent would: `template.json`, and `extras.json` when there are extras. */
export function writeTemplateProposal(projectDir: string, template: any = exampleTemplate(), extras?: unknown): string {
  const dir = join(projectDir, "template-input", "proposal");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "template.json"), JSON.stringify(template, null, 2));
  if (extras !== undefined) writeFileSync(join(dir, "extras.json"), JSON.stringify(extras, null, 2));
  return dir;
}
````

`tests/template-prompt.test.ts`:

````ts
// Route B: the downloadable prompt, and `npm run template:check` that the agent runs on its work.
// An agent that follows the prompt needs only this file and the project folder.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareData } from "../src/server/projects.js";
import { buildTemplatePrompt } from "../src/server/template-prompt.js";
import { ALLOWED_VARIABLES, CSS_FUNCTIONS, TAGS } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { webpHeader } from "./helpers/brand-files.js";
import { carouselExample, exampleTemplate, saved, writeTemplateProposal } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
const dirs: string[] = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function start() {
  const s = await startTemplates({ withClient: false });
  studios.push(s);
  return s;
}

const context = {
  kind: "image" as const,
  formats: ["li-square" as const, "story" as const],
  texts: ["A post about a launch."],
  brief: "Bold statements",
  brand: brandFromDisk() as any,
  profile: { sector: "Staffing" },
  tone: "Warm.",
  bannedWords: ["cheap"],
};
const input = {
  images: [{ name: "image-0a1b2c3d.png", bytes: 2048 }],
  texts: "A post about a launch.",
  brief: "Bold statements",
  kind: "image" as const,
  formats: context.formats,
};

describe("buildTemplatePrompt", () => {
  const text = buildTemplatePrompt({ slug: "acme", input, context, brandFolder: "data/projects/acme/brand" });

  it("says where the proposal goes, which project it is for, and what the file holds", () => {
    expect(text).toContain('# Make an own template for the project "acme"');
    expect(text).toContain("data/projects/acme/template-input/proposal/");
    expect(text).toContain('"kind": "image"');
    expect(text).toContain('"formats": ["li-square","story"]');
    expect(text).toContain("`fields` and `tree`");
    expect(text).toContain("no `id` and no `created`");
    expect(text).toContain("data/projects/acme/brand/logo/default.svg");
  });

  it("lists the screenshots by name, and the texts and the brief", () => {
    expect(text).toContain("data/projects/acme/template-input/image-0a1b2c3d.png");
    expect(text).toContain("A post about a launch.");
    expect(text).toContain("Bold statements");
  });

  it("has the same rules as the validator: every tag, variable and function, and the example", () => {
    for (const t of TAGS) expect(text).toContain(`\`${t}\``);
    for (const v of ALLOWED_VARIABLES) expect(text).toContain(`\`${v}\``);
    for (const f of CSS_FUNCTIONS) expect(text).toContain(`\`${f}\``);
    expect(text).toContain('"label": "Headline"');
    expect(text).toContain("Warm.");
  });

  it("tells the agent to run the check, and what not to touch or call", () => {
    expect(text).toContain("npm run template:check -- acme");
    expect(text).toContain('prints "The template proposal is valid."');
    expect(text).toContain("Do not write outside");
    expect(text).toContain("call any paid API");
  });

  it("asks for slides in a carousel", () => {
    const carousel = buildTemplatePrompt({
      slug: "acme",
      input: { ...input, kind: "carousel", formats: ["li-carousel"] },
      context: { ...context, kind: "carousel", formats: ["li-carousel"] },
      brandFolder: "src/web/brand",
    });
    expect(carousel).toContain("`slides` and `defaultSlides`");
    expect(carousel).toContain("src/web/brand/logo/default.svg");
  });
});

describe("GET /api/template-prompt", () => {
  it("needs some material", async () => {
    const { call } = await start();
    expect(await call("/api/template-prompt")).toMatchObject({ status: 400 });
  });

  it("is a markdown download about the material of this project, without a path of this computer or a key", async () => {
    const { call, upload, base, dataDir } = await start();
    await upload(webpHeader(5, 5));
    await call("/api/template-input", "PUT", { texts: "Hello", brief: "Short", kind: "image", formats: ["story"] });
    const r = await fetch(`${base}/api/template-prompt`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="template-prompt-postwright.md"');
    const body = await r.text();
    expect(body).toMatch(/data\/projects\/postwright\/template-input\/image-[0-9a-f]{8}\.webp/);
    expect(body).toContain("Hello");
    expect(body).toContain("src/web/brand/logo/default.svg");
    expect(body).not.toContain(dataDir);
    expect(body).not.toMatch(/sk-ant|ANTHROPIC_API_KEY/);
  });

  it("is about the project in the header", async () => {
    const { call, base } = await start();
    await call("/api/projects", "POST", { name: "Beta Studio" });
    await call(
      "/api/template-input",
      "PUT",
      { texts: "", brief: "For beta", kind: "image", formats: ["story"] },
      "beta-studio",
    );
    const r = await fetch(`${base}/api/template-prompt`, { headers: { "x-postwright-project": "beta-studio" } });
    expect(r.headers.get("content-disposition")).toContain("template-prompt-beta-studio.md");
    expect(await r.text()).toContain("npm run template:check -- beta-studio");
    expect((await fetch(`${base}/api/template-prompt`)).status).toBe(400);
  });
});

describe("npm run template:check", () => {
  const run = (dataDir: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "src/server/template-check-cli.ts", ...args], {
      env: { ...process.env, POSTWRIGHT_DATA_DIR: dataDir },
      encoding: "utf8",
    });
  async function data() {
    const dataDir = join(mkdtempSync(join(tmpdir(), "pw-check-")), "data");
    dirs.push(join(dataDir, ".."));
    await prepareData(dataDir);
    return { dataDir, project: join(dataDir, "projects", "postwright") };
  }

  it("approves a valid proposal, with and without extras, with exit code 0", async () => {
    const { dataDir, project } = await data();
    writeTemplateProposal(project);
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("The template proposal is valid.");
    writeTemplateProposal(project, carouselExample(), { notes: ["A note."] });
    expect(run(dataDir, "postwright").status).toBe(0);
  });

  it("names every problem with its place and exits with 1", async () => {
    const { dataDir, project } = await data();
    const bad = { ...exampleTemplate(), css: ".a { color: red; }", tree: [{ tag: "script" }] };
    writeTemplateProposal(project, bad);
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("The proposal has 2 problems:");
    expect(r.stdout).toContain('css rule 1 (.a) (color): the colour "red" is not allowed');
    expect(r.stdout).toContain('tree[0].tag: "script" is not an allowed tag');
  });

  it("says what is wrong with an id of its own and with a broken extras file", async () => {
    const { dataDir, project } = await data();
    writeTemplateProposal(project, saved(exampleTemplate()));
    expect(run(dataDir, "postwright").stdout).toContain("must not have them");
    writeTemplateProposal(project, exampleTemplate(), { notes: "not a list" });
    expect(run(dataDir, "postwright").stdout).toContain("extras.json: notes");
  });

  it("says what is wrong when there is no proposal, no argument, or no such project", async () => {
    const { dataDir } = await data();
    const none = run(dataDir, "postwright");
    expect(none.status).toBe(1);
    expect(none.stdout).toContain("No proposal found");
    expect(run(dataDir).status).toBe(2);
    expect(run(dataDir, "../x").status).toBe(2);
    const unknown = run(dataDir, "nope");
    expect(unknown.status).toBe(1);
    expect(unknown.stdout).toContain("Unknown project");
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-prompt.test.ts`
Expected: FAIL, `Cannot find module '../src/server/template-prompt.js'`.

- [ ] **Step 3: Write the prompt and the CLI**

`src/server/template-prompt.ts`:

````ts
// Route B: the downloadable prompt for Claude Code or Codex. It holds everything an agent needs to
// write a template proposal into the project folder and check it, without calling the Claude API.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ApiError, response, route, type Route } from "./http.js";
import { guideText, requestText, type GuideContext } from "./template-guide.js";
import { readTemplateInput, splitTexts, type TemplateInput } from "./template-input.js";
import { EMPTY_INPUT, loadContext } from "./template-generate.js";

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export function buildTemplatePrompt(o: {
  slug: string;
  input: TemplateInput;
  context: GuideContext;
  /** Where the logo files are: the project's own brand folder, or the built-in one. */
  brandFolder: string;
}): string {
  const folder = `data/projects/${o.slug}/template-input`;
  const proposal = `${folder}/proposal`;
  const images = o.input.images.length
    ? o.input.images.map((f) => `- \`${folder}/${f.name}\` (${kb(f.bytes)}): a screenshot of an old post`).join("\n")
    : "- (no screenshots)";
  const carousel = o.input.kind === "carousel";
  return `# Make an own template for the project "${o.slug}"

You are working in the Postwright folder (the one with \`package.json\`). Do not run the studio; you only write files.

## Goal

Write a template proposal into \`${proposal}/\`. The studio shows it on the Templates screen the next time the page loads (or after "Check for a proposal"), and the user keeps it or discards it. Stop only when the check in the last section says the proposal is valid.

## Material

Look at every screenshot before you start:

${images}

The logo of the brand is \`${o.brandFolder}/logo/default.svg\` (or \`default.png\`); you do not need it in the template, because the \`logo\` slot places it.

${requestText(o.context)}

## What to write

All paths are inside \`${proposal}/\`.

- \`template.json\`, the template. It has \`"version": 1\`, \`"kind": "${o.input.kind}"\`, \`"formats": ${JSON.stringify(o.input.formats)}\`, \`name\`, \`goal\`, \`css\` and ${carousel ? "`slides` and `defaultSlides`" : "`fields` and `tree`"}. It has no \`id\` and no \`created\`: the studio makes those when the user keeps the template.
- \`extras.json\` (optional): \`{ "notes": ["..."] }\`, up to ten short notes for the user, for example what you took from the old posts or what you could not see.

${guideText(o.context)}

## Check your work

Run:

\`\`\`
npm run template:check -- ${o.slug}
\`\`\`

It checks the proposal with the same code as the studio and names every problem with its place. Fix them and run it again. You are done when it prints "The template proposal is valid."

## Do not

- Do not write outside \`${proposal}/\`.
- Do not touch other projects, \`src/\`, or the files in \`${folder}/\` that are not in \`proposal/\`.
- Do not start the server or call any paid API.
`;
}

/** `GET /api/template-prompt`: the prompt as a markdown download. */
export function templatePromptRoutes(): Route[] {
  return [
    route("GET", "/api/template-prompt", async (c) => {
      const project = await c.project();
      const input = await readTemplateInput(project.dir);
      if (!input.images.length && !splitTexts(input.texts).length && !input.brief) throw new ApiError(400, EMPTY_INPUT);
      const custom = existsSync(join(project.dir, "brand", "brand.json"));
      const text = buildTemplatePrompt({
        slug: project.slug,
        input,
        context: await loadContext(project.dir, input),
        brandFolder: custom ? `data/projects/${project.slug}/brand` : "src/web/brand",
      });
      return response({
        contentType: "text/markdown; charset=utf-8",
        headers: { "content-disposition": `attachment; filename="template-prompt-${project.slug}.md"` },
        body: text,
      });
    }),
  ];
}
````

`src/server/template-check-cli.ts`:

````ts
// `npm run template:check -- <project>`: checks the template proposal of a project with the same
// code as the server and names every problem. For an agent that makes a proposal by hand.
import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PROJECT_SLUG, projectDir } from "./projects.js";
import { checkProposal } from "./template-proposal.js";

export async function templateCheck(
  dataDir: string,
  slug: string | undefined,
): Promise<{ code: number; out: string[] }> {
  if (!slug || !PROJECT_SLUG.test(slug)) return { code: 2, out: ["Usage: npm run template:check -- <project>"] };
  const dir = projectDir(dataDir, slug);
  const known = await access(join(dir, "project.json")).then(
    () => true,
    () => false,
  );
  if (!known) return { code: 1, out: [`Unknown project: ${slug}`] };
  const result = await checkProposal(dir);
  if (result.state === "none") {
    return {
      code: 1,
      out: [`No proposal found: data/projects/${slug}/template-input/proposal/template.json is missing.`],
    };
  }
  if (result.state === "invalid") {
    const n = result.problems.length;
    return {
      code: 1,
      out: [`The proposal has ${n} problem${n === 1 ? "" : "s"}:`, ...result.problems.map((p) => `- ${p}`)],
    };
  }
  return { code: 0, out: ["The template proposal is valid."] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, out } = await templateCheck(process.env.POSTWRIGHT_DATA_DIR ?? "./data", process.argv[2]);
  console.log(out.join("\n"));
  process.exitCode = code;
}
````

In `package.json`, under `scripts`, after `brand:check`:

````json
    "template:check": "node --import tsx src/server/template-check-cli.ts",
````

In `src/server/app.ts` add `import { templatePromptRoutes } from "./template-prompt.js";` and, after the `templateGenerateRoutes(...)` line, `...templatePromptRoutes(),`.

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest run tests/template-prompt.test.ts`
Expected: all pass (the CLI tests start a Node process each; allow a few seconds).

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 5: Commit**

```bash
git add src/server/template-prompt.ts src/server/template-check-cli.ts src/server/app.ts package.json tests/helpers/template.ts tests/template-prompt.test.ts
git commit -m "Add the prompt for an agent and template:check (route B)"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 6: The proposal routes (get, apply, discard)

**Files:**
- Modify: `src/server/template-proposal.ts`, `src/server/app.ts`
- Test: `tests/template-routes.test.ts` (append)

**Interfaces:**
- Consumes: `checkProposal`, `discardProposal` (Task 4), `saveOwnTemplate` (Task 2), `response`, `route`, `ApiError`, `Project`, `Route` (`http.ts`).
- Produces: `applyProposal(project: Project): Promise<TemplateFile>` (checks again; 409 when there is none, when it is invalid, or at 30 templates; assigns the id; writes the file; removes the proposal); `templateProposalRoutes(): Route[]`: `GET /api/template-proposal` (the `ProposalState`), `POST /api/template-proposal/apply` (201 with the saved file), `DELETE /api/template-proposal` (200 also when there is nothing).

- [ ] **Step 1: Write the tests**

In `tests/template-routes.test.ts`: change the imports to `import { existsSync, writeFileSync } from "node:fs";` and `import { exampleTemplate, saved, writeOwn, writeTemplateProposal } from "./helpers/template.js";`, and append:

````ts
describe("the proposal routes", () => {
  const proposal = (dir: string, template: unknown = exampleTemplate(), extras?: unknown) =>
    writeTemplateProposal(dir, template, extras);

  it("says none, then ready with the notes and whether it is a sample, then invalid with every problem", async () => {
    const { call, projectDir } = await start();
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    proposal(projectDir, exampleTemplate(), { notes: ["From the old posts."], sample: true });
    const ready = await call("/api/template-proposal");
    expect(ready.body).toMatchObject({
      state: "ready",
      notes: ["From the old posts."],
      sample: true,
      template: { name: "Statement" },
    });
    proposal(projectDir, { ...exampleTemplate(), css: ".a { color: red; }", tree: [{ tag: "script" }] });
    const invalid = await call("/api/template-proposal");
    expect(invalid.body.state).toBe("invalid");
    expect(invalid.body.problems).toHaveLength(2);
    expect(invalid.body.problems.join("\n")).toMatch(/colour "red"/);
  });

  it("is invalid for an id of its own, for text that is not JSON, and for extras that do not fit", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir, saved(exampleTemplate()));
    expect((await call("/api/template-proposal")).body.problems[0]).toMatch(/must not have them/);
    const dir = proposal(projectDir);
    writeFileSync(join(dir, "template.json"), "{ nope");
    expect((await call("/api/template-proposal")).body).toEqual({
      state: "invalid",
      problems: ["template.json: not valid JSON"],
    });
    proposal(projectDir, exampleTemplate(), { notes: "x", unknown: true });
    expect((await call("/api/template-proposal")).body.problems[0]).toMatch(/^extras\.json: /);
  });

  it("applies a proposal: the server makes the id, the proposal goes, and the template is in the list", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^own-[0-9a-f]{8}$/);
    expect(r.body).toMatchObject({ name: "Statement", kind: "image" });
    expect(existsSync(join(projectDir, "template-input", "proposal"))).toBe(false);
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    expect((await call("/api/templates")).body.templates.map((t: any) => t.id)).toEqual([r.body.id]);
    expect((await call("/api/template-proposal/apply", "POST", {})).status).toBe(409);
  });

  it("does not apply a proposal that is not valid, and leaves it in place", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir, { ...exampleTemplate(), css: ".a { background: url(x); }" });
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/not valid: css rule 1 \(\.a\) \(background\): url\(\) is not allowed/);
    expect((await call("/api/templates")).body.templates).toEqual([]);
    expect((await call("/api/template-proposal")).body.state).toBe("invalid");
  });

  it("says 409 at 30 templates, and keeps the proposal", async () => {
    const { call, projectDir } = await start();
    for (let i = 0; i < 30; i++) writeOwn(projectDir, exampleTemplate(), `own-${String(i).padStart(8, "0")}`);
    proposal(projectDir);
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("A project can have at most 30 own templates; delete one first");
    expect((await call("/api/template-proposal")).body.state).toBe("ready");
  });

  it("discards, also when there is nothing to discard", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    expect((await call("/api/template-proposal", "DELETE")).status).toBe(200);
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    expect((await call("/api/template-proposal", "DELETE")).status).toBe(200);
  });

  it("works from generation to a saved template, per project", async () => {
    const { call } = await start();
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", { texts: "A post", brief: "", kind: "image", formats: ["li-square"] });
    expect((await call("/api/template-generate", "POST", {})).body).toMatchObject({ state: "ready", sample: true });
    expect((await call("/api/template-proposal", "GET", undefined, "beta")).body).toEqual({ state: "none" });
    const kept = await call("/api/template-proposal/apply", "POST", {});
    expect(kept.status).toBe(201);
    expect(kept.body.name).toBe("Sample template");
    expect((await call("/api/templates", "GET", undefined, "beta")).body.templates).toEqual([]);
  });

  it("applies a template that a post can then use, and an idea too", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    const kept = await call("/api/template-proposal/apply", "POST", {});
    const post = await call("/api/posts", "POST", {
      title: "A post",
      kind: "image",
      template: kept.body.id,
      formats: ["li-square"],
      content: { headline: "A *b*" },
      brandVersion: "v1",
    });
    expect(post.status).toBe(201);
    expect((await call("/api/ideas", "POST", { date: "2026-10-12", title: "I", template: kept.body.id })).status).toBe(
      201,
    );
  });
});
````

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/template-routes.test.ts`
Expected: the new `the proposal routes` tests FAIL with status 404 (no such route).

- [ ] **Step 3: Add apply and the routes**

In `src/server/template-proposal.ts` replace the imports from `./http.js` onward with:

````ts
import { ApiError, response, route, type Project, type Route } from "./http.js";
import { path as inside, reason, serialize, writeJsonAtomic } from "./files.js";
import { saveOwnTemplate } from "./template-store.js";
import { checkTemplate, type TemplateFile, type TemplateProposal } from "../web/studio/own-template.js";
````

and append at the end of the file:

````ts
/**
 * Keeps the proposal: it is checked once more, gets an id and the time from the server, is saved
 * as an own template, and the proposal is removed. At most 30 templates per project.
 */
export async function applyProposal(project: Project): Promise<TemplateFile> {
  return serialize(`template-apply:${project.dir}`, async () => {
    const state = await checkProposal(project.dir);
    if (state.state === "none") throw new ApiError(409, "There is no template proposal to use");
    if (state.state === "invalid") throw new ApiError(409, `The proposal is not valid: ${state.problems[0]}`);
    const file = await saveOwnTemplate(project.dir, state.template);
    await discardProposal(project.dir);
    return file;
  });
}

export function templateProposalRoutes(): Route[] {
  return [
    route("GET", "/api/template-proposal", async (c) => checkProposal((await c.project()).dir)),
    route("POST", "/api/template-proposal/apply", async (c) =>
      response({ status: 201, body: await applyProposal(await c.project()) }),
    ),
    route("DELETE", "/api/template-proposal", async (c) => {
      await discardProposal((await c.project()).dir);
      return { ok: true };
    }),
  ];
}
````

In `src/server/app.ts` add `import { templateProposalRoutes } from "./template-proposal.js";` and, after `...templatePromptRoutes(),`, `...templateProposalRoutes(),`. The finished `app.ts` has this in `routes`:

````ts
      ...templateRoutes(),
      ...templateInputRoutes({ generate: { available: brand !== null, model: brand?.model ?? null } }),
      ...templateGenerateRoutes({ dataDir: o.dataDir, brand }),
      ...templatePromptRoutes(),
      ...templateProposalRoutes(),
      ...createRoutes(o),
````

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest run tests/template-routes.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 5: Commit**

```bash
git add src/server/template-proposal.ts src/server/app.ts tests/template-routes.test.ts
git commit -m "Add the template proposal routes"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

## STOP POINT: the server side is done

Tasks 1 to 6 are finished. The owner asked for a natural place to stop; this is it. Everything the browser needs is behind `/api/templates`, `/api/template-input`, `/api/template-generate`, `/api/template-prompt` and `/api/template-proposal`, and `npm run template:check` exists. Nothing in the studio shows it yet.

Before stopping:

- [ ] Run the full set once more: `npm run format:check && npm run typecheck && npm test`.
- [ ] Walk the routes by hand with no key (nothing is booked): start with `env -u ANTHROPIC_API_KEY POSTWRIGHT_DATA_DIR=$(mktemp -d) PORT=<free port> npm start`, then `PUT /api/template-input` with some text, `POST /api/template-generate`, `GET /api/template-proposal` (state `ready`, `sample: true`), `POST /api/template-proposal/apply` (201), `GET /api/templates`. Stop the server.
- [ ] Say in the report that the paid call (route A with a key) has only been tried against a fake client (open point 1 of the spec).
- [ ] The owner decides whether to continue with Task 7.

---

### Task 7: Register own templates in the browser and in the pickers

**Files:**
- Create: `src/web/studio/template-card.js`, `tests/own-template-browser.test.ts`
- Modify: `src/web/studio/templates.js` and `.d.ts` (`registerOwnTemplates`, `allTemplates`, `templateLabel`, `template(id)` fallback), `src/web/studio.js` (fetch and register, `ctx.reloadTemplates`), `src/web/studio/editor.js` (gallery and Convert), `src/web/studio/library.js`, `src/web/studio/ideas-ui.js`

**Interfaces:**
- Consumes: `checkTemplate`, `compileTemplate` (Task 1); `GET /api/templates` (Task 2).
- Produces:
  - `registerOwnTemplates(files: unknown[]): void` (replaces what was registered; a file `checkTemplate` refuses in `"saved"` mode is skipped with `console.warn`), `allTemplates(): Template[]` (built-ins, then own), `templateLabel(s: Template): string` (`"<name> (your template)"` for an own one), and `template(id)` that falls back to the registered ones. `TEMPLATES` stays the built-in list.
  - `templateCard(s: Template, actions?: Node[]): HTMLElement` and `observeThumbnails(cards, brand): IntersectionObserver` in `template-card.js` (the editor's gallery card, with a "Your template" badge for own ones).
  - `ctx.reloadTemplates(): Promise<unknown[]>` on the screen context: fetches `/api/templates` again and registers the result. A failing request does not stop the studio (a notice, and the built-ins stay).
- A project switch reloads the page, so nothing leaks between projects. Templates use only brand variables and logo slots, so they follow a later brand kit change.

- [ ] **Step 1: Write the browser test**

It needs Chrome (the installed one; it is skipped on a developer machine without it and fails in CI, like `mobile.test.ts`). It covers the gallery, the editor preview, the Convert list, the library filter, the export as PNG of an image and of every slide of a carousel (`toSvg` needs a DOM, so this is the spec's "export path" test), and Review Focus 1 and 2.

````ts
// Own templates in a real Chrome: they appear next to the built-in ones in the editor, the
// Convert list and the library filter, they preview like any template, and they export as PNG.
// Chrome is the installed one; without it the file is skipped on a developer machine and fails in CI.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { startStudio } from "./helpers/studio.js";
import { carouselExample, exampleTemplate, writeOwn } from "./helpers/template.js";

const browser: Browser | null = await chromium.launch({ channel: "chrome" }).catch((error: Error) => {
  if (process.env.CI) throw error;
  console.warn(
    `own-template-browser.test.ts skipped: Google Chrome could not be started (${error.message.split("\n")[0]}).`,
  );
  return null;
});

let studio: Awaited<ReturnType<typeof startStudio>>;
const IMAGE = "own-0123abcd";
const CAROUSEL = "own-89abcdef";

beforeAll(async () => {
  if (!browser) return;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  studio = await startStudio();
  writeOwn(studio.projectDir, { ...exampleTemplate(), name: "Quote card" }, IMAGE);
  writeOwn(studio.projectDir, { ...carouselExample(), name: "Tour" }, CAROUSEL);
  // A broken file must not stop the studio.
  writeFileSync(join(studio.projectDir, "templates", "own-33333333.json"), "{ not json");
});
afterAll(async () => {
  await studio?.close();
  await browser?.close();
});

async function open(route: string, width = 1280, height = 900): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height } });
  await page.goto(`${studio.base}/#${route}`);
  await page.waitForSelector("#studio-nav a", { state: "attached" });
  await page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });
  await page.waitForLoadState("networkidle");
  return page;
}

describe.skipIf(!browser)("own templates in the studio", () => {
  it("shows them in the gallery next to the nine built-in ones, labelled, with a thumbnail", async () => {
    const page = await open("editor");
    try {
      expect(await page.locator("article.studio-template-card").count()).toBe(11);
      const card = page.locator(`article[data-template="${IMAGE}"]`);
      expect(await card.locator("h2").innerText()).toBe("Quote card");
      expect(await card.innerText()).toContain("Your template");
      expect(await page.locator('article[data-template="statement"]').innerText()).not.toContain("Your template");
      await card.locator("iframe").waitFor({ state: "attached" });
      const html = await card.locator("iframe").evaluate((f) => (f as HTMLIFrameElement).srcdoc);
      expect(html).toContain(`template-${IMAGE}`);
      await page.locator(`article[data-template="${CAROUSEL}"] iframe`).waitFor({ state: "attached" });
    } finally {
      await page.close();
    }
  });

  it("opens a new post with an own template and previews it", async () => {
    const page = await open(`editor/new/${IMAGE}`);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.locator(".studio-preview-iframe").first().waitFor({ state: "attached" });
      const html = await page
        .locator(".studio-preview-iframe")
        .first()
        .evaluate((f) => (f as HTMLIFrameElement).srcdoc);
      expect(html).toContain(`template-${IMAGE}`);
      expect(html).toContain("without the design tool.");
      const convert = await page.locator("#field-convert option").allInnerTexts();
      expect(convert).toContain("Tour (your template)");
      expect(convert).toContain("Statement");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("opens a carousel of its own, with its three slide kinds", async () => {
    const page = await open(`editor/new/${CAROUSEL}`);
    try {
      await page.locator(".studio-preview-iframe").first().waitFor({ state: "attached" });
      const kinds = await page.locator("select option").allInnerTexts();
      expect(kinds).toEqual(expect.arrayContaining(["Cover", "Step", "Closing"]));
    } finally {
      await page.close();
    }
  });

  it("lists them in the library filter", async () => {
    const library = await open("library");
    try {
      expect(await library.locator("#filter-template option").allInnerTexts()).toEqual(
        expect.arrayContaining(["Quote card (your template)", "Statement"]),
      );
    } finally {
      await library.close();
    }
  });

  it("exports an own template, every slide of an own carousel, as a PNG", async () => {
    const page = await open("editor");
    try {
      const out = (await page.evaluate(`(async () => {
        const { buildImage, template } = await import("/studio/templates.js");
        const { loadBrand } = await import("/studio/brand.js");
        const { renderToBlob } = await import("/studio/render.js");
        const brand = await loadBrand();
        const result = [];
        for (const id of ["${IMAGE}", "${CAROUSEL}"]) {
          const s = template(id);
          const count = s.kind === "carousel" ? s.defaultSlides.length : 1;
          for (let i = 0; i < count; i++) {
            const image = buildImage({ template: id, format: s.formats[0], brand, slide: i });
            const blob = await renderToBlob(image);
            result.push([id, i, blob.type, blob.size]);
          }
        }
        return result;
      })()`)) as Array<[string, number, string, number]>;
      expect(out.map(([id, i]) => `${id}/${i}`)).toEqual([
        `${IMAGE}/0`,
        `${CAROUSEL}/0`,
        `${CAROUSEL}/1`,
        `${CAROUSEL}/2`,
        `${CAROUSEL}/3`,
      ]);
      for (const [, , type, size] of out) {
        expect(type).toBe("image/png");
        expect(size).toBeGreaterThan(5000);
      }
    } finally {
      await page.close();
    }
  });

  it("shows a name with markup as plain text, in the gallery and in the pickers", async () => {
    const name = "<img src=x onerror=alert(1)>";
    writeOwn(studio.projectDir, { ...exampleTemplate(), name }, "own-0badf00d");
    const page = await open("editor");
    try {
      expect(await page.locator(`article[data-template="own-0badf00d"] h2`).innerText()).toBe(name);
      expect(await page.locator("img[src='x']").count()).toBe(0);
      await page.goto(`${studio.base}/#library`);
      await page.waitForSelector("#filter-template");
      expect(await page.locator("#filter-template option").allInnerTexts()).toContain(`${name} (your template)`);
    } finally {
      await page.close();
    }
  });

  it("does not crash on a post whose own template is gone: the library lists it, the editor says which one is missing", async () => {
    const post = await fetch(`${studio.base}/api/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Orphan",
        kind: "image",
        template: "own-deadbeef",
        formats: ["li-square"],
        content: { headline: "A *b*" },
        brandVersion: "v1",
      }),
    }).then((r) => r.json());
    const library = await open("library");
    try {
      expect(await library.locator("#studio-content").innerText()).toContain("Orphan");
    } finally {
      await library.close();
    }
    const editor = await open(`editor/${post.id}`);
    try {
      expect(await editor.locator("#notices").innerText()).toContain("unknown template (own-deadbeef)");
    } finally {
      await editor.close();
    }
  });
});
````

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/own-template-browser.test.ts`
Expected: FAIL: the gallery shows 9 cards, not 11 (or the whole file is skipped when Chrome is missing: install Chrome first).

- [ ] **Step 3: Register, label and fall back in `templates.js`**

````diff
--- a/src/web/studio/templates.js
+++ b/src/web/studio/templates.js
@@ -20,6 +20,7 @@
 import profileBanner from "./templates/profile-banner.js";
 import companyCover from "./templates/company-cover.js";
 import carousel from "./templates/carousel.js";
+import { checkTemplate, compileTemplate } from "./own-template.js";
 
 /** All templates, in the order of the gallery. */
 export const TEMPLATES = [
@@ -36,9 +37,39 @@
 
 const BY_ID = new Map(TEMPLATES.map((s) => [s.id, s]));
 
-/** The template for an id, or null. */
+/** The own templates of the active project (see own-template.js), compiled; set by `registerOwnTemplates`. */
+let OWN = [];
+
+/**
+ * Registers the own templates of the project: the saved files from `GET /api/templates`. A file
+ * that `checkTemplate` refuses is skipped with a warning; the studio still works. Replaces what
+ * was registered before. A project switch reloads the page, so nothing leaks between projects.
+ */
+export function registerOwnTemplates(files) {
+  OWN = [];
+  for (const file of files ?? []) {
+    const checked = checkTemplate(file, { mode: "saved" });
+    if (!checked.ok) {
+      console.warn(`Own template skipped: ${checked.problems[0]}`);
+      continue;
+    }
+    OWN.push(compileTemplate(file));
+  }
+}
+
+/** All templates a user can pick: the built-in ones, then the own ones. `TEMPLATES` stays the built-in list. */
+export function allTemplates() {
+  return [...TEMPLATES, ...OWN];
+}
+
+/** The name of a template as a picker shows it: an own template says so. */
+export function templateLabel(s) {
+  return s.own ? `${s.name} (your template)` : s.name;
+}
+
+/** The template for an id (built-in or own), or null. */
 export function template(id) {
-  return BY_ID.get(id) ?? null;
+  return BY_ID.get(id) ?? OWN.find((s) => s.id === id) ?? null;
 }
 
 const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
````

````diff
--- a/src/web/studio/templates.d.ts
+++ b/src/web/studio/templates.d.ts
@@ -86,6 +86,9 @@
 
 export const TEMPLATES: Template[];
 export function template(id: string): Template | null;
+export function registerOwnTemplates(files: unknown[]): void;
+export function allTemplates(): Template[];
+export function templateLabel(s: Template): string;
 export function escapeHtml(text: unknown): string;
 export function fontFamilyName(name: string): string;
 export function countEmphasis(text: unknown): number;
````

- [ ] **Step 4: The shared gallery card**

`src/web/studio/template-card.js`:

````js
// One template as a gallery card, for the editor's gallery and the Templates screen: a thumbnail
// that is drawn when it scrolls into view, the name (with "Your template" for an own one), the goal,
// the formats, and whatever buttons the screen puts at the bottom.
import { el } from "/ui.js";
import { format as formatOf } from "/studio/formats.js";
import { buildImage, defaultContent, template as templateOf } from "/studio/templates.js";
import { showPreview } from "/studio/render.js";

/** `actions`: elements for the foot of the card (a link, buttons). */
export function templateCard(s, actions = []) {
  const card = el("article", { class: "studio-template-card" }, [
    el("div", { class: "studio-thumbnail", "aria-hidden": "true" }),
    el("div", { class: "studio-template-card-text" }, [
      el("h2", { text: s.name }),
      s.own ? el("span", { class: "badge badge-draft", text: "Your template" }) : null,
      el("p", { text: s.goal }),
      el("p", { class: "studio-format-list", text: s.formats.map((x) => formatOf(x).name).join(" · ") }),
    ]),
    ...(actions.length ? [el("div", { class: "button-row" }, actions)] : []),
  ]);
  card.dataset.template = s.id;
  card.dataset.format = s.formats[0];
  return card;
}

/**
 * Draws the thumbnails of `cards` when they come into view: a dozen full images at once is heavy.
 * Returns the observer; call `disconnect()` when the screen is left.
 */
export function observeThumbnails(cards, brand) {
  const observer = new IntersectionObserver(
    (lines) => {
      for (const r of lines) {
        if (!r.isIntersecting) continue;
        observer.unobserve(r.target);
        const s = templateOf(r.target.dataset.template);
        if (!s) continue;
        const image = buildImage({
          template: s.id,
          content: defaultContent(s),
          format: r.target.dataset.format,
          brand,
        });
        showPreview(r.target.querySelector(".studio-thumbnail"), image, { maxHeight: 220 });
      }
    },
    { rootMargin: "200px" },
  );
  for (const card of cards) observer.observe(card);
  return observer;
}
````

- [ ] **Step 5: Use it in the editor, the library and the idea form**

````diff
diff --git a/src/web/studio/editor.js b/src/web/studio/editor.js
--- a/src/web/studio/editor.js
+++ b/src/web/studio/editor.js
@@ -14,13 +14,15 @@ import {
   projectHeaders,
 } from "/ui.js";
 import {
-  TEMPLATES,
+  allTemplates,
   buildImage,
   template as templateOf,
+  templateLabel,
   defaultContent,
   fieldsOf,
   withoutEmphasis,
 } from "/studio/templates.js";
+import { observeThumbnails, templateCard } from "/studio/template-card.js";
 import { CHANNELS, format as formatOf } from "/studio/formats.js";
 import { showPreview } from "/studio/render.js";
 import { measureOverflow, removeMeasureFrames } from "/studio/overflow.js";
@@ -74,28 +76,16 @@ export async function show(container, ctx) {
 
 function showGallery(container, ctx) {
   ctx.setTitle("Editor");
-  const cards = TEMPLATES.map((s) => {
-    const f = s.formats[0];
-    const holder = el("div", { class: "studio-thumbnail", "aria-hidden": "true" });
-    const card = el("article", { class: "studio-template-card" }, [
-      holder,
-      el("div", { class: "studio-template-card-text" }, [
-        el("h2", { text: s.name }),
-        el("p", { text: s.goal }),
-        el("p", { class: "studio-format-list", text: s.formats.map((x) => formatOf(x).name).join(" · ") }),
-      ]),
+  const cards = allTemplates().map((s) =>
+    templateCard(s, [
       el("a", {
         class: "button",
         href: `#editor/new/${s.id}`,
         text: `Use ${s.name}`,
         "aria-label": `New post with template ${s.name}`,
       }),
-    ]);
-    // Render thumbnails only when they come into view: twelve full images at once is heavy.
-    card.dataset.template = s.id;
-    card.dataset.format = f;
-    return card;
-  });
+    ]),
+  );
   container.replaceChildren(
     el("section", { class: "page-intro" }, [
       el("div", {}, [
@@ -107,24 +97,7 @@ function showGallery(container, ctx) {
     ]),
     el("div", { class: "studio-gallery" }, cards),
   );
-  const observer = new IntersectionObserver(
-    (lines) => {
-      for (const r of lines) {
-        if (!r.isIntersecting) continue;
-        observer.unobserve(r.target);
-        const s = templateOf(r.target.dataset.template);
-        const image = buildImage({
-          template: s.id,
-          content: defaultContent(s),
-          format: r.target.dataset.format,
-          brand: ctx.brand,
-        });
-        showPreview(r.target.querySelector(".studio-thumbnail"), image, { maxHeight: 220 });
-      }
-    },
-    { rootMargin: "200px" },
-  );
-  for (const k of cards) observer.observe(k);
+  const observer = observeThumbnails(cards, ctx.brand);
   return { leave: () => observer.disconnect() };
 }
 
@@ -1052,7 +1025,9 @@ async function showEditor(container, ctx, begin) {
     const choice = el(
       "select",
       { id: "field-convert" },
-      TEMPLATES.filter((x) => x.id !== s.id).map((x) => el("option", { value: x.id, text: x.name })),
+      allTemplates()
+        .filter((x) => x.id !== s.id)
+        .map((x) => el("option", { value: x.id, text: templateLabel(x) })),
     );
     const button = el("button", { type: "button", class: "secondary", text: "Convert" });
     button.addEventListener("click", async () => {
````

````diff
diff --git a/src/web/studio/library.js b/src/web/studio/library.js
--- a/src/web/studio/library.js
+++ b/src/web/studio/library.js
@@ -1,7 +1,7 @@
 // Library: all posts (recipes) as cards, with the status as tabs and further filters next to
 // the search.
 import { confirmDialog, el, emptyState, icon, notice } from "/ui.js";
-import { TEMPLATES, template as templateOf } from "/studio/templates.js";
+import { allTemplates, template as templateOf, templateLabel } from "/studio/templates.js";
 import { factUsable } from "/studio/brand-check.js";
 import { readableMoment, localToday } from "/studio/recipe.js";
 import { CHANNELS, FORMATS, channelsOf } from "/studio/formats.js";
@@ -62,7 +62,7 @@ export async function show(container, ctx) {
   ]);
   const templateFilter = el("select", { id: "filter-template", class: "small", "aria-label": "Template" }, [
     el("option", { value: "", text: "All templates" }),
-    ...TEMPLATES.map((s) => el("option", { value: s.id, text: s.name })),
+    ...allTemplates().map((s) => el("option", { value: s.id, text: templateLabel(s) })),
   ]);
   const search = el("input", {
     type: "search",
````

````diff
diff --git a/src/web/studio/ideas-ui.js b/src/web/studio/ideas-ui.js
--- a/src/web/studio/ideas-ui.js
+++ b/src/web/studio/ideas-ui.js
@@ -6,7 +6,7 @@
 // Suggestions only become ideas after a tick and "Add to planner"; nothing is stored
 // automatically.
 import { confirmDialog, el, notice, fieldError } from "/ui.js";
-import { TEMPLATES, template as templateOf, withoutEmphasis } from "/studio/templates.js";
+import { allTemplates, template as templateOf, templateLabel, withoutEmphasis } from "/studio/templates.js";
 import { ideaToRecipe, toInput } from "/studio/recipe.js";
 import { getAiMode, sampleBar, sampleLabel } from "/studio/writing-help-ui.js";
 
@@ -78,7 +78,7 @@ export function ideaPanel({ ctx, state, saved, deleted, fallback }) {
   const note = el("textarea", { id: "idea-note", rows: "3", maxlength: "1000" });
   const template = el("select", { id: "idea-template" }, [
     el("option", { value: "", text: "No template yet" }),
-    ...TEMPLATES.map((s) => el("option", { value: s.id, text: s.name })),
+    ...allTemplates().map((s) => el("option", { value: s.id, text: templateLabel(s) })),
   ]);
   const headlineField = el("input", {
     type: "text",
````

- [ ] **Step 6: Fetch and register in `studio.js`**

In `src/web/studio.js`: add `import { registerOwnTemplates } from "/studio/templates.js";` below the `loadBrand` import, `let templatesPromise = null;` below `let settingsPromise = null;`, this function above `confirmLeave`:

````js
/**
 * The own templates of the project, registered with the template engine before a screen runs.
 * A failing request does not stop the studio: the built-in templates are still there.
 */
function loadTemplates(retry = false) {
  if (retry || !templatesPromise) {
    const promise = api("/api/templates")
      .then(({ templates }) => {
        registerOwnTemplates(templates);
        return templates;
      })
      .catch((e) => {
        if (templatesPromise === promise) templatesPromise = null;
        registerOwnTemplates([]);
        notice(`Your own templates could not be loaded: ${e.message}`, "error");
        return [];
      });
    templatesPromise = promise;
  }
  return templatesPromise;
}
````

then in `render()` load them with the other three (`const [mod, brand, settings] = await Promise.all([MODULES[screen](), loadBrand(), loadSettings(), loadTemplates()]);`) and add to `ctx`, above `reloadSettings`:

````js
      /** Fetches the own templates again and registers them (after one was kept, renamed or deleted). */
      reloadTemplates: () => loadTemplates(true),
````

- [ ] **Step 7: Run the tests and the checks**

Run: `npx vitest run tests/own-template-browser.test.ts tests/templates.test.ts tests/mobile.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Visual check (screenshots outside the repo)**

Start the app on a free port, with a temporary data folder and no API key, make a sample template, and take screenshots with `playwright-core` and the installed Chrome at 1440 and 375 wide, light and dark. Everything lives in temporary folders; nothing goes into the repo.

````bash
SHOTS=$(mktemp -d); DATA=$(mktemp -d)
PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
(env -u ANTHROPIC_API_KEY POSTWRIGHT_DATA_DIR=$DATA PORT=$PORT npm start > $SHOTS/server.log 2>&1 &)
sleep 3
api() { curl -s -X "$1" "http://127.0.0.1:$PORT$2" -H 'content-type: application/json' -d "$3"; }
api PUT /api/template-input '{"texts":"A post","brief":"Bold statements","kind":"image","formats":["li-square","story"]}' > /dev/null
api POST /api/template-generate '{}' > /dev/null
api POST /api/template-proposal/apply '{}' > /dev/null
````

Save this script as `$SHOTS/shots.mjs` (it walks down the page once, because thumbnails are drawn when they scroll into view):

````js
// Screenshots of some studio screens at 1440 and 375 wide, light and dark. Usage:
//   REPO=<repo folder> node shots.mjs <base url> <output folder> <screen> [<screen> ...]
import { createRequire } from "node:module";
const require = createRequire(`${process.env.REPO}/package.json`);
const { chromium } = require("playwright-core");
const [, , base, out, ...screens] = process.argv;
const browser = await chromium.launch({ channel: "chrome" });
for (const [width, height, scheme] of [
  [1440, 900, "light"],
  [1440, 900, "dark"],
  [375, 812, "light"],
  [375, 812, "dark"],
]) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await context.newPage();
  for (const screen of screens) {
    await page.goto(`${base}/#${screen}`);
    await page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });
    await page.waitForLoadState("networkidle");
    // Thumbnails are drawn when they scroll into view: walk down the page once.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += height / 2) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${screen.replaceAll("/", "-")}-${width}-${scheme}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
````

````bash
REPO=$(pwd) node $SHOTS/shots.mjs http://127.0.0.1:$PORT $SHOTS editor
pkill -f "src/server/start.ts"
echo $SHOTS
````

Open the PNGs with the Read tool and check, in light and dark and at both widths: no horizontal scroll at 375, nothing cut off, the "Your template" label readable, text contrast fine, previews drawn. Fix what is wrong, then repeat.

Look at the editor gallery: the sample template appears after the nine built-in ones, labelled "Your template", with a drawn thumbnail.

- [ ] **Step 8: Commit**

```bash
git add src/web/studio/template-card.js src/web/studio/templates.js src/web/studio/templates.d.ts src/web/studio.js src/web/studio/editor.js src/web/studio/library.js src/web/studio/ideas-ui.js tests/own-template-browser.test.ts
git commit -m "Register own templates in the studio and the pickers"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 8: The Templates screen

**Files:**
- Create: `src/web/studio/template-list.js`, `src/web/studio/template-create.js`, `src/web/studio/template-proposal.js`
- Modify: `src/web/studio.js` (nav, lede, icon, module), `src/web/ui.js` (`textDialog` gets `options.value`), `src/web/studio.css`
- Test: `tests/own-template-browser.test.ts` (append), `tests/mobile.test.ts`

**Interfaces:**
- Consumes: `templateCard`, `observeThumbnails` (Task 7), `allTemplates` (Task 7), `ctx.reloadTemplates()` (Task 7), `compileTemplate` (Task 1), `buildImage`, `defaultContent`, `fieldsOf`, `runCheck`, `measureOverflow`, `removeMeasureFrames`, `showPreview`, `download`, `IMAGE_FORMATS`, `confirmDialog`, `textDialog`, `notice`, and all the routes of tasks 2 to 6.
- Produces: the screen `templates` (`#templates`): `show(container, ctx)` in `template-list.js` (the form, the proposal, your templates with Rename and Delete, the built-in ones, and a list of files that could not be used with a Delete each); `createBlock(ctx, { onProposal, hasProposal })`; `proposalBlock(ctx, { onChange })` returning `{ element, refresh, pending }`.

Behaviour (from the spec): the card "Make a template" takes up to six screenshots (png, jpg, webp, 3 MB), pasted texts (posts separated by a line `---`), a brief, the kind and the formats, with the buttons Generate with Claude, Download prompt, Save details and Check for a proposal; buttons that cannot work are disabled with the reason beside them (no material yet); an empty company profile blocks nothing but the form says the sample content will be generic and links to Settings; making a proposal while one is waiting asks first. The proposal card shows name, goal, notes and the sample content in each chosen format (every slide for a carousel), the brand check and overflow findings, and the buttons **Use this template**, **Use and start a post** (saves, reloads the registered templates, then goes to `#editor/new/<id>`) and **Discard**. An invalid proposal lists its problems and has Discard. Own cards say "Your template" and have Rename and Delete (`confirmDialog`; a template in use gives the server's 409 sentence in a notice).

- [ ] **Step 1: Write the tests**

`tests/own-template-browser.test.ts`: add `writeTemplateProposal` to the helper import (`import { carouselExample, exampleTemplate, writeOwn, writeTemplateProposal } from "./helpers/template.js";`) and add this test as the last one in the `describe` (Review Focus 5):

````ts
  it("shows the findings of a proposal whose text does not fit a format, and still lets the user decide", async () => {
    const long = { ...exampleTemplate(), name: "Too much", formats: ["li-link"] };
    long.fields[3].max = 400;
    long.fields[3].defaultValue = "A very long text that goes on and on. ".repeat(10).trim();
    writeTemplateProposal(studio.projectDir, long, { notes: [] });
    const page = await open("templates");
    try {
      await page.waitForSelector("#template-proposal:not([hidden])");
      await page.waitForFunction(() => /Problem:/.test(document.getElementById("template-proposal")?.innerText ?? ""));
      const card = await page.locator("#template-proposal").innerText();
      expect(card).toContain("You can still use the template");
      expect(await page.getByRole("button", { name: "Use this template" }).isEnabled()).toBe(true);
    } finally {
      await page.close();
    }
  });
````

`tests/mobile.test.ts`: in `beforeAll`, after `postId = ...`, add a proposal for the screen to show (without a key it is the fixed sample):

````ts
  // A proposal for the Templates screen to show: without an API key it is the fixed sample.
  const input = { texts: "A post", brief: "Bold statements", kind: "image", formats: ["li-square", "story"] };
  await fetch(`${studio.base}/api/template-input`, { method: "PUT", headers: json, body: JSON.stringify(input) });
  await fetch(`${studio.base}/api/template-generate`, { method: "POST", headers: json, body: "{}" });
````

and add `["templates, with a proposal showing", "templates"],` to `SCREENS` after `["brand kit", "brand-kit"],`. The existing loops then check no sideways scrolling and Tab order at phone and tablet width.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/own-template-browser.test.ts tests/mobile.test.ts`
Expected: FAIL: the Templates screen does not exist (`#studio-main` stays empty, `#template-proposal` is not found).

- [ ] **Step 3: Wire the screen into the shell**

In `src/web/studio.js`: in `NAV_GROUPS`, "Your foundation", add `["templates", "Templates"],` after `["brand-kit", "Brand kit"],`; add `templates: "The layouts you start a post from, and your own, made from your old posts.",` to `SCREEN_LEDE`; `templates: "layers",` to `SCREEN_ICON`; `templates: () => import("/studio/template-list.js"),` to `MODULES`.

`src/web/ui.js` (a rename dialog starts from the old name):

````diff
diff --git a/src/web/ui.js b/src/web/ui.js
--- a/src/web/ui.js
+++ b/src/web/ui.js
@@ -303,13 +303,14 @@ export async function confirmDialog(question, options = {}) {
   return confirmed === true;
 }
 
-/** Asks for one line of text. Returns the trimmed text, or `null` on cancel or Escape. */
+/** Asks for one line of text, starting from `options.value`. Returns the trimmed text, or `null` on cancel or Escape. */
 export async function textDialog(title, label, options = {}) {
   return dialog({
     title,
     confirmText: options.confirmText ?? "Create",
     buildContent: (form) => {
       const input = el("input", { type: "text", id: "dialog-text", maxlength: String(options.maxLength ?? 60) });
+      input.value = options.value ?? "";
       form.prepend(el("div", { class: "field" }, [el("label", { for: "dialog-text", text: label }), input]));
       queueMicrotask(() => input.focus());
       // An empty name keeps the dialog open.
````

`src/web/studio.css`:

````diff
diff --git a/src/web/studio.css b/src/web/studio.css
--- a/src/web/studio.css
+++ b/src/web/studio.css
@@ -2586,10 +2586,21 @@ textarea[readonly] {
   gap: var(--r3);
 }
 
-#brand-proposal h3 {
+#brand-proposal h3,
+#template-proposal h3 {
   margin-top: var(--r5);
 }
 
+/* The previews of a template proposal have the shape of their format, so they are as wide as they are drawn. */
+#template-proposal .studio-proposal-posts .studio-preview {
+  max-width: none;
+}
+
+.studio-section-title {
+  margin: var(--r5) 0 var(--r3);
+  font-size: var(--t-l);
+}
+
 /* The sample posts are square: a box as wide as the preview is tall leaves no empty strip. */
 .studio-proposal-posts .studio-preview {
   max-width: 260px;
````

- [ ] **Step 4: The form**

`src/web/studio/template-create.js`:

````js
// "Make a template": the material for an own template (screenshots of old posts, pasted texts, a
// brief, the kind and the formats), and the two ways to turn it into a proposal: Generate with
// Claude (without an API key on the server it gives a fixed sample), or a prompt to download for
// Claude Code or Codex.
import { confirmDialog, el, icon, notice, projectHeaders } from "/ui.js";
import { download } from "/studio/render.js";
import { format as formatOf } from "/studio/formats.js";
import { IMAGE_FORMATS } from "/studio/own-template.js";

const MAX_IMAGES = 6;
const EMPTY = "Add a screenshot, the text of an old post or a short brief first.";
const size = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/**
 * `onProposal()` runs when a proposal may have changed; `hasProposal()` says whether one is waiting
 * (a new one replaces it, which the user is told).
 */
export function createBlock(ctx, { onProposal, hasProposal }) {
  const holder = el("section", { class: "card", id: "template-create" });

  async function load() {
    const state = await ctx.api("/api/template-input");
    if (ctx.valid()) render(state);
  }

  function render(state) {
    const texts = el("textarea", {
      id: "template-texts",
      rows: "6",
      maxlength: "8000",
      placeholder: "Paste the text of an old post. Separate posts with a line that holds only ---",
    });
    texts.value = state.texts;
    const brief = el("textarea", {
      id: "template-brief",
      rows: "3",
      maxlength: "600",
      placeholder: "For example: short statements with one bold phrase, for customer quotes",
    });
    brief.value = state.brief;
    const kind = el("select", { id: "template-kind" }, [
      el("option", { value: "image", text: "A single image" }),
      el("option", { value: "carousel", text: "A carousel (cover, steps and closing slide)" }),
    ]);
    kind.value = state.kind;
    const formatBoxes = IMAGE_FORMATS.map((key) =>
      el("label", { class: "checkbox" }, [
        el("input", {
          type: "checkbox",
          name: "format",
          value: key,
          ...(state.formats.includes(key) ? { checked: "" } : {}),
        }),
        formatOf(key).name,
      ]),
    );
    const formatHolder = el("fieldset", { class: "field" });
    const syncFormats = () => {
      formatHolder.replaceChildren(
        el("legend", { text: "Formats" }),
        ...(kind.value === "carousel"
          ? [
              el("p", {
                class: "help-text",
                text: `${formatOf("li-carousel").name}: a carousel always uses this one format.`,
              }),
            ]
          : formatBoxes),
      );
    };
    syncFormats();
    kind.addEventListener("change", () => {
      syncFormats();
      refreshButtons();
    });

    const status = el("p", { role: "status", class: "help-text" });
    const failure = el("p", { class: "error-message", role: "alert", hidden: "" });
    const why = el("p", { class: "help-text" });
    const buttons = [];

    const details = () => ({
      texts: texts.value,
      brief: brief.value.trim(),
      kind: kind.value,
      formats:
        kind.value === "carousel"
          ? ["li-carousel"]
          : formatBoxes
              .map((b) => b.querySelector("input"))
              .filter((i) => i.checked)
              .map((i) => i.value),
    });
    const saveDetails = () => {
      const d = details();
      if (!d.formats.length) throw new Error("Choose at least one format");
      return ctx.api("/api/template-input", { method: "PUT", body: d });
    };
    const hasMaterial = () => state.images.length > 0 || texts.value.trim() !== "" || brief.value.trim() !== "";
    const busy = (on, text = "") => {
      for (const b of buttons) b.disabled = on || b.dataset.off === "1";
      status.textContent = text;
    };
    const run = async (text, work) => {
      failure.hidden = true;
      busy(true, text);
      try {
        await work();
      } catch (e) {
        failure.textContent = e.message;
        failure.hidden = false;
        notice(e.message, "error");
      } finally {
        busy(false);
        refreshButtons();
      }
    };

    const upload = el("input", {
      type: "file",
      id: "template-file",
      accept: "image/png,image/jpeg,image/webp",
      multiple: "",
    });
    const chosen = el("span", { class: "upload-name", text: "Choose screenshots" });
    upload.addEventListener("change", async () => {
      const files = [...upload.files];
      if (files.length) chosen.textContent = files.map((f) => f.name).join(", ");
      await run("Uploading…", async () => {
        for (const file of files) {
          try {
            await ctx.api("/api/template-input/image", { method: "POST", raw: file });
          } catch (e) {
            notice(`${file.name}: ${e.message}`, "error");
          }
        }
        await saveDetails().catch(() => undefined); // keep what was typed before the list reloads
      });
      await load();
    });
    const images = el(
      "ul",
      { class: "studio-input-list" },
      state.images.map((f) =>
        el("li", {}, [
          el("span", { text: `${f.name} · ${size(f.bytes)}` }),
          el("button", {
            type: "button",
            class: "secondary small",
            text: "Remove",
            "aria-label": `Remove ${f.name}`,
            onclick: async () => {
              await run("", async () => {
                await saveDetails().catch(() => undefined);
                await ctx.api(`/api/template-input/${encodeURIComponent(f.name)}`, { method: "DELETE" });
              });
              await load();
            },
          }),
        ]),
      ),
    );

    const save = el("button", { type: "button", class: "secondary", text: "Save details" });
    save.addEventListener("click", () =>
      run("Saving…", async () => {
        await saveDetails();
        notice("Details saved");
      }),
    );

    const generate = el("button", { type: "button", text: "Generate with Claude" });
    generate.addEventListener("click", async () => {
      if (
        hasProposal() &&
        !(await confirmDialog("A new proposal replaces the one you have not used yet.", {
          title: "Replace the proposal?",
          confirmText: "Replace it",
        }))
      )
        return;
      await run(
        state.generate.available ? "Generating… this can take a minute. Keep this page open." : "Making the sample…",
        async () => {
          await saveDetails();
          await ctx.api("/api/template-generate", { method: "POST", body: {} });
          notice(state.generate.available ? "The template proposal is ready" : "The sample template is ready");
          onProposal();
        },
      );
    });

    const prompt = el("button", { type: "button", class: "secondary", text: "Download prompt (.md)" });
    prompt.addEventListener("click", () =>
      run("", async () => {
        await saveDetails();
        const r = await fetch("/api/template-prompt", { headers: projectHeaders() });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The prompt could not be made");
        const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "template-prompt.md";
        download(await r.blob(), name, "text/markdown");
      }),
    );

    const check = el("button", { type: "button", class: "secondary", text: "Check for a proposal" });
    check.addEventListener("click", () => onProposal());

    buttons.push(save, generate, prompt);
    // Why a button is off: nothing to work from yet.
    function refreshButtons() {
      const off = !hasMaterial();
      for (const b of [generate, prompt]) {
        b.dataset.off = off ? "1" : "";
        b.disabled = off;
      }
      why.textContent = off
        ? EMPTY
        : state.generate.available
          ? `Uses the Claude API (${state.generate.model}). A template costs roughly 10 to 50 cents and counts towards the monthly cap.`
          : "Generate with Claude needs ANTHROPIC_API_KEY on the server. Without it you get a fixed sample template, to try the screen; download the prompt for a real proposal.";
    }
    for (const input of [texts, brief]) input.addEventListener("input", refreshButtons);
    refreshButtons();

    const profileEmpty = !Object.values(ctx.settings.profile ?? {}).some((v) => String(v ?? "").trim());
    holder.replaceChildren(
      el("h2", { text: "Make a template" }),
      el("p", {
        class: "help-text",
        text: "Give the studio your old posts and it proposes a template in your brand: layout, fields, and sample content. You see the proposal in every format before anything is saved.",
      }),
      el("div", { class: "field" }, [
        el("label", { class: "upload" }, [
          `Screenshots of old posts (up to ${MAX_IMAGES})`,
          el("span", { class: "upload-tile" }, [upload, icon("plus"), chosen]),
        ]),
        el("p", { class: "help-text", text: "PNG, JPEG or WebP, up to 3 MB each." }),
        images,
      ]),
      el("div", { class: "field" }, [
        el("label", { for: "template-texts", text: "Texts of old posts (optional)" }),
        texts,
      ]),
      el("div", { class: "field" }, [el("label", { for: "template-brief", text: "Brief (optional)" }), brief]),
      el("div", { class: "field" }, [el("label", { for: "template-kind", text: "What kind of post" }), kind]),
      formatHolder,
      profileEmpty
        ? el("p", { class: "help-text" }, [
            "Your company profile in ",
            el("a", { href: "#settings", text: "Settings" }),
            " is empty, so the sample content will be generic.",
          ])
        : null,
      el("div", { class: "button-row" }, [generate, prompt, save]),
      why,
      el("p", {
        class: "help-text",
        text: "With the prompt: run it in Claude Code or Codex from the Postwright folder, then check for a proposal here (or reload the page).",
      }),
      el("div", { class: "button-row" }, [check]),
      status,
      failure,
    );
  }

  load().catch((e) => notice(e.message, "error"));
  return holder;
}
````

- [ ] **Step 5: The proposal**

`src/web/studio/template-proposal.js`:

````js
// The proposal of an own template as the user sees it before anything is saved: name, goal and
// notes, the sample content in every chosen format (every slide, for a carousel), what the brand
// check and the overflow measurement find, and the buttons that keep or discard it.
import { confirmDialog, el, notice } from "/ui.js";
import { buildImage, defaultContent, fieldsOf } from "/studio/templates.js";
import { compileTemplate } from "/studio/own-template.js";
import { format as formatOf } from "/studio/formats.js";
import { showPreview } from "/studio/render.js";
import { measureOverflow, removeMeasureFrames } from "/studio/overflow.js";
import { runCheck } from "/studio/brand-check.js";

/** The findings of the brand check that say something about a template (the rest is about a post). */
const CODES = ["too-long", "emphasis", "contrast", "overflow", "banned-word", "exclamation"];
const LEVEL = { error: "Problem", attention: "Look at", ok: "Fine" };

/** The sample content of a compiled proposal, as the editor would start a post. */
function sampleOf(s) {
  return s.kind === "carousel" ? { content: {}, slides: s.defaultSlides } : { content: defaultContent(s), slides: [] };
}

/** `[{ format, slide }]`: every image of the proposal. */
function imagesOf(s) {
  const slides = s.kind === "carousel" ? s.defaultSlides.map((_, i) => i) : [null];
  return s.formats.flatMap((format) => slides.map((slide) => ({ format, slide })));
}

function preview(ctx, s, { format, slide }, caption) {
  const sample = sampleOf(s);
  const image = buildImage({
    template: s,
    content: sample.content,
    slides: sample.slides,
    slide: slide ?? 0,
    format,
    brand: ctx.brand,
  });
  const box = el("div", { class: "studio-preview" });
  // The preview scales to the width of its box, so it needs to be on the page first.
  requestAnimationFrame(() => {
    const scale = showPreview(box, image, { maxHeight: 240, label: caption });
    box.style.width = `${Math.round(image.width * scale)}px`;
  });
  return el("figure", { class: "studio-file" }, [box, el("figcaption", { text: caption })]);
}

/** The findings for one proposal: brand check plus overflow, measured in the real layout. */
async function findingsOf(ctx, s) {
  const sample = sampleOf(s);
  const names = {};
  const overflow = [];
  for (const { format, slide } of imagesOf(s)) {
    const fields = s.kind === "carousel" ? fieldsOf(s, sample.slides[slide].kind) : s.fields;
    for (const v of fields) names[v.id] = `${/\d$/.test(v.label) ? "" : "the "}${v.label.toLowerCase()}`;
    try {
      const image = buildImage({
        template: s,
        content: sample.content,
        slides: sample.slides,
        slide: slide ?? 0,
        format,
        brand: ctx.brand,
      });
      overflow.push(...(await measureOverflow(image, formatOf(format), { slide, names })));
    } catch {
      /* an image that cannot be built is shown as an empty preview */
    }
  }
  removeMeasureFrames();
  const post = { template: s.id, formats: s.formats, ...sample, caption: {}, altText: "", link: "", facts: [] };
  const report = runCheck({
    post,
    template: s,
    settings: { channels: [], bannedWords: ctx.settings.bannedWords },
    facts: [],
    today: new Date().toISOString().slice(0, 10),
    brand: ctx.brand,
    overflow,
  });
  return report.findings.filter((f) => CODES.includes(f.code));
}

/** `onChange()` runs after the proposal was kept or discarded (the list of templates changed). */
export function proposalBlock(ctx, { onChange }) {
  const holder = el("section", { class: "card", id: "template-proposal", hidden: "" });
  let pending = false;

  async function discard() {
    const ok = await confirmDialog("The proposal is removed; nothing else changes.", {
      title: "Discard this proposal?",
      confirmText: "Discard",
      dangerous: true,
    });
    if (!ok) return;
    try {
      await ctx.api("/api/template-proposal", { method: "DELETE" });
      await refresh();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function keep(thenStartPost, buttons) {
    for (const b of buttons) b.disabled = true;
    try {
      const file = await ctx.api("/api/template-proposal/apply", { method: "POST", body: {} });
      // The editor only knows a template once it is registered.
      await ctx.reloadTemplates();
      notice(`The template "${file.name}" is saved`);
      if (thenStartPost) ctx.navigate(`#editor/new/${file.id}`);
      else {
        await refresh();
        onChange();
      }
    } catch (e) {
      notice(e.message, "error");
      for (const b of buttons) b.disabled = false;
    }
  }

  async function refresh() {
    let result;
    try {
      result = await ctx.api("/api/template-proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    if (!ctx.valid()) return;
    pending = result.state !== "none";
    if (result.state === "none") {
      holder.hidden = true;
      return;
    }
    holder.hidden = false;
    const discardButton = el("button", { type: "button", class: "secondary", text: "Discard" });
    discardButton.addEventListener("click", discard);
    if (result.state === "invalid") {
      holder.replaceChildren(
        el("h2", { text: "Proposal" }),
        el("p", { class: "studio-warning", text: "This proposal cannot be used:" }),
        el(
          "ul",
          { class: "studio-lines" },
          result.problems.map((p) => el("li", { text: p })),
        ),
        el("p", {
          class: "help-text",
          text: "Fix the file and check again, make a new proposal, or discard this one.",
        }),
        el("div", { class: "button-row" }, [discardButton]),
      );
      return;
    }
    let s;
    try {
      s = compileTemplate(result.template);
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    const use = el("button", { type: "button", text: "Use this template" });
    const useAndStart = el("button", { type: "button", class: "secondary", text: "Use and start a post" });
    const buttons = [use, useAndStart];
    use.addEventListener("click", () => keep(false, buttons));
    useAndStart.addEventListener("click", () => keep(true, buttons));
    const findings = el("div", {}, [el("p", { class: "help-text", role: "status", text: "Checking the layout…" })]);
    const previews = imagesOf(s).map((i) => {
      const f = formatOf(i.format);
      return preview(
        ctx,
        s,
        i,
        i.slide === null
          ? f.name
          : `${f.name}, slide ${i.slide + 1} (${s.slides.find((k) => k.kind === s.defaultSlides[i.slide].kind).name})`,
      );
    });
    holder.replaceChildren(
      el("h2", { text: `Proposal: ${s.name}` }),
      result.sample ? el("span", { class: "badge badge-draft", text: "Sample, made without a model" }) : null,
      el("p", { class: "help-text", text: `${s.goal} Nothing is saved yet.` }),
      result.notes.length
        ? el("div", {}, [
            el("h3", { text: "Good to know" }),
            el(
              "ul",
              { class: "studio-lines" },
              result.notes.map((n) => el("li", { text: n })),
            ),
          ])
        : null,
      el("h3", { text: "Sample content in every format" }),
      el("div", { class: "studio-proposal-posts" }, previews),
      el("h3", { text: "Brand check" }),
      findings,
      el("div", { class: "button-row" }, [use, useAndStart, discardButton]),
    );
    findingsOf(ctx, s)
      .then((list) => {
        if (!ctx.valid() || !holder.contains(findings)) return;
        const bad = list.filter((f) => f.level !== "ok");
        findings.replaceChildren(
          bad.length
            ? el("p", { class: "studio-warning", text: "The check found something. You can still use the template." })
            : el("p", { class: "help-text", text: "Nothing to fix." }),
          el(
            "ul",
            { class: "studio-lines" },
            list.map((f) => el("li", { text: `${LEVEL[f.level]}: ${f.text}` })),
          ),
        );
      })
      .catch((e) =>
        findings.replaceChildren(el("p", { class: "studio-warning", text: `The check failed: ${e.message}` })),
      );
  }

  refresh();
  return { element: holder, refresh, pending: () => pending };
}
````

- [ ] **Step 6: The screen**

`src/web/studio/template-list.js`:

````js
// Templates: the layouts a post starts from. The nine built-in ones and the project's own, made
// from its old posts. Own templates can be renamed and deleted; new ones come from the form
// and the proposal below it.
import { confirmDialog, el, notice, textDialog } from "/ui.js";
import { allTemplates } from "/studio/templates.js";
import { observeThumbnails, templateCard } from "/studio/template-card.js";
import { createBlock } from "/studio/template-create.js";
import { proposalBlock } from "/studio/template-proposal.js";

export async function show(container, ctx) {
  let observer = null;
  const gallery = el("div");

  /** The templates changed: fetch them again, register them and draw the lists. */
  async function changed() {
    await ctx.reloadTemplates();
    await draw();
  }

  async function rename(s) {
    const name = await textDialog("Rename template", "Name", { confirmText: "Rename", maxLength: 40, value: s.name });
    if (!name) return;
    try {
      await ctx.api(`/api/templates/${s.id}`, { method: "PUT", body: { name } });
      await changed();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function remove(id, name) {
    const ok = await confirmDialog(`"${name}" is deleted. Posts that use it have to be changed or deleted first.`, {
      title: "Delete this template?",
      confirmText: "Delete",
      dangerous: true,
    });
    if (!ok) return;
    try {
      await ctx.api(`/api/templates/${id}`, { method: "DELETE" });
      await changed();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  const useLink = (s) =>
    el("a", {
      class: "button",
      href: `#editor/new/${s.id}`,
      text: `Use ${s.name}`,
      "aria-label": `New post with template ${s.name}`,
    });

  async function draw() {
    const { skipped } = await ctx.api("/api/templates");
    if (!ctx.valid()) return;
    observer?.disconnect();
    const own = allTemplates().filter((s) => s.own);
    const builtIn = allTemplates().filter((s) => !s.own);
    const ownCards = own.map((s) =>
      templateCard(s, [
        useLink(s),
        el("button", {
          type: "button",
          class: "secondary",
          text: "Rename",
          "aria-label": `Rename ${s.name}`,
          onclick: () => rename(s),
        }),
        el("button", {
          type: "button",
          class: "secondary",
          text: "Delete",
          "aria-label": `Delete ${s.name}`,
          onclick: () => remove(s.id, s.name),
        }),
      ]),
    );
    const builtInCards = builtIn.map((s) => templateCard(s, [useLink(s)]));
    gallery.replaceChildren(
      ...[
        el("h2", { class: "studio-section-title", text: "Your templates" }),
        own.length
          ? el("div", { class: "studio-gallery" }, ownCards)
          : el("p", { class: "help-text", text: "You have no templates of your own yet. Make one above." }),
        skipped.length
          ? el("div", {}, [
              el("h3", { text: "Files that could not be used" }),
              el(
                "ul",
                { class: "studio-input-list" },
                skipped.map((f) =>
                  el("li", {}, [
                    el("span", { text: `${f.file}: ${f.problem}` }),
                    el("button", {
                      type: "button",
                      class: "secondary small",
                      text: "Delete",
                      "aria-label": `Delete ${f.file}`,
                      onclick: () => remove(f.file.replace(/\.json$/, ""), f.file),
                    }),
                  ]),
                ),
              ),
            ])
          : null,
        el("h2", { class: "studio-section-title", text: "Built-in templates" }),
        el("div", { class: "studio-gallery" }, builtInCards),
      ].filter(Boolean),
    );
    observer = observeThumbnails([...ownCards, ...builtInCards], ctx.brand);
  }

  const proposal = proposalBlock(ctx, { onChange: draw });
  const create = createBlock(ctx, { onProposal: proposal.refresh, hasProposal: proposal.pending });
  container.replaceChildren(create, proposal.element, gallery);
  await draw();
  return { leave: () => observer?.disconnect() };
}
````

- [ ] **Step 7: Run the tests and the checks**

Run: `npx vitest run tests/own-template-browser.test.ts tests/mobile.test.ts`
Expected: all pass.

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Visual check (screenshots outside the repo)**

Start the app on a free port, with a temporary data folder and no API key, make a sample template, and take screenshots with `playwright-core` and the installed Chrome at 1440 and 375 wide, light and dark. Everything lives in temporary folders; nothing goes into the repo.

````bash
SHOTS=$(mktemp -d); DATA=$(mktemp -d)
PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
(env -u ANTHROPIC_API_KEY POSTWRIGHT_DATA_DIR=$DATA PORT=$PORT npm start > $SHOTS/server.log 2>&1 &)
sleep 3
api() { curl -s -X "$1" "http://127.0.0.1:$PORT$2" -H 'content-type: application/json' -d "$3"; }
api PUT /api/template-input '{"texts":"A post","brief":"Bold statements","kind":"image","formats":["li-square","story"]}' > /dev/null
api POST /api/template-generate '{}' > /dev/null
````

Save this script as `$SHOTS/shots.mjs` (it walks down the page once, because thumbnails are drawn when they scroll into view):

````js
// Screenshots of some studio screens at 1440 and 375 wide, light and dark. Usage:
//   REPO=<repo folder> node shots.mjs <base url> <output folder> <screen> [<screen> ...]
import { createRequire } from "node:module";
const require = createRequire(`${process.env.REPO}/package.json`);
const { chromium } = require("playwright-core");
const [, , base, out, ...screens] = process.argv;
const browser = await chromium.launch({ channel: "chrome" });
for (const [width, height, scheme] of [
  [1440, 900, "light"],
  [1440, 900, "dark"],
  [375, 812, "light"],
  [375, 812, "dark"],
]) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await context.newPage();
  for (const screen of screens) {
    await page.goto(`${base}/#${screen}`);
    await page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });
    await page.waitForLoadState("networkidle");
    // Thumbnails are drawn when they scroll into view: walk down the page once.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += height / 2) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${screen.replaceAll("/", "-")}-${width}-${scheme}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
````

````bash
REPO=$(pwd) node $SHOTS/shots.mjs http://127.0.0.1:$PORT $SHOTS templates
pkill -f "src/server/start.ts"
echo $SHOTS
````

Open the PNGs with the Read tool and check, in light and dark and at both widths: no horizontal scroll at 375, nothing cut off, the "Your template" label readable, text contrast fine, previews drawn. Fix what is wrong, then repeat.

Look at the Templates screen with a proposal showing (the form, the proposal card with its previews and findings, then "Your templates" and the built-in ones). Then keep the proposal and look again:

````bash
PORT=<the port above>  # start the server again as above if you stopped it
curl -s -X POST http://127.0.0.1:$PORT/api/template-proposal/apply -H 'content-type: application/json' -d '{}' > /dev/null
````

and take the screenshots of `templates` again: the own card has "Your template", Use, Rename and Delete. Also try, by hand in Chrome, Rename, Delete, "Use and start a post", and an invalid proposal (write a `template.json` with `"tree": [{"tag":"script"}]` into `template-input/proposal/` of the temporary data folder): it lists the problem with its place and has a Discard button.

- [ ] **Step 8: Commit**

```bash
git add src/web/studio/template-list.js src/web/studio/template-create.js src/web/studio/template-proposal.js src/web/studio.js src/web/ui.js src/web/studio.css tests/own-template-browser.test.ts tests/mobile.test.ts
git commit -m "Add the Templates screen"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

### Task 9: README, DESIGN and the handover

**Files:**
- Modify: `README.md`, `DESIGN.md`, `docs/phase-5-handover.md`

No new code. `tests/public.test.ts` scans these files, so keep to English and add no path of a computer.

- [ ] **Step 1: README**

The README is already over the 700 words that `Openbaar/CLAUDE.md` asks for, so add little: three edits.

1. In "What it does", change the Templates bullet to: `- **Templates.** Nine of them: statement, question and answer, steps, statistic, product image, carousel, link preview, LinkedIn profile banner and company cover. Each comes in the formats it suits, ten in all, from a LinkedIn square to an Instagram story. Your own come on top (see below).`
2. After the section "Make a brand kit", add (about 110 words):

````markdown
## Make your own templates

On the **Templates** screen, give the studio screenshots of old posts (up to six), the text of some posts and a short brief, and choose single image or carousel and the formats. **Generate with Claude** proposes a template in your brand (about 10 to 50 cents, counted towards the cap); without an API key it gives a fixed sample so you can try the screen. Or **Download the prompt**, run it in Claude Code or Codex, and check for the proposal; `npm run template:check -- <project>` checks it from the command line. You see the proposal in every format with the brand check before you keep it. A kept template sits next to the built-in ones in the editor, Convert, the library filter and the planner, and can be renamed or deleted.
````

3. In "How it works", add at the end of the first paragraph: `A built-in template is code; one of your own is data (fields, a tree of elements and some CSS) that a single validator checks before it is ever drawn: no scripts, no remote loads, no colours outside the brand.` Then update the test count in the code block (`# 726 tests, ...`) to the number `npm test` prints now.

- [ ] **Step 2: DESIGN.md**

In "Surface", change the groups to `Workspace (Overview, All posts, Planner, Editor) and Your foundation (Brand kit, Templates, Fact bank, Snippets)`, and add a sentence: `Own templates carry a quiet "Your template" label wherever templates are listed; the Templates screen puts the form and a waiting proposal above the gallery, so the next step is always at the top.`

- [ ] **Step 3: Handover**

In `docs/phase-5-handover.md`, under "What is in it", add:

````markdown
- **AI-made templates** (spec `docs/superpowers/specs/2026-10-05-ai-templates-design.md`, plan `docs/superpowers/plans/2026-10-05-ai-templates.md`). A template is data in `data/projects/<slug>/templates/own-<8 hex>.json`; `src/web/studio/own-template.js` has the only judge (`checkTemplate`) and the engine (`compileTemplate`). Route A is `POST /api/template-generate` (one Opus call through `runPaid`, reserve $1, booked as `template:<slug>`; without a key it returns the fixed sample), route B is `GET /api/template-prompt` plus `npm run template:check -- <project>`. Material lives in `template-input/`, a waiting proposal in `template-input/proposal/` (`template.json`, optional `extras.json` with notes and the sample flag). The Templates screen is under "Your foundation".
````

and to "Open": `6. The paid call of route A has only been tried against a fake client: the real cost (estimated at 10 to 50 cents) and whether structured output accepts the depth-6 schema are unmeasured. If it refuses the schema, fall back to JSON in a normal reply, checked by the same `checkTemplate`.` and `7. Out of scope on purpose: editing a template's tree or CSS in the studio, sharing templates between projects, banner formats, fonts or images inside a template, animation, a carousel step-chain slot, web search while generating.`

- [ ] **Step 4: Check**

Run: `npm run format && npm run typecheck && npm run format:check && npm test`
Expected: all green. (`npm run format` rewrites files with Prettier; run it before the check.)

- [ ] **Step 5: Commit**

```bash
git add README.md DESIGN.md docs/phase-5-handover.md
git commit -m "Document AI-made templates"
```
(The commit is made as the configured git user. No `Co-Authored-By` line. Do not push.)

---

## Self-review (done when the plan was written)

- **Spec coverage:** user flow 1 to 5 (Task 8; the editor, Convert, library and planner pickers in Tasks 2 and 7), data shape (Task 1), rendering (Tasks 1 and 7), safety rules (Task 1, every rule has a test row), generation routes A and B (Tasks 4 and 5), storage and all twelve routes (Tasks 2, 3, 4, 5, 6), screen (Task 8), errors (a 400 or 409 sentence each: Tasks 2, 3, 6; 502 and 429 from `runPaid`: Task 4), testing list (every named test file exists; the `toSvg` test runs in Chrome, see gap 5), out of scope (Task 9 handover), open point 1 (stop point and handover).
- **Placeholders:** none; every code step holds the code, taken from a working implementation. Each task's code was run and green (948 tests, typecheck and format check) when this plan was written.
- **Names:** one name per thing across tasks (`checkTemplate`, `compileTemplate`, `registerOwnTemplates`, `allTemplates`, `loadOwnTemplates`, `readOwnTemplates`, `checkProposal`, `writeProposal`, `applyProposal`, `generateTemplate`, `sampleTemplate`, `loadContext`, `loadMaterial`, `startTemplates`).
