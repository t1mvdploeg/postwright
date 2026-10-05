# AI-made templates: design

## Goal

A project can make its own post templates from its old posts. The user gives screenshots, pasted post texts and a short brief; Claude, or an agent running a downloaded prompt, proposes a template in the project's brand. The user previews it in every chosen format and keeps or discards it. A kept template behaves like a built-in one: gallery, editor, brand check, preview, export.

## User flow

1. **Templates**, a new screen under "Your foundation" (`NAV_GROUPS`, `MODULES`, `SCREEN_ICON` in `src/web/studio.js`, icon `layers`), lists the nine built-ins and the project's own templates. Own ones can be renamed and deleted.
2. **Create a template**, a card like `brand-create.js`: up to six screenshots (png, jpg, webp, 3 MB each), pasted texts of old posts (up to 8,000 characters, separated by a line `---`), a brief (up to 600 characters), the kind (single image or carousel) and the formats.
3. **Generate with Claude**, or **Download the prompt** and then **Check for a proposal**.
4. The proposal card shows name, goal, notes and the sample content in each chosen format, with brand check and overflow findings. Buttons: **Use this template**, **Use and start a post** (saves, then `#editor/new/<id>`), **Discard**.
5. Own templates appear beside the built-ins in the editor gallery, the Convert list, the library filter and the idea planner, labelled "Your template".

## Data shape

One JSON file per template; a proposal is the same without `id` and `created`. Zod schema in `src/server/template-schema.ts`.

```ts
type Template = {
  version: 1; id: string /* own-<8 hex>, made by the server */; created: string;
  name: string /* 1-40 */; goal: string /* 1-140 */;
  formats: FormatKey[];   // carousel: ["li-carousel"]; image: not li-carousel, li-profile, li-company
  css: string;            // up to 6000 characters
} & (
  | { kind: "image"; fields: Field[]; tree: Node[] }
  | { kind: "carousel";
      slides: { kind: "cover" | "content" | "closing"; name: string; fields: Field[]; tree: Node[] }[]; // exactly these three
      defaultSlides: { kind: string; content: Record<string, string> }[] }  // 3 to 8, first is a cover
);

type Field =  // as in fields.js and templates.d.ts; at most 12 per template or slide kind
  | { id: string; label: string; kind: "headline"; max: number; defaultValue: string } // emphasis "exactly-one", required
  | { id; label; kind: "text" | "line"; max: number; defaultValue: string; help?: string }
  | { id; label; kind: "choice"; options: { value: string; text: string }[]; defaultValue: string }
  | { id; label; kind: "media"; required?: boolean; help?: string }
  | { preset: "ground" | "headlineSize"; defaultValue?: string };  // ground() / HEADLINE_SIZE of fields.js

type Node =  // depth at most 6, at most 60 nodes per tree
  | { tag: "div"|"section"|"main"|"header"|"footer"|"figure"|"h1"|"h2"|"h3"|"p"|"span"|"strong"|"ul"|"li";
      classes?: string[];     // each /^[a-z][a-z0-9-]{0,30}$/, at most 6
      classFrom?: string;     // a choice field; its value becomes a class
      headlineOf?: string;    // a headline field; adds headlineClass(headlineSize, value)
      dataField?: string;     // data-field="<id>" for the overflow measurement
      showIf?: string;        // only when that field is not empty (c.empty)
      children?: Node[] }
  | { field: string; as: "rich" | "plain" | "footer" }  // c.t | c.e | c.footer
  | { literal: string }                                 // up to 80 characters
  | { slot: "logo" } | { slot: "route" }
  | { slot: "image"; field: string }                    // c.media, or the placeholder
  | { slot: "icon"; name: "arrow" | "tick" };           // c.icon
```

Sample content is each field's `defaultValue`, as in the built-ins. A headline default has exactly one `*emphasis*` (`countEmphasis`) and fits `max`.

## Rendering

`compileTemplate(file)` in a new shared module `src/web/studio/own-template.js` returns an object shaped like `Template` in `templates.d.ts` (`html(v, c)`, `fields`, `css`, and for carousels `slides`, `defaultSlides`, `maxSlides: 20`) plus `own: true`. `html` walks the tree and emits only through `TemplateContext`: `c.t`, `c.e`, `c.footer`, `c.media`, `c.icon`, `c.route()`, `c.logo(logoMode(v.ground))` and `escapeHtml`. The engine writes the root itself (`div.image`, or `section.image.slide` for a carousel, with `groundClass(v.ground)`) and adds `c.symbols` when an icon slot is used. The only attributes it can emit are `class` and `data-field`.

