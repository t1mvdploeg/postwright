// The studio's AI: the choice between Claude and the sample provider, the costs and the
// monthly cap, and what the routes show of it. Not a single call goes to the network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnthropicProvider, DEFAULT_MODEL, type ClientFactory } from "../src/server/ai/anthropic.js";
import { aiMode, chooseProvider } from "../src/server/ai/choose.js";
import { AiError, EMPTY_USAGE, type AiProvider } from "../src/server/ai/provider.js";
import { book, costUsd, monthTotalUsd } from "../src/server/ai/usage.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import { WritingSuggestionSchema, type WritingTask } from "../src/server/writing-help.js";
import { IdeasSuggestionSchema, type IdeasPrompt } from "../src/server/ideas.js";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { uncoveredNumbers } from "../src/web/studio/numbers.js";
import { startStudio } from "./helpers/studio.js";

const BRAND = { brandName: "Test brand", bannedWords: ["guaranteed", "nr. 1"] };
const FACT = {
  id: "f-00000000-0000-4000-8000-000000000001",
  text: "Orders over 12 units ship free.",
  source: "README.md",
};
const prompt = (task: WritingTask["task"], facts = [FACT]): WritingTask => ({
  task,
  template: "Statement",
  channel: "linkedin",
  note: "",
  current: { fields: {}, caption: "", altText: "" },
  facts,
  brand: BRAND,
  fields: [
    { id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true },
    { id: "text", label: "Text", kind: "text", max: 160, emphasis: false },
  ],
});
const IDEAS: IdeasPrompt = {
  from: "2026-10-05",
  to: "2026-10-16",
  count: 3,
  channel: "linkedin",
  note: "",
  templates: [{ id: "statement", name: "Statement", goal: "" }],
  facts: [{ id: FACT.id, text: FACT.text, kind: "product" }],
  moments: [{ key: "day", date: "2026-10-08", title: "Some day", sentence: "Something happens." }],
  existing: [],
  campaign: null,
  results: [],
  brand: BRAND,
};

describe("chooseProvider and aiMode", () => {
  it("chooses the sample provider without a key and Claude with a key", () => {
    expect(chooseProvider({}).name).toBe("sample");
    expect(chooseProvider({ ANTHROPIC_API_KEY: "  " }).name).toBe("sample");
    expect(chooseProvider({ ANTHROPIC_API_KEY: "x" }).name).toBe("anthropic");
  });

  it("reports the mode, and POSTWRIGHT_MODEL overrides the model", () => {
    expect(aiMode(chooseProvider({}))).toEqual({ mode: "sample", model: null });
    expect(aiMode(chooseProvider({ ANTHROPIC_API_KEY: "x" }))).toEqual({ mode: "live", model: DEFAULT_MODEL });
    expect(aiMode(chooseProvider({ ANTHROPIC_API_KEY: "x", POSTWRIGHT_MODEL: "claude-haiku-4-5" }))).toEqual({
      mode: "live",
      model: "claude-haiku-4-5",
    });
  });
});

describe("sample-provider", () => {
  it("gives three variants that only use text from the facts, at no cost", async () => {
    const r = await sampleProvider.writeText(prompt("caption"));
    expect(WritingSuggestionSchema.safeParse(r.suggestion).success).toBe(true);
    expect(r.suggestion.variants).toHaveLength(3);
    expect(r.usage).toEqual(EMPTY_USAGE);
    for (const v of r.suggestion.variants) {
      expect(v.caption).toMatch(/^Sample caption \d: Orders over 12 units ship free\.$/);
      expect(uncoveredNumbers(v.caption, [FACT])).toEqual([]);
      expect(v.usedFacts).toEqual([FACT.id]);
    }
  });

  it("puts exactly one phrase between asterisks in a headline field with emphasis, and fills the rest with the fact", async () => {
    const r = await sampleProvider.writeText(prompt("fields"));
    for (const v of r.suggestion.variants) {
      expect(v.fields[0].text.match(/\*[^*]+\*/g)).toHaveLength(1);
      expect(v.fields[1].text).toBe(FACT.text);
    }
    const without = await sampleProvider.writeText(prompt("fields", []));
    expect(without.suggestion.variants[0].fields[1].text).toBe("Sample text 1 for text.");
    expect(without.suggestion.variants[0].usedFacts).toEqual([]);
  });

  it("gives the requested ideas on workdays, with the first moment, and costs nothing", async () => {
    const r = await sampleProvider.suggestIdeas(IDEAS);
    expect(IdeasSuggestionSchema.safeParse(r.suggestion).success).toBe(true);
    expect(r.suggestion.ideas).toHaveLength(3);
    expect(r.suggestion.ideas[0]).toMatchObject({ title: "Some day", moment: "day", note: "Something happens." });
    expect(r.suggestion.ideas[1].title).toBe("Sample idea 2");
    expect(r.usage).toEqual(EMPTY_USAGE);
  });
});

