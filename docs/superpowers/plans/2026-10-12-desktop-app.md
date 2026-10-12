# Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postwright opens as a program on a Mac with Apple Silicon, from a `.dmg` built on GitHub, while `npm start` keeps working unchanged.

**Architecture:** A small Electron main script in `desktop/` starts the existing server on a free port and opens one window on it. The server is compiled with `tsc` into `build/`, next to a copy of the web folder. `electron-builder` packs `build/` into a `.dmg`.

**Tech Stack:** Electron 44, electron-builder 26, TypeScript (existing), Vitest and playwright-core (existing).

**Spec:** `docs/superpowers/specs/2026-10-12-desktop-app-design.md`

## Global Constraints

- Apple Silicon only. No Windows, no Intel build, no signing certificate, no automatic updates, no field for the API key.
- `npm start`, `npm test`, `npm run typecheck` and `npm run format:check` behave as before and pass after every task.
- Only two new packages, both development dependencies: `electron` and `electron-builder`.
- The program never writes next to itself: data goes to `POSTWRIGHT_DATA_DIR`, otherwise to `data` inside `app.getPath("userData")`.
- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no preload.
- `build/` and `release/` are never committed.
- The repository is public and `tests/public.test.ts` checks every tracked text file: English only, no paths from a computer, no e-mail addresses, no keys.
- One commit per task, authored by the repository owner, with no co-author or tool lines. Nothing is pushed without the owner's go-ahead.
- These facts were not tried before writing the plan; each has a step that checks it and says what to do otherwise: named imports from `electron` in an ES module main script, playwright-core 1.63 driving Electron 44, `identity: "-"` giving an ad-hoc signature.

## Review Focus

1. A link with a scheme other than `http(s)`, or a host that only looks local (`http://127.0.0.1:4173.example.com/`): never loaded in the window. Unit tests in Task 1, Step 2.
2. The program is opened a second time while it runs: no second window and no second server. Desktop test "does not open a second window" in Task 1.
3. The window is closed: the server stops and the process ends, so no port stays open. Desktop test "stops the server and the program" in Task 1.
4. The data folder cannot be created: no studio window on a dead server. Desktop test "shows no studio window" in Task 1.
5. The program is started straight from the mounted `.dmg`, a read-only volume: it still runs, because nothing is written next to it. Task 2, Step 6.

---

### Task 1: The program opens the studio in a window

**Files:**
- Create: `desktop/links.ts`, `desktop/main.ts`, `desktop/tsconfig.json`, `desktop/build.mjs`, `desktop/vitest.config.ts`, `desktop/desktop.test.ts`, `tests/desktop-links.test.ts`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`

**Interfaces:**
- Consumes: `prepareData(dataDir)` from `src/server/projects.ts`; `createApp({ dataDir })` from `src/server/app.ts`; `startServer({ dataDir, port, ...createApp(...) })` from `src/server/http.ts`, which resolves to `{ url: string; close(): Promise<void> }`.
- Produces: `linkAction(url: string, origin: string): "stay" | "external" | "refuse"`; the compiled entry `build/desktop/main.js`; scripts `desktop` and `test:desktop`; the environment variable `POSTWRIGHT_APP` (path of a packed binary) read by `desktop/desktop.test.ts`.

- [ ] **Step 1: Install the two packages and wire the scripts**

Run: `npm install --save-dev electron@^44.7.0 electron-builder@^26.15.3`

In `package.json` add `"main": "build/desktop/main.js"` after `"type"`, and change the scripts to:

```json
"scripts": {
  "start": "node --import tsx src/server/start.ts",
  "desktop": "node desktop/build.mjs && electron .",
  "desktop:pack": "node desktop/build.mjs && electron-builder --config desktop/electron-builder.yml --mac --arm64 --publish never",
  "test": "vitest run",
  "test:desktop": "vitest run --config desktop/vitest.config.ts",
  "brand:check": "node --import tsx src/server/brand-check-cli.ts",
  "template:check": "node --import tsx src/server/template-check-cli.ts",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write src tests desktop",
  "format:check": "prettier --check src tests desktop"
}
```

In `tsconfig.json` change `"include"` to `["src", "tests", "desktop"]`. Append to `.gitignore`:

```
/build
/release
```

- [ ] **Step 2: Write the failing unit test for links**

`tests/desktop-links.test.ts`:

```ts
// Which links the desktop window follows, hands to the system browser, or refuses.
import { describe, expect, it } from "vitest";
import { linkAction } from "../desktop/links.js";

