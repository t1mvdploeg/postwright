# Multi-slide posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every image post can have up to 20 slides, each slide with its own template, exported as PNGs per slide and (for LinkedIn formats) as one PDF.

**Architecture:** Slide 1 stays in `post.template` / `post.content`; slides 2..n go in a new `post.moreSlides: [{ template, content }]`. A new pure module `src/web/studio/slides.js` turns any post into its list of images (`imagesOf`) and holds the format and export rules; brand check, export, thumbnails and the editor go through it instead of branching on `s.kind === "carousel"`. The Carousel template and its `post.slides` stay exactly as they are.

**Tech Stack:** Node 22 + TypeScript server (zod 4), plain browser ESM in `src/web` (no build step, `.d.ts` files beside JS modules), vitest, playwright-core with the installed Chrome for browser tests, prettier.

**Spec:** `docs/superpowers/specs/2026-10-05-multi-slide-posts-design.md`

## Global Constraints

- At most 20 slides per post: `moreSlides` max 19 (`MAX_SLIDES = 20`).
- No migration: every reader treats a missing `moreSlides` or `slides` as `[]`.
- A carousel post (`kind: "carousel"`) never has `moreSlides`; the server rejects it.
- Carousel templates (built-in or own) are never offered as a slide template.
- Code, comments, UI text and docs in English, in the style of the surrounding code (short comments that say why).
- Browser modules import each other with absolute paths (`/studio/x.js`) only in browser-only files (`editor.js`, `export-ui.js`, `post-cards.js`); modules that tests or the server import (`slides.js`, `recipe.js`, `brand-check.js`, `templates.js`) use relative paths (`./x.js`).
- Every new or changed exported function of a `.js` module gets its declaration in the `.d.ts` beside it.
- Commits on branch `meerdere-slides`, author Tim (already configured: `133122358+t1mvdploeg@users.noreply.github.com`), no `Co-Authored-By` line.
- Before each commit: `npm run typecheck && npm run format:check && npm test` green (run `npm run format` first if needed).

## Review Focus

1. A post file saved before this change (no `moreSlides`, possibly no `slides`) is opened in the editor, listed, thumbnailed and counted for media without an error. Pinned in Task 2 (server) and Task 1 (`imagesOf`, `mediaIdsOf` on a bare post).
2. A slide whose own template was deleted: editor opens, the slide says "Template missing", brand check gives an error, save keeps the slide untouched, and no move can put it in position 1. Pinned in Task 3 (`toInput` keeps it), Task 4 (brand check error) and Task 7 (browser).
3. Adding a slide whose template lacks one of the chosen formats (default Statement has Story; Question has none): the formats narrow, nothing throws. Pinned in Task 1 (`narrowFormats`) and Task 7 (browser).
4. Moving a slide to position 1 changes the post's `template`: save sends the new slide-1 template, formats stay valid. Pinned in Task 1 (`fromPages`) and Task 7 (browser reopen).
5. Editing only an extra slide must drop a stale brand check on the server. Pinned in Task 2.

---

### Task 1: The pure slide module `slides.js`

**Files:**
- Create: `src/web/studio/slides.js`
- Create: `src/web/studio/slides.d.ts`
- Modify: `src/web/studio/recipe.js` (move `takeOver` and `MEDIA_ID` out; import them)
- Test: `tests/slides.test.ts`

**Interfaces:**
- Consumes: `template`, `allTemplates`, `imageCount`, `defaultContent` from `src/web/studio/templates.js`.
- Produces (all exported from `src/web/studio/slides.js`):
  - `MAX_SLIDES: 20`
  - `isCarousel(post): boolean`
  - `pagesOf(post): Array<{ template: string, content: Record<string,string> }>`: slide 1 then `moreSlides`.
  - `fromPages(pages): { template, content, moreSlides }`
  - `imagesOf(post): Array<{ template: string, content: object, slides?: Slide[], slide: number }>`: the arguments for `buildImage` except `format`, `brand` and `media`.
  - `slideNumber(post, slide): number | null`: 1-based number for a file name, or null for a one-image image post.
  - `imageTasks(post): Array<{ format: string, slide: number|null, image: ReturnType<typeof imagesOf>[number] }>`: format-major.
  - `pdfFormat(post): string | null`
  - `sharedFormats(templateIds: string[]): string[]`: in the order of the first template's formats; unknown ids are ignored.
  - `slideTemplates(formats: string[]): Template[]`: image templates sharing at least one format.
  - `narrowFormats(formats: string[], templateId: string): { formats: string[], dropped: string[] }`
  - `changeSlideTemplate(page, targetId): { template, content }`
  - `takeOver(source, fields, target): void` (moved from recipe.js, now exported)
  - `mediaIdsOf(post): string[]`

- [ ] **Step 1: Write the failing test** in `tests/slides.test.ts`

```ts
// The slides of a post: one list of images for every kind of post, the format rules and the
// export plan.
import { describe, it, expect } from "vitest";
import {
  MAX_SLIDES,
  changeSlideTemplate,
  fromPages,
  imageTasks,
  imagesOf,
  mediaIdsOf,
  narrowFormats,
  pagesOf,
  pdfFormat,
  sharedFormats,
  slideNumber,
  slideTemplates,
} from "../src/web/studio/slides.js";
import { newRecipe } from "../src/web/studio/recipe.js";

const MEDIA = "0123456789abcdef0123456789abcdef.png";
const three = () => ({
  kind: "image" as const,
  template: "statement",
  content: { headline: "One *two*" },
  slides: [],
  moreSlides: [
    { template: "statistic", content: { headline: "Three *four*" } },
    { template: "question", content: { headline: "Five *six*" } },
  ],
  formats: ["li-square", "ig-square"],
});

describe("pagesOf and fromPages", () => {
  it("treats a post saved before moreSlides existed as one slide", () => {
    const old = { template: "statement", content: { headline: "x" } };
    expect(pagesOf(old)).toEqual([{ template: "statement", content: { headline: "x" } }]);
    expect(imagesOf(old)).toEqual([{ template: "statement", content: { headline: "x" }, slide: 0 }]);
    expect(mediaIdsOf(old)).toEqual([]);
  });

  it("round-trips, and a slide moved to the front becomes the post's template", () => {
    const pages = pagesOf(three());
    expect(pages.map((p) => p.template)).toEqual(["statement", "statistic", "question"]);
    const [a, b, c] = pages;
    expect(fromPages([b, a, c])).toEqual({
      template: "statistic",
      content: { headline: "Three *four*" },
      moreSlides: [a, c],
    });
  });
});

describe("imagesOf", () => {
  it("gives one image per slide of an image post, each with its own template", () => {
    expect(imagesOf(three()).map((i) => [i.template, i.slide])).toEqual([
      ["statement", 0],
      ["statistic", 1],
      ["question", 2],
    ]);
  });

  it("gives a carousel one image per carousel slide, all on the carousel template", () => {
    const r = newRecipe("carousel");
    const images = imagesOf(r);
    expect(images).toHaveLength(r.slides.length);
    expect(images[2]).toMatchObject({ template: "carousel", slides: r.slides, slide: 2 });
  });
});

describe("formats", () => {
  it("shares only what every slide's template has, in the first template's order", () => {
    expect(sharedFormats(["statement", "statistic", "question"])).toEqual([
      "li-square",
      "li-portrait",
      "ig-square",
      "ig-portrait",
    ]);
    expect(sharedFormats(["statement", "own-deadbeef"])).toEqual(sharedFormats(["statement"]));
    expect(sharedFormats([])).toEqual([]);
  });

  it("offers image templates that share at least one format, never a carousel", () => {
    const ids = slideTemplates(["li-square", "story"]).map((s) => s.id);
    expect(ids).toContain("question");
    expect(ids).toContain("statement");
    expect(ids).not.toContain("carousel");
    expect(ids).not.toContain("link-preview");
  });

  it("narrows the formats when a template lacks one, and says what was dropped", () => {
    expect(narrowFormats(["li-square", "li-portrait", "story"], "question")).toEqual({
      formats: ["li-square", "li-portrait"],
      dropped: ["story"],
    });
    expect(narrowFormats(["li-square"], "statement")).toEqual({ formats: ["li-square"], dropped: [] });
  });
});

describe("changeSlideTemplate", () => {
  it("takes over the values that fit and fills the rest with defaults", () => {
    const page = changeSlideTemplate({ template: "statement", content: { headline: "Keep *me*", nonsense: "x" } }, "question");
    expect(page.template).toBe("question");
    expect(page.content.headline).toBe("Keep *me*");
    expect(page.content).not.toHaveProperty("nonsense");
  });

  it("throws on an unknown template", () => {
    expect(() => changeSlideTemplate({ template: "statement", content: {} }, "own-deadbeef")).toThrow(/Unknown template/);
  });
});

describe("export plan", () => {
  it("numbers the files only when there is more than one image, and per format all slides", () => {
    const tasks = imageTasks(three());
    expect(tasks.map((t) => [t.format, t.slide])).toEqual([
      ["li-square", 1],
      ["li-square", 2],
      ["li-square", 3],
      ["ig-square", 1],
      ["ig-square", 2],
      ["ig-square", 3],
    ]);
    const one = { ...three(), moreSlides: [] };
    expect(imageTasks(one).map((t) => t.slide)).toEqual([null, null]);
    expect(slideNumber(one, 0)).toBeNull();
    expect(slideNumber(newRecipe("carousel"), 0)).toBe(1);
  });

  it("makes a PDF for a carousel, and for a multi-slide post only with a LinkedIn feed format", () => {
    expect(pdfFormat(newRecipe("carousel"))).toBe("li-carousel");
    expect(pdfFormat(three())).toBe("li-square");
    expect(pdfFormat({ ...three(), formats: ["ig-square"] })).toBeNull();
    expect(pdfFormat({ ...three(), moreSlides: [] })).toBeNull();
  });

  it("finds media ids in slide 1, carousel slides and extra slides", () => {
    const post = { ...three(), moreSlides: [{ template: "product-image", content: { image: MEDIA } }] };
    expect(mediaIdsOf(post)).toEqual([MEDIA]);
  });

  it("allows twenty slides", () => {
    expect(MAX_SLIDES).toBe(20);
  });
});
```

