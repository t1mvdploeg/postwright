// POST /api/brand/generate with a fake client: the cap, the booking, the proposal and what
// happens when the model refuses or the proposal cannot be used.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chooseBrandClient } from "../src/server/ai/choose.js";
import { book } from "../src/server/ai/usage.js";
import type { BrandClient } from "../src/server/ai/brand.js";
import { AI_PROPOSAL, answer, fakeClient, fetchFailed, message } from "./helpers/brand-ai.js";
import { pdf, pngHeader, SVG, webpHeader } from "./helpers/brand-files.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

async function start(
  replies: Parameters<typeof fakeClient>[0],
  withBrand = true,
  brand?: { client: BrandClient; model: string },
) {
  const fake = fakeClient(replies);
  const s = await startStudio({
    brand: brand ?? (withBrand ? { client: fake.client, model: "claude-opus-5-5" } : null),
  });
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
  const upload = (role: string, body: Buffer | string, project?: string) =>
    fetch(`${s.base}/api/brand/input/${role}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(project ? { "x-postwright-project": project } : {}) },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
  const usage = () =>
    readFileSync(join(s.dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  return { ...s, ...fake, call, upload, usage };
}

describe("before the call", () => {
  it("needs a logo, and a key", async () => {
    const withKey = await start([answer()]);
    expect(await withKey.call("/api/brand/generate", "POST", {})).toMatchObject({
      status: 400,
      body: { error: "Add a logo first" },
    });
    const noKey = await start([], false);
    await noKey.upload("logo", SVG);
    const r = await noKey.call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/ANTHROPIC_API_KEY.*download the prompt/i);
    expect((await noKey.call("/api/brand/input")).body.generate).toEqual({ available: false, model: null });
    expect((await withKey.call("/api/brand/input")).body.generate).toEqual({
      available: true,
      model: "claude-opus-5-5",
    });
  });

  it("refuses without a call when the reserve of $2 does not fit under the cap", async () => {
    const { call, upload, calls, dataDir } = await start([answer()]);
    await upload("logo", SVG);
    const settings = (await call("/api/settings")).body;
    await call("/api/settings", "PUT", { ...settings, writingHelp: { ...settings.writingHelp, capUsdPerMonth: 2 } });
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/up to \$2/);
    expect(calls).toHaveLength(0);
    // Room left in the month counts: $8.50 spent and a cap of $10 leaves too little.
    await call("/api/settings", "PUT", { ...settings, writingHelp: { ...settings.writingHelp, capUsdPerMonth: 10 } });
    await book(dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 8.5, ok: true });
    expect((await call("/api/brand/generate", "POST", {})).status).toBe(429);
    expect(calls).toHaveLength(0);
  });
});

describe("a successful generation", () => {
  it("makes a proposal, shows it, and books the cost", async () => {
    const { call, upload, calls, usage, projectDir } = await start([answer()]);
    await upload("logo", SVG);
    await upload("image", webpHeader(3, 3));
    await upload("guide", pdf(50));
    await call("/api/brand/input", "PUT", { website: "https://acme.example", notes: "tone: warm" });
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ state: "ready", brand: { name: "Acme", logos: { white: "logo/white.svg" } } });
    expect(existsSync(join(projectDir, "brand-input", "proposal", "brand.json"))).toBe(true);
    expect((await call("/api/brand/proposal")).body.state).toBe("ready");
    // The request held the material of this project.
    const sent = JSON.stringify(calls[0].messages);
    expect(sent).toContain("https://acme.example");
    expect(sent).toContain("tone: warm");
    expect(sent).toContain('"type":"document"');
    // 100,000 in and 10,000 out at $4 and $20 per million.
    expect(usage()).toMatchObject([{ task: "brandKit:postwright", model: "claude-opus-5-5", usd: 0.6, ok: true }]);
    // Nothing is applied until the user says so.
    expect((await call("/api/brand")).body.name).toBe("Postwright");
  });

  it("continues a paused turn and books all turns", async () => {
    const { call, upload, calls, usage } = await start([message({ stop: "pause_turn" }), answer()]);
    await upload("logo", SVG);
    expect((await call("/api/brand/generate", "POST", {})).status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(usage()[0].usd).toBe(1.2);
  });

  it("says in the proposal when the website could not be read", async () => {
    const { call, upload } = await start([message({ blocks: [fetchFailed], text: JSON.stringify(AI_PROPOSAL) })]);
    await upload("logo", SVG);
    await call("/api/brand/input", "PUT", { website: "https://acme.example", notes: "" });
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.body.extras.notes.some((n: string) => /website could not be read/.test(n))).toBe(true);
  });

  it("makes a PNG kit for a PNG logo, with a note when the reader cannot use the file", async () => {
    const { call, upload } = await start([answer()]);
    await upload("logo", pngHeader(8, 8));
    const r = await call("/api/brand/generate", "POST", {});
    // pngHeader has no pixel data: the reader cannot use it, which becomes a note, not a failure.
    expect(r.status).toBe(200);
    expect(r.body.brand.logos.default).toBe("logo/default.png");
    expect(r.body.extras.notes.some((n: string) => /could not be read/.test(n))).toBe(true);
  });

  it("works on the material of the project in the header", async () => {
    const { call, upload, calls } = await start([answer()]);
    await call("/api/projects", "POST", { name: "Beta" });
    await upload("logo", '<svg xmlns="http://www.w3.org/2000/svg"><title>beta logo</title></svg>', "beta");
    expect((await call("/api/brand/generate", "POST", {}, "beta")).status).toBe(200);
    expect(JSON.stringify(calls[0].messages)).toContain("beta logo");
    expect((await call("/api/brand/proposal")).body.state).toBe("none");
    expect((await call("/api/brand/proposal", "GET", undefined, "beta")).body.state).toBe("ready");
  });
});

describe("when it goes wrong", () => {
  it("turns a refusal into a readable error, books the tokens and makes no proposal", async () => {
    const { call, upload, usage, projectDir } = await start([message({ stop: "refusal" })]);
    await upload("logo", SVG);
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/Brand kit generation did not give a usable answer: .*declined/);
    expect(usage()).toMatchObject([{ ok: false, usd: 0.6 }]);
    expect(existsSync(join(projectDir, "brand-input", "proposal"))).toBe(false);
  });

  it("turns a network error into a readable error without a cost", async () => {
    const { call, upload, usage } = await start([new Error("connection reset")]);
    await upload("logo", SVG);
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("connection reset");
    expect(usage()).toMatchObject([{ ok: false, usd: 0 }]);
  });

  it("gives up on endless pauses with a message, and books them", async () => {
    const paused = message({ stop: "pause_turn" });
    const { call, upload, usage } = await start([paused, paused, paused, paused]);
    await upload("logo", SVG);
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/did not finish/);
    expect(usage()[0]).toMatchObject({ ok: false, usd: 2.4 });
  });

  it("refuses a proposal that cannot be used (422), keeps the old brand and books the call", async () => {
    const bad = {
      ...AI_PROPOSAL,
      grounds: { ...AI_PROPOSAL.grounds, accent: { background: "#777777", text: "#888888" } },
    };
    const { call, upload, usage, projectDir } = await start([answer(bad)]);
    await upload("logo", SVG);
    const r = await call("/api/brand/generate", "POST", {});
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/refused.*accent/);
    expect(usage()).toMatchObject([{ ok: true, usd: 0.6 }]);
    expect(existsSync(join(projectDir, "brand-input", "proposal"))).toBe(false);
    expect((await call("/api/brand")).body.name).toBe("Postwright");
  });

  it("never shows the key", async () => {
    // The real client made from a key, only asked for what the studio shows: no request is sent.
    const key = "sk-test-secret-123";
    const real = chooseBrandClient({ ANTHROPIC_API_KEY: key })!;
    const { call, upload, dataDir } = await start([], true, real);
    await upload("logo", SVG);
    const shown = [await call("/api/brand/input"), await call("/api/ai"), await call("/api/brand/proposal")];
    for (const r of shown) expect(JSON.stringify(r.body)).not.toContain(key);
    expect(shown[0].body.generate).toEqual({ available: true, model: "claude-opus-5-5" });
    expect(existsSync(join(dataDir, "ai-usage.jsonl"))).toBe(false);
  });
});
