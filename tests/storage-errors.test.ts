// Files in the data folder that a user can break by hand: the studio then names the file
// in a readable error (500) and writes nothing over or next to it.
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

async function start() {
  const s = await startStudio();
  studios.push(s);
  const file = (...parts: string[]) => join(s.projectDir, ...parts);
  const set = (name: string, content: string) => {
    mkdirSync(join(file(name), ".."), { recursive: true });
    writeFileSync(file(name), content);
  };
  const ask = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(s.base + path, {
      method: method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  return { ...s, file, set, ask };
}

const POST_ID = "p-00000000-0000-4000-8000-000000000001";

describe("a broken list file", () => {
  it.each([
    ["not JSON", "{broken"],
    ["an object instead of a list", '{"a":1}'],
    ["a list without ids", '[{"text":"x"}]'],
    ["a list with something other than objects", "[1,2]"],
  ])("gives a 500 that names marketing/facts.json: %s", async (_name, content) => {
    const { set, ask, file } = await start();
    set("marketing/facts.json", content);
    const read = await ask("/api/facts");
    expect(read.status).toBe(500);
    expect(read.body.error).toContain("marketing/facts.json");
    const write = await ask("/api/facts", "POST", {
      text: "A fact.",
      kind: "product",
      source: { kind: "site", reference: "README.md" },
      validFrom: null,
      validUntil: null,
      status: "active",
    });
    expect(write.status).toBe(500);
    expect(write.body.error).toContain("marketing/facts.json");
    // The writing help reads the same list.
    const help = await ask("/api/writing-help", "POST", {
      task: "caption",
      template: "Statement",
      channel: "linkedin",
      note: "",
      fields: [],
      facts: [],
    });
    expect(help.status).toBe(500);
    expect(help.body.error).toContain("marketing/facts.json");
    // Nothing was overwritten.
    expect(readFileSync(file("marketing", "facts.json"), "utf8")).toBe(content);
  });
});

describe("a broken post file", () => {
  it.each([
    ["not JSON", "{broken"],
    ["an object with another id", JSON.stringify({ id: "p-00000000-0000-4000-8000-000000000002" })],
    ["an object without fields", '{"a":1}'],
  ])("gives a 500 that names the file, also in the list: %s", async (_name, content) => {
    const { set, ask, file } = await start();
    const name = `marketing/posts/${POST_ID}.json`;
    set(name, content);
    for (const [path, method] of [
      ["/api/posts", "GET"],
      [`/api/posts/${POST_ID}`, "GET"],
      [`/api/posts/${POST_ID}`, "DELETE"],
      ["/api/overview", "GET"],
    ]) {
      const r = await ask(path, method);
      expect(r.status, `${method} ${path}`).toBe(500);
      expect(r.body.error, `${method} ${path}`).toContain(name);
    }
    expect(readFileSync(file(name), "utf8")).toBe(content);
  });
});

describe("a file that cannot be read from disk", () => {
  it.each([
    ["marketing/settings.json", "/api/settings"],
    ["marketing/facts.json", "/api/facts"],
    ["marketing/moments.json", "/api/moments"],
  ])("names %s and the error code, never an absolute path", async (name, url) => {
    const { set, ask, file, dataDir } = await start();
    set(name, "[]");
    chmodSync(file(name), 0o000);
    const r = await ask(url);
    chmodSync(file(name), 0o600);
    if (r.status === 200) return; // running as root: nothing is unreadable
    expect(r.status).toBe(500);
    expect(r.body.error).toContain(name);
    expect(r.body.error).toContain("EACCES");
    expect(r.body.error).not.toContain(dataDir);
  });
});

describe("PUT /api/settings", () => {
  it("reports an unreadable file instead of overwriting it", async () => {
    const { set, ask, file } = await start();
    set("marketing/settings.json", "{broken");
    const r = await ask("/api/settings", "PUT", DEFAULT_SETTINGS);
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("marketing/settings.json");
    expect(readFileSync(file("marketing", "settings.json"), "utf8")).toBe("{broken");
  });

  it("just saves if the file is missing or in order", async () => {
    const { ask } = await start();
    const changed = { ...DEFAULT_SETTINGS, defaultHashtags: "#other" };
    expect((await ask("/api/settings", "PUT", changed)).status).toBe(200);
    expect((await ask("/api/settings", "PUT", DEFAULT_SETTINGS)).status).toBe(200);
  });
});

describe("POST /api/sample-content", () => {
  it.each([
    ["broken settings", "marketing/settings.json", "{broken", "marketing/settings.json"],
    ["a broken brand", "brand/brand.json", "{broken", "data/projects/postwright/brand/brand.json"],
  ])("writes nothing when it meets %s", async (_name, fileName, content, named) => {
    const { set, ask, file } = await start();
    set(fileName, content);
    const r = await ask("/api/sample-content", "POST", {});
    expect(r.status).toBe(500);
    expect(r.body.error).toContain(named);
    for (const n of ["facts.json", "snippets.json", "posts"]) expect(existsSync(file("marketing", n)), n).toBe(false);
  });
});
