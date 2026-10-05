# Postwright phase 4: handover for finishing the work

Read this first. Branch `fase-4` holds the finished server side of phase 4 (tasks 1-11). Two tasks remain: 12 (the "Create a brand kit" screen) and 13 (finishing).

## 1. Status

**Goal of phase 4.** Postwright works with several brands side by side, each in its own project (a full workspace of posts, facts, texts, campaigns, ideas, media and settings). A user can also have a brand kit made from supplied material (logo, images, PDF, fonts, website address), either with one click through the Claude API, or without API cost through a downloadable prompt for Claude Code or Codex.

**Done (tasks 1-11), tests green, reviewed.** Each part was reviewed, and a closing check of tasks 1-11 was done and its fixes applied.

- Projects: `data/projects/<slug>/` with `project.json`, `marketing/`, `brand/`, `brand-input/`, `brand-previous/`. First start migrates old `data/marketing/` and `data/brand/` into project `postwright`. The browser sends `X-Postwright-Project: <slug>` on every call (`api()` and `projectHeaders()` in `src/web/ui.js`); the server resolves it in one place (`ctx.project()` in `http.ts`). A fact id from another project can no longer be saved in a post.
- Global spending cap in `data/settings.json` and one guard for every paid call: `src/server/ai/guard.ts` (`runPaid`: cap check before the call, one lock, failed calls booked).
- Brand-input uploads (logo, images, PDF, fonts, website, notes), checked on content.
- A small PNG decoder/encoder (`src/server/png.ts`, no dependency) for logo variants.
- `checkProposal` (the one judge for a proposal) and `npm run brand:check -- <slug>`.
- Apply (`POST /api/brand/apply`): current `brand/` moves to `brand-previous/`, the proposal becomes `brand/`, tone, banned words and hashtags go to the project settings.
- Route B: `GET /api/brand/prompt`, a markdown prompt for Claude Code or Codex.
- `buildProposal` (contrast fixes, logo variants, font handling, schema check) and route A: `POST /api/brand/generate`.

## 2. Working rules

- British English everywhere (code, UI text, comments, docs). The leak test fails on common Dutch words.
- No new dependencies. Allowed: `@anthropic-ai/sdk`, `tsx`, `zod`, `@types/node`, `fflate`, `prettier`, `typescript`, `vitest`.
- The server listens on `127.0.0.1` only.
- The API key comes only from `ANTHROPIC_API_KEY`: never to the browser, a file, a log or a test file.
- Commits carry no `Co-Authored-By` line and no "Generated with Claude Code" line. Never commit `data/` or `.env`.
- Before each commit: `npm test`, `npm run typecheck` and `npm run format:check` are green. `tests/public.test.ts` is the leak test (local paths, e-mail addresses, API keys, Dutch words in every tracked text file); it replaces any separate scan.
- Work on branch `fase-4`. Never push to `main` without the owner's consent.
- Never make a real API call without asking the owner first: one generation costs from a few tens of cents to over a dollar.
- Never run the server on the repo's own `data/`; use a temporary data folder (`POSTWRIGHT_DATA_DIR`) and a free port.
- Write the test first and watch it fail. No abstraction the task does not ask for.

## 3. Open decision for the owner (ask before starting task 12)

Task 12 can go into the current studio (`src/web/studio/…`, the code below) or into a new frontend that another tool is building. The server routes of tasks 5-11 are the interface either way. Ask which one, and do not start task 12 before the answer. If the new frontend is chosen, use section 4 as the list of what the screen must do, not as code to paste.

## 4. Task 12: the "Create a brand kit" screen

**Requirements.** On the Brand kit screen, a block "Create a brand kit" with:

- Logo (required): SVG, or PNG (transparent is best on dark grounds). Uploading a new logo replaces the old one.
- Images (optional, up to 8): PNG, JPEG or WebP, up to 5 MB each.
- Brand guide (optional): one PDF, up to 20 MB.
- Fonts (optional): woff2, woff, ttf, otf.
- Website (optional, `https://`) and notes (optional free text).
- Buttons: "Generate with Claude" (off without a logo, or without `ANTHROPIC_API_KEY` on the server, with the reason shown), "Download prompt (.md)" (off without a logo), "Save details", "Check for a proposal".
- The list of uploaded files, each with a Remove button.
- Below it, a proposal block, shown only when a proposal exists: colours, contrast per ground, logos, one sample post per ground, notes ("Good to know"), what goes to the project settings, and the button "Use this brand kit" (asks for confirmation, applies, reloads). An invalid proposal shows the problems, each naming its field, instead of a preview.
- Generation can take minutes: show progress text and keep the buttons off while it runs. Errors appear readably in the block.

**Routes used** (all take the project header):