Check the media field id of `product-image` before running: `grep -n "kind: \"media\"" -B3 src/web/studio/templates/product-image.js`; use its `id` in place of `image` if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slides.test.ts`
Expected: FAIL, cannot find module `../src/web/studio/slides.js`.

- [ ] **Step 3: Write `src/web/studio/slides.js`**

```js
// The slides of a post. An image post has slide 1 in `template` and `content` and the rest in
// `moreSlides`, each slide with its own template; a carousel keeps its slides in `slides`, all
// on the carousel template. Everything that draws, checks or exports a post asks this module
// for its images. Pure, so that vitest and the server can use it.
import { template as templateOf, allTemplates, imageCount, defaultContent } from "./templates.js";

/** Instagram's maximum; LinkedIn documents allow more. */
export const MAX_SLIDES = 20;

const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

/** The LinkedIn feed formats a document post (PDF) can be made from, besides the carousel's own. */
const DOCUMENT_FORMATS = ["li-square", "li-portrait"];

export function isCarousel(post) {
  return post.kind === "carousel" || templateOf(post.template)?.kind === "carousel";
}

/** Every slide of an image post as `{ template, content }`: slide 1, then the extra slides. */
export function pagesOf(post) {
  return [{ template: post.template, content: post.content ?? {} }, ...(post.moreSlides ?? [])];
}

/** The other way round: the first page is the post's own template and content. */
export function fromPages(pages) {
  const [first, ...rest] = pages;
  return { template: first.template, content: first.content, moreSlides: rest };
}

/** Per image, the arguments for `buildImage` except format, brand and media. */
export function imagesOf(post) {
  if (isCarousel(post)) {
    const slides = post.slides ?? [];
    const s = templateOf(post.template);
    const count = s ? imageCount(s, slides) : Math.max(slides.length, 1);
    return Array.from({ length: count }, (_, slide) => ({ template: post.template, content: {}, slides, slide }));
  }
  return pagesOf(post).map((p, slide) => ({ template: p.template, content: p.content ?? {}, slide }));
}

/** The slide number in a file name (1-based), or null for a post that is one image. */
export function slideNumber(post, slide) {
  return isCarousel(post) || imagesOf(post).length > 1 ? slide + 1 : null;
}

/** Every image to export: per format, every slide. */
export function imageTasks(post) {
  const images = imagesOf(post);
  return post.formats.flatMap((format) =>
    images.map((image) => ({ format, slide: slideNumber(post, image.slide), image })),
  );
}

/** The format of the PDF for LinkedIn, or null when the post gets none. */
export function pdfFormat(post) {
  if (isCarousel(post)) return "li-carousel";
  if (pagesOf(post).length < 2) return null;
  return post.formats.find((f) => DOCUMENT_FORMATS.includes(f)) ?? null;
}

/** The formats every one of these templates has; a template that no longer exists is skipped. */
export function sharedFormats(templateIds) {
  const lists = templateIds.map((id) => templateOf(id)?.formats).filter(Boolean);
  if (!lists.length) return [];
  return lists[0].filter((f) => lists.every((l) => l.includes(f)));
}

/** The templates a slide can have: image templates with at least one of these formats. */
export function slideTemplates(formats) {
  return allTemplates().filter((s) => s.kind !== "carousel" && s.formats.some((f) => formats.includes(f)));
}

/** The formats left when a slide with this template joins, and the ones that drop out. */
export function narrowFormats(formats, templateId) {
  const own = templateOf(templateId)?.formats ?? [];
  return { formats: formats.filter((f) => own.includes(f)), dropped: formats.filter((f) => !own.includes(f)) };
}

/**
 * Values that fit in `fields`: same id, a choice only as an option, an image only as a
 * media id.
 */
export function takeOver(source, fields, target) {
  for (const v of fields) {
    const w = source?.[v.id];
    if (typeof w !== "string" || !w.trim()) continue;
    if (v.kind === "choice" && !v.options.some((o) => o.value === w)) continue;
    if (v.kind === "media" && !MEDIA_ID.test(w)) continue;
    target[v.id] = w;
  }
}

/** A slide in another template, keeping the values that fit. */
export function changeSlideTemplate(page, targetId) {
  const target = templateOf(targetId);
  if (!target) throw new Error(`Unknown template: ${targetId}`);
  const content = defaultContent(target);
  takeOver(page.content, target.fields, content);
  return { template: target.id, content };
}

/** Every uploaded image a post uses, in slide 1, carousel slides and extra slides. */
export function mediaIdsOf(post) {
  return [post.content, ...(post.slides ?? []).map((d) => d.content), ...(post.moreSlides ?? []).map((d) => d.content)]
    .flatMap((i) => Object.values(i ?? {}))
    .filter((v) => MEDIA_ID.test(v));
}
```

- [ ] **Step 4: Remove `MEDIA_ID` and `takeOver` from `recipe.js`** and import `takeOver` instead:

```js
import { template as templateOf, defaultContent, fieldsOf } from "./templates.js";
import { titleFrom } from "./brand-check.js";
import { takeOver } from "./slides.js";
```

Delete the `const MEDIA_ID = …` line and the whole `function takeOver(…) { … }` block with its comment from `recipe.js`.

- [ ] **Step 5: Write `src/web/studio/slides.d.ts`**

```ts
// Type declaration next to slides.js (plain browser ESM, no build step).
import type { Slide, Template } from "./templates.js";

