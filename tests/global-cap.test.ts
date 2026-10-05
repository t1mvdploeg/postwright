// The monthly cap is one setting for all projects, in data/settings.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { prepareData } from "../src/server/projects.js";
import type { AiProvider } from "../src/server/ai/provider.js";
import { startStudio } from "./helpers/studio.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

// $0.40 per call: 100,000 in and 20,000 out at $2 and $10 per million.
const provider = {
  name: "anthropic",
  model: "claude-sonnet-5-5",
  writeText: async () => ({
    suggestion: {
      variants: [{ fields: [{ id: "headline", text: "A *headline*" }], caption: "", altText: "", usedFacts: [] }],
    },
    model: "claude-sonnet-5-5",
    usage: { input: 100_000, output: 20_000, cacheRead: 0, cacheWrite: 0 },
    durationMs: 5,
  }),
} as unknown as AiProvider;
const HELP = {
  task: "fields",
  template: "Statement",
  channel: "linkedin",
  note: "",
  facts: [],
  fields: [{ id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true }],
};

async function start() {
  const s = await startStudio({ provider });
  studios.push(s);
  const call = async (project: string, path: string, method = "GET", body?: unknown) => {
    const r = await fetch(s.base + path, {
      method,
      headers: {
        "x-postwright-project": project,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  await call("postwright", "/api/projects", "POST", { name: "Beta" });
  return { ...s, call };
}

describe("the cap", () => {
  it("is the same in every project and is stored in data/settings.json, not in the project file", async () => {
    const { call, dataDir, projectDir } = await start();
    const settings = (await call("postwright", "/api/settings")).body;
    const saved = await call("postwright", "/api/settings", "PUT", {
      ...settings,
      writingHelp: { enabled: true, capUsdPerMonth: 3 },
    });
    expect(saved.status).toBe(200);
    expect((await call("beta", "/api/settings")).body.writingHelp.capUsdPerMonth).toBe(3);
    expect(JSON.parse(readFileSync(join(dataDir, "settings.json"), "utf8"))).toEqual({ capUsdPerMonth: 3 });
    const projectFile = JSON.parse(readFileSync(join(projectDir, "marketing", "settings.json"), "utf8"));
    expect(projectFile.writingHelp).toEqual({ enabled: true });
  });

  it("keeps the other settings per project", async () => {
    const { call } = await start();
    const a = (await call("postwright", "/api/settings")).body;
    await call("beta", "/api/settings", "PUT", {
      ...a,
      writingHelp: { enabled: false, capUsdPerMonth: a.writingHelp.capUsdPerMonth },
    });
    expect((await call("beta", "/api/settings")).body.writingHelp.enabled).toBe(false);
    expect((await call("postwright", "/api/settings")).body.writingHelp.enabled).toBe(true);
  });

  it("counts the spending of all projects together", async () => {
    const { call } = await start();
    const a = (await call("postwright", "/api/settings")).body;
    await call("postwright", "/api/settings", "PUT", { ...a, writingHelp: { enabled: true, capUsdPerMonth: 0.5 } });
    expect((await call("postwright", "/api/writing-help", "POST", HELP)).status).toBe(200); // $0.40
    const second = await call("beta", "/api/writing-help", "POST", HELP);
    expect(second.status).toBe(200); // $0.40 booked, now $0.80 spent
    const third = await call("beta", "/api/writing-help", "POST", HELP);
    expect(third.status).toBe(429);
    expect(third.body.error).toContain("monthly cap");
  });

  it("names data/settings.json when it is broken", async () => {
    const { call, dataDir } = await start();
    writeFileSync(join(dataDir, "settings.json"), "{broken");
    const r = await call("postwright", "/api/settings");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/settings\.json cannot be read/);
    expect(r.body.error).not.toContain(dataDir);
  });
});

describe("the migration", () => {
  it("takes the cap of the old settings file along", async () => {
    const data = join(mkdtempSync(join(tmpdir(), "pw-cap-")), "data");
    mkdirSync(join(data, "marketing"), { recursive: true });
    writeFileSync(
      join(data, "marketing", "settings.json"),
      JSON.stringify({ ...DEFAULT_SETTINGS, writingHelp: { enabled: true, capUsdPerMonth: 3 } }),
    );
    await prepareData(data);
    expect(JSON.parse(readFileSync(join(data, "settings.json"), "utf8"))).toEqual({ capUsdPerMonth: 3 });
  });
});