| Route                           | Purpose                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/brand/input`          | `{ website, notes, files: [{ name, kind, bytes }], generate: { available, model } }`                                                 |
| `PUT /api/brand/input`          | Save `{ website, notes }`                                                                                                            |
| `POST /api/brand/input/:role`   | Upload one file as the raw body; `role` is `logo`, `image`, `guide` or `font`; answers 201                                           |
| `DELETE /api/brand/input/:name` | Remove an uploaded file                                                                                                              |
| `POST /api/brand/generate`      | Route A: make a proposal with Claude (body `{}`); slow, costs money                                                                  |
| `GET /api/brand/prompt`         | Route B: the prompt as a markdown download (`content-disposition` has the file name)                                                 |
| `GET /api/brand/proposal`       | `{ state: "none" }`, `{ state: "invalid", problems }` or `{ state: "ready", brand, extras: { tone, bannedWords, hashtags, notes } }` |
| `POST /api/brand/apply`         | Make the proposal the brand of the project                                                                                           |
| `GET /brand-proposal/<file>`    | Static files of the proposal (logos, font); `GET /brand/<file>` for the active brand                                                 |

**Already done.** The `LOGO_MIME` piece (a logo's data URI follows its file extension, `svg` or `png`) is in `src/web/studio/brand.js` already, from the closing check. Step 3 below only moves that code into `embedBrand`.

**Files.** Create `src/web/studio/brand-views.js`, `brand-create.js`, `brand-preview.js` and `tests/brand-embed.test.ts`. Modify `src/web/ui.js`, `src/web/ui.d.ts`, `src/web/studio/brand.js`, `brand.d.ts`, `brand-kit.js` and `src/web/studio.css`.

**Interfaces to produce.**

- `api(path, { raw })` in `ui.js`: with `raw` (a `File` or `Blob`) the file goes as the body with its own `content-type`.
- `embedBrand(manifest, folder): Promise<Brand>` in `brand.js`: turns a `brand.json` into the brand the templates use (logos and font as `data:` URIs) from `folder` (`/brand` or `/brand-proposal`).
- `colorsView(m)`, `contrastView(m)`, `logosView(m, extra?)`, `groundFor(mode)` in `brand-views.js`.
- `createBlock(ctx, { onProposal })` in `brand-create.js` (returns an element) and `proposalBlock(ctx)` in `brand-preview.js` (returns `{ element, refresh }`).

`ctx` has `api`, `brand`, `settings`, `valid()` (false once the screen is no longer the active one) and more; see `src/web/studio.js`.

### Step 1: write the failing test, `tests/brand-embed.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedBrand } from "../src/web/studio/brand.js";

afterEach(() => vi.unstubAllGlobals());

const manifest = {
  name: "Acme",
  font: { family: "Acme Sans", files: ["fonts/a.woff2"] },
  logos: { default: "logo/a.png", white: "logo/w.svg" },
};

describe("embedBrand", () => {
  it("loads logos and font from the given folder with the project header, and types the logos by extension", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "acme", setItem: () => undefined });
    const seen: Array<[string, Record<string, string>]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push([url, (init?.headers ?? {}) as Record<string, string>]);
        return new Response(new Uint8Array([1, 2, 3]));
      }),
    );
    const brand = await embedBrand(manifest, "/brand-proposal");
    expect(seen.map(([url]) => url).sort()).toEqual([
      "/brand-proposal/fonts/a.woff2",
      "/brand-proposal/logo/a.png",
      "/brand-proposal/logo/w.svg",
    ]);
    for (const [, headers] of seen) expect(headers["x-postwright-project"]).toBe("acme");
    expect(brand.logos.default).toMatch(/^data:image\/png;base64,/);
    expect(brand.logos.white).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(brand.fontCss).toContain('font-family: "Acme Sans"');
    expect(brand.fontCss).toContain("data:font/woff2;base64,");
  });

  it("fails with the path when a file cannot be loaded", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 404 })),
    );
    await expect(embedBrand(manifest, "/brand")).rejects.toThrow(/Could not load \/brand\/(logo|fonts)\//);
  });
});
```

### Step 2: run it

`npx vitest run tests/brand-embed.test.ts` must FAIL (`embedBrand` does not exist yet).

### Step 3: `brand.js`, `ui.js`, the type files

In `brand.js`, move the build-up out of `loadBrand` into `embedBrand` (the `LOGO_MIME` constant stays as it is; remove the now unused `BRAND_FOLDER` constant if nothing else uses it, or keep it for `loadBrand`):

```js
const LOGO_MIME = { svg: "image/svg+xml", png: "image/png" };
const BRAND_FOLDER = "/brand";

/**
 * Turns the manifest of a brand (a `brand.json`) into the brand the templates use: the logos
 * and the font as data URIs, loaded from `folder` (`/brand` for the active brand,
 * `/brand-proposal` for a proposal). The type of a logo follows its extension.
 */
