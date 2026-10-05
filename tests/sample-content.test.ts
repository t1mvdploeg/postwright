// The sample content: sample facts, snippets and posts about Postwright itself. The route
// only tops up and is therefore safe to run twice.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SAMPLE_FACTS, SAMPLE_POSTS, SAMPLE_SNIPPETS } from "../src/server/sample-content.js";
import { FactInputSchema, SnippetInputSchema, type Fact, type Post } from "../src/server/schema.js";
import { TEMPLATES } from "../src/web/studio/templates.js";
import { startStudio } from "./helpers/studio.js";

describe("sample-content", () => {
  it("every fact is a valid draft fact, and the first names the real number of templates", () => {
    expect(SAMPLE_FACTS.length).toBeGreaterThanOrEqual(5);
    for (const f of SAMPLE_FACTS)
      expect(FactInputSchema.safeParse({ ...f, status: "draft" }).success, f.text).toBe(true);
    expect(new Set(SAMPLE_FACTS.map((f) => f.text)).size).toBe(SAMPLE_FACTS.length);
    expect(SAMPLE_FACTS[0].text).toBe(`Postwright ships with ${TEMPLATES.length} post templates.`);
  });

  it("the snippets are valid and each has its own name", () => {
    for (const t of SAMPLE_SNIPPETS) expect(SnippetInputSchema.safeParse(t).success, t.name).toBe(true);
    expect(new Set(SAMPLE_SNIPPETS.map((t) => t.name)).size).toBe(SAMPLE_SNIPPETS.length);
  });

  it("the sample posts use existing templates, and exactly one is scheduled", () => {
    expect(SAMPLE_POSTS.map((p) => p.template)).toEqual(["statement", "statistic", "steps"]);
    for (const p of SAMPLE_POSTS)
      expect(
        TEMPLATES.some((s) => s.id === p.template),
        p.template,
      ).toBe(true);
    expect(SAMPLE_POSTS.filter((p) => p.inDays !== undefined)).toHaveLength(1);
  });
});

describe("POST /sample-content", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.close();
  });
  // Every POST without a raw body requires application/json, even if the route does not read
  // the body.
  const post = (path: string) =>
    fetch(studio.base + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const get = async (path: string) => (await fetch(studio.base + path)).json();

  it("fills in as draft and adds nothing twice on a second go", async () => {
    const first = await (await post("/api/sample-content")).json();
    expect(first).toEqual({ facts: SAMPLE_FACTS.length, snippets: SAMPLE_SNIPPETS.length, posts: SAMPLE_POSTS.length });
    const two = await (await post("/api/sample-content")).json();
    expect(two).toEqual({ facts: 0, snippets: 0, posts: 0 });
    const facts: Fact[] = (await get("/api/facts")).facts;
    expect(facts).toHaveLength(SAMPLE_FACTS.length);
    expect(facts.every((f) => f.status === "draft")).toBe(true);
    expect(facts.some((f) => f.text.includes(`${TEMPLATES.length} post templates`))).toBe(true);
    const snippets = (await get("/api/snippets")).snippets;
    expect(snippets.map((t: { text: string }) => t.text).sort()).toEqual(SAMPLE_SNIPPETS.map((t) => t.text).sort());
    expect((await get("/api/posts")).posts).toHaveLength(SAMPLE_POSTS.length);
  });

  it("puts down three sample posts, one of which is scheduled in seven days with a green check", async () => {
    const posts: Post[] = (await get("/api/posts")).posts;
    expect(posts.map((p) => p.template).sort()).toEqual(["statement", "statistic", "steps"]);
    const scheduled = posts.filter((p) => p.status === "scheduled");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].template).toBe("steps");
    expect(scheduled[0].check).toMatchObject({ errors: 0 });
    const days = (new Date(scheduled[0].scheduled as string).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    // The other two are drafts, and the statistic example hangs on the fact with the number of
    // templates.
    const statistic = posts.find((p) => p.template === "statistic") as Post;
    expect(statistic.status).toBe("draft");
    expect(statistic.content.number).toBe(String(TEMPLATES.length));
    const fact = (await get("/api/facts")).facts.find((f: Fact) => f.id === statistic.facts[0]);
    expect(fact.text).toBe(SAMPLE_FACTS[0].text);
    // A sample post is an ordinary post: it can be fetched with its history.
    const first = await get(`/api/posts/${scheduled[0].id}`);
    expect(first.history.map((g: { what: string }) => g.what)).toEqual([
      "created",
      expect.stringMatching(/^scheduled for /),
    ]);
  });

  it("on a new click only adds back the deleted sample post", async () => {
    // Idempotent on title: one click only adds what is missing.
    const posts: Post[] = (await get("/api/posts")).posts;
    const remove = posts.find((p) => p.template === "statement") as Post;
    await fetch(`${studio.base}/api/posts/${remove.id}`, { method: "DELETE" });
    expect(await (await post("/api/sample-content")).json()).toEqual({ facts: 0, snippets: 0, posts: 1 });
    expect((await get("/api/posts")).posts).toHaveLength(SAMPLE_POSTS.length);
  });
});
