// The studio on a phone and a tablet, in a real Chrome: no sideways scrolling, no keyboard focus
// on things that cannot be seen, and a menu that closes with Escape. Chrome is the installed
// one (playwright-core downloads no browser). Without Chrome the file is skipped on a developer
// machine and fails in CI.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { startStudio } from "./helpers/studio.js";

const browser: Browser | null = await chromium.launch({ channel: "chrome" }).catch((error: Error) => {
  if (process.env.CI) throw error;
  console.warn(`mobile.test.ts skipped: Google Chrome could not be started (${error.message.split("\n")[0]}).`);
  return null;
});

let studio: Awaited<ReturnType<typeof startStudio>>;
let postId = "";

beforeAll(async () => {
  if (!browser) return;
  studio = await startStudio();
  const json = { "content-type": "application/json" };
  await fetch(`${studio.base}/api/sample-content`, { method: "POST", headers: json, body: "{}" });
  postId = (await (await fetch(`${studio.base}/api/posts`)).json()).posts[0].id;
  // A proposal for the Templates screen to show: without an API key it is the fixed sample.
  const input = { texts: "A post", brief: "Bold statements", kind: "image", formats: ["li-square", "story"] };
  await fetch(`${studio.base}/api/template-input`, { method: "PUT", headers: json, body: JSON.stringify(input) });
  await fetch(`${studio.base}/api/template-generate`, { method: "POST", headers: json, body: "{}" });
});
afterAll(async () => {
  await studio?.close();
  await browser?.close();
});

const SCREENS = () => [
  ["overview", "overview"],
  ["all posts", "library"],
  ["planner", "planning"],
  ["editor", `editor/${postId}`],
  ["brand kit", "brand-kit"],
  ["templates, with a proposal showing", "templates"],
  ["fact bank", "facts"],
  ["snippets", "snippets"],
  ["settings", "settings"],
];

async function open(width: number, height: number, route: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height } });
  await page.goto(`${studio.base}/#${route}`);
  await page.waitForSelector("#studio-nav a", { state: "attached" });
  await page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });
  await page.waitForLoadState("networkidle");
  return page;
}

const sideways = (page: Page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));

describe.skipIf(!browser)("studio on a phone (375 x 812)", () => {
  for (const [name, route] of SCREENS()) {
    it(`${name}: no sideways scrolling`, async () => {
      const page = await open(375, 812, route);
      try {
        const { scrollWidth, width } = await sideways(page);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      } finally {
        await page.close();
      }
    });

    it(`${name}: Tab never lands on something out of sight`, async () => {
      const page = await open(375, 812, route);
      try {
        const problems: string[] = [];
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press("Tab");
          const found = await page.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return null;
            const r = e.getBoundingClientRect();
            const hidden = getComputedStyle(e).visibility === "hidden";
            const label = `${e.tagName.toLowerCase()}#${e.id}.${String(e.getAttribute("class"))} "${(e.textContent ?? "").trim().slice(0, 30)}"`;
            if (r.width === 0 || r.height === 0 || hidden) return `${label} is invisible`;
            if (r.right <= 0 || r.left >= window.innerWidth)
              return `${label} is off-screen (left ${Math.round(r.left)})`;
            return null;
          });
          if (found) problems.push(`Tab ${i + 1}: ${found}`);
        }
        expect(problems).toEqual([]);
      } finally {
        await page.close();
      }
    });
  }

  it("the menu opens with focus inside it, and Escape closes it and returns focus to the Menu button", async () => {
    const page = await open(375, 812, "overview");
    try {
      await page.click("#studio-menu");
      await expect(page.locator("#studio-sidebar.open").count()).resolves.toBe(1);
      expect(
        await page.evaluate(() => document.getElementById("studio-sidebar")!.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator("#studio-sidebar.open").count()).resolves.toBe(0);
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("studio-menu");
      expect(await page.getAttribute("#studio-menu", "aria-expanded")).toBe("false");
    } finally {
      await page.close();
    }
  });
});

describe.skipIf(!browser)("post actions on a phone", () => {
  it("sit in a menu that Escape and a click elsewhere close", async () => {
    const page = await open(375, 812, "library");
    try {
      const summary = page.locator(".post-menu summary").first();
      const menu = page.locator(".post-menu").first();
      await summary.click();
      expect(await menu.evaluate((m) => (m as HTMLDetailsElement).open)).toBe(true);
      expect(
        await page
          .getByRole("button", { name: /^Delete/ })
          .first()
          .isVisible(),
      ).toBe(true);
      await page.keyboard.press("Escape");
      expect(await menu.evaluate((m) => (m as HTMLDetailsElement).open)).toBe(false);
      expect(await summary.evaluate((e) => e === document.activeElement)).toBe(true);
      await summary.click();
      await page.click("h1");
      expect(await menu.evaluate((m) => (m as HTMLDetailsElement).open)).toBe(false);
    } finally {
      await page.close();
    }
  });
});

