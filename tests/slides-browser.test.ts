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
      expect((await slideTexts(page)).map((t) => t.split(":")[0])).toEqual([
        "1. Statement",
        "2. Statistic",
        "3. Question and answer",
      ]);
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
      expect((await slideTexts(page)).map((t) => t.split(":")[0])).toEqual([
        "1. Question and answer",
        "2. Statement",
        "3. Statistic",
      ]);
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
      expect(await page.getByRole("list", { name: "Brand check result" }).innerText()).toMatch(/no longer exists/);
      expect(await page.getByRole("button", { name: "↑ Up" }).count()).toBe(0);

      // Export refuses before the "Export anyway?" dialog: it could only fail on that slide.
      await page.getByRole("button", { name: "Everything as ZIP" }).click();
      await page
        .locator("#notices")
        .getByText("Slide 2: its template no longer exists; delete it first")
        .waitFor({ timeout: 5000 });
      expect(await page.getByRole("button", { name: "Export anyway" }).count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
