// The routes for own templates: list, rename, delete, and where an own template shows up in
// the planner and the ideas. (The routes for the input material, the generation and the
// proposal have their own sections further down.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { plusDays } from "../src/web/studio/calendar.js";
import { sampleProvider } from "../src/server/ai/sample.js";
import type { AiProvider } from "../src/server/ai/provider.js";
import type { IdeasPrompt } from "../src/server/ideas.js";
import { exampleTemplate, saved, writeOwn, writeTemplateProposal } from "./helpers/template.js";
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

describe("the proposal routes", () => {
  const proposal = (dir: string, template: unknown = exampleTemplate(), extras?: unknown) =>
    writeTemplateProposal(dir, template, extras);

  it("says none, then ready with the notes and whether it is a sample, then invalid with every problem", async () => {
    const { call, projectDir } = await start();
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    proposal(projectDir, exampleTemplate(), { notes: ["From the old posts."], sample: true });
    const ready = await call("/api/template-proposal");
    expect(ready.body).toMatchObject({
      state: "ready",
      notes: ["From the old posts."],
      sample: true,
      template: { name: "Statement" },
    });
    proposal(projectDir, { ...exampleTemplate(), css: ".a { color: red; }", tree: [{ tag: "script" }] });
    const invalid = await call("/api/template-proposal");
    expect(invalid.body.state).toBe("invalid");
    expect(invalid.body.problems).toHaveLength(2);
    expect(invalid.body.problems.join("\n")).toMatch(/colour "red"/);
  });

  it("is invalid for an id of its own, for text that is not JSON, and for extras that do not fit", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir, saved(exampleTemplate()));
    expect((await call("/api/template-proposal")).body.problems[0]).toMatch(/must not have them/);
    const dir = proposal(projectDir);
    writeFileSync(join(dir, "template.json"), "{ nope");
    expect((await call("/api/template-proposal")).body).toEqual({
      state: "invalid",
      problems: ["template.json: not valid JSON"],
    });
    proposal(projectDir, exampleTemplate(), { notes: "x", unknown: true });
    expect((await call("/api/template-proposal")).body.problems[0]).toMatch(/^extras\.json: /);
  });

  it("applies a proposal: the server makes the id, the proposal goes, and the template is in the list", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^own-[0-9a-f]{8}$/);
    expect(r.body).toMatchObject({ name: "Statement", kind: "image" });
    expect(existsSync(join(projectDir, "template-input", "proposal"))).toBe(false);
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    expect((await call("/api/templates")).body.templates.map((t: any) => t.id)).toEqual([r.body.id]);
    expect((await call("/api/template-proposal/apply", "POST", {})).status).toBe(409);
  });

  it("does not apply a proposal that is not valid, and leaves it in place", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir, { ...exampleTemplate(), css: ".a { background: url(x); }" });
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/not valid: css rule 1 \(\.a\) \(background\): url\(\) is not allowed/);
    expect((await call("/api/templates")).body.templates).toEqual([]);
    expect((await call("/api/template-proposal")).body.state).toBe("invalid");
  });

  it("says 409 at 30 templates, and keeps the proposal", async () => {
    const { call, projectDir } = await start();
    for (let i = 0; i < 30; i++) writeOwn(projectDir, exampleTemplate(), `own-${String(i).padStart(8, "0")}`);
    proposal(projectDir);
    const r = await call("/api/template-proposal/apply", "POST", {});
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("A project can have at most 30 own templates; delete one first");
    expect((await call("/api/template-proposal")).body.state).toBe("ready");
  });

  it("discards, also when there is nothing to discard", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    expect((await call("/api/template-proposal", "DELETE")).status).toBe(200);
    expect((await call("/api/template-proposal")).body).toEqual({ state: "none" });
    expect((await call("/api/template-proposal", "DELETE")).status).toBe(200);
  });

  it("works from generation to a saved template, per project", async () => {
    const { call } = await start();
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", { texts: "A post", brief: "", kind: "image", formats: ["li-square"] });
    expect((await call("/api/template-generate", "POST", {})).body).toMatchObject({ state: "ready", sample: true });
    expect((await call("/api/template-proposal", "GET", undefined, "beta")).body).toEqual({ state: "none" });
    const kept = await call("/api/template-proposal/apply", "POST", {});
    expect(kept.status).toBe(201);
    expect(kept.body.name).toBe("Sample template");
    expect((await call("/api/templates", "GET", undefined, "beta")).body.templates).toEqual([]);
  });

  it("applies a template that a post can then use, and an idea too", async () => {
    const { call, projectDir } = await start();
    proposal(projectDir);
    const kept = await call("/api/template-proposal/apply", "POST", {});
    const post = await call("/api/posts", "POST", {
      title: "A post",
      kind: "image",
      template: kept.body.id,
      formats: ["li-square"],
      content: { headline: "A *b*" },
      brandVersion: "v1",
    });
    expect(post.status).toBe(201);
    expect((await call("/api/ideas", "POST", { date: "2026-10-12", title: "I", template: kept.body.id })).status).toBe(
      201,
    );
  });
});
