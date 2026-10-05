// The routes for own templates: list, rename, delete, and where an own template shows up in
// the planner and the ideas. (The routes for the input material, the generation and the
// proposal have their own sections further down.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { plusDays } from "../src/web/studio/calendar.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import type { AiProvider } from "../src/server/ai/provider.js";
import type { IdeasPrompt } from "../src/server/ideas.js";
import { exampleTemplate, writeOwn } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (studios.length) await studios.pop()!.close();
});
async function start(options: Parameters<typeof startTemplates>[0] = { withClient: false }) {
  const s = await startTemplates(options);
  studios.push(s);
  return s;
}

describe("GET /api/templates", () => {
  it("lists the templates and the files that were skipped, and still answers when a file is broken", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { call, projectDir } = await start();
    expect((await call("/api/templates")).body).toEqual({ templates: [], skipped: [] });
    writeOwn(projectDir);
    writeFileSync(join(projectDir, "templates", "own-33333333.json"), "{ not json");
    const r = await call("/api/templates");
    expect(r.status).toBe(200);
    expect(r.body.templates.map((t: any) => [t.id, t.name])).toEqual([["own-0123abcd", "Statement"]]);
    expect(r.body.skipped).toHaveLength(1);
    expect(r.body.skipped[0].file).toBe("own-33333333.json");
  });
});

describe("PUT /api/templates/:id", () => {
  it("renames, trims the name, and refuses anything else in the body", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    const ok = await call(`/api/templates/${id}`, "PUT", { name: "  Quote  " });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe("Quote");
    expect((await call("/api/templates")).body.templates[0].name).toBe("Quote");
    for (const body of [{ name: "" }, { name: "x".repeat(41) }, {}, { name: "A", css: "" }, { name: 5 }]) {
      expect((await call(`/api/templates/${id}`, "PUT", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call("/api/templates/own-99999999", "PUT", { name: "A" })).status).toBe(404);
    expect((await call("/api/templates/nope", "PUT", { name: "A" })).status).toBe(400);
  });
});

describe("DELETE /api/templates/:id", () => {
  it("deletes, and says 404 for one that is gone", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    expect((await call(`/api/templates/${id}`, "DELETE")).status).toBe(200);
    expect((await call(`/api/templates/${id}`, "DELETE")).status).toBe(404);
  });
});

describe("an own template in ideas and in the planner", () => {
  it("accepts the id of an own template on an idea, and still refuses an unknown one", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    const idea = (template: string | null) => ({ date: "2026-10-12", title: "An idea", template });
    expect((await call("/api/ideas", "POST", idea(id))).status).toBe(201);
    expect((await call("/api/ideas", "POST", idea("statement"))).status).toBe(201);
    expect((await call("/api/ideas", "POST", idea(null))).status).toBe(201);
    const unknown = await call("/api/ideas", "POST", idea("own-99999999"));
    expect(unknown).toMatchObject({ status: 400, body: { error: "Unknown template" } });
    const saved = (await call("/api/ideas")).body.ideas.find((i: any) => i.template === id);
    expect((await call(`/api/ideas/${saved.id}`, "PUT", idea(id))).status).toBe(200);
    expect((await call(`/api/ideas/${saved.id}`, "PUT", idea("own-99999999"))).status).toBe(400);
  });

  it("does not let an idea use the template of another project", async () => {
    const { call, projectDir } = await start();
    const id = writeOwn(projectDir);
    await call("/api/projects", "POST", { name: "Beta" });
    const r = await call("/api/ideas", "POST", { date: "2026-10-12", title: "X", template: id }, "beta");
    expect(r.status).toBe(400);
  });

  it("offers the own templates to the idea planner next to the built-in ones", async () => {
    let seen: IdeasPrompt | null = null;
    const provider: AiProvider = {
      ...sampleProvider,
      suggestIdeas: async (prompt) => {
        seen = prompt;
        return sampleProvider.suggestIdeas(prompt);
      },
    };
    const { call, projectDir } = await start({ withClient: false, provider });
    writeOwn(projectDir, { ...exampleTemplate(), name: "Quote card", goal: "A quote." });
    const from = plusDays(new Date().toISOString().slice(0, 10), 1);
    const r = await call("/api/ideas/suggest", "POST", {
      from,
      to: plusDays(from, 6),
      count: 2,
      channel: "linkedin",
      note: "",
      campaign: null,
    });
    expect(r.status).toBe(200);
    const ids = seen!.templates.map((t) => t.id);
    expect(ids.slice(0, 9)).toContain("statement");
    expect(ids).toHaveLength(10);
    expect(seen!.templates[9]).toEqual({ id: "own-0123abcd", name: "Quote card", goal: "A quote." });
  });
});