export interface Page {
  template: string;
  content: Record<string, string>;
}
export interface PostSlides {
  kind?: "image" | "carousel";
  template: string;
  content?: Record<string, string>;
  slides?: Slide[];
  moreSlides?: Page[];
  formats?: string[];
}
export interface ImageArgs {
  template: string;
  content: Record<string, string>;
  slides?: Slide[];
  slide: number;
}

export const MAX_SLIDES: 20;
export function isCarousel(post: PostSlides): boolean;
export function pagesOf(post: PostSlides): Page[];
export function fromPages(pages: Page[]): { template: string; content: Record<string, string>; moreSlides: Page[] };
export function imagesOf(post: PostSlides): ImageArgs[];
export function slideNumber(post: PostSlides, slide: number): number | null;
export function imageTasks(post: PostSlides & { formats: string[] }): { format: string; slide: number | null; image: ImageArgs }[];
export function pdfFormat(post: PostSlides & { formats: string[] }): string | null;
export function sharedFormats(templateIds: string[]): string[];
export function slideTemplates(formats: string[]): Template[];
export function narrowFormats(formats: string[], templateId: string): { formats: string[]; dropped: string[] };
export function takeOver(source: Record<string, string> | undefined, fields: Template["fields"], target: Record<string, string>): void;
export function changeSlideTemplate(page: Page, targetId: string): Page;
export function mediaIdsOf(post: PostSlides): string[];
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/slides.test.ts tests/recipe.test.ts`
Expected: PASS (recipe tests still pass after the move).

- [ ] **Step 7: Commit**

```bash
npm run format && npm run typecheck && npm run format:check && npm test
git add src/web/studio/slides.js src/web/studio/slides.d.ts src/web/studio/recipe.js tests/slides.test.ts
git commit -m "Add slides.js: one list of images for every post, format rules, export plan"
```

---

### Task 2: Server: `moreSlides` in the schema, the check and media usage

**Files:**
- Modify: `src/server/schema.ts:103-150` (`MoreSlideSchema`, `PostInputSchema`)
- Modify: `src/server/routes.ts:125-130` (`contentDiffers`), `routes.ts:~296-345` (`fillPosts`, if typecheck asks)
- Modify: `src/server/store.ts:395-406` (`mediaUsage`)
- Test: `tests/routes.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PostInput.moreSlides: { template: string; content: Record<string,string> }[]` (default `[]`), and on `Post`.

- [ ] **Step 1: Write the failing tests** at the end of the `describe("posts", …)` block in `tests/routes.test.ts`

```ts
  it("stores extra slides with their own template, at most nineteen, and none on a carousel", async () => {
    const more = [{ template: "statistic", content: { headline: "Two *slides*" } }];
    const p = await newPost({ moreSlides: more });
    expect(p.moreSlides).toEqual(more);
    expect((await newPost()).moreSlides).toEqual([]);
    const twenty = Array.from({ length: 20 }, () => more[0]);
    expect((await ask(`${API}/posts`, { body: recipe({ moreSlides: twenty }) })).status).toBe(400);
    const carousel = await ask(`${API}/posts`, {
      body: recipe({ kind: "carousel", template: "carousel", formats: ["li-carousel"], content: {}, moreSlides: more }),
    });
    expect(carousel.status).toBe(400);
    expect(JSON.stringify(carousel.body)).toMatch(/extra slides/);
  });

  it("clears the check when only an extra slide changes", async () => {
    const more = [{ template: "statistic", content: { headline: "Two *slides*" } }];
    const p = await newPost({ moreSlides: more });
    const { check: _c, ...withoutCheck } = recipe({ moreSlides: more });
    const same = await ask(`${API}/posts/${p.id}`, { method: "PUT", body: { ...withoutCheck, version: 1 } });
    expect(same.body.check).not.toBeNull();
    const changed = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...withoutCheck, moreSlides: [{ template: "question", content: {} }], version: 2 },
    });
    expect(changed.body.check).toBeNull();
  });

  it("reads a post file from before moreSlides (and without slides) in the list and the media count", async () => {
    const p = await newPost();
    const file = join(projectDir, "marketing", "posts", `${p.id}.json`);
    const { moreSlides: _m, slides: _s, ...old } = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify(old));
    expect((await ask(`${API}/posts`)).status).toBe(200);
    expect((await ask(`${API}/media`)).status).toBe(200);
    expect((await ask(`${API}/posts/${p.id}`)).status).toBe(200);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/routes.test.ts -t "extra slide|before moreSlides"`
Expected: FAIL. The first two fail because `moreSlides` is rejected by the strict schema (400). The third fails with a 500 on `/api/media` (`p.slides.map` on undefined).

- [ ] **Step 3: Schema.** In `src/server/schema.ts`, below `SlideSchema`:

```ts
/** An extra slide of an image post: slides 2..n, each with its own template. */
const MoreSlideSchema = z
  .object({
    template: z.string().regex(TEMPLATE_ID, "invalid template"),
    content: Content,
  })
  .strict();
```

In `PostInputSchema`, after `slides: …`:

```ts
    moreSlides: z.array(MoreSlideSchema).max(19).default([]),
```

and after its `.strict()`:

```ts
  .strict()
  .refine((p) => p.kind !== "carousel" || p.moreSlides.length === 0, {
    message: "a carousel has no extra slides",
    path: ["moreSlides"],
  });
```

First run `grep -rn "PostInputSchema\.\(shape\|extend\|omit\|pick\|partial\)" src tests`; if anything uses those, put the same rule in the POST and PUT routes instead (`throw new ApiError(400, "moreSlides: a carousel has no extra slides")` after `validate`).

- [ ] **Step 4: `contentDiffers`** in `src/server/routes.ts`: add `moreSlides` to the `Pick` and the key, tolerant of old files:

```ts
function contentDiffers(
  a: Pick<Post, "template" | "content" | "slides" | "moreSlides" | "formats" | "caption" | "altText" | "link" | "facts">,
  b: typeof a,
): boolean {
  const key = (x: typeof a) =>
    JSON.stringify([
      x.template,
      x.content,
      x.slides ?? [],
      x.moreSlides ?? [],
      x.formats,
      x.caption,
      x.altText,
      x.link,
      x.facts,
    ]);
  return key(a) !== key(b);
}
```

- [ ] **Step 5: `mediaUsage`** in `src/server/store.ts`:

```ts
    const ids = new Set(
      [p.content, ...(p.slides ?? []).map((d) => d.content), ...(p.moreSlides ?? []).map((d) => d.content)]
        .flatMap((i) => Object.values(i ?? {}))
        .filter((v) => MEDIA_ID.test(v)),
    );
```

- [ ] **Step 6: Typecheck.** Run `npm run typecheck`. Where a `Post` literal now misses `moreSlides` (likely `fillPosts` in `routes.ts` and test helpers building `Post` objects), add `moreSlides: []` next to `slides: []`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/routes.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npm run format && npm run typecheck && npm run format:check && npm test
git add src/server tests
git commit -m "Store extra slides of an image post, each with its own template"
```

---

### Task 3: Recipes: `newRecipe`, `toInput` and `convert` with extra slides

**Files:**
- Modify: `src/web/studio/recipe.js` (`newRecipe`, `toInput`, comment on `convert`)
- Modify: `src/web/studio/recipe.d.ts`
- Test: `tests/recipe.test.ts`

**Interfaces:**
- Consumes: `sharedFormats` from Task 1; `template` from templates.js.
- Produces: `Recipe.moreSlides: Page[]`; `toInput(post, s, check)` where `s` is slide 1's template (or the carousel). It returns `moreSlides`, filters `formats` to the formats shared by all slides with an existing template, keeps a slide whose template is missing unchanged, and throws `Error("The slides share no format; …")` when no format is left.

- [ ] **Step 1: Write the failing tests** in `tests/recipe.test.ts` (new `describe`)

```ts
describe("extra slides", () => {
  it("starts a new recipe with no extra slides", () => {
    expect(newRecipe("statement").moreSlides).toEqual([]);
    expect(newRecipe("carousel").moreSlides).toEqual([]);
  });

  it("sends extra slides with only their template's fields, and only shared formats", () => {
    const post = {
      ...newRecipe("statement", { brandVersion: "test-1.0" }),
      formats: ["li-square", "story"],
      moreSlides: [{ template: "question", content: { headline: "Why *not*?", nonsense: "x" } }],
    };
    const input = toInput(post, template("statement")!, null);
    expect(input.formats).toEqual(["li-square"]);
    expect(input.moreSlides[0].template).toBe("question");
    expect(input.moreSlides[0].content.headline).toBe("Why *not*?");
    expect(input.moreSlides[0].content).not.toHaveProperty("nonsense");
    expect(PostInputSchema.safeParse({ ...input, check: undefined }).success).toBe(true);
  });

  it("keeps a slide whose template is gone exactly as it was", () => {
    const gone = { template: "own-deadbeef", content: { headline: "Old" } };
    const input = toInput({ ...newRecipe("statement"), moreSlides: [gone] }, template("statement")!, null);
    expect(input.moreSlides).toEqual([gone]);
  });

  it("refuses when the slides share no format", () => {
    const post = {
      ...newRecipe("statement"),
      formats: ["wide"],
      moreSlides: [{ template: "question", content: {} }],
    };
    expect(() => toInput(post, template("statement")!, null)).toThrow(/share no format/);
  });

  it("sends no extra slides for a carousel, and Convert starts from slide 1 only", () => {
    const c = newRecipe("carousel");
    expect(toInput({ ...c, moreSlides: [{ template: "question", content: {} }] }, template("carousel")!, null).moreSlides).toEqual([]);
    const post = { ...newRecipe("statement"), title: "T", moreSlides: [{ template: "question", content: {} }] };
    expect(convert(post, "question").moreSlides).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/recipe.test.ts -t "extra slides"`
Expected: FAIL (`moreSlides` undefined).

- [ ] **Step 3: Implement.** In `recipe.js` add `import { sharedFormats, takeOver } from "./slides.js";` (replacing the Task 1 import). In `newRecipe` add `moreSlides: [],` after `slides,`. Replace `toInput` with:

```js
/**
 * The part of a post that goes to the server on save: only the fields of the schema, only
 * fields that the template (or the slide kind) knows, and no empty captions. `s` is the
 * template of slide 1 (or the carousel). An extra slide whose template no longer exists goes
 * along unchanged: its content is not ours to cut.
 */
export function toInput(post, s, check) {
  const only = (content, fields) =>
    Object.fromEntries(fields.map((v) => [v.id, String(content?.[v.id] ?? v.defaultValue ?? "")]));
  const carousel = s.kind === "carousel";
  const moreSlides = carousel
    ? []
    : (post.moreSlides ?? []).map((d) => {
        const t = templateOf(d.template);
        return t ? { template: t.id, content: only(d.content, t.fields) } : { template: d.template, content: d.content ?? {} };
      });
  const allowed = carousel ? s.formats : sharedFormats([s.id, ...moreSlides.map((d) => d.template)]);
  const formats = [...new Set(post.formats)].filter((f) => allowed.includes(f));
  if (!formats.length && moreSlides.length)
    throw new Error("The slides share no format; choose a format every slide's template has");
  return {
    title:
      String(post.title ?? "")
        .trim()
        .slice(0, 120) || titleFrom(post, s),
    kind: s.kind,
    template: s.id,
    formats,
    content: carousel ? {} : only(post.content, s.fields),
    slides: carousel
      ? (post.slides ?? []).map((d) => ({ kind: d.kind, content: only(d.content, fieldsOf(s, d.kind)) }))
      : [],
    moreSlides,
    caption: Object.fromEntries(Object.entries(post.caption ?? {}).filter(([, t]) => String(t ?? "").trim())),
    altText: String(post.altText ?? ""),
    link: String(post.link ?? "").trim(),
    facts: [...new Set(post.facts ?? [])],
    campaign: post.campaign || null,
    brandVersion: post.brandVersion,
    check,
  };
}
```

(A one-slide post with no formats left keeps today's behaviour: the server answers 400 on `formats` min 1.)

In the comment above `convert`, add the sentence: "Extra slides do not come along: Convert makes a new post from slide 1."

- [ ] **Step 4: `recipe.d.ts`.** Add `import type { Page } from "./slides.js";` and `moreSlides: Page[];` to `Recipe` after `slides`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/recipe.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format && npm run typecheck && npm run format:check && npm test
git add src/web/studio/recipe.js src/web/studio/recipe.d.ts tests/recipe.test.ts
git commit -m "Send extra slides on save, with only shared formats"
```

---

### Task 4: Brand check over every slide

**Files:**
- Modify: `src/web/studio/brand-check.js` (`textsOf`, field sets in `runCheck`)
- Test: `tests/brand-check.test.ts`

**Interfaces:**
- Consumes: `pagesOf` from Task 1; `template` from templates.js.
- Produces: `runCheck` and `textsOf` handle `post.moreSlides`. Findings carry `slide` (0-based) when the post has more than one slide, and `null` for a one-slide post. A new error has code `missing-template`.

- [ ] **Step 1: Write the failing tests.** Add a `describe("multi-slide posts", …)` to `tests/brand-check.test.ts`. Reuse the inputs the existing `runCheck` tests pass for `settings`, `today` and `brand`; find a nearby call with `grep -n "runCheck({" tests/brand-check.test.ts`.

```ts
describe("multi-slide posts", () => {
  const settings = { ...DEFAULT_SETTINGS, channels: ["linkedin"], bannedWords: [] };
  const base = {
    template: "statement",
    formats: ["li-square"],
    content: { ground: "accent", headline: "One *two*", text: "" },
    slides: [],
    caption: {},
  };

  it("checks the fields of every slide with its own template, and names the slide", () => {
    const post = {
      ...base,
      moreSlides: [
        { template: "statistic", content: { headline: "Fine *here*" } },
        { template: "question", content: { headline: "No emphasis at all" } },
      ],
    };
    const r = runCheck({ post, template: template("statement")!, settings, today: "2026-10-05" });
    const emphasis = r.findings.find((b) => b.code === "emphasis" && b.level === "error");
    expect(emphasis).toMatchObject({ slide: 2 });
    expect(emphasis!.text).toMatch(/^Slide 3: /);
    expect(textsOf(post, template("statement")!).some((t) => t.where.startsWith("Slide 2,"))).toBe(true);
  });

  it("reads a one-slide post as before", () => {
    const r = runCheck({ post: { ...base, content: { headline: "None" } }, template: template("statement")!, settings, today: "2026-10-05" });
    expect(r.findings.find((b) => b.code === "emphasis" && b.level === "error")).toMatchObject({ slide: null });
  });

  it("gives an error for a slide whose template no longer exists", () => {
    const post = { ...base, moreSlides: [{ template: "own-deadbeef", content: {} }] };
    const r = runCheck({ post, template: template("statement")!, settings, today: "2026-10-05" });
    expect(r.findings).toContainEqual(
      expect.objectContaining({ level: "error", code: "missing-template", slide: 1 }),
    );
  });
});
```

If `runCheck` needs more inputs to run without throwing (see the existing tests), add them the same way.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/brand-check.test.ts -t "multi-slide"`
Expected: FAIL. Slides 2 and 3 are not checked, so there is no emphasis error with slide 2 and no `missing-template` finding.

- [ ] **Step 3: Implement.** In `brand-check.js` import `template as templateOf` from `./templates.js` (add to the existing import) and `import { pagesOf } from "./slides.js";`. Add one helper above `textsOf`:

```js
/**
 * The fields of a post per slide: `{ fields, content, slide, missing }`. `slide` is the index,
 * or null for a post that is one image (its findings then read as before). A slide whose own
 * template no longer exists has no fields and `missing: true`.
 */
function fieldSetsOf(post, s) {
  if (s.kind === "carousel")
    return (post.slides ?? []).map((d, i) => ({ fields: fieldsOf(s, d.kind), content: d.content ?? {}, slide: i, missing: false }));
  const pages = pagesOf(post);
  return pages.map((p, i) => {
    const t = i === 0 ? s : templateOf(p.template);
    return { fields: t?.fields ?? [], content: p.content ?? {}, slide: pages.length > 1 ? i : null, missing: !t };
  });
}
```

In `textsOf`, replace

```js
  if (s.kind === "carousel") {
    (post.slides ?? []).forEach((d, i) => fields(fieldsOf(s, d.kind), d.content, i));
  } else fields(s.fields, post.content, null);
```

with

```js
  for (const set of fieldSetsOf(post, s)) fields(set.fields, set.content, set.slide);
```

In `runCheck`, replace the `const fieldSets = …;` expression with `const fieldSets = fieldSetsOf(post, s);`, and as the first statement inside the `for (const { fields, content, slide } of fieldSets)` loop (destructure `missing` too):

```js
    if (missing) {
      add("error", "missing-template", `Slide ${slide + 1}: its template no longer exists; delete this slide`, { slide });
      continue;
    }
```

Update the JSDoc of `textsOf` ("per slide for a carousel" → "per slide when a post has more than one").

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/brand-check.test.ts`
Expected: PASS (the old carousel tests included).

- [ ] **Step 5: Commit**

```bash
npm run format && npm run typecheck && npm run format:check && npm test
git add src/web/studio/brand-check.js tests/brand-check.test.ts
git commit -m "Brand check every slide with its own template"
```

---

### Task 5: Export and post cards through `imagesOf`

**Files:**
- Modify: `src/web/studio/export-ui.js` (whole file below)
- Modify: `src/web/studio/post-cards.js` (`postCard`, `drawArtwork`)
- Modify: `src/web/studio/editor.js` only the three export calls in `exportAs` (`editor.js:~1478-1480`), so the editor keeps working until Task 6

**Interfaces:**
- Consumes: `imagesOf`, `imageTasks`, `pdfFormat`, `slideNumber`, `isCarousel`, `mediaIdsOf` from Task 1.
- Produces, with new signatures (the template parameter `s` is gone):
  - `allImages(post, brand, progress?)`
  - `exportPng(post, brand, key, slide, campaign)`
  - `exportZip(post, brand, campaign, progress?)`
  - `exportPdf(post, brand, campaign, progress?)`

These browser-only modules have no unit tests. The enumeration logic is covered by `imageTasks` and `pdfFormat` (Task 1), and the browser test in Task 7 exports a ZIP.

- [ ] **Step 1: Replace `export-ui.js` from the `async function bytes` line down** (keep `captionFile` as it is):

```js
// Exporting: one PNG, all formats as a ZIP, and a PDF for LinkedIn.
// Everything happens in the browser: no upload, no body limit, and what you download is
// what the preview showed.
import { buildImage } from "/studio/templates.js";
import { fileName, format as formatOf, slugOf, CHANNELS } from "/studio/formats.js";
import { download, renderToBlob } from "/studio/render.js";
import { createZip } from "/studio/zip.js";
import { createPdf } from "/studio/pdf.js";
import { loadMedia } from "/studio/brand.js";
import { imagesOf, imageTasks, isCarousel, mediaIdsOf, pdfFormat, slideNumber } from "/studio/slides.js";

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// captionFile stays here unchanged.

/**
 * All images of a post: per format, every slide.
 * @param {(step: number, total: number) => void} progress
 */
export async function allImages(post, brand, progress = () => {}) {
  const media = await loadMedia(mediaIdsOf(post));
  const tasks = imageTasks(post);
  const out = [];
  for (const [i, t] of tasks.entries()) {
    progress(i + 1, tasks.length);
    out.push({ format: t.format, slide: t.slide, image: buildImage({ ...t.image, format: t.format, brand, media }) });
  }
  return out;
}

/**
 * The start of the name of a zip or pdf: `<brand>_<campaign>_<post>`; empty parts are
 * dropped.
 */
const baseName = (brand, campaign, title, fallback) =>
  [slugOf(brand.name), slugOf(campaign), slugOf(title) || fallback].filter(Boolean).join("_");

const pdfName = (post, brand, campaign) =>
  isCarousel(post)
    ? `${baseName(brand, campaign, post.title, "carousel")}_carousel.pdf`
    : `${baseName(brand, campaign, post.title, "post")}_document.pdf`;

export async function exportPng(post, brand, key, slide, campaign) {
  const media = await loadMedia(mediaIdsOf(post));
  const image = buildImage({ ...imagesOf(post)[slide], format: key, brand, media });
  const name = fileName({ brand: brand.name, campaign, post: post.title, format: key, slide: slideNumber(post, slide) });
  download(await renderToBlob(image), name, "image/png");
}

export async function exportZip(post, brand, campaign, progress) {
  const images = await allImages(post, brand, () => {});
  const files = [];
  for (const [i, b] of images.entries()) {
    progress?.(i + 1, images.length);
    files.push({
      name: fileName({ brand: brand.name, campaign, post: post.title, format: b.format, slide: b.slide }),
      bytes: await bytes(await renderToBlob(b.image)),
    });
  }
  if (pdfFormat(post)) files.push({ name: pdfName(post, brand, campaign), bytes: await documentPdf(post, brand, () => {}) });
  files.push({ name: "caption.txt", bytes: captionFile(post) });
  const { history: _dropped, ...recipe } = post;
  files.push({ name: "recipe.json", bytes: `${JSON.stringify(recipe, null, 2)}\n` });
  download(createZip(files), `${baseName(brand, campaign, post.title, "post")}.zip`, "application/zip");
}

/** Every slide as a page of one PDF, in the format `pdfFormat` picks. */
async function documentPdf(post, brand, progress) {
  const key = pdfFormat(post);
  if (!key) throw new Error("This post has no LinkedIn format for a PDF");
  const media = await loadMedia(mediaIdsOf(post));
  const f = formatOf(key);
  const images = imagesOf(post);
  const pages = [];
  for (const [i, args] of images.entries()) {
    progress(i + 1, images.length);
    const image = buildImage({ ...args, format: key, brand, media });
    pages.push({ jpeg: await bytes(await renderToBlob(image, "image/jpeg", 0.92)), width: f.width, height: f.height });
  }
  return createPdf(pages, { title: post.title });
}

export async function exportPdf(post, brand, campaign, progress) {
  download(await documentPdf(post, brand, progress), pdfName(post, brand, campaign), "application/pdf");
}
```

(Put `captionFile` back exactly where the comment says; do not change it.)

- [ ] **Step 2: Editor export calls** (`exportAs` in `editor.js`), temporarily with `state.post`:

```js
      if (kind === "png") await exportPng(state.post, ctx.brand, state.format, state.slide, campaignName());
      else if (kind === "zip") await exportZip(state.post, ctx.brand, campaignName(), progress);
      else await exportPdf(state.post, ctx.brand, campaignName(), progress);
```

- [ ] **Step 3: `post-cards.js`.** Import `import { imagesOf, mediaIdsOf } from "/studio/slides.js";`. In `drawArtwork` replace the `ids` line and the `buildImage({...})` call with:

```js
            const media = await loadMedia(mediaIdsOf(p));
            const image = buildImage({ ...imagesOf(p)[0], format: p.formats[0], brand, media });
```

In `postCard`, show the slide count beside the status (library and overview both use it):

```js
  const count = imagesOf(p).length;
  …
    el("div", { class: "studio-post-status" }, [
      statusBadge(p.status),
      count > 1 ? el("span", { class: "badge", text: `${count} slides` }) : null,
      side,
    ]),
```

- [ ] **Step 4: Verify.** Run `npm run typecheck && npm run format:check && npm test`; all green. Then start the studio (`npm start`, see the port in the output) and in the browser export a ZIP of an existing carousel post. It must still contain the PNGs `_slide-01…` and `_carousel.pdf`. A sample image post must still export one PNG per format with no slide suffix.

- [ ] **Step 5: Commit**

```bash
git add src/web/studio/export-ui.js src/web/studio/post-cards.js src/web/studio/editor.js
git commit -m "Export and draw post cards through imagesOf; a PDF for multi-slide LinkedIn posts"
```

---

### Task 6: The editor: slides for every post

**Files:**
- Modify: `src/web/studio/editor.js` (`showEditor`, `editor.js:108-1493`)
- Modify: `src/web/studio/writing-help-ui.js` (`currentContent`, `writingHelpPanel` parameters)
- Modify: `src/web/studio.css` only if the slide-actions row needs room for the extra select (reuse `.studio-slide-add` for the "Change template" row)

**Interfaces:**
- Consumes: from Task 1 `MAX_SLIDES`, `pagesOf`, `fromPages`, `imagesOf`, `sharedFormats`, `slideTemplates`, `narrowFormats`, `changeSlideTemplate`, `mediaIdsOf`, `pdfFormat`. From Task 3 `toInput(post, s, check)`. From Task 5 the export signatures.
- Produces: an editor in which `state.pages` is the source of truth for an image post's slides. Element ids for the browser test: `#new-slide` (template choice for a new slide), button text "Add slide"; `#slide-template` (template choice for the chosen slide), button text "Change template"; the slide list `ol.studio-slide-list`, with each item's button text `"<n>. <template name>[: headline]"` or `"<n>. Template missing"`.

The carousel keeps every behaviour it has. Each change below says what replaces what.

- [ ] **Step 1: State and accessors.** At the top of `showEditor`, after `const s = …`:

```js
  const carousel = s.kind === "carousel";
```

Add `pages: carousel ? [] : pagesOf(begin),` to `state`. Replace the three accessor lines (`slides`, `currentContent`, `currentFields`) with:

```js
  const slides = () => state.post.slides ?? [];
  /** The template of a slide of an image post (undefined when its own template is gone); the carousel otherwise. */
  const slideTemplate = (i = state.slide) => (carousel ? s : templateOf(state.pages[i]?.template));
  /** The post as it is now, with the slides of an image post folded back in. */
  const postNow = () => (carousel ? state.post : { ...state.post, ...fromPages(state.pages) });
  const slideCount = () => (carousel ? slides().length : state.pages.length);
  const currentContent = () =>
    carousel ? (slides()[state.slide]?.content ?? {}) : (state.pages[state.slide]?.content ?? {});
  const currentFields = () => (carousel ? fieldsOf(s, slides()[state.slide]?.kind) : (slideTemplate()?.fields ?? []));
```

Add `MAX_SLIDES, pagesOf, fromPages, imagesOf, sharedFormats, slideTemplates, narrowFormats, changeSlideTemplate, mediaIdsOf, pdfFormat` as an import from `/studio/slides.js`.

- [ ] **Step 2: Formats as a render function.** Replace the `formatChoice` construction with an empty fieldset plus `renderFormats()`:

```js
  const formatOptions = el("div", { class: "studio-choice-options" });
  const formatChoice = el("fieldset", { class: "studio-choice", id: "field-formats" }, [
    el("legend", { text: "Formats" }),
    formatOptions,
  ]);
```

and in the render section:

```js
  function renderFormats() {
    const own = carousel ? s.formats : (slideTemplate(0)?.formats ?? []);
    const shared = carousel ? s.formats : sharedFormats(state.pages.map((p) => p.template));
    formatOptions.replaceChildren(
      ...own.map((f) => {
        const off = !ctx.settings.formats.includes(f);
        const notShared = !shared.includes(f);
        const control = el("input", {
          type: "checkbox",
          value: f,
          ...(state.post.formats.includes(f) ? { checked: "" } : {}),
          ...(notShared ? { disabled: "" } : {}),
        });
        control.addEventListener("change", () => {
          const chosen = new Set(state.post.formats);
          if (control.checked) chosen.add(f);
          else chosen.delete(f);
          state.post.formats = own.filter((x) => chosen.has(x));
          if (!state.post.formats.includes(state.format)) state.format = state.post.formats[0] ?? own[0];
          renderTabs();
          changed();
        });
        const note = notShared ? " (not in every slide)" : off ? " (off in Settings)" : "";
        return el("label", { class: "studio-radio" }, [control, el("span", { text: `${formatOf(f).name}${note}` })]);
      }),
    );
  }
```

Call `renderFormats()` first in `renderAll()`. In `renderTabs`, replace `[s.formats[0]]` with `[(slideTemplate(0) ?? s).formats[0]]`.

- [ ] **Step 3: One helper to change the formats after a slide joins:**

```js
  /** A slide with this template joins: keep only the formats it shares, and say what dropped. */
  function joinFormats(templateId) {
    const { formats, dropped } = narrowFormats(state.post.formats, templateId);
    if (!dropped.length) return;
    state.post.formats = formats;
    if (!formats.includes(state.format)) state.format = formats[0];
    const name = templateOf(templateId)?.name ?? templateId;
    notice(`${dropped.map((f) => formatOf(f).name).join(", ")} off: ${name} does not have ${dropped.length === 1 ? "it" : "them"}`);
  }
```

`slideTemplates(state.post.formats)` only offers templates that share at least one format, so `formats` is never empty here.

- [ ] **Step 4: The slide list for image posts.** Rename the current `renderSlides` body to `renderCarouselSlides()`. Make `renderSlides()` call either `renderCarouselSlides()` or the new `renderPages()`:

```js
  function renderSlides() {
    if (carousel) renderCarouselSlides();
    else renderPages();
  }

  function renderPages() {
    const pages = state.pages;
    const n = pages.length;
    const i = state.slide;
    const button = (text, action, off = false) =>
      el("button", { type: "button", class: "secondary small", text, ...(off ? { disabled: "" } : {}), onclick: action });
    // A slide whose own template is gone must never become slide 1: slide 1 is the post's
    // template, and the editor cannot open a post without one.
    const leaderAfter = (from, to) => (to === 0 ? pages[from] : from === 0 ? pages[to] : pages[0]);
    const canMove = (d) => i + d >= 0 && i + d < n && Boolean(templateOf(leaderAfter(i, i + d)?.template));
    const choices = (id, label, exclude) =>
      el(
        "select",
        { id, "aria-label": label },
        slideTemplates(state.post.formats)
          .filter((t) => t.id !== exclude)
          .map((t) => el("option", { value: t.id, text: templateLabel(t) })),
      );
    const newChoice = choices("new-slide", "Template of the new slide", null);
    const add = button("Add slide", () => {
      const t = templateOf(newChoice.value);
      if (!t) return;
      joinFormats(t.id);
      pages.splice(i + 1, 0, { template: t.id, content: defaultContent(t) });
      state.slide = i + 1;
      renderAll();
      changed();
    }, n >= MAX_SLIDES);
    const addRow = el("div", { class: "studio-slide-add" }, [newChoice, add]);
    if (n === 1) {
      slideHolder.replaceChildren(el("h2", { text: "Slides" }), addRow);
      return;
    }
    const list = el(
      "ol",
      { class: "studio-slide-list", "aria-label": "Slides" },
      pages.map((p, k) => {
        const t = templateOf(p.template);
        const name = t
          ? `${t.name}${p.content?.headline ? `: ${withoutEmphasis(p.content.headline)}` : ""}`
          : "Template missing";
        const choose = el("button", {
          type: "button",
          class: `button-plain studio-slide${k === i ? " active" : ""}`,
          "aria-current": k === i ? "true" : "false",
          title: name,
          text: `${k + 1}. ${name}`,
        });
        choose.addEventListener("click", () => {
          state.slide = k;
          renderAll();
        });
        return el("li", {}, [choose]);
      }),
    );
    const missing = !slideTemplate(i);
    const actions = el("div", { class: "studio-slide-actions", role: "group", "aria-label": `Slide ${i + 1}` }, [
      missing ? null : button("↑ Up", () => {
        state.slide = moveSlide(pages, i, -1);
        renderAll();
        changed();
      }, !canMove(-1)),
      missing ? null : button("↓ Down", () => {
        state.slide = moveSlide(pages, i, 1);
        renderAll();
        changed();
      }, !canMove(1)),
      missing ? null : button("Duplicate", () => {
        pages.splice(i + 1, 0, structuredClone(pages[i]));
        state.slide = i + 1;
        renderAll();
        changed();
      }, n >= MAX_SLIDES),
      button("Delete", () => {
        pages.splice(i, 1);
        state.slide = Math.min(i, pages.length - 1);
        renderAll();
        changed();
      }, i === 0 && !templateOf(pages[1]?.template)),
    ]);
    const changeChoice = choices("slide-template", "Other template for this slide", pages[i].template);
    const change = button("Change template", () => {
      const id = changeChoice.value;
      if (!id) return;
      joinFormats(id);
      pages[i] = changeSlideTemplate(pages[i], id);
      renderAll();
      changed();
    });
    slideHolder.replaceChildren(
      el("h2", { text: "Slides" }),
      list,
      actions,
      missing ? null : el("div", { class: "studio-slide-add" }, [changeChoice, change]),
      addRow,
    );
  }
```

`templateLabel` is already used by `convertField`; check that it is imported or defined in `editor.js` (`grep -n "templateLabel" src/web/studio/editor.js`). If it is not, import it from where `convertField` gets it. Make `slideHolder` always part of the left column: replace `s.kind === "carousel" ? slideHolder : null` with `slideHolder`.

- [ ] **Step 5: Fields for a slide whose template is gone.** At the start of `renderFields()`:

```js
    if (!carousel && !slideTemplate()) {
      fieldsHolder.replaceChildren(
        el("p", {
          class: "studio-warning",
          text: "This slide's template no longer exists. Delete the slide to export the post.",
        }),
      );
      return;
    }
```

In the headline auto-title condition, replace `(s.kind !== "carousel" || state.slide === 0)` with `state.slide === 0`.

- [ ] **Step 6: Images through `imagesOf`.**
  - `currentImage()`:

    ```js
      function currentImage() {
        return buildImage({ ...imagesOf(postNow())[state.slide], format: state.format, brand: ctx.brand, media: state.media });
      }
    ```

  - In `renderPreview`, replace both `s.kind === "carousel"` tests with `slideCount() > 1`. In the label, use `, slide ${state.slide + 1}`. Add an `else slideNav.replaceChildren();` after the nav block, so the nav disappears when the post is back to one slide.
  - In `renderFeed`, replace the `buildImage({...})` argument with `{ ...imagesOf(postNow())[0], format: f, brand: ctx.brand, media: state.media }`, and the line under the image with:

    ```js
              carousel
                ? el("p", { class: "studio-feed-below", text: `Document · ${slides().length} pages` })
                : slideCount() > 1
                  ? el("p", { class: "studio-feed-below", text: `${slideCount()} slides` })
                  : null,
    ```

  - `measureAll()`:

    ```js
      async function measureAll() {
        const images = imagesOf(postNow());
        const numbered = carousel || images.length > 1;
        const names = {};
        const out = [];
        for (const f of state.post.formats) {
          for (const args of images) {
            const fields = carousel ? fieldsOf(s, slides()[args.slide]?.kind) : (templateOf(args.template)?.fields ?? []);
            // "the headline", but "item 2": a numbered label has no article.
            for (const v of fields) names[v.id] = `${/\d$/.test(v.label) ? "" : "the "}${v.label.toLowerCase()}`;
            try {
              const image = buildImage({ ...args, format: f, brand: ctx.brand, media: state.media });
              out.push(...(await measureOverflow(image, formatOf(f), { slide: numbered ? args.slide : null, names })));
            } catch {
              /* an image that cannot be built is already reported by renderPreview */
            }
          }
        }
        if (!ctx.valid()) return;
        state.overflow = out;
        renderCheck();
      }
    ```

  - `loadImages()`: `state.media = { ...state.media, ...(await loadMedia(mediaIdsOf(postNow()))) };`

- [ ] **Step 7: Check, save, export, alt text, Convert.**
  - `currentCheck()`: `post: postNow(), template: slideTemplate(0) ?? s,`.
  - `save()`: `const input = toInput(postNow(), slideTemplate(0) ?? s, { … });`. `toInput` can now throw "The slides share no format". Check that `save()`'s `try` has a `catch` that shows `notice(e.message, "error")`. If it does not, add one in the same style as `exportAs`. After a successful save `state.pages` stays as it is: it is the editor's source of truth, and the response only refreshes the rest of `state.post`.
  - `exportAs`: pass `postNow()` instead of `state.post` in the three calls from Task 5.
  - Export buttons: keep references `const pngButton = el(...)` and `const pdfButton = el(...)`. Always create the PDF button, and in `renderAll()` set:

    ```js
        pngButton.textContent = slideCount() > 1 ? "This slide as PNG" : "This format as PNG";
        pdfButton.hidden = !pdfFormat(postNow());
    ```

  - `altFromImage`: replace the `const i = …` line with `const i = carousel ? (slides()[0]?.content ?? {}) : state.pages[0].content;`, and replace `s.name` with `(slideTemplate(0) ?? s).name`.
  - `convertField`: call `convert(postNow(), …)` and filter on `x.id !== state.pages[0]?.template && x.id !== s.id` (a new post from slide 1, as the spec says).

- [ ] **Step 8: Writing help reads the chosen slide.** In `writing-help-ui.js`, change the parameter `template` to a getter, and add `currentValues`:

```js
/** The content already filled in on the slide, for the task: only the fields the help knows. */
function currentContent(values, post, fields, channel) {
  const field = Object.fromEntries(
    fields.map((v) => [v.id, String(values?.[v.id] ?? "")]).filter(([, t]) => t.trim()),
  );
  return { fields: field, caption: post.caption?.[channel] ?? "", altText: post.altText ?? "" };
}
```

In `writingHelpPanel({ ctx, template, currentFields, currentValues, currentPost, … })`, send `template: template().name` and `current: currentContent(currentValues(), post, fields, currentChannel())`. In `editor.js`, pass `template: () => slideTemplate() ?? s,` and `currentValues: () => currentContent(),`. If the panel uses `template` anywhere else, call it there too (`grep -n "template" src/web/studio/writing-help-ui.js`).

- [ ] **Step 9: Remaining `s.kind === "carousel"` in the editor.** Run `grep -n 's.kind === "carousel"\|s.kind !== "carousel"' src/web/studio/editor.js`. Each remaining one is either carousel-only by nature (carousel PDF wording, the carousel list) or must use `carousel` / `slideCount()` as above. Replace them with the `carousel` constant.

- [ ] **Step 10: Verify.** Run `npm run typecheck && npm run format:check && npm test`; all green, including `tests/own-template-browser.test.ts`, `tests/mobile.test.ts` and `tests/project-ui.test.ts` (real Chrome). Then do a manual pass with `npm start` in the browser:
  1. Make a new Statement post and add a Statistic slide and a Question slide. Story drops out with a notice.
  2. Move the Question slide to position 1 and check that the format checkboxes follow.
  3. Change slide 2's template.
  4. Save and reload; the order and templates are kept.
  5. Export the ZIP and check the PNGs per slide and the PDF `_document.pdf`.
  6. Open an existing carousel post: nothing has changed.
  7. Look at phone width (390 px): the slide list and its selects fit.

- [ ] **Step 11: Commit**

```bash
git add src/web/studio/editor.js src/web/studio/writing-help-ui.js src/web/studio.css
git commit -m "Editor: slides with their own template for every post"
```

---

### Task 7: Browser test for multi-slide posts

**Files:**
- Create: `tests/slides-browser.test.ts`

**Interfaces:**
- Consumes: the element ids from Task 6 (`#new-slide`, "Add slide", `#slide-template`, "Change template", `ol.studio-slide-list`); `startStudio` from `tests/helpers/studio.ts`.

- [ ] **Step 1: Write the test**

```ts
// Posts with several slides in a real Chrome: add slides with their own template, move one to
// the front, save and reopen; and a slide whose own template is gone does not break the editor.
// Chrome is the installed one; without it the file is skipped on a developer machine and fails in CI.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { startStudio } from "./helpers/studio.js";

const browser: Browser | null = await chromium.launch({ channel: "chrome" }).catch((error: Error) => {
  if (process.env.CI) throw error;
  console.warn(`slides-browser.test.ts skipped: Google Chrome could not be started (${error.message.split("\n")[0]}).`);
  return null;
});

let studio: Awaited<ReturnType<typeof startStudio>>;

beforeAll(async () => {
  if (!browser) return;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  studio = await startStudio();
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

const slideTexts = (page: Page) => page.locator("ol.studio-slide-list li button").allInnerTexts();

describe.skipIf(!browser)("posts with several slides", () => {
  it("adds slides with their own template, moves one to the front, and keeps it after saving", async () => {
    const page = await open("editor/new/statement");
    try {
      await page.selectOption("#new-slide", "statistic");
      await page.getByRole("button", { name: "Add slide" }).click();
      await page.selectOption("#new-slide", "question");
      await page.getByRole("button", { name: "Add slide" }).click();
      expect((await slideTexts(page)).map((t) => t.split(":")[0])).toEqual(["1. Statement", "2. Statistic", "3. Question"]);
      // Question has no Story format: Story is off now.
      expect(await page.locator('#field-formats input[value="story"]').isChecked()).toBe(false);

      await page.getByRole("button", { name: "↑ Up" }).click();
      await page.getByRole("button", { name: "↑ Up" }).click();
      expect((await slideTexts(page))[0]).toMatch(/^1\. Question/);

      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForFunction(() => /#editor\/[^/]+$/.test(location.hash) && !location.hash.includes("new"));
      const id = (await page.evaluate(() => location.hash)).split("/")[1];
      const saved = await (await fetch(`${studio.base}/api/posts/${id}`)).json();
      expect(saved.template).toBe("question");
      expect(saved.moreSlides.map((d: { template: string }) => d.template)).toEqual(["statement", "statistic"]);

      await page.reload();
      await page.waitForSelector("ol.studio-slide-list");
      expect((await slideTexts(page)).map((t) => t.split(":")[0])).toEqual(["1. Question", "2. Statement", "3. Statistic"]);
    } finally {
      await page.close();
    }
  });

  it("opens a post with a slide whose own template is gone, and says so", async () => {
    const r = await fetch(`${studio.base}/api/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Gone",
        kind: "image",
        template: "statement",
        formats: ["li-square"],
        content: { headline: "Still *here*" },
        moreSlides: [{ template: "own-deadbeef", content: { headline: "Old" } }],
        brandVersion: "test-1.0",
      }),
    });
    expect(r.status).toBe(201);
    const { id } = await r.json();
    const page = await open(`editor/${id}`);
    try {
      expect(await slideTexts(page)).toEqual([expect.stringMatching(/^1\. Statement/), "2. Template missing"]);
      await page.locator("ol.studio-slide-list li button").nth(1).click();
      expect(await page.locator(".studio-fields").innerText()).toMatch(/no longer exists/);
      expect(await page.locator(".studio-check").innerText()).toMatch(/no longer exists/);
      expect(await page.getByRole("button", { name: "↑ Up" }).count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
```

If the project needs a header for API calls (`projectHeaders()` in the studio; look at how `tests/own-template-browser.test.ts` or `tests/routes.test.ts` call the API), add the same header to the two `fetch` calls.

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/slides-browser.test.ts`
Expected: PASS. If it fails, fix the editor (Task 6 code), not the test, unless the test uses a selector that differs from the real markup.

- [ ] **Step 3: Commit**

```bash
npm run format && npm run typecheck && npm run format:check && npm test
git add tests/slides-browser.test.ts
git commit -m "Browser test: posts with several slides"
```

---

### Task 8: Docs and handover

**Files:**
- Modify: `README.md` (what it does: one line on slides; keep it under ~700 words)
- Modify: `PRODUCT.md` if it lists post features (one line)
- Create: `docs/multi-slide-handover.md`

- [ ] **Step 1: README.** In the "what it does" list, add one line in the same style: posts can have up to 20 slides, each with its own template, exported as PNGs per slide and a PDF for LinkedIn. Check the word count: `wc -w README.md`.

- [ ] **Step 2: Handover** `docs/multi-slide-handover.md`, in the style of `docs/phase-5-handover.md`:
  - What is in it, with file names: `slides.js`, `moreSlides` in the schema, the editor.
  - What was checked: the tests, and the browser pass from Task 6, step 10.
  - What is open: the items under "Out of scope on purpose" in the spec, and anything found during the browser pass.

- [ ] **Step 3: Final check and commit**

```bash
npm run typecheck && npm run format:check && npm test
git add README.md PRODUCT.md docs/multi-slide-handover.md
git commit -m "Document posts with several slides"
```