`templates.js` gains `registerOwnTemplates(list)` and `allTemplates()` (built-ins, then own); `template(id)` falls back to the registered ones; `TEMPLATES` stays the built-ins; `buildImage({ template })` also accepts a template object, so a proposal previews before it is saved. `studio.js` fetches `GET /api/templates` next to `loadBrand()` and `loadSettings()` and registers the result. A project switch reloads the page, so nothing leaks between projects. The four pickers that read `TEMPLATES` (`editor.js` gallery and Convert, `library.js`, `ideas-ui.js`) move to `allTemplates()`. `runCheck`, `fieldsOf`, `measureOverflow`, `showPreview` and `render.js` stay as they are. Templates use only brand variables and logo slots, so they follow a later brand kit change. On the server, `routes.ts` replaces its two uses of `TEMPLATES`/`templateOf` (idea check, planner list) with built-ins plus `loadOwnTemplates(project.dir)`.

## Safety rules

One function, `checkTemplate(raw)` in `own-template.js`, runs on every proposal, before saving, when a file is read, and again in `compileTemplate`. The server does not trust the model and the browser does not trust the file. It refuses and never repairs; each message names the place and the problem ("css rule 3 (.hero): url() is not allowed").

- **Tree.** Only the tag enum; unknown keys are refused. Field references must exist and fit (`rich` on headline or text, `footer` on line, `classFrom` on choice, `slot: image` on media).
- **CSS, refused outright.** `@` (no `@import`, `@font-face`, `@media`), `/*`, `\`, `<`, `#`, `[`, control characters, quotes (except `content: ""`), and the properties `font-family`, `animation*`, `transition*`.
- **Functions.** An identifier followed by `(` must be in an allowlist: `var`, `calc`, `min`, `max`, `clamp`, `color-mix(in srgb, …)`, `translate*`, `scale`, `rotate`, `minmax`, `repeat`, `linear-gradient`, `radial-gradient`. That rejects `url(`, `URL(`, `image-set(`, `src(`, `attr(`, `expression(` in any case or spacing.
- **Colours.** No hex, `rgb/hsl/hwb/lab/lch/oklab/oklch/color()`, and no named or system colour. Allowed: `transparent`, `currentcolor`, and `var()` of the 14 brand variables (`CSS_VARIABLES` in `brand-proposal.ts`), `--ground-{light,ink,accent}` with `-text`, `--emphasis`, `--soft`, `--hairline`, `--width`, `--height`. A shadow is `color-mix(in srgb, var(--ink) 25%, transparent)`.
- **Selectors.** Classes, allowed tags, `* > + ~ , .` and `:first-child :last-child :not() :nth-child() ::before ::after`. The classes of `template-css.js` (`.image`, `.headline`, `.text`, `.footer`, `.paper` …) may be reused.
- **Size.** CSS 6,000 characters and 80 rules, file 60 kB, 30 own templates per project.
- **Ids and files.** Ids are `own-` plus 8 hex, never from the model; built-in ids never start with `own-`. File names match `^own-[0-9a-f]{8}\.json$` and the id inside; paths go through `path()` of `files.ts`.

## Generation

Material lives in `data/projects/<slug>/template-input/` (`image-<hash>.<ext>`, `input.json`), built like `brand-input.ts`; its `classify`, `checkImage` and `mediaKind` sniffing (8,000 px limit) are exported and reused.

**Route A**, `POST /api/template-generate` (`template-generate.ts`, like `brand-generate.ts`). Needs at least one screenshot, text or brief. With a key it makes one vision call through `runPaid` (`ai/guard.ts`): cap checked first with `TEMPLATE_RESERVE_USD = 1`, one call at a time, booked in `ai-usage.jsonl` as `template:<slug>`, also on failure. Client and model are those of `chooseBrandClient()` (`BRAND_MODEL`, `claude-opus-5-5`, `POSTWRIGHT_BRAND_MODEL`). The call (`ai/template.ts`, like `generateBrand`) uses structured output (`zodOutputFormat`) from a schema unrolled to depth 6 (no recursion), `max_tokens` 24,000, adaptive thinking at effort `medium`, no web tool. Estimate: about 16,000 input tokens and 8,000 to 20,000 output tokens, 10 to 50 cents at the prices in `ai/usage.ts`; the worst case stays under the reserve. Parsing and `checkTemplate` run inside the paid call, so a refused answer is booked with its tokens and the 502 of `runPaid` carries the reason. No automatic retry. The result is written to the proposal file, replacing a pending one (the UI says so).

The prompt holds: the safety rules, generated from the same constants as the validator; the node schema; one worked example, a statement-like template in tree form (`src/server/template-example.json`, also a test fixture); the base classes and variables; screenshots labelled "Old post n"; the texts and brief; kind and formats; `profileForPrompt(settings.profile)`, `tone` and `bannedWords`; the brand's name, colours with usage, grounds, font family, logo modes and default logo (PNG block, or SVG text within `svgForPrompt`). Instructions: take style and structure from the old posts, copy no text or numbers, write sample content for this business, use only variables and slots.