describe.skipIf(!browser)("studio on a tablet (820 x 1180)", () => {
  for (const [name, route] of SCREENS()) {
    it(`${name}: no sideways scrolling`, async () => {
      const page = await open(820, 1180, route);
      try {
        const { scrollWidth, width } = await sideways(page);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      } finally {
        await page.close();
      }
    });
  }
});

describe.skipIf(!browser)("the editor on a phone and a tablet", () => {
  const inView = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    }, selector);

  it("keeps Save and the brand check in view at the bottom of the fields (375)", async () => {
    const page = await open(375, 812, `editor/${postId}`);
    try {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await inView(page, "#studio-main .studio-editor-bar button")).toBe(true);
      expect(await inView(page, ".studio-bar-check")).toBe(true);
      expect(await page.textContent(".studio-bar-check")).toMatch(/^Brand check: /);
      // The bar must not cover the last field: the end of the page is clear of it.
      const clear = await page.evaluate(() => {
        const bar = document.querySelector(".studio-editor-bar")!.getBoundingClientRect();
        const last = [
          ...document.querySelectorAll(".studio-editor > :not([style*='none']) :is(input,button,summary,label)"),
        ]
          .filter((e) => (e as HTMLElement).offsetParent)
          .pop()!;
        return last.getBoundingClientRect().bottom <= bar.top;
      });
      expect(clear).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("shows the preview in a tab, with arrow keys moving between the tabs (375)", async () => {
    const page = await open(375, 812, `editor/${postId}`);
    try {
      expect(await page.locator("#editor-tab-fields").getAttribute("aria-selected")).toBe("true");
      expect(await page.locator(".studio-preview").first().isVisible()).toBe(false);
      await page.focus("#editor-tab-fields");
      await page.keyboard.press("ArrowRight");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("editor-tab-preview");
      expect(await page.locator("#editor-tab-preview").getAttribute("aria-selected")).toBe("true");
      expect(await page.locator(".studio-preview").first().isVisible()).toBe(true);
      const box = await page.locator(".studio-preview").first().boundingBox();
      expect(box!.width).toBeGreaterThan(200);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      await page.keyboard.press("End");
      expect(await page.locator("#editor-tab-caption").getAttribute("aria-selected")).toBe("true");
      expect(await page.locator("#field-altText").isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("keeps the preview live while you type in Fields (375)", async () => {
    const page = await open(375, 812, `editor/${postId}`);
    try {
      await page.fill("#field-headline", "Typed on a phone");
      await page.click("#editor-tab-preview");
      await page.waitForFunction(() =>
        document.querySelector(".studio-preview")?.getAttribute("aria-label")?.includes("Typed on a phone"),
      );
    } finally {
      await page.close();
    }
  });

  for (const [width, height] of [
    [375, 812],
    [820, 1180],
  ]) {
    it(`has no sideways scrolling in any tab (${width})`, async () => {
      const page = await open(width, height, `editor/${postId}`);
      try {
        for (const tab of width < 701 ? ["fields", "preview", "caption"] : [null]) {
          if (tab) await page.click(`#editor-tab-${tab}`);
          const { scrollWidth, width: w } = await sideways(page);
          expect(scrollWidth).toBeLessThanOrEqual(w);
        }
      } finally {
        await page.close();
      }
    });
  }

  it("lays out the tablet in two columns without a nested scroll box for the facts (820)", async () => {
    const page = await open(820, 1180, `editor/${postId}`);
    try {
      const [fields, preview] = await Promise.all(
        ["#editor-panel-fields", "#editor-panel-preview"].map((s) => page.locator(s).boundingBox()),
      );
      expect(preview!.x).toBeGreaterThan(fields!.x + fields!.width - 1);
      expect(await page.locator(".studio-editor-tabs").isVisible()).toBe(false);
      expect(await inView(page, ".studio-editor-bar button")).toBe(true);
      const overflow = await page.locator(".studio-fact-list").evaluate((e) => getComputedStyle(e).overflowY);
      expect(overflow).toBe("visible");
    } finally {
      await page.close();
    }
  });

  it("still saves with Ctrl+S on a phone", async () => {
    const page = await open(375, 812, `editor/${postId}`);
    try {
      await page.fill("#field-title", "Saved with the keyboard");
      expect(await page.textContent(".studio-save-status")).toBe("Not saved");
      await page.keyboard.press("Control+s");
      await page.waitForFunction(() =>
        document.querySelector(".studio-save-status")?.textContent?.startsWith("Saved at"),
      );
      const saved = await (await fetch(`${studio.base}/api/posts/${postId}`)).json();
      expect(saved.title).toBe("Saved with the keyboard");
    } finally {
      await page.close();
    }
  });
});