const origin = "http://127.0.0.1:4173";

describe("linkAction", () => {
  it.each([
    ["http://127.0.0.1:4173/#editor/abc", "stay"],
    ["blob:http://127.0.0.1:4173/0d7c1c1e-export", "stay"],
    ["https://example.com/page", "external"],
    ["http://example.com/", "external"],
    ["http://127.0.0.1:9999/", "external"],
    ["http://127.0.0.1:4173.example.com/", "external"],
    ["file:///etc/hosts", "refuse"],
    ["javascript:alert(1)", "refuse"],
    ["mailto:someone@example.com", "refuse"],
    ["not a url", "refuse"],
  ])("%s -> %s", (url, action) => {
    expect(linkAction(url, origin)).toBe(action);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/desktop-links.test.ts`
Expected: FAIL, the module `../desktop/links.js` cannot be found.

- [ ] **Step 4: Write `desktop/links.ts`**

```ts
export type LinkAction = "stay" | "external" | "refuse";

/**
 * What the window does with a link: its own studio stays in the window, another site goes
 * to the system browser, and every other scheme is refused.
 */
export function linkAction(url: string, origin: string): LinkAction {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return "refuse";
  }
  if (target.origin === origin) return "stay";
  return target.protocol === "https:" || target.protocol === "http:" ? "external" : "refuse";
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run tests/desktop-links.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Write the failing desktop test**

`desktop/vitest.config.ts`:

```ts
// The desktop test opens a real window, so it runs on its own: npm run test:desktop.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["desktop/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
```

`desktop/desktop.test.ts`:

```ts
// The real program in a real window: it opens the studio, keeps its data in the folder it is
// given, exports a file, keeps other sites out, and stops its server when the window closes.
// Set POSTWRIGHT_APP to the binary of a packed program to test that one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const packed = process.env.POSTWRIGHT_APP ? resolve(process.env.POSTWRIGHT_APP) : undefined;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "postwright-desktop-")));
const dataDir = join(tmp, "main", "data");
const exportDir = join(tmp, "exports");

function launch(name: string, data = join(tmp, name, "data")): Promise<ElectronApplication> {
  const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
  return electron.launch({
    executablePath: packed,
    cwd: root,
    args: [...(packed ? [] : ["build/desktop/main.js"]), `--user-data-dir=${join(tmp, name, "profile")}`],
    env: { ...env, POSTWRIGHT_DATA_DIR: data } as Record<string, string>,
    timeout: 20000,
  });
}

const ready = (page: Page) => page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });

let app: ElectronApplication;
let page: Page;

beforeAll(async () => {
  if (!packed) execFileSync(process.execPath, ["desktop/build.mjs"], { cwd: root, stdio: "inherit" });
  app = await launch("main");
  page = await app.firstWindow();
  await ready(page);
});
afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

describe("the desktop program", () => {
  it("opens the studio from its own server, with the profile it was given", async () => {
    expect(new URL(page.url()).hostname).toBe("127.0.0.1");
    await page.getByRole("button", { name: "Add sample content" }).waitFor();
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(join(tmp, "main", "profile"));
  });

  it("adds the sample content and keeps it in the data folder", async () => {
    await page.getByRole("button", { name: "Add sample content" }).click();
    await page.locator("a.studio-post-link").first().waitFor();
    expect(await page.locator("a.studio-post-link").count()).toBe(3);
    expect(readdirSync(join(dataDir, "projects")).length).toBeGreaterThan(0);
  });

  it("exports a post as a PNG file", async () => {
    await app.evaluate(({ session }, dir) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(`${dir}/${item.getFilename()}`));
    }, exportDir);
    await page.locator("a.studio-post-link", { hasText: "from idea to scheduled post" }).click();
    await ready(page);
    await page.getByRole("button", { name: "This format as PNG" }).click();
    await vi.waitFor(
      () => {
        const [file] = readdirSync(exportDir).filter((name) => name.endsWith(".png"));
        expect(file).toBeDefined();
        const bytes = readFileSync(join(exportDir, file!));
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(bytes.length).toBeGreaterThan(1000);
      },
      { timeout: 20000, interval: 250 },
    );
  });

  it("hands a link to another site to the system browser and stays where it is", async () => {
    // The stub keeps the test from opening a real browser; stop if Electron refuses it.
    const stubbed = await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { opened: string[] }).opened = opened;
      const stub = async (url: string) => void opened.push(url);
      shell.openExternal = stub;
      return shell.openExternal === stub;
    });
    expect(stubbed).toBe(true);
    const before = page.url();
    await page.evaluate(() => void window.open("https://example.com/new-window"));
    await page.evaluate(() => void (location.href = "https://example.com/same-window"));
    await vi.waitFor(async () => {
      const opened = await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened);
      expect(opened).toEqual(["https://example.com/new-window", "https://example.com/same-window"]);
    });
    expect(app.windows()).toHaveLength(1);
    expect(page.url()).toBe(before);
  });

  it("does not open a second window when it is started again", async () => {
    await expect(launch("main")).rejects.toThrow();
    expect(app.windows()).toHaveLength(1);
  });

  it("shows no studio window when the data folder cannot be used", async () => {
    const file = join(tmp, "not-a-folder");
    writeFileSync(file, "");
    const broken = await launch("broken", join(file, "data"));
    try {
      await new Promise((done) => setTimeout(done, 3000));
      expect(broken.windows()).toHaveLength(0);
    } finally {
      broken.process().kill();
    }
  });

  it("stops the server and the program when the window closes", async () => {
    const origin = new URL(page.url()).origin;
    const exited = new Promise((done) => app.process().once("exit", done));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await exited;
    await expect(fetch(origin)).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `npm run test:desktop`
Expected: FAIL in `beforeAll`: `desktop/build.mjs` does not exist.

- [ ] **Step 8: Write the build**

`desktop/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "rootDir": "..", "outDir": "../build" },
  "include": ["main.ts", "links.ts", "../src/server"]
}
```

`desktop/build.mjs`:

```js
// Compiles the server and the main script into build/, next to a copy of the web folder:
// the server finds the web files, and its template example, relative to itself.
import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

rmSync("build", { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "desktop/tsconfig.json"], {
  stdio: "inherit",
});
cpSync("src/web", "build/src/web", { recursive: true });
cpSync("src/server/template-example.json", "build/src/server/template-example.json");
```

- [ ] **Step 9: Write `desktop/main.ts`**

```ts
// The desktop program: the same server and web studio, in a window of its own.
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import { createApp } from "../src/server/app.js";
import { startServer } from "../src/server/http.js";
import { prepareData } from "../src/server/projects.js";
import { linkAction } from "./links.js";

// A --user-data-dir switch moves the profile, so a test run never shares the lock or the
// folder of the installed program.
const profile = app.commandLine.getSwitchValue("user-data-dir");
if (profile) app.setPath("userData", profile);

let win: BrowserWindow | null = null;

async function main(): Promise<void> {
  await app.whenReady();
  const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? join(app.getPath("userData"), "data");
  await prepareData(dataDir);
  const server = await startServer({ dataDir, port: 0, ...createApp({ dataDir }) });
  const origin = new URL(server.url).origin;

  /** True when the link belongs in the window; another site goes to the system browser. */
  const follow = (url: string): boolean => {
    const action = linkAction(url, origin);
    if (action === "external") void shell.openExternal(url);
    return action === "stay";
  };

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    title: "Postwright",
    backgroundColor: "#f8f7f4",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (follow(url)) void win?.loadURL(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!follow(url)) event.preventDefault();
  });
  app.on("window-all-closed", () => {
    void server.close().finally(() => app.quit());
  });
  await win.loadURL(server.url);
}

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  main().catch((error: unknown) => {
    dialog.showErrorBox("Postwright could not start", error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
} else {
  app.quit();
}
```

- [ ] **Step 10: Run the desktop test until it passes**

Run: `npm run test:desktop`
Expected: PASS, 7 tests. A window opens and closes during the run, and an error dialog shows for about three seconds in the "data folder cannot be used" test.

If it fails, these are the known unknowns, in the order to check:
- `SyntaxError: The requested module 'electron' does not provide an export named ...`: replace the named import with `import electron from "electron"; const { app, BrowserWindow, dialog, shell } = electron;`.
- `electron.launch` times out although `npm run desktop` opens the window by hand: playwright-core does not drive this Electron. Run `npm install --save-dev playwright-core@latest`, rerun `npm test` to confirm the Chrome tests still pass, and try again.
- The profile assertion fails: Electron did not apply the switch. Print `process.argv` in `main.ts` to see where the switch ended up and read it from there.
- The second-launch test hangs instead of rejecting: wrap the launch in `Promise.race` with a 15 second rejection.

- [ ] **Step 11: Open the program by hand**

Run: `npm run desktop`
Expected: the Postwright window opens on the Overview. Add the sample content, open a post, choose "This format as PNG": a save dialog appears and the file opens as an image. Quit with Cmd+Q.

- [ ] **Step 12: Run every check**

Run: `npm run format && npm run typecheck && npm test`
Expected: the type check is clean and all tests pass, including the ten new link tests and the public check on the new files.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore desktop tests/desktop-links.test.ts
git commit -m "Open the studio as a desktop program with Electron"
```

---

### Task 2: A packed program in a `.dmg`

**Files:**
- Create: `desktop/electron-builder.yml`, `desktop/icon.png`
- Modify: none (the `desktop:pack` script exists since Task 1)

**Interfaces:**
- Consumes: `build/` from `desktop/build.mjs`; `POSTWRIGHT_APP` in `desktop/desktop.test.ts`.
- Produces: `release/mac-arm64/Postwright.app` and `release/Postwright-<version>-mac-apple-silicon.dmg`.

- [ ] **Step 1: Make the icon**

The icon is the existing mark on a paper tile, in the proportions macOS uses (an 824 pixel tile on a 1024 pixel canvas). Write this one-off script to `build/make-icon.mjs` (the folder is ignored) and run it with `node build/make-icon.mjs`:

```js
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const mark = readFileSync("assets/mark-light.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<style>
  html, body { margin: 0; background: transparent; }
  .tile { position: absolute; left: 100px; top: 100px; width: 824px; height: 824px; border-radius: 185px;
    background: #f8f7f4; display: grid; place-items: center; }
  svg { width: 600px; height: 600px; }
</style><div class="tile">${mark}</div>`);
await page.screenshot({ path: "desktop/icon.png", omitBackground: true });
await browser.close();
```

Open `desktop/icon.png` and check: a paper rounded square with the clay mark centred, transparent corners.

- [ ] **Step 2: Write `desktop/electron-builder.yml`**

```yaml
appId: io.github.t1mvdploeg.postwright
productName: Postwright
# Unpacked files: the server reads its web folder from disk next to itself.
asar: false
directories:
  output: release
files:
  - build/**
  - package.json
mac:
  icon: desktop/icon.png
  category: public.app-category.productivity
  # No developer certificate: an ad-hoc signature, so Apple Silicon does not call the program damaged.
  identity: "-"
  artifactName: Postwright-${version}-mac-apple-silicon.${ext}
  target:
    - target: dmg
      arch: arm64
```

- [ ] **Step 3: Pack**

Run: `npm run desktop:pack`
Expected: `release/mac-arm64/Postwright.app` and `release/Postwright-0.1.0-mac-apple-silicon.dmg` exist.

- [ ] **Step 4: Check the signature**

Run: `codesign --verify --deep --strict --verbose=2 release/mac-arm64/Postwright.app && codesign -dv release/mac-arm64/Postwright.app 2>&1 | grep Signature`
Expected: `valid on disk`, `satisfies its Designated Requirement` and `Signature=adhoc`.

If the builder rejects `identity: "-"` or the signature is not ad-hoc, set `identity: null`, add `afterPack: desktop/after-pack.cjs` at the top level of the config, create that file, and repeat Steps 3 and 4:

```js
// Signs the packed program ad hoc, before the .dmg is made from it.
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

exports.default = async ({ appOutDir, packager }) => {
  const program = join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", program], { stdio: "inherit" });
};
```

- [ ] **Step 5: Run the desktop test against the packed program**

Run: `POSTWRIGHT_APP=release/mac-arm64/Postwright.app/Contents/MacOS/Postwright npm run test:desktop`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run it from the mounted `.dmg`**

```bash
hdiutil attach release/Postwright-*-mac-apple-silicon.dmg -nobrowse -readonly -mountpoint build/dmg
POSTWRIGHT_APP=build/dmg/Postwright.app/Contents/MacOS/Postwright npm run test:desktop
hdiutil detach build/dmg
```

Expected: PASS, 7 tests, from a read-only volume.

- [ ] **Step 7: Confirm where the program keeps its work**

Run: `ls ~/Library/Application\ Support/Postwright 2>/dev/null; open release/mac-arm64/Postwright.app`
Then quit the program and run: `ls ~/Library/Application\ Support/Postwright/data`
Expected: a `projects` folder. The README in Task 3 names this folder; if the name differs, use the real one there.

- [ ] **Step 8: Run every check and commit**

Run: `npm run format:check && npm run typecheck && npm test`
Expected: all pass.

```bash
git add desktop/electron-builder.yml desktop/icon.png
git commit -m "Pack the desktop program as a .dmg for Apple Silicon"
```

(Add `desktop/after-pack.cjs` to the commit if Step 4 needed it.)

---

### Task 3: Release workflow, README and product notes

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`, `PRODUCT.md`

**Interfaces:**
- Consumes: scripts `test:desktop` and `desktop:pack`; the `.dmg` name from Task 2.
- Produces: a workflow artifact `postwright-mac-apple-silicon` on a manual run, and a draft release with the `.dmg` on a `v*` tag.

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: release
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  mac:
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:desktop
      - run: npm run desktop:pack
      - run: POSTWRIGHT_APP=release/mac-arm64/Postwright.app/Contents/MacOS/Postwright npm run test:desktop
      - uses: actions/upload-artifact@v4
        with:
          name: postwright-mac-apple-silicon
          path: release/*.dmg
          if-no-files-found: error
      - if: startsWith(github.ref, 'refs/tags/v')
        run: gh release create "$GITHUB_REF_NAME" release/*.dmg --draft --title "Postwright $GITHUB_REF_NAME" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

Run: `ruby -ryaml -e 'p YAML.load_file(".github/workflows/release.yml").keys'`
Expected: `["name", true, "permissions", "jobs"]` (Ruby reads the key `on` as `true`).

- [ ] **Step 2: Add the Download section to the README**

Insert before `## Quick start`:

```markdown
## Download

On a Mac with Apple Silicon you can skip the setup: download the `.dmg` from the [latest release](https://github.com/t1mvdploeg/postwright/releases/latest), open it and drag Postwright to Applications. Your work is saved in `~/Library/Application Support/Postwright/data`.

The program has no Apple developer signature, so macOS stops it the first time. Open it once, close the warning, then choose **Open Anyway** under **System Settings → Privacy & Security**.

The program gives sample answers for the AI features. To use your own API key, run the local version below.
```

In the code block under "How it works", add a line after `npm test`:

```bash
npm run test:desktop   # the real desktop program; opens a window
```

Under "What it does not do", add:

```markdown
- The download is for Apple Silicon Macs. On Windows, Linux and Intel Macs, use the local version.
```

- [ ] **Step 3: Name the program in `PRODUCT.md`**

Append to the paragraph under `## Capabilities and Constraints`:

```markdown
The same studio is also packed as a desktop program for Apple Silicon Macs: its own window, no terminal, sample answers for the AI features.
```

- [ ] **Step 4: Run every check and commit**

Run: `npm run format:check && npm run typecheck && npm test`
Expected: all pass, including the public check on the workflow and the README.

```bash
git add .github/workflows/release.yml README.md PRODUCT.md
git commit -m "Build the .dmg on GitHub and describe the download"
```

- [ ] **Step 5: Try the workflow on GitHub (needs the owner's go-ahead)**

The workflow cannot run locally. With the owner's approval: push the branch, start the workflow by hand (`gh workflow run release.yml --ref desktop`), wait for it (`gh run watch`), and download the artifact (`gh run download --name postwright-mac-apple-silicon`). Expected: a green run and a `.dmg`.

- [ ] **Step 6: Open the downloaded `.dmg` as a visitor would (owner, by hand)**

A file downloaded with a browser carries the quarantine mark that a local build lacks. Download the artifact in a browser, open the `.dmg`, drag Postwright to Applications and open it. Expected: the warning that the developer cannot be verified, and **Open Anyway** under Privacy & Security starts the program. If macOS says the program is damaged instead, the ad-hoc signature did not survive; go back to Task 2, Step 4.

The README link to the latest release works once the owner has published the first release.