**Route B**, `GET /api/template-prompt` (`template-prompt.ts`, like `brand-prompt.ts`): a `.md` with the same material and rules. The agent writes `data/projects/<slug>/template-input/proposal/template.json` and runs `npm run template:check -- <project>` (new `template-check-cli.ts`, like `brand-check-cli.ts`) until it prints "The template proposal is valid." It writes nowhere else and calls no paid API.

**No API key.** Route A returns `sampleTemplate(kind, formats)` from `ai/sample.ts`: a fixed template named "Sample template" with a note that it was made without a model; nothing is booked or capped. It is a standalone function, not part of `AiProvider`, whose interface serves the Sonnet writing tasks while route A uses the brand client.

## Storage and API routes

`data/projects/<slug>/templates/<id>.json`, validated with zod and `checkTemplate` on read. A broken file is skipped with `console.warn` and listed in `skipped`; it never fails a request.

| Route | Purpose |
| --- | --- |
| `GET /api/templates` | `{ templates, skipped: [{ file, problem }] }` |
| `PUT /api/templates/:id` | Rename (`{ name }`, strict) |
| `DELETE /api/templates/:id` | Delete; 409 with the count when posts use it |
| `GET /api/template-input` | Images, texts, brief, kind, formats, `generate: { available, model }` |
| `PUT /api/template-input` | Save texts, brief, kind, formats |
| `POST /api/template-input/image` | Add a screenshot (`rawBody`); at most six |
| `DELETE /api/template-input/:name` | Remove a screenshot |
| `POST /api/template-generate` | Route A, live or sample; returns the proposal state |
| `GET /api/template-prompt` | Route B prompt |
| `GET /api/template-proposal` | `none`, `invalid` with `problems`, or `ready` with `template`, `notes`, `sample` |
| `POST /api/template-proposal/apply` | Check again, assign id, write file, remove proposal; 409 at 30 |
| `DELETE /api/template-proposal` | Discard |

## Screen

`templates.js` is the engine, so the screen is `template-list.js`, with `template-create.js` (form) and `template-proposal.js` (like `proposalBlock` in `brand-preview.js`). Built-in and own cards share the gallery card; own ones show "Your template", Rename and Delete (`confirmDialog`). Buttons that cannot work are disabled with the reason beside them, as in `brand-create.js`. An empty company profile does not block anything; the form says the sample content will be generic and links to Settings.

## Errors

A refused proposal lists every problem with its place, on the card and in `template:check`. An unusable model answer is a booked 502 from `runPaid`; a reached cap is its 429. Deleting a template in use, the 30-template limit, a seventh screenshot, an oversized or damaged image and an empty form each give a 400 or 409 in one plain sentence. A post whose own template is gone is treated like any unknown template today.

## Testing

- `tests/template-check.test.ts`: `checkTemplate` against `script`, `iframe`, `a` as tags; `onclick`/`style` keys; `url(`, `URL(`, `u\72l(`, `url (`, `image-set(`, `src(`, `attr(`, `expression(`; `@import`, `@font-face`; comment and backslash tricks, `<`; hex, `rgb()`, `hsl()`, `oklch()`, `color()`, `red`, `Canvas`; unknown variables; oversize CSS, tree, depth and text; missing field references; a choice value that is not a class name.
- `tests/own-template.test.ts`: the example compiles; `buildImage` renders every format with injection in every field (as `templates.test.ts`); no attribute besides `class` and `data-field`; each carousel slide renders; the export path (`toSvg`, as `export.test.ts`); `own-` ids never clash.
- `tests/template-store.test.ts`: round trip, broken file skipped with a warning, two projects do not see each other's templates, delete blocked by a post.
- `tests/template-routes.test.ts`: every route, limits, apply and discard.
- `tests/template-ai.test.ts`: route A with a fake client (like `brand-ai.test.ts`): booked on success and on a refused answer, cap and reserve; sample answer without a key; the prompt lists every allowed tag, variable and function.
- `tests/mobile.test.ts`: the Templates screen with a sample proposal showing. `tests/public.test.ts` keeps covering the example and fixtures.

## Out of scope

Editing a template's tree or CSS in the studio; sharing templates between projects; banner formats `li-profile` and `li-company`; fonts or images inside a template; animation; a carousel step-chain slot; web search while generating.

## Open points

1. **Real-key trial.** The cost estimate and whether structured output accepts the depth-6 schema are unmeasured until one paid call is made. If the schema is refused, the fallback is JSON in a normal reply, checked by the same `checkTemplate`.
