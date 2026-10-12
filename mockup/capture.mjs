// Run only when browser access is available. The app must use disposable sample data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const screens = fileURLToPath(new URL("screens/", import.meta.url));
const temporary = fileURLToPath(new URL(".tmp/", import.meta.url));
await mkdir(screens, { recursive: true });
await mkdir(temporary, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  env: { ...process.env, TMPDIR: temporary },
  args: ["--disable-background-networking", "--disable-component-update"],
});
const captured = [];
const checks = [];

try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "file:" ||
      url.protocol === "data:" ||
      (url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        url.port === "4199")
    ) {
      return route.continue();
    }
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4199/#overview");
  await page.waitForLoadState("networkidle");
  // Read-only: sample content must already exist in the isolated app instance.
  const response = await page.request.get("http://127.0.0.1:4199/api/posts");
  assert(response.ok(), "The app must be running on port 4199.");
  const { posts } = await response.json();
  const post = posts.find(
    (item) => item.template === "steps" && item.title.startsWith("Example:"),
  );
  assert(post, "Start the app with isolated sample data before capturing.");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const mode of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
      // Inspect every current screen; capture the three matching mockup screens.
      for (const route of [
        "overview",
        "library",
        "planning",
        `editor/${post.id}`,
        "brand-kit",
        "templates",
        "facts",
        "snippets",
        "settings",
      ]) {
        await page.goto(`http://127.0.0.1:4199/#${route}`);
        await page.waitForSelector("#studio-main:not([aria-busy])");
        // Not networkidle: a screen that keeps a request open never reaches it.
        await page.waitForTimeout(800);
        const name =
          route === "planning"
            ? "planner"
            : route.startsWith("editor/")
              ? "editor"
              : route;
        if (["overview", "editor", "planner"].includes(name)) {
          await page.screenshot({
            path: `${screens}current-${name}-${mode}-${width}.png`,
            fullPage: true,
          });
          captured.push(`current-${name}-${mode}-${width}.png`);
        }
        if (width === 390 && name === "editor") {
          await page.click("#editor-tab-preview");
          await page.screenshot({
            path: `${screens}current-editor-preview-${mode}-${width}.png`,
            fullPage: true,
          });
          captured.push(`current-editor-preview-${mode}-${width}.png`);
          await page.click("#editor-tab-caption");
          await page.screenshot({
            path: `${screens}current-editor-review-${mode}-${width}.png`,
            fullPage: true,
          });
          captured.push(`current-editor-review-${mode}-${width}.png`);
        }
      }

      for (const name of ["overview", "editor", "planner"]) {
        await page.goto(new URL(`index.html#${name}`, import.meta.url).href);
        await page.waitForFunction(
          () =>
            document
              .querySelector("#current-screen")
              .textContent.toLowerCase() === location.hash.slice(1),
        );
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator("#appearance").inputValue(), "system");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        assert.equal(
          overflow,
          false,
          `${name} ${mode} ${width}: horizontal overflow`,
        );
        assert.equal(await page.locator(".screen:not([hidden])").count(), 1);
        const imagesReady = await page.evaluate(() =>
          [...document.images].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        );
        assert(imagesReady, `${name}: missing local image`);
        await page.screenshot({
          path: `${screens}mockup-${name}-${mode}-${width}.png`,
          fullPage: true,
        });
        captured.push(`mockup-${name}-${mode}-${width}.png`);
        checks.push(
          `${name}: ${mode}, ${width}px, system theme, local assets, no horizontal overflow`,
        );
        if (name === "editor" && width === 390) {
          for (const panel of ["content", "review"]) {
            await page.click(`#tab-${panel}`);
            assert(await page.locator(`#panel-${panel}`).isVisible());
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
            );
            await page.screenshot({
              path: `${screens}mockup-editor-${panel}-${mode}-${width}.png`,
              fullPage: true,
            });
            captured.push(`mockup-editor-${panel}-${mode}-${width}.png`);
          }
          await page.focus("#tab-content");
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            "tab-preview",
          );
          assert.equal(
            await page.locator("#tab-preview").getAttribute("aria-selected"),
            "true",
          );
        }
        await page.selectOption(
          "#appearance",
          mode === "light" ? "dark" : "light",
        );
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          mode === "light" ? "dark" : "light",
        );
        await page.selectOption("#appearance", "system");
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          null,
        );
      }
    }
  }
  assert.deepEqual(errors, [], "Browser JavaScript errors");
  await writeFile(
    `${screens}capture-results.json`,
    JSON.stringify({ captured, checks, errors }, null, 2) + "\n",
  );
  console.log(
    `Captured ${captured.length} screenshots in mockup/screens/. Open each image for visual review.`,
  );
} finally {
  await browser.close();
}