export async function embedBrand(m, folder) {
  const logos = Object.fromEntries(
    await Promise.all(
      Object.entries(m.logos).map(async ([mode, path]) => [
        mode,
        await getDataUri(`${folder}/${path}`, LOGO_MIME[path.split(".").pop().toLowerCase()] ?? "image/svg+xml"),
      ]),
    ),
  );
  const family = m.font.family.replace(/["\\]/g, "");
  const fontFaces = await Promise.all(
    m.font.files.map((path) => {
      const ext = path.split(".").pop().toLowerCase();
      return getDataUri(`${folder}/${path}`, FONT_MIME[ext] ?? "application/octet-stream").then(
        (src) =>
          `@font-face { font-family: "${family}"; font-style: normal; font-weight: 100 900; src: url("${src}") format("${FONT_FORMAT[ext] ?? "woff2"}"); }`,
      );
    }),
  );
  return { ...m, logos, fontCss: fontFaces.join("\n") };
}

export function loadBrand() {
  brandPromise ??= (async () => {
    const r = await fetch("/api/brand", { headers: projectHeaders() });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The brand could not be loaded");
    return embedBrand(await r.json(), BRAND_FOLDER);
  })();
  brandPromise.catch(() => {
    brandPromise = null;
  });
  return brandPromise;
}
```

`brand.d.ts` gets:

```ts
export function embedBrand(manifest: Record<string, any>, folder: string): Promise<Brand & Record<string, unknown>>;
```

`ui.js`, in `api()`: directly after the `init` object is filled, add the `raw` branch and change the existing `if (options.body !== undefined)` into an `else if`:

```js
if (options.raw) {
  init.body = options.raw;
  init.headers["content-type"] = options.raw.type || "application/octet-stream";
} else if (options.body !== undefined) init.body = JSON.stringify(options.body);
```

In `ui.d.ts`, add `raw?: Blob` to the options of `api`.

### Step 4: `brand-views.js` (new)

The blocks for colours, contrast and logos that `brand-kit.js` has today move here, so a proposal can reuse them.

```js
// The building blocks of a brand kit page: colours, contrast per ground and the logos. Used
// for the brand of the project and for a proposal.
import { el } from "/ui.js";
import { contrastOn } from "/studio/color.js";

/** Which ground a logo variant belongs on, derived from the variant's name. */
export function groundFor(mode) {
  if (/on-ink|^white$/.test(mode)) return "ink";
  if (/on-accent/.test(mode)) return "accent";
  return "light";
}

export function colorsView(m) {
  return el(
    "div",
    { class: "studio-colors" },
    m.colors.map((k) =>
      el("div", { class: "studio-color" }, [
        el("span", { class: "studio-swatch", style: `background:${k.hex}` }),
        el("b", { text: k.name }),
        el("code", { text: k.hex }),
        el("span", { class: "help-text", text: k.usage }),
      ]),
    ),
  );
}

export function contrastView(m) {
  return el("div", { class: "table-scroll" }, [
    el("table", { class: "list" }, [
      el("thead", {}, [
        el(
          "tr",
          {},
          ["Ground", "Text on the ground"].map((t) => el("th", { scope: "col", text: t })),
        ),
      ]),
      el(
        "tbody",
        {},
        Object.keys(m.grounds).map((g) => {
          const c = contrastOn(m, g);
          return el("tr", {}, [
            el("td", { text: { light: "Light", ink: "Ink", accent: "Accent" }[g] ?? g }),
            el("td", { text: `${c.ratio}:1 ${c.ratio >= c.threshold ? "✓" : "✗"}` }),
          ]);
        }),
      ),
    ]),
  ]);
}

/**
 * The logos of an embedded brand (every logo is a data URI already). `extra(mode, source)` may
 * return buttons or links to put under a logo.
 */
export function logosView(m, extra = () => null) {
  return el(
    "div",
    { class: "studio-file-grid" },
    Object.entries(m.logos).map(([mode, source]) =>
      el("figure", { class: "studio-file" }, [
        el("div", { class: `studio-file-image ground-${groundFor(mode)}` }, [el("img", { src: source, alt: "" })]),
        el("figcaption", { text: mode }),
        extra(mode, source),
      ]),
    ),
  );
}
```

### Step 4b: `brand-kit.js` (replace the file)

Colours, contrast and logos now come from `brand-views.js`. The screen gets the create block and the proposal block. A PNG logo gets a PNG link and no SVG/PNG buttons. Keep the existing wording of "Rules" and "Logos" if it differs from this.

```js
// Brand kit: the brand book of the project, and the place to create a new brand kit. Colours with
// contrast, logos, the route motif and the rules come from the active brand of the project
// (`brand.json` and the files next to it, see `src/server/brand.ts`).
import { el, notice, projectHeaders } from "/ui.js";
import { asDataUri } from "/studio/brand.js";
import { slugOf } from "/studio/formats.js";
import { download } from "/studio/render.js";
import { colorsView, contrastView, logosView } from "/studio/brand-views.js";
import { createBlock } from "/studio/brand-create.js";
import { proposalBlock } from "/studio/brand-preview.js";

const FOLDER = "/brand";

/** An SVG as a PNG with the longest side at `side` pixels, transparent. */
async function svgToPng(path, side = 2048) {
  const img = new Image();
  img.src = path;
  await img.decode();
  const scale = side / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
  const c = document.createElement("canvas");
  c.width = Math.round((img.naturalWidth || side) * scale);
  c.height = Math.round((img.naturalHeight || side) * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) =>
    c.toBlob((b) => (b ? ok(b) : no(new Error("Making a PNG did not work in this browser"))), "image/png"),
  );
}

/** The route motif of the brand as a data URI; null when the brand has none. */
async function motifSource() {
  const r = await fetch(`${FOLDER}/motifs/route.svg`, { headers: projectHeaders() }).catch(() => null);
  return r?.ok ? asDataUri(new Blob([await r.arrayBuffer()], { type: "image/svg+xml" })) : null;
}

export async function show(container, ctx) {
  const m = ctx.brand;
  const motifUrl = await motifSource();
  if (!ctx.valid()) return;

  const logos = logosView(m, (mode, source) => {
    const isPng = source.startsWith("data:image/png");
    const name = `${slugOf(m.name)}-${mode}`;
    const row = [
      el("a", {
        class: "button-link small",
        href: source,
        download: `${name}.${isPng ? "png" : "svg"}`,
        text: isPng ? "PNG" : "SVG",
      }),
    ];
    if (!isPng) {
      const png = el("button", { type: "button", class: "secondary small", text: "PNG" });
      png.addEventListener("click", async () => {
        try {
          download(await svgToPng(source), `${name}.png`, "image/png");
        } catch (e) {
          notice(e.message, "error");
        }
      });
      row.push(png);
    }
    return el("div", { class: "button-row" }, row);
  });

  const motifCard = motifUrl
    ? el("section", { class: "card" }, [
        el("h2", { text: "Route motif" }),
        el("div", { class: "studio-file-grid" }, [
          el("figure", { class: "studio-file" }, [
            el("div", { class: "studio-file-image ground-ink" }, [el("img", { src: motifUrl, alt: "" })]),
            el("figcaption", { text: "route" }),
            el("a", { class: "button-link small", href: motifUrl, download: "route.svg", text: "SVG" }),
          ]),
        ]),
      ])
    : null;

  const proposal = proposalBlock(ctx);
  const create = createBlock(ctx, { onProposal: proposal.refresh });

  container.replaceChildren(
    ...[
      el("section", { class: "page-intro" }, [
        el("div", {}, [
          el("p", { class: "intro-label", text: `Brand version ${m.version}` }),
          el("p", {
            text: `The brand this project works from: ${m.name}. Create a new brand kit below, or put your own brand.json and files in the brand folder of this project.`,
          }),
        ]),
      ]),
      create,
      proposal.element,
      el("section", { class: "card" }, [
        el("h2", { text: "Colours" }),
        colorsView(m),
        el("h3", { text: "Contrast per ground (WCAG: headline 3:1, text 4.5:1)" }),
        contrastView(m),
      ]),
      el("section", { class: "card" }, [
        el("h2", { text: "Logos" }),
        el("p", {
          class: "help-text",
          text: "On ink and accent, the light version. The single-colour modes leave the mark out, so a photo or an unusual colour shows through.",
        }),
        logos,
      ]),
      motifCard,
      el("section", { class: "card" }, [
        el("h2", { text: "Rules" }),
        el(
          "ul",
          { class: "studio-lines" },
          [
            "Exactly one coloured phrase per headline.",
            "The light logo on ink and accent.",
            "Plain and calm, without exclamation marks.",
            "Every number comes from a linked fact with a source.",
            "The route is a watermark, never in an accent colour.",
          ].map((t) => el("li", { text: t })),
        ),
      ]),
    ].filter(Boolean),
  );
}
```

### Step 5: `brand-create.js` (new)

One ruling is already applied in this code (Q2): after an upload or a removal, the website and notes are saved before the list is reloaded, so typed but unsaved details are not lost.

```js
// "Create a brand kit": the material for a brand kit, and the two ways to turn it into a
// proposal: Generate with Claude (needs ANTHROPIC_API_KEY on the server), or a prompt to
// download for Claude Code or Codex.
import { el, notice, projectHeaders } from "/ui.js";
import { download } from "/studio/render.js";

const ROLES = [
  {
    role: "logo",
    label: "Logo (required)",
    accept: ".svg,.png,image/svg+xml,image/png",
    help: "An SVG, or a PNG with a transparent background (best on dark grounds).",
  },
  {
    role: "image",
    label: "Images (up to 8)",
    accept: "image/png,image/jpeg,image/webp",
    multiple: true,
    help: "From earlier posts, the website or the style guide. PNG, JPEG or WebP, up to 5 MB each.",
  },
  { role: "guide", label: "Brand guide (one PDF, up to 20 MB)", accept: "application/pdf,.pdf", help: "" },
  {
    role: "font",
    label: "Fonts",
    accept: ".woff2,.woff,.ttf,.otf",
    multiple: true,
    help: "Without fonts the studio uses Inter and gives it the name of the font it finds.",
  },
];

const size = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export function createBlock(ctx, { onProposal }) {
  const holder = el("section", { class: "card", id: "brand-create" });

  async function load() {
    const state = await ctx.api("/api/brand/input");
    if (ctx.valid()) render(state);
  }

  function render(state) {
    const hasLogo = state.files.some((f) => f.kind === "logo");
    const website = el("input", { type: "url", id: "brand-website", maxlength: "300", placeholder: "https://" });
    website.value = state.website;
    const notes = el("textarea", {
      id: "brand-notes",
      rows: "3",
      maxlength: "2000",
      placeholder: "For example: tone, business but warm",
    });
    notes.value = state.notes;
    const status = el("p", { role: "status", class: "help-text" });
    const failure = el("p", { class: "error-message", role: "alert", hidden: "" });
    const buttons = [];

    const saveDetails = () =>
      ctx.api("/api/brand/input", { method: "PUT", body: { website: website.value.trim(), notes: notes.value } });
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
      }
    };

    const fields = ROLES.map((r) => {
      const input = el("input", {
        type: "file",
        id: `brand-file-${r.role}`,
        accept: r.accept,
        ...(r.multiple ? { multiple: "" } : {}),
      });
      input.addEventListener("change", async () => {
        const files = [...input.files];
        await run("Uploading…", async () => {
          for (const file of files) {
            try {
              await ctx.api(`/api/brand/input/${r.role}`, { method: "POST", raw: file });
            } catch (e) {
              notice(`${file.name}: ${e.message}`, "error");
            }
          }
          await saveDetails(); // ruling Q2: keep what was typed before the list reloads
        });
        await load();
      });
      const list = el(
        "ul",
        { class: "studio-input-list" },
        state.files
          .filter((f) => f.kind === r.role)
          .map((f) =>
            el("li", {}, [
              el("span", { text: `${f.name} · ${size(f.bytes)}` }),
              el("button", {
                type: "button",
                class: "secondary small",
                text: "Remove",
                "aria-label": `Remove ${f.name}`,
                onclick: async () => {
                  await run("", async () => {
                    await saveDetails(); // ruling Q2
                    await ctx.api(`/api/brand/input/${encodeURIComponent(f.name)}`, { method: "DELETE" });
                  });
                  await load();
                },
              }),
            ]),
          ),
      );
      return el("div", { class: "field" }, [
        el("label", { for: input.id, text: r.label }),
        input,
        r.help ? el("p", { class: "help-text", text: r.help }) : null,
        list,
      ]);
    });

    const save = el("button", { type: "button", class: "secondary", text: "Save details" });
    save.addEventListener("click", () =>
      run("Saving…", async () => {
        await saveDetails();
        notice("Details saved");
      }),
    );

    const generate = el("button", { type: "button", text: "Generate with Claude" });
    generate.addEventListener("click", () =>
      run("Generating… this can take a few minutes. Keep this page open.", async () => {
        await saveDetails();
        await ctx.api("/api/brand/generate", { method: "POST", body: {} });
        notice("The brand kit proposal is ready");
        onProposal();
      }),
    );

    const prompt = el("button", { type: "button", class: "secondary", text: "Download prompt (.md)" });
    prompt.addEventListener("click", () =>
      run("", async () => {
        await saveDetails();
        const r = await fetch("/api/brand/prompt", { headers: projectHeaders() });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The prompt could not be made");
        const name =
          /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "brand-kit-prompt.md";
        download(await r.blob(), name, "text/markdown");
      }),
    );

    const check = el("button", { type: "button", class: "secondary", text: "Check for a proposal" });
    check.addEventListener("click", () => onProposal());

    buttons.push(save, generate, prompt);
    // Why a button is off: no logo, or no key on the server.
    if (!hasLogo)
      for (const b of [generate, prompt]) {
        b.dataset.off = "1";
        b.disabled = true;
      }
    if (!state.generate.available) {
      generate.dataset.off = "1";
      generate.disabled = true;
    }

    const why = !hasLogo
      ? "Add a logo first."
      : !state.generate.available
        ? "Generate with Claude needs ANTHROPIC_API_KEY on the server (set it and restart). Without it, download the prompt."
        : `Uses the Claude API (${state.generate.model}). A brand kit costs from a few tens of cents to about a dollar and counts towards the monthly cap.`;

    holder.replaceChildren(
      el("h2", { text: "Create a brand kit" }),
      el("p", {
        class: "help-text",
        text: "Give the studio your material and it proposes a brand kit: colours, grounds with contrast, logo variants and a font. You see the proposal before anything changes.",
      }),
      ...fields,
      el("div", { class: "field" }, [el("label", { for: "brand-website", text: "Website (optional)" }), website]),
      el("div", { class: "field" }, [el("label", { for: "brand-notes", text: "Notes (optional)" }), notes]),
      el("div", { class: "button-row" }, [generate, prompt, save]),
      el("p", { class: "help-text", text: why }),
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
```

### Step 6: `brand-preview.js` (new)

```js
// The proposal of a brand kit as the user sees it before anything changes: colours, contrast,
// logos, one sample post per ground, what goes to the settings, and the button that applies it.
import { confirmDialog, el, notice } from "/ui.js";
import { embedBrand } from "/studio/brand.js";
import { showPreview } from "/studio/render.js";
import { buildImage } from "/studio/templates.js";
import { colorsView, contrastView, logosView } from "/studio/brand-views.js";

const GROUNDS = [
  ["light", "Light"],
  ["ink", "Ink"],
  ["accent", "Accent"],
];

function samplePost(brand, ground) {
  const image = buildImage({
    template: "statement",
    content: {
      ground,
      headline: `On-brand posts, *in the style of ${brand.name}.*`,
      text: "A sample post in the proposed brand kit.",
      footerLeft: brand.name,
    },
    format: "li-square",
    brand,
  });
  const box = el("div", { class: "studio-preview" });
  // The preview scales to the width of its box, so it needs to be on the page first.
  requestAnimationFrame(() =>
    showPreview(box, image, { maxHeight: 260, label: `Sample post on the ${ground} ground` }),
  );
  return box;
}

export function proposalBlock(ctx) {
  const holder = el("section", { class: "card", id: "brand-proposal", hidden: "" });

  async function refresh() {
    let result;
    try {
      result = await ctx.api("/api/brand/proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    if (!ctx.valid()) return;
    if (result.state === "none") {
      holder.hidden = true;
      return;
    }
    holder.hidden = false;
    if (result.state === "invalid") {
      holder.replaceChildren(
        el("h2", { text: "Proposal" }),
        el("p", { class: "studio-warning", text: "This proposal cannot be used yet:" }),
        el(
          "ul",
          { class: "studio-lines" },
          result.problems.map((p) => el("li", { text: p })),
        ),
        el("p", { class: "help-text", text: "Fix the files and check again, or make a new proposal." }),
      );
      return;
    }
    let brand;
    try {
      brand = await embedBrand(result.brand, "/brand-proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    const { extras } = result;
    const settingsLines = [
      extras.tone ? `Tone: ${extras.tone}` : null,
      extras.bannedWords.length ? `Banned words added: ${extras.bannedWords.join(", ")}` : null,
      extras.hashtags ? `Hashtags added: ${extras.hashtags}` : null,
    ].filter(Boolean);
    const apply = el("button", { type: "button", text: "Use this brand kit" });
    apply.addEventListener("click", async () => {
      const ok = await confirmDialog(
        `The brand kit of this project becomes "${brand.name}". The current one is kept once, as brand-previous, and posts made with it are flagged by the brand check.`,
        { title: "Use this brand kit?", confirmText: "Use this brand kit" },
      );
      if (!ok) return;
      apply.disabled = true;
      try {
        await ctx.api("/api/brand/apply", { method: "POST", body: {} });
        notice("The brand kit is applied");
        location.reload();
      } catch (e) {
        notice(e.message, "error");
        apply.disabled = false;
      }
    });
    // `replaceChildren` would write a null as the text "null", so the optional parts are filtered out.
    holder.replaceChildren(
      ...[
        el("h2", { text: `Proposal: ${brand.name}` }),
        el("p", { class: "help-text", text: `Version ${brand.version}. Nothing has changed yet.` }),
        extras.notes.length
          ? el("div", {}, [
              el("h3", { text: "Good to know" }),
              el(
                "ul",
                { class: "studio-lines" },
                extras.notes.map((n) => el("li", { text: n })),
              ),
            ])
          : null,
        el("h3", { text: "Colours" }),
        colorsView(brand),
        el("h3", { text: "Contrast per ground" }),
        contrastView(brand),
        el("h3", { text: "Logos" }),
        logosView(brand),
        el("h3", { text: "One post per ground" }),
        el(
          "div",
          { class: "studio-proposal-posts" },
          GROUNDS.map(([ground, name]) =>
            el("figure", { class: "studio-file" }, [samplePost(brand, ground), el("figcaption", { text: name })]),
          ),
        ),
        settingsLines.length
          ? el("div", {}, [
              el("h3", { text: "Goes to the settings of this project" }),
              el(
                "ul",
                { class: "studio-lines" },
                settingsLines.map((t) => el("li", { text: t })),
              ),
            ])
          : null,
        el("div", { class: "button-row" }, [apply]),
      ].filter(Boolean),
    );
  }

  refresh();
  return { element: holder, refresh };
}
```

### Step 7: CSS

Append to `src/web/studio.css`:

```css
.studio-input-list {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--t-s);
}

.studio-input-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--r3);
}

.studio-proposal-posts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--r3);
}
```

### Step 8: check and commit

Run `npx vitest run tests/brand-embed.test.ts` (PASS), then `npm test`, `npm run typecheck`, `npm run format:check`. Check that the server serves the new file: start it on a temporary data folder and `curl -s localhost:4173/studio/brand-create.js | head -3` must answer 200. Commit on `fase-4` with the message "Add the Create a brand kit screen with proposal preview". The page itself is checked in the browser in task 13.

## 5. Task 13: finishing

1. **Fresh clone.** `git clone` the repo into a temporary folder, check out `fase-4`, then `npm ci && npm test && npm run typecheck && npm run format:check`. All green on a copy that comes from git alone.
2. **Server with a fake client, so route A runs without a key and without cost.** Save this outside the repo as `serve-fake.ts` and start it with `REPO=$PWD POSTWRIGHT_DATA_DIR=$(mktemp -d) node --import tsx <path>/serve-fake.ts`:

```ts
// Runs the studio with a fake Claude client, so that route A can be tried without a key and without cost.
const root = process.env.REPO!;
const { createApp } = await import(`${root}/src/server/app.ts`);
const { startServer } = await import(`${root}/src/server/http.ts`);
const { prepareData } = await import(`${root}/src/server/projects.ts`);
const { answer, fakeClient } = await import(`${root}/tests/helpers/brand-ai.ts`);
const dataDir = process.env.POSTWRIGHT_DATA_DIR!;
await prepareData(dataDir);
const { client } = fakeClient([answer(), answer(), answer()]);
const s = await startServer({
  dataDir,
  port: 4180,
  ...createApp({ dataDir, brand: { client, model: "claude-opus-5-5" } }),
});
console.log(`Fake studio at ${s.url}`);
```

Make test material: a transparent 128 by 128 PNG (a coloured circle) with `writePng` from `src/server/png.ts`; the SVG `src/web/brand/logo/default.svg`; the image `assets/social-preview.png`; the font `src/web/brand/fonts/inter-latin.woff2`; and a PDF (any file that starts with `%PDF-`). If the fake script's imports no longer match the real exports, follow the real code. 3. **Walk through it in a browser** at `http://127.0.0.1:4180` and note what differs. If no browser is available in your environment, say so plainly, do not claim these checks as done, and list them for the owner.

1.  Project picker: one project, "Postwright". Choose "New project…", create "Acme", and check that the picker, the tab title and the heading show the project. Create a fact in Acme: it must be missing in Postwright, and the other way round. Delete `data/projects/acme` by hand and reload: the studio opens Postwright without an error.
2.  Brand kit screen of Acme: the buttons are off with the reason "Add a logo first". Upload the SVG, then the transparent PNG (it replaces the SVG), then an image, the PDF and the font; remove one file. Try a text file as the logo (refused with a message). Enter an http address and save (refused); enter an https address.
3.  "Generate with Claude" (fake client): a proposal appears with colours, contrast with ticks, logos on their grounds (the white variant on dark), three sample posts in the new brand, and the notes. Without the fake client (plain `npm start`, no key) the button is off and says why.
4.  "Use this brand kit": confirm; the page reloads with the new brand. Check that a new post in the editor uses it, that Postwright's brand is unchanged, that Settings shows the tone, banned words and hashtags, and that `data/projects/acme/brand-previous/` does not exist (the built-in brand was the starting point). Make a second proposal and apply it: now `brand-previous/` exists and holds the first kit.
5.  Route B: click "Download prompt (.md)" and read it as someone who does not know the studio. Then copy `src/web/brand` into `data/projects/acme/brand-input/proposal/` by hand, change `name` in `brand.json`, and click "Check for a proposal": the proposal appears. Delete one logo file from that folder and check again: the screen shows the problem with its field. Run `POSTWRIGHT_DATA_DIR=<same folder> npm run brand:check -- acme` and compare the messages.
6.  Narrow screen (phone width): the picker and the block stay usable.
7.  Real key: **ask the owner first.** Only after their agreement, start with `ANTHROPIC_API_KEY` in the environment (never in a file) and a small set (one logo, one image, an https address), and check the new line in `ai-usage.jsonl`. This also settles the live-API unknowns in section 6.

Fix every fault in its own commit, with a test where possible. 4. **Short review of task 12** (a subagent is fine, but not required). Look at: does any call read or write outside the project folder; does the key appear anywhere (response, log, test file, browser); can the user lose uploaded details or a brand by a failed call (apply must leave nothing half done); is anything built that the spec does not ask for; does text from the server or a proposal reach the page only through `el(…, { text })` and never as HTML. 5. **README.** It still says `npm test` runs 388 tests (use the real count from `npm test`) and says nothing about projects, the brand kit screen or `npm run brand:check`. Fix: the spending cap is shared by all projects (`data/settings.json`); the brand lives in `data/projects/<project>/brand/`; add two or three sentences about projects and about making a brand kit (the prompt is the route without API cost); mention that a post with a fact id from another project can no longer be saved. Keep the README to about 720 words (`wc -w README.md`; it is 709 now), so cut something less needed. 6. **Everything green, then the snapshot.** `npm test`, `npm run typecheck`, `npm run format:check` all pass and `git status --short` is empty. Then **ask the owner** before merging `fase-4` into `main` or pushing anything. The repo's own leak test replaces any separate scan; also check that no commit message on the branch has a `Co-Authored-By` line (`git log --format=%B main..fase-4`). 7. **Report to the owner** in five lines: what the tool can do now, the number of tests, the commit on the branch, what the owner still has to do (the real-key trial and its cost, the decision about task 12 if still open), and that nothing was pushed.

## 6. Rulings that still matter, and known leftovers

**Rulings** (the code already follows them):

- R2: SVG text over 100 KB is not sent to Claude; the prompt says it was too large and the proposal carries a notice suggesting a PNG version.
- R3: on apply the tone is replaced; banned words and hashtags are added to what the project already has.
- Q1: a proposal's `version` must be at most 40 characters and not only whitespace, or every post save would break after apply.
- Q2: save website and notes before reloading the input list after an upload or removal (already in the code above).
- Q3: `data:` URIs inside an SVG are replaced by a placeholder before the SVG goes into the prompt (else one logo can cost more than the reserve).
- Q4: the request has top-level `cache_control: ephemeral`, so `pause_turn` continuations reuse the cached input.
- Q5: the PNG reader limits the inflated size (decompression-bomb guard); `engines` is `>=22.2` because `zlib.crc32` needs it.
- Q6/S2: generation and apply use the same lock key (`brand-apply:<project folder>`), so apply never moves a half-written proposal.
- Q7: a test checks that `GET /api/brand/input` and `GET /api/ai` never contain the API key.
- S1: tasks 7-11 are the interface any frontend uses; task 12 waits for the owner's decision.
- F1: the README fix waits for task 13 (above).
- F2: the older `brand-previous/` is deleted only after an apply has succeeded.
- Parked: `repairAnswer` silently cuts `url` (300) and `fontFamily` (60); refusing instead is a one-line change if wanted. A failure of the final `rm` of the expiring backup, outside the rollback, gives a 500 after an apply that did take effect; the next apply removes it.

**Deferred minors worth knowing:**

- Worst case per generation is about $4, above the $2 reserve: up to 4 calls of 32,000 output tokens at $20 per million is $2.56, plus input (a dense 20 MB PDF is about $1.5). The real cost is booked, so the cap can be overshot once by $2-3. Cheap options: check the room before each `pause_turn` continuation, or lower `max_tokens` to 16,000. Mention it near the cap sentence in the README if desired.
- The AI lock is held for the whole generation (minutes). Writing help and ideas in every project wait behind it, the free sample provider included. Consider a fast 409 when the lock is busy.
- A dropped connection after streaming books $0 (no usage to book); the cap fails closed otherwise.
- The prompt and `brand:check` assume the data folder `data/`; with `POSTWRIGHT_DATA_DIR` set they look in the wrong place (and `brand:check` can say "valid" for the wrong folder).
- `buildProposal` re-reads the logo after the paid call; if the logo is replaced during a generation, colours and variants can come from different files. Passing the logo read by `loadMaterial` fixes it.
- `PUT /api/settings` is not under the apply lock (a simultaneous save could lose a field). There is no test for applying twice (it answers 409 "no proposal"). The PNG is decoded three times, and a PNG colour key (tRNS) is treated as opaque.
- Residual SVG filter gaps (`&#` in `<style>` text, backslash escapes in `style="…"`) are mitigated by the sandbox CSP, nosniff and use as an image only.
- Cancelling the "New project" name dialog after agreeing to discard changes costs one extra question. `GlobalSettingsSchema` is `.strict()`. The AI-off check sits outside the lock.
- `tone` is stored in the settings, but no AI call reads it yet.
- Symlinks inside `brand/` or `proposal/` are not resolved by the path checks (single-user trust, as before phase 4).

**Live-API unknowns** (cannot be tested without a real key; settle them in task 13 step 3.7 and only with the owner's consent):

- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) together with structured output and the web fetch tool in one request.
- The container id that must be passed on after `pause_turn`.
- The usage that is reported when a fallback model answered (the cost is priced at the highest rate for an unknown model, so it cannot count too low).
- Real token counts for a PDF plus 8 images.

## 7. Later idea from the owner (not designed)

Generate new post templates through the API, or through a downloadable prompt as for the brand kit, based on the brand's sector and similar brands. Nothing is decided. Start with a brainstorm with the owner (a short round of questions), then a plan, before any code.