describe("cost and usage", () => {
  it("calculates with the model's prices per million tokens", () => {
    expect(
      costUsd("claude-sonnet-5-5", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }),
    ).toBeCloseTo(12);
    // Cache read 0.20; cache write 1.25 times the input price (2.50).
    expect(
      costUsd("claude-sonnet-5-5", { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 }),
    ).toBeCloseTo(2.7);
    expect(costUsd("claude-haiku-4-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(1);
    expect(costUsd("sample", EMPTY_USAGE)).toBe(0);
  });

  it("calculates an unknown model at the highest price, so the cap does not count too low", () => {
    const u = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(costUsd("a-new-model", u)).toBe(costUsd("claude-fable-5-1", u));
    expect(costUsd("a-new-model", u)).toBeGreaterThan(costUsd("claude-sonnet-5-5", u));
  });

  describe("file", () => {
    const folders: string[] = [];
    afterEach(() => {
      while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
    });
    const isNew = () => {
      const d = mkdtempSync(join(tmpdir(), "pw-ai-"));
      folders.push(d);
      return d;
    };
    const line = (timestamp: string, usd: number, ok = true) => ({
      timestamp,
      model: "m",
      task: "writingHelp:fields",
      usd,
      ok,
    });

    it("writes to ai-usage.jsonl and counts only the current month", async () => {
      const d = isNew();
      expect(await monthTotalUsd(d, new Date("2026-10-05T12:00:00Z"))).toBe(0);
      await book(d, line("2026-09-30T23:59:59Z", 5));
      await book(d, line("2026-10-01T00:00:00Z", 1.5));
      await book(d, line("2026-10-04T10:00:00Z", 0.25, false));
      await book(d, line("2026-11-01T00:00:00Z", 7));
      expect(readFileSync(join(d, "ai-usage.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
      expect(await monthTotalUsd(d, new Date("2026-10-05T12:00:00Z"))).toBeCloseTo(1.75);
      expect(await monthTotalUsd(d, new Date("2026-09-01T00:00:00Z"))).toBeCloseTo(5);
    });

    const filePath = (d: string) => join(d, "ai-usage.jsonl");
    const NOW = new Date("2026-10-05T12:00:00Z");

    it("ignores only a last, unfinished line (a crashed process)", async () => {
      const d = isNew();
      await book(d, line("2026-10-01T00:00:00Z", 2));
      appendFileSync(filePath(d), '{"timestamp":"2026-10-0');
      expect(await monthTotalUsd(d, NOW)).toBeCloseTo(2);
    });

    it("record starts on a new line if the file does not end with a line break", async () => {
      const d = isNew();
      await book(d, line("2026-10-01T00:00:00Z", 2));
      appendFileSync(filePath(d), '{"timestamp":"2026-10-0');
      await book(d, line("2026-10-02T00:00:00Z", 3));
      const rawLines = readFileSync(filePath(d), "utf8").split("\n");
      // The new booking sits whole on a line of its own, not stuck onto the half one.
      expect(JSON.parse(rawLines[2])).toMatchObject({ usd: 3 });
      expect(rawLines[3]).toBe("");
    });

    it("refuses (500) an unreadable line in the middle of the file, with file and line number", async () => {
      const d = isNew();
      await book(d, line("2026-10-01T00:00:00Z", 2));
      appendFileSync(filePath(d), "{broken\n");
      await book(d, line("2026-10-02T00:00:00Z", 3));
      await expect(monthTotalUsd(d, NOW)).rejects.toMatchObject({
        status: 500,
        message: expect.stringMatching(/ai-usage\.jsonl.*line 2\b/),
      });
    });

    it.each([
      ["usd as text", '{"timestamp":"2026-10-01T00:00:00Z","usd":"99"}'],
      ["usd missing", '{"timestamp":"2026-10-01T00:00:00Z"}'],
      ["usd is null", '{"timestamp":"2026-10-01T00:00:00Z","usd":null}'],
      ["no timestamp", '{"usd":1}'],
      ["not an object", "[1]"],
    ])("refuses (500) a line with %s, even if it is the last", async (_name, content) => {
      const d = isNew();
      writeFileSync(filePath(d), content + "\n");
      await expect(monthTotalUsd(d, NOW)).rejects.toMatchObject({
        status: 500,
        message: expect.stringMatching(/ai-usage\.jsonl.*line 1\b/),
      });
    });
  });
});

describe("AnthropicProvider (with a fake client)", () => {
  const response = (o: Record<string, unknown>) => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ variants: [] }) }],
    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: null },
    ...o,
  });
  const withClient = (create: (p: Record<string, any>) => unknown) => {
    const seen: Array<Record<string, any>> = [];
    const client = {
      create: async (p: Record<string, any>) => {
        seen.push(p);
        return create(p);
      },
    } as unknown as ClientFactory;
    return { seen, provider: new AnthropicProvider({ apiKey: "x", model: "claude-sonnet-5-5", client }) };
  };

  it("sends a structured request with the brand name in the instruction and returns usage", async () => {
    const { seen, provider } = withClient(() => response({}));
    const r = await provider.writeText(prompt("caption"));
    expect(r).toMatchObject({
      model: "claude-sonnet-5-5",
      suggestion: { variants: [] },
      usage: { input: 100, output: 40, cacheRead: 10, cacheWrite: 0 },
    });
    const p = seen[0];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.system).toContain("Test brand");
    expect(p.system).toContain("Tone: plain and calm");
    expect(p.system).toContain("use only the facts provided");
    // The task contains the facts, but not the brand.
    expect(p.messages[0].content).toContain(FACT.text);
    expect(p.messages[0].content).not.toContain("Test brand");
  });

  it("throws an AiError with the tokens used on a refusal, a cut-off or an unreadable answer", async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ stop_reason: "refusal" }, /declined/],
      [{ stop_reason: "max_tokens" }, /cut off/],
      [{ content: [{ type: "text", text: "not json" }] }, /valid JSON/],
      [{ content: [{ type: "text", text: JSON.stringify({ variants: [{ caption: 1 }] }) }] }, /schema/],
    ];
    for (const [extra, notice] of cases) {
      const { provider } = withClient(() => response(extra));
      const error = await provider.writeText(prompt("caption")).catch((e) => e);
      expect(error).toBeInstanceOf(AiError);
      expect(error.message).toMatch(notice);
      expect(error.usage).toMatchObject({ input: 100, output: 40 });
    }
  });

  it("turns an API error into an AiError without usage", async () => {
    const { provider } = withClient(() => {
      throw new Error("401 invalid x-api-key");
    });
    const error = await provider.suggestIdeas(IDEAS).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.usage).toBeUndefined();
  });
});

