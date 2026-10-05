// "Use this brand kit": the proposal becomes the brand of the project, the old brand is kept
// once, and tone, banned words and hashtags go to the settings of the project.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeHashtags, mergeWords } from "../src/server/brand-apply.js";
import { startStudio } from "./helpers/studio.js";
import { writeProposal } from "./helpers/proposal.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

async function start() {
  const s = await startStudio();
  studios.push(s);
  const call = async (path: string, method = "GET", body?: unknown, project?: string) => {
    const headers: Record<string, string> = project ? { "x-postwright-project": project } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(s.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const propose = (name: string, version: string, extras?: object) => {
    const dir = writeProposal(s.projectDir, (b) => {
      b.name = name;
      b.version = version;
    });
    if (extras) writeFileSync(join(dir, "extras.json"), JSON.stringify(extras));
  };
  return { ...s, call, propose };
}

describe("POST /api/brand/apply", () => {
  it("answers 409 when there is no proposal, and leaves the brand alone", async () => {
    const { call } = await start();
    const r = await call("/api/brand/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("There is no brand kit proposal to apply");
    expect((await call("/api/brand")).body.name).toBe("Postwright");
  });

  it("makes the proposal the brand; with the built-in brand there is nothing to keep", async () => {
    const { call, propose, projectDir } = await start();
    propose("One", "acme-2026-10-05-1");
    const r = await call("/api/brand/apply", "POST", {});
    expect(r).toMatchObject({ status: 200, body: { version: "acme-2026-10-05-1" } });
    expect((await call("/api/brand")).body).toMatchObject({ name: "One", version: "acme-2026-10-05-1" });
    expect(existsSync(join(projectDir, "brand", "logo", "default.svg"))).toBe(true);
    expect(existsSync(join(projectDir, "brand-input", "proposal"))).toBe(false);
    expect(existsSync(join(projectDir, "brand-previous"))).toBe(false);
    // The proposal is gone, so a second apply has nothing to do and changes nothing.
    expect((await call("/api/brand/apply", "POST", {})).status).toBe(409);
    expect((await call("/api/brand")).body.name).toBe("One");
  });

  it("keeps the previous brand once: the one before it expires", async () => {
    const { call, propose, projectDir } = await start();
    const previousName = () => JSON.parse(readFileSync(join(projectDir, "brand-previous", "brand.json"), "utf8")).name;
    propose("One", "acme-2026-10-05-1");
    await call("/api/brand/apply", "POST", {});
    propose("Two", "acme-2026-10-05-2");
    await call("/api/brand/apply", "POST", {});
    expect((await call("/api/brand")).body.name).toBe("Two");
    expect(previousName()).toBe("One");
    propose("Three", "acme-2026-10-05-3");
    await call("/api/brand/apply", "POST", {});
    expect(previousName()).toBe("Two");
  });

  it("adds banned words and hashtags without replacing, and sets the tone", async () => {
    const { call, propose } = await start();
    const before = (await call("/api/settings")).body;
    propose("One", "acme-2026-10-05-1", {
      tone: "Warm but direct.",
      bannedWords: ["Cheap", "BEST", "unbeatable"],
      hashtags: "#acme #Postwright #launch",
    });
    await call("/api/brand/apply", "POST", {});
    const after = (await call("/api/settings")).body;
    expect(after.tone).toBe("Warm but direct.");
    expect(after.bannedWords).toEqual(expect.arrayContaining([...before.bannedWords, "Cheap", "unbeatable"]));
    expect(after.bannedWords.filter((w: string) => w.toLowerCase() === "best")).toHaveLength(1);
    expect(after.defaultHashtags).toBe("#postwright #acme #launch");
    expect({ ...after, tone: "", bannedWords: [], defaultHashtags: "" }).toEqual({
      ...before,
      tone: "",
      bannedWords: [],
      defaultHashtags: "",
    });
  });

  it("keeps the tone it has when the proposal brings none", async () => {
    const { call, propose } = await start();
    const settings = (await call("/api/settings")).body;
    await call("/api/settings", "PUT", { ...settings, tone: "Plain." });
    propose("One", "acme-2026-10-05-1", { tone: "" });
    await call("/api/brand/apply", "POST", {});
    expect((await call("/api/settings")).body.tone).toBe("Plain.");
  });

  it("refuses an invalid proposal with the reason, and moves nothing", async () => {
    const { call, projectDir } = await start();
    writeProposal(projectDir, (b) => (b.grounds.light.text = b.grounds.light.background));
    const r = await call("/api/brand/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/not valid.*contrast/);
    expect(existsSync(join(projectDir, "brand-input", "proposal", "brand.json"))).toBe(true);
    expect(existsSync(join(projectDir, "brand"))).toBe(false);
  });

  it("stops before it moves anything when settings.json of the project is broken", async () => {
    const { call, propose, projectDir } = await start();
    propose("One", "acme-2026-10-05-1");
    mkdirSync(join(projectDir, "marketing"), { recursive: true });
    writeFileSync(join(projectDir, "marketing", "settings.json"), "{broken");
    const r = await call("/api/brand/apply", "POST", {});
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("marketing/settings.json");
    expect(existsSync(join(projectDir, "brand-input", "proposal", "brand.json"))).toBe(true);
    expect(existsSync(join(projectDir, "brand"))).toBe(false);
  });

  it("puts everything back when the settings cannot be written", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {}); // the server logs the failed write
    const { call, propose, projectDir } = await start();
    propose("One", "acme-2026-10-05-1");
    await call("/api/brand/apply", "POST", {});
    propose("Two", "acme-2026-10-05-2");
    mkdirSync(join(projectDir, "marketing"), { recursive: true });
    chmodSync(join(projectDir, "marketing"), 0o555); // no file there yet, so reading works and writing does not
    try {
      expect((await call("/api/brand/apply", "POST", {})).status).toBe(500);
    } finally {
      chmodSync(join(projectDir, "marketing"), 0o755);
    }
    expect((await call("/api/brand")).body.name).toBe("One");
    expect(existsSync(join(projectDir, "brand-input", "proposal", "brand.json"))).toBe(true);
    expect(existsSync(join(projectDir, "brand-previous"))).toBe(false);
    log.mockRestore();
  });

  it("leaves the other project alone", async () => {
    const { call, propose } = await start();
    await call("/api/projects", "POST", { name: "Beta" });
    propose("One", "acme-2026-10-05-1", { tone: "Warm.", bannedWords: ["cheap"] });
    await call("/api/brand/apply", "POST", {});
    expect((await call("/api/brand", "GET", undefined, "beta")).body.name).toBe("Postwright");
    expect((await call("/api/settings", "GET", undefined, "beta")).body.tone).toBe("");
  });
});

describe("tone in the settings", () => {
  it("round-trips and has a limit", async () => {
    const { call } = await start();
    const settings = (await call("/api/settings")).body;
    expect(settings.tone).toBe("");
    expect((await call("/api/settings", "PUT", { ...settings, tone: "Plain." })).status).toBe(200);
    expect((await call("/api/settings", "PUT", { ...settings, tone: "x".repeat(1501) })).status).toBe(400);
  });
});

describe("mergeWords and mergeHashtags", () => {
  it("adds only what is new, ignoring case, and keeps the order", () => {
    expect(mergeWords(["best", "Cheap"], ["CHEAP", "new", "NEW", " spaced "])).toEqual([
      "best",
      "Cheap",
      "new",
      "spaced",
    ]);
  });

  it("stops at 100 words", () => {
    const many = Array.from({ length: 100 }, (_, i) => `w${i}`);
    expect(mergeWords(many, ["extra"])).toEqual(many);
  });

  it("adds hashtags that are new and keeps the line within 300 characters", () => {
    expect(mergeHashtags("#a #b", "#B #c")).toBe("#a #b #c");
    expect(mergeHashtags("", "#a #b")).toBe("#a #b");
    const long = `#${"x".repeat(290)}`;
    expect(mergeHashtags(long, "#abcdefghijkl #z")).toBe(`${long} #z`);
  });
});
