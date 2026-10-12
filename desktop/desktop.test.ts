// The real program in a real window: it opens the studio, keeps its data in the folder it is
// given, exports a file, keeps other sites out, and stops its server when the window closes.
// Set POSTWRIGHT_APP to the binary of a packed program to test that one.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const packed = process.env.POSTWRIGHT_APP ? resolve(process.env.POSTWRIGHT_APP) : undefined;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "postwright-desktop-")));
const dataDir = join(tmp, "main", "data");
const exportDir = join(tmp, "exports");

const args = (name: string) => [
  ...(packed ? [] : ["build/desktop/main.js"]),
  `--user-data-dir=${join(tmp, name, "profile")}`,
];
function environment(data: string): Record<string, string> {
  const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
  return { ...env, POSTWRIGHT_DATA_DIR: data } as Record<string, string>;
}

function launch(name: string, data = join(tmp, name, "data")): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: packed,
    cwd: root,
    args: args(name),
    env: environment(data),
    timeout: 20000,
  });
}

const ready = (page: Page) => page.waitForSelector("#studio-main:not([aria-busy])", { state: "attached" });

/** Answers the "not saved" question in place of a person, 0 leaves and 1 stays, and counts the questions. */
const answerUnsaved = (answer: number) =>
  app.evaluate(({ dialog }, button) => {
    const count = globalThis as unknown as { asked?: number };
    count.asked ??= 0;
    dialog.showMessageBoxSync = (() => {
      count.asked! += 1;
      return button;
    }) as typeof dialog.showMessageBoxSync;
  }, answer);

let app: ElectronApplication;
let page: Page;
let origin: string;

beforeAll(async () => {
  if (!packed) execFileSync(process.execPath, ["desktop/build.mjs"], { cwd: root, stdio: "inherit" });
  app = await launch("main");
  page = await app.firstWindow();
  await ready(page);
  origin = new URL(page.url()).origin;
  // The program asks its own "not saved" question. Without a listener Playwright tries to
  // answer a dialog that is not there.
  page.on("dialog", () => undefined);
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
    await page.locator(".studio-export summary").click();
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

  // Only on the unpacked program: there Playwright holds the start until it is attached. A packed
  // program is already blocked by its error dialog, and the launch would wait for it in vain.
  it.skipIf(packed)("shows no studio window when the data folder cannot be used", async () => {
    const file = join(tmp, "not-a-folder");
    writeFileSync(file, "");
    const broken = await launch("broken", join(file, "data"));
    try {
      await new Promise((done) => setTimeout(done, 3000));
      expect(broken.windows()).toHaveLength(0);
    } finally {
      // Not the default signal: the program waits in its error dialog and would not hear it.
      broken.process().kill("SIGKILL");
    }
  });

  it("asks before it closes a post with changes that are not saved, and stays open on Stay", async () => {
    const status = await page.evaluate(() => {
      const title = document.querySelector<HTMLInputElement>("#field-title")!;
      title.value = "Changed in the program";
      title.dispatchEvent(new Event("input", { bubbles: true }));
      return document.querySelector(".studio-save-status")!.textContent;
    });
    expect(status).toBe("Not saved");
    await answerUnsaved(1);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await vi.waitFor(async () => {
      expect(await app.evaluate(() => (globalThis as unknown as { asked: number }).asked)).toBe(1);
    });
    expect(app.windows()).toHaveLength(1);
  });

  it("stops the server and the program when the window closes", async () => {
    await answerUnsaved(0);
    const exited = new Promise((done) => app.process().once("exit", done));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await exited;
    await expect(fetch(origin)).rejects.toThrow();
  });

  // Started without Playwright: with it, a second start on the same profile and address ends
  // in a load error that a plain start does not give. Fails while another Postwright program
  // is open on this computer: that one holds the address.
  it("comes back on the same address, so the studio still knows the theme and the project", async () => {
    const binary = packed ?? (createRequire(import.meta.url)("electron") as unknown as string);
    const again = spawn(binary, args("main"), { cwd: root, env: environment(dataDir), stdio: "ignore" });
    try {
      await vi.waitFor(async () => expect((await fetch(origin)).ok).toBe(true), { timeout: 20000, interval: 250 });
    } finally {
      again.kill("SIGKILL");
    }
  });
});