describe("routes", () => {
  const studios: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (studios.length) await studios.pop()!.close();
  });
  async function start(provider?: AiProvider) {
    const s = await startStudio({ provider });
    studios.push(s);
    const ask = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
      const r = await fetch(s.base + path, {
        method: method,
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      return { status: r.status, text, body: JSON.parse(text) as any };
    };
    return { ...s, ask };
  }
  const request = {
    task: "caption",
    template: "Statement",
    channel: "linkedin",
    note: "",
    fields: [],
    facts: [],
  };
  const live = (behavior: (o: any) => Promise<any>): AiProvider => ({
    name: "anthropic",
    model: "claude-sonnet-5-5",
    writeText: behavior,
    suggestIdeas: behavior,
  });
  const lines = (dataDir: string) =>
    readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

  it("GET /api/ai gives the mode without the key", async () => {
    const without = await start();
    expect((await without.ask("/api/ai")).body).toEqual({ mode: "sample", model: null });
    const secret = await start(chooseProvider({ ANTHROPIC_API_KEY: "sk-test-secret" }));
    const ai = await secret.ask("/api/ai");
    expect(ai.body).toEqual({ mode: "live", model: DEFAULT_MODEL });
    expect(ai.text).not.toContain("sk-test-secret");
  });

  it("a failed call with a real client leaks the key nowhere: not in the response, the usage file or the log", async () => {
    const KEY = "sk-ant-test-0123456789-secret";
    // The SDK really does receive the key; the "network" returns an error that has the key in
    // its text (the worst kind: a client that echoes the header back). What the studio passes
    // on must not contain it.
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seenHeadlines: Array<Record<string, string>> = [];
    try {
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: any, init?: any) => {
        const address = String(input?.url ?? input);
        if (!address.includes("api.anthropic.com")) return original(input, init);
        seenHeadlines.push(Object.fromEntries(new Headers(init?.headers ?? input?.headers).entries()));
        return new Response(
          JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch;
      try {
        // Created after the redirect: the SDK remembers the `fetch` from the moment the client is
        // built.
        const provider = chooseProvider({ ANTHROPIC_API_KEY: KEY });
        expect(provider.name).toBe("anthropic");
        const { ask, dataDir } = await start(provider);
        const r = await ask("/api/writing-help", request);
        expect(r.status).toBe(502);
        // The call really did leave with the key (so the test checks something) ...
        expect(seenHeadlines.length).toBeGreaterThan(0);
        expect(JSON.stringify(seenHeadlines)).toContain(KEY);
        // ... and it appears nowhere the user or a log file can see it.
        expect(r.text).not.toContain(KEY);
        expect(readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")).not.toContain(KEY);
        const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls], (_k, v) =>
          v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
        );
        expect(output).not.toContain(KEY);
      } finally {
        globalThis.fetch = original;
      }
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it("a damaged usage file refuses a live call with a 500, without calling the provider", async () => {
    const calls: number[] = [];
    const { ask, dataDir } = await start(
      live(async () => {
        calls.push(1);
        return { suggestion: { variants: [] }, model: "claude-sonnet-5-5", usage: EMPTY_USAGE, durationMs: 1 };
      }),
    );
    writeFileSync(
      join(dataDir, "ai-usage.jsonl"),
      `{"timestamp":"${new Date().toISOString()}","usd":"99"}\n{"tijdstip":"x"}{"tijdstip"\n`,
    );
    const r = await ask("/api/writing-help", request);
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("ai-usage.jsonl");
    expect(calls).toHaveLength(0);
  });

  it("the banned words from the settings go to the model as a prohibition, in both requests", async () => {
    const seen: Array<{ task: string; banned: string[] }> = [];
    const spy = live(async (o: any) => {
      seen.push({ task: o.from ? "ideas" : "writingHelp", banned: o.brand.bannedWords });
      return {
        suggestion: o.from ? { ideas: [] } : { variants: [] },
        model: "claude-sonnet-5-5",
        usage: EMPTY_USAGE,
        durationMs: 1,
      };
    });
    const { ask } = await start(spy);
    await ask("/api/settings", { ...DEFAULT_SETTINGS, bannedWords: ["wonderbaarlijk", "nr. 1"] }, "PUT");
    expect((await ask("/api/writing-help", request)).status).toBe(200);
    expect(
      (await ask("/api/ideas/suggest", { from: "2099-01-01", to: "2099-01-05", count: 1, channel: "linkedin" })).status,
    ).toBe(200);
    expect(seen).toEqual([
      { task: "writingHelp", banned: ["wonderbaarlijk", "nr. 1"] },
      { task: "ideas", banned: ["wonderbaarlijk", "nr. 1"] },
    ]);
  });

  it("the sample provider answers with sample: true, without a cap, and records $ 0", async () => {
    const { ask, dataDir } = await start();
    await ask("/api/settings", { ...DEFAULT_SETTINGS, writingHelp: { enabled: true, capUsdPerMonth: 0 } }, "PUT");
    const r = await ask("/api/writing-help", request);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sample: true, model: "sample" });
    expect(r.body.variants).toHaveLength(3);
    expect(lines(dataDir)).toMatchObject([{ task: "writingHelp:caption", usd: 0, ok: true }]);
  });

  it("a live provider that throws an AiError gives 502 without sample, and the call is recorded as failed", async () => {
    const { ask, dataDir } = await start(
      live(async () => {
        throw new AiError("401 invalid x-api-key");
      }),
    );
    const r = await ask("/api/writing-help", request);
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("401 invalid x-api-key");
    expect(r.body).not.toHaveProperty("sample");
    expect(lines(dataDir)).toMatchObject([
      { task: "writingHelp:caption", usd: 0, ok: false, model: "claude-sonnet-5-5" },
    ]);
  });

  it("records the tokens already used on a failure", async () => {
    const usage = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 };
    const { ask, dataDir } = await start(
      live(async () => {
        throw new AiError("cut off", usage);
      }),
    );
    expect((await ask("/api/writing-help", request)).status).toBe(502);
    expect(lines(dataDir)[0]).toMatchObject({ ok: false, usd: 2 });
  });

  it("the user's brand (data/brand/brand.json) gives the brand name to the writing help and is served that way", async () => {
    const seen: string[] = [];
    const spy = live(async (o: WritingTask) => {
      seen.push(o.brand.brandName);
      return { suggestion: { variants: [] }, model: "claude-sonnet-5-5", usage: EMPTY_USAGE, durationMs: 1 };
    });
    const { ask, dataDir, base } = await start(spy);
    expect((await ask("/api/writing-help", request)).status).toBe(200);
    expect(seen).toEqual(["Postwright"]); // the built-in brand
    const builtIn = JSON.parse(readFileSync(new URL("../src/web/brand/brand.json", import.meta.url), "utf8"));
    const custom = JSON.stringify({ ...builtIn, name: "Own brand", version: "custom-9" });
    mkdirSync(join(dataDir, "brand"), { recursive: true });
    writeFileSync(join(dataDir, "brand", "brand.json"), custom);
    expect((await ask("/api/writing-help", request)).status).toBe(200);
    expect(seen).toEqual(["Postwright", "Own brand"]);
    const served = await fetch(`${base}/brand/brand.json`);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe(custom);
  });

  it.each([
    ["a wrong type", '{"writingHelp":{"enabled":"no"}}'],
    ["not JSON", "{this is not json"],
  ])("refuses an AI call on unreadable settings (%s) without calling the provider", async (_name, content) => {
    const spy = vi.fn(async () => {
      throw new Error("must not be called");
    });
    const { ask, dataDir } = await start(live(spy));
    mkdirSync(join(dataDir, "marketing"), { recursive: true });
    writeFileSync(join(dataDir, "marketing", "settings.json"), content);
    for (const [path, body] of [
      ["/api/writing-help", request],
      ["/api/ideas/suggest", { from: "2099-01-01", to: "2099-01-05", count: 1, channel: "linkedin" }],
    ] as const) {
      const r = await ask(path, body);
      expect(r.status).toBe(500);
      expect(r.body.error).toContain("marketing/settings.json");
    }
    expect(spy).not.toHaveBeenCalled();
    expect(existsSync(join(dataDir, "ai-usage.jsonl"))).toBe(false);
  });

  it("stops a live provider at the monthly cap; the sample provider keeps working", async () => {
    const calls: number[] = [];
    const behavior = async () => {
      calls.push(1);
      return { suggestion: { variants: [] }, model: "claude-sonnet-5-5", usage: EMPTY_USAGE, durationMs: 1 };
    };
    const l = await start(live(behavior));
    await book(l.dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 10, ok: true });
    const blocked = await l.ask("/api/writing-help", request);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/monthly cap/);
    expect(calls).toHaveLength(0);
    // A slightly higher cap lets it through again.
    await l.ask("/api/settings", { ...DEFAULT_SETTINGS, writingHelp: { enabled: true, capUsdPerMonth: 10.01 } }, "PUT");
    expect((await l.ask("/api/writing-help", request)).status).toBe(200);

    const v = await start();
    await book(v.dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 99, ok: true });
    expect((await v.ask("/api/writing-help", request)).status).toBe(200);
  });
});
