// Marketing studio: writing help. The writing help only works with active facts that the
// server loads itself, checks every suggestion for numbers without a fact, books every
// call and respects the monthly cap.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { writingInstruction, WritingSuggestionSchema, type WritingTask } from "../src/server/writing-help.js";
import { AiError, EMPTY_USAGE, type AiProvider, type AiResult } from "../src/server/ai/provider.js";
import type { WritingSuggestion } from "../src/server/writing-help.js";
import { monthTotalUsd } from "../src/server/ai/usage.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import { startStudio } from "./helpers/studio.js";

const fake = {
  seen: null as WritingTask | null,
  response: null as ((o: WritingTask) => AiResult<WritingSuggestion>) | null,
  delay: 0,
};
const provider: AiProvider = {
  name: "anthropic",
  model: "claude-sonnet-5-5",
  writeText: async (o) => {
    fake.seen = o;
    if (fake.delay) await new Promise((ok) => setTimeout(ok, fake.delay));
    return fake.response!(o);
  },
  suggestIdeas: async () => {
    throw new Error("must not");
  },
};

let base = "";
let dataDir = "";
let close: () => Promise<void>;
const API = "/api";

async function ask(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const r = await fetch(base + path, {
    method: method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}

async function fact(text: string, status = "active") {
  const r = await ask(`${API}/facts`, {
    text,
    kind: "product",
    source: { kind: "site", reference: "README.md" },
    status,
  });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

const request = (facts: string[], extra: Record<string, unknown> = {}) => ({
  task: "fields",
  template: "Statement",
  channel: "linkedin",
  note: "For HR managers.",
  fields: [
    { id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true },
    { id: "text", label: "Text", kind: "text", max: 160, emphasis: false },
  ],
  facts,
  ...extra,
});

beforeAll(async () => {
  const s = await startStudio({ provider });
  base = s.base;
  dataDir = s.dataDir;
  close = s.close;
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  fake.seen = null;
  fake.delay = 0;
  fake.response = (o) => ({
    suggestion: {
      variants: [0, 1, 2, 3].map((i) => ({
        fields: [
          { id: "headline", text: `Suggestion ${i} *headline*` },
          { id: "text", text: "A unit price of € 62,75." },
          { id: "secret", text: "x" },
        ],
        caption: "",
        altText: "",
        usedFacts: o.facts.map((f) => f.id),
      })),
    },
    model: "claude-sonnet-5-5",
    usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
    durationMs: 5,
  });
  await setWritingHelp(true);
});

const bookings = () =>
  readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

async function setWritingHelp(enabled: boolean, cap = 10) {
  const r = await ask(`${API}/settings`, { ...DEFAULT_SETTINGS, writingHelp: { enabled, capUsdPerMonth: cap } }, "PUT");
  expect(r.status).toBe(200);
}

describe("writingHelp", () => {
  it("is on by default, and off when the user sets it so", async () => {
    expect(DEFAULT_SETTINGS.writingHelp).toEqual({ enabled: true, capUsdPerMonth: 10 });
    await setWritingHelp(false);
    const r = await ask(`${API}/writing-help`, request([]));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/is off/);
  });

  it("refuses an unknown or non-active fact", async () => {
    const draft = await fact("A draft with € 5", "draft");
    expect((await ask(`${API}/writing-help`, request([draft]))).status).toBe(400);
    expect((await ask(`${API}/writing-help`, request(["f-00000000-0000-4000-8000-000000000000"]))).status).toBe(400);
    expect((await ask(`${API}/writing-help`, request([], { task: "gedicht" }))).status).toBe(400);
  });

  it("sends the model only the facts that the server loads itself, and checks numbers", async () => {
    const id = await fact("Cost price is € 52,75 per hour");
    const r = await ask(`${API}/writing-help`, request([id]));
    expect(r.status).toBe(200);
    expect(r.body.sample).toBe(false);
    expect(fake.seen!.facts).toEqual([{ id, text: "Cost price is € 52,75 per hour", source: "README.md" }]);
    expect(fake.seen!.brand.brandName).toBe("Postwright");
    expect(r.body.variants).toHaveLength(3);
    const v = r.body.variants[0];
    expect(Object.keys(v.fields)).toEqual(["headline", "text"]);
    expect(v.uncovered).toEqual(["€ 62,75"]);
    expect(v.usedFacts).toEqual([id]);
  });

  it("passes the current post content to the model", async () => {
    const current = { fields: { headline: "Seen *enough*" }, caption: "A text.", altText: "" };
    expect((await ask(`${API}/writing-help`, request([], { task: "alt-text", current }))).status).toBe(200);
    expect(fake.seen!.current).toEqual(current);
    expect((await ask(`${API}/writing-help`, request([]))).status).toBe(200);
    expect(fake.seen!.current).toEqual({ fields: {}, caption: "", altText: "" });
  });

  it("records every call with task and cost, also on an error", async () => {
    const before = bookings().length;
    await ask(`${API}/writing-help`, request([]));
    fake.response = () => {
      throw new AiError("The model did not return valid JSON", {
        input: 1_000_000,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    };
    const error = await ask(`${API}/writing-help`, request([]));
    expect(error.status).toBe(502);
    expect(error.body).not.toHaveProperty("sample");
    const isNew = bookings().slice(before);
    expect(isNew).toHaveLength(2);
    expect(isNew[0]).toMatchObject({ task: "writingHelp:fields", model: "claude-sonnet-5-5", ok: true });
    expect(isNew[0].usd).toBeCloseTo(0.0007, 8); // 100 in and 50 out at $ 2 and $ 10 per million
    expect(isNew[1]).toMatchObject({ ok: false });
  });

  it("stops at the monthly cap", async () => {
    await setWritingHelp(true, 0);
    const r = await ask(`${API}/writing-help`, request([]));
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/monthly cap/);
  });

  it("with concurrent calls lets through no more than the cap allows", async () => {
    // One call costs $ 0.90, more than the room under the cap; without serialisation all three
    // still saw room.
    await setWritingHelp(true, (await monthTotalUsd(dataDir, new Date())) + 0.5);
    const slow = fake.response!;
    fake.response = (o) => ({
      ...slow(o),
      usage: { input: 200_000, output: 50_000, cacheRead: 0, cacheWrite: 0 },
    });
    fake.delay = 80;
    const reports = await Promise.all([
      ask(`${API}/writing-help`, request([])),
      ask(`${API}/writing-help`, request([])),
      ask(`${API}/writing-help`, request([])),
    ]);
    expect(reports.map((u) => u.status).sort()).toEqual([200, 429, 429]);
  });
});

describe("instruction and schema", () => {
  it("takes the brand name from the brand and keeps the rule about the facts", () => {
    const text = writingInstruction({ brandName: "Sample brand", bannedWords: ["guaranteed", "nr. 1"] });
    expect(text).toContain("Sample brand");
    expect(text).toContain("Tone: plain and calm");
    expect(text).toContain("use only the facts provided");
    expect(text).toContain('["guaranteed","nr. 1"]');
    expect(writingInstruction({ brandName: "X", bannedWords: [] })).not.toContain("Forbidden");
  });

  it("the sample provider satisfies the response schema", async () => {
    const o: WritingTask = {
      task: "fields",
      template: "Statement",
      channel: "linkedin",
      note: "",
      current: { fields: {}, caption: "", altText: "" },
      facts: [],
      fields: [{ id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true }],
      brand: { brandName: "X", bannedWords: [] },
    };
    const a = await sampleProvider.writeText(o);
    expect(a.suggestion.variants).toHaveLength(3);
    expect(WritingSuggestionSchema.safeParse(a.suggestion).success).toBe(true);
    expect(a.usage).toEqual(EMPTY_USAGE);
  });
});
