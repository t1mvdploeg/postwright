// Marketing studio: suggesting ideas for a period. The server chooses what the model sees
// and re-checks everything that comes back: dates within the period, existing templates,
// only supplied facts and moments, and numbers without a source reported. Nothing is saved
// automatically.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { plusDays } from "../src/web/studio/calendar.js";
import {
  ideasInstruction,
  IdeasSuggestionSchema,
  tidyIdeas,
  workdays,
  type IdeasPrompt,
  type IdeasSuggestion,
} from "../src/server/ideas.js";
import { EMPTY_USAGE, type AiProvider, type AiResult } from "../src/server/ai/provider.js";
import { monthTotalUsd } from "../src/server/ai/usage.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import { startStudio } from "./helpers/studio.js";

const PROMPT: IdeasPrompt = {
  from: "2026-10-05",
  to: "2026-10-16",
  count: 3,
  channel: "linkedin",
  note: "",
  templates: [
    { id: "statement", name: "Statement", goal: "" },
    { id: "question", name: "Question", goal: "" },
  ],
  facts: [
    { id: "f-00000000-0000-4000-8000-000000000001", text: "The minimum hourly rate is € 14,99.", kind: "external" },
  ],
  moments: [
    {
      key: "signup-transition",
      date: "2026-11-01",
      title: "Registration",
      sentence: "Registration is open from 1 November to 31 December 2026.",
    },
  ],
  existing: [],
  campaign: null,
  results: [],
  brand: { brandName: "Test brand", bannedWords: [] },
};
const idea = (
  x: Partial<{
    date: string;
    title: string;
    note: string;
    template: string;
    headline: string;
    facts: string[];
    moment: string;
  }>,
) => ({
  date: "2026-10-06",
  title: "An idea",
  note: "",
  template: "statement",
  headline: "A *headline.*",
  facts: [],
  moment: "",
  ...x,
});

