// The spending cap fails closed: a paid call whose booking fails still counts, and a usage
// file that cannot be appended to stops live calls before they cost anything.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import type { AiProvider } from "../src/server/ai/provider.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // the server logs the failed booking
});
afterEach(async () => {
  vi.restoreAllMocks();
  while (studios.length) await studios.pop()!.close();
});

const HELP = {
  task: "fields",
  template: "Statement",
  channel: "linkedin",
  note: "",
  facts: [],
  fields: [{ id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true }],
};

async function start(onCall: (usageFile: string) => void) {
  let dataDir = "";
  let calls = 0;
  const provider = {
    name: "anthropic",
    model: "claude-sonnet-5-5",
    // $ 0.40 per call: 100,000 in and 20,000 out at $ 2 and $ 10 per million.
    writeText: async () => {
      calls++;
      onCall(join(dataDir, "ai-usage.jsonl"));
      return {
        suggestion: {
          variants: [{ fields: [{ id: "headline", text: "A *headline*" }], caption: "", altText: "", usedFacts: [] }],
        },
        model: "claude-sonnet-5-5",
        usage: { input: 100_000, output: 20_000, cacheRead: 0, cacheWrite: 0 },
        durationMs: 5,
      };
    },
  } as unknown as AiProvider;
  const s = await startStudio({ provider });
  studios.push(s);
  dataDir = s.dataDir;
  const ask = async (path: string, method: string, body: unknown) => {
    const r = await fetch(s.base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  const cap = (usd: number) =>
    ask("/api/settings", "PUT", { ...DEFAULT_SETTINGS, writingHelp: { enabled: true, capUsdPerMonth: usd } });
  return { dataDir, ask, cap, calls: () => calls };
}

describe("the monthly cap when the usage file cannot be written", () => {
  it("still counts a paid call whose booking failed", async () => {
    // The file is made read-only during the call: the preflight passed, the booking fails.
    const s = await start((file) => chmodSync(file, 0o400));
    expect((await s.cap(0.4)).status).toBe(200);
    const first = await s.ask("/api/writing-help", "POST", HELP);
    chmodSync(join(s.dataDir, "ai-usage.jsonl"), 0o600);
    if (first.status === 200) return; // running as root: nothing is unwritable
    expect(first.status).toBe(500);
    // The file says $ 0, but $ 0.40 has been spent: the cap of $ 0.40 is reached.
    const second = await s.ask("/api/writing-help", "POST", HELP);
    expect(second.status).toBe(429);
    expect(s.calls()).toBe(1);
  });

  it("refuses a live call before it is made if the file cannot be appended to", async () => {
    const s = await start(() => {});
    expect((await s.cap(10)).status).toBe(200);
    expect((await s.ask("/api/writing-help", "POST", HELP)).status).toBe(200);
    const file = join(s.dataDir, "ai-usage.jsonl");
    expect(existsSync(file)).toBe(true);
    chmodSync(file, 0o400);
    const r = await s.ask("/api/writing-help", "POST", HELP);
    chmodSync(file, 0o600);
    if (r.status === 200) return; // running as root
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/ai-usage\.jsonl.*EACCES/);
    expect(r.body.error).not.toContain(s.dataDir);
    expect(s.calls()).toBe(1);
  });
});
