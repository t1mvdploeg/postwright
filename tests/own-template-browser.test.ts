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