describe("workdays", () => {
  it("gives Monday to Friday in the period", () => {
    expect(workdays("2026-10-23", "2026-10-27")).toEqual(["2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(workdays("2026-10-24", "2026-10-25")).toEqual([]);
  });
});

describe("tidyIdeas", () => {
  it("drops invalid and out-of-period dates and empty titles, truncates and sorts", () => {
    const off = tidyIdeas(
      {
        ideas: [
          idea({ date: "2026-10-09", title: "B" }),
          idea({ date: "2026-02-30" }),
          idea({ date: "2026-10-20" }),
          idea({ date: "2026-10-06", title: "A" }),
          idea({ title: "   " }),
          idea({ date: "2026-10-07", title: "C" }),
          idea({ date: "2026-10-08", title: "D" }),
        ],
      },
      PROMPT,
    );
    expect(off.map((i) => i.title)).toEqual(["A", "C", "B"]);
  });
  it("does not stumble over a date that is not a date (month 13 gives an invalid Date in JavaScript)", () => {
    expect(
      tidyIdeas(
        { ideas: [idea({ date: "2026-13-01" }), idea({ date: "2026-10-00" }), idea({ title: "Good" })] },
        PROMPT,
      ).map((i) => i.title),
    ).toEqual(["Good"]);
  });
  it("turns an unknown template into null and drops invented facts and moments", () => {
    const [i] = tidyIdeas(
      { ideas: [idea({ template: "canva", facts: ["f-made-up", PROMPT.facts[0].id], moment: "does-not-exist" })] },
      PROMPT,
    );
    expect(i).toMatchObject({ template: null, facts: [PROMPT.facts[0].id], moment: null });
  });
  it("reports numbers without a source; a linked fact or moment covers them", () => {
    const [without] = tidyIdeas({ ideas: [idea({ note: "The rate is € 14,99 and the fine € 50.000." })] }, PROMPT);
    expect(without.uncovered).toEqual(["€ 14,99", "€ 50.000"]);
    const [withValue] = tidyIdeas(
      {
        ideas: [
          idea({
            note: "The rate is € 14,99; register before 31 December.",
            facts: [PROMPT.facts[0].id],
            moment: "signup-transition",
          }),
        ],
      },
      PROMPT,
    );
    expect(withValue.uncovered).toEqual([]);
  });
});

describe("sample provider and instruction", () => {
  it("gives exactly the requested number of ideas on workdays in the period, which pass the recalculation", async () => {
    const r = await sampleProvider.suggestIdeas(PROMPT);
    expect(IdeasSuggestionSchema.safeParse(r.suggestion).success).toBe(true);
    expect(r.suggestion.ideas).toHaveLength(3);
    const off = tidyIdeas(r.suggestion, PROMPT);
    expect(off).toHaveLength(3);
    expect(
      off.every(
        (i) => workdays(PROMPT.from, PROMPT.to).includes(i.date) && i.template !== null && i.uncovered.length === 0,
      ),
    ).toBe(true);
    expect(off[0].moment).toBe("signup-transition");
    expect(r.usage).toEqual(EMPTY_USAGE);
  });

  it("takes the brand name from the brand and keeps the rule about the facts", () => {
    const text = ideasInstruction({ brandName: "Sample brand", bannedWords: ["guaranteed", "nr. 1"] });
    expect(text).toContain("Sample brand");
    expect(text).toContain("Tone: plain and calm");
    expect(text).toContain("use only the facts provided");
    expect(text).toContain('["guaranteed","nr. 1"]');
  });
});

// ---------------------------------------------------------------------------------------------
// The route, with its own test provider as in writing-help.test.ts.
// ---------------------------------------------------------------------------------------------
const fake = {
  seen: null as IdeasPrompt | null,
  response: null as ((o: IdeasPrompt) => AiResult<IdeasSuggestion>) | null,
};
const provider: AiProvider = {
  name: "anthropic",
  model: "claude-sonnet-5-5",
  suggestIdeas: async (o) => {
    fake.seen = o;
    return fake.response!(o);
  },
  // Only for the cap test: a writing help call that costs something ($ 0.40).
  writeText: async () => ({
    suggestion: {
      variants: [{ fields: [{ id: "headline", text: "A *headline*" }], caption: "", altText: "", usedFacts: [] }],
    },
    model: "claude-sonnet-5-5",
    usage: { input: 100_000, output: 20_000, cacheRead: 0, cacheWrite: 0 },
    durationMs: 5,
  }),
};

let base = "";
let dataDir = "";
let close: () => Promise<void>;
const API = "/api";
/** The same Amsterdam date as the server. */
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

async function ask(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const r = await fetch(base + path, {
    method: method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}

async function setAiHelp(enabled: boolean, cap = 10) {
  const r = await ask(`${API}/settings`, { ...DEFAULT_SETTINGS, writingHelp: { enabled, capUsdPerMonth: cap } }, "PUT");
  expect(r.status).toBe(200);
}

const request = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  from,
  to,
  count: 2,
  channel: "linkedin",
  note: "For planners.",
  campaign: null,
  ...extra,
});

const bookings = () => {
  try {
    return readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

beforeAll(async () => {
  const s = await startStudio({ provider });
  base = s.base;
  dataDir = s.dataDir;
  close = s.close;
});
afterAll(async () => {
  await close();
});
beforeEach(() => {
  fake.seen = null;
  fake.response = (o) => ({
    suggestion: { ideas: [idea({ date: o.from, title: "First" })] },
    model: "claude-sonnet-5-5",
    usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
    durationMs: 5,
  });
});

describe("POST /ideas/suggestions", () => {
  it("is off as long as the AI help is off", async () => {
    await setAiHelp(false);
    const from = plusDays(today(), 1);
    const r = await ask(`${API}/ideas/suggest`, request(from, plusDays(from, 9)));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/is off/);
    expect(fake.seen).toBeNull();
  });

  it("gives suggestions within the period, saves nothing and records the cost as marketing", async () => {
    await setAiHelp(true);
    const from = plusDays(today(), 1);
    const to = plusDays(from, 9);
    fake.response = (o) => ({
      suggestion: {
        ideas: [
          idea({ date: o.from, title: "Inside" }),
          idea({ date: plusDays(o.to, 5), title: "Outside" }),
          idea({ date: plusDays(o.from, 2), title: "Unknown template", template: "unknown" }),
        ],
      },
      model: "claude-sonnet-5-5",
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
      durationMs: 5,
    });
    const before = bookings().length;
    const r = await ask(`${API}/ideas/suggest`, request(from, to));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ model: "claude-sonnet-5-5", from, sample: false });
    const suggestions = r.body.suggestions as Array<{ date: string; title: string; template: string | null }>;
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(2);
    expect(suggestions.every((v) => v.date >= from && v.date <= to)).toBe(true);
    expect(suggestions.map((v) => v.title)).toEqual(["Inside", "Unknown template"]);
    expect(suggestions.find((v) => v.title === "Unknown template")!.template).toBeNull();
    expect(suggestions.find((v) => v.title === "Inside")!.template).toBe("statement");
    // The model got what the server chose itself: the period, the count and the real templates.
    expect(fake.seen).toMatchObject({ from, to, count: 2, channel: "linkedin", campaign: null });
    expect(fake.seen!.templates.some((s) => s.id === "statement")).toBe(true);
    // Nothing saved.
    expect((await ask(`${API}/ideas`)).body.ideas).toEqual([]);
    // One booking, with task `ideas:<from>..<to>`.
    const lines = bookings();
    expect(lines.length).toBe(before + 1);
    expect(lines.at(-1)).toMatchObject({ task: `ideas:${from}..${to}`, ok: true, model: "claude-sonnet-5-5" });
  });

  it("refuses a period in the past and a period longer than three months", async () => {
    await setAiHelp(true);
    const now = today();
    const past = await ask(`${API}/ideas/suggest`, request(plusDays(now, -10), plusDays(now, -1)));
    expect(past.status).toBe(400);
    expect(past.body.error).toMatch(/past/);
    const from = plusDays(now, 1);
    // 93 days, from and to both counted: too long.
    const lang = await ask(`${API}/ideas/suggest`, request(from, plusDays(from, 92)));
    expect(lang.status).toBe(400);
    expect(lang.body.error).toMatch(/three months/);
    expect(fake.seen).toBeNull();
    // Exactly 92 days, from and to both counted, is still allowed.
    expect((await ask(`${API}/ideas/suggest`, request(from, plusDays(from, 91)))).status).toBe(200);
  });

  it("refuses a date that does not exist with 400, not with a server error", async () => {
    await setAiHelp(true);
    const from = plusDays(today(), 1);
    expect((await ask(`${API}/ideas/suggest`, request("2099-13-01", "2099-13-05"))).status).toBe(400);
    // Day 32 always lies after `from` in the same month and within three months: only the date
    // check catches it.
    expect((await ask(`${API}/ideas/suggest`, request(from, `${from.slice(0, 7)}-32`))).status).toBe(400);
    expect(fake.seen).toBeNull();
  });

  it("treats a start in the past as today", async () => {
    await setAiHelp(true);
    const now = today();
    const r = await ask(`${API}/ideas/suggest`, request(plusDays(now, -1), plusDays(now, 5)));
    expect(r.status).toBe(200);
    expect(r.body.from).toBe(now);
    expect(fake.seen!.from).toBe(now);
    expect(r.body.suggestions.every((v: { date: string }) => v.date >= now)).toBe(true);
  });

  it("shares the monthly cap with the writing help", async () => {
    // First a writing help call that really costs something, with room under the cap.
    await setAiHelp(true, 1000);
    const help = await ask(`${API}/writing-help`, {
      task: "fields",
      template: "Statement",
      channel: "linkedin",
      note: "",
      facts: [],
      fields: [{ id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true }],
    });
    expect(help.status).toBe(200);
    const last = bookings().at(-1);
    expect(last).toMatchObject({ task: "writingHelp:fields", ok: true });
    expect(last.usd).toBeCloseTo(0.4, 8); // 100,000 in and 20,000 out at $ 2 and $ 10 per million
    // The cap exactly at what has been spent this month, writing help included: then it is
    // reached.
    await setAiHelp(true, await monthTotalUsd(dataDir, new Date()));
    const from = plusDays(today(), 1);
    const r = await ask(`${API}/ideas/suggest`, request(from, plusDays(from, 9)));
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/monthly cap/);
    expect(fake.seen).toBeNull();
  });

  it("gives the model only usable facts, and the campaign with name and goal (final review, C3)", async () => {
    await setAiHelp(true, 1000);
    const fact = async (text: string, status: string, validUntil: string | null = null) => {
      const r = await ask(`${API}/facts`, {
        text,
        kind: "product",
        source: { kind: "site", reference: "README.md" },
        status,
        validUntil,
      });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    const active = await fact("An active fact for the ideas help.", "active");
    const draft = await fact("A draft fact for the ideas help.", "draft");
    const expired = await fact("An expired fact for the ideas help.", "active", plusDays(today(), -1));
    const withdrawn = await fact("A withdrawn fact for the ideas help.", "withdrawn");
    const campaign = await ask(`${API}/campaigns`, {
      name: "Autumn",
      utmCampaign: "autumn-ideas",
      goal: "Point readers to the new release.",
    });
    expect(campaign.status).toBe(201);
    const from = plusDays(today(), 1);
    const r = await ask(`${API}/ideas/suggest`, request(from, plusDays(from, 9), { campaign: campaign.body.id }));
    expect(r.status).toBe(200);
    const seen = fake.seen!.facts.map((f) => f.id);
    expect(seen).toContain(active);
    for (const id of [draft, expired, withdrawn]) expect(seen).not.toContain(id);
    expect(fake.seen!.campaign).toEqual({ name: "Autumn", goal: "Point readers to the new release." });
  });

  it("refuses a campaign that does not exist with 400, without asking the model", async () => {
    await setAiHelp(true, 1000);
    const from = plusDays(today(), 1);
    const r = await ask(
      `${API}/ideas/suggest`,
      request(from, plusDays(from, 9), { campaign: "c-00000000-0000-4000-8000-000000000000" }),
    );
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/campaign/);
    expect(fake.seen).toBeNull();
  });
});
