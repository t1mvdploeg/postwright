// Everything in the studio belongs to one project: a fact, a post, a setting or an image of
// project A does not exist in project B, and a bad project header never reaches the disk.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { raw } from "./helpers/raw.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

const FACT = {
  text: "Orders over 12 units ship free.",
  kind: "product",
  source: { kind: "site", reference: "README.md" },
  status: "active",
};
const POST = {
  title: "Statement: one",
  kind: "image",
  template: "statement",
  formats: ["li-square"],
  content: { ground: "accent", headline: "Seen enough. *Your turn.*", text: "Short." },
  brandVersion: "test-1.0",
  check: { errors: 0, attention: 0, on: new Date().toISOString() },
};

async function start() {
  const s = await startStudio();
  studios.push(s);
  const call = async (project: string | undefined, path: string, method = "GET", body?: unknown) => {
    const headers: Record<string, string> = {};
    if (project !== undefined) headers["x-postwright-project"] = project;
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(s.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const created = await call(undefined, "/api/projects", "POST", { name: "Beta" });
  expect(created.body.slug).toBe("beta");
  return { ...s, call };
}

describe("the project header", () => {
  it("means the first project when it is missing or empty", async () => {
    const { call } = await start();
    const made = await call(undefined, "/api/facts", "POST", FACT);
    expect(made.status).toBe(201);
    expect((await call("postwright", "/api/facts")).body.facts).toHaveLength(1);
    expect((await call("", "/api/facts")).body.facts).toHaveLength(1);
  });

  it.each(["nope", "../beta", "Beta", "beta, postwright", "x".repeat(80)])(
    "gives 404 Unknown project for %j",
    async (header) => {
      const { call } = await start();
      for (const [method, path] of [
        ["GET", "/api/facts"],
        ["GET", "/api/posts"],
        ["GET", "/api/brand"],
        ["GET", "/api/settings"],
      ] as const) {
        const r = await call(header, path, method);
        expect(r.status, `${method} ${path}`).toBe(404);
        expect(r.body).toEqual({ error: "Unknown project" });
      }
    },
  );

  it("is not needed for the project list", async () => {
    const { call } = await start();
    expect((await call("nope", "/api/projects")).status).toBe(200);
  });
});

describe("separation of two projects", () => {
  it("keeps facts, posts, snippets and settings apart", async () => {
    const { call } = await start();
    expect((await call("postwright", "/api/facts", "POST", FACT)).status).toBe(201);
    expect((await call("postwright", "/api/posts", "POST", POST)).status).toBe(201);
    expect(
      (
        await call("postwright", "/api/snippets", "POST", {
          name: "Sign-off",
          text: "Made with Postwright.",
          kind: "closer",
        })
      ).status,
    ).toBe(201);
    const settings = (await call("postwright", "/api/settings")).body;
    expect((await call("postwright", "/api/settings", "PUT", { ...settings, defaultHashtags: "#alpha" })).status).toBe(
      200,
    );
    expect((await call("postwright", "/api/snippets")).body.snippets).toHaveLength(1);
    expect((await call("beta", "/api/facts")).body.facts).toEqual([]);
    expect((await call("beta", "/api/posts")).body.posts).toEqual([]);
    expect((await call("beta", "/api/snippets")).body.snippets).toEqual([]);
    expect((await call("beta", "/api/settings")).body.defaultHashtags).not.toBe("#alpha");
    expect((await call("postwright", "/api/settings")).body.defaultHashtags).toBe("#alpha");
  });

  it("does not let a fact of A end up in a post of B", async () => {
    const { call } = await start();
    const fact = (await call("postwright", "/api/facts", "POST", FACT)).body;
    const refused = await call("beta", "/api/posts", "POST", { ...POST, facts: [fact.id] });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/fact.*this project/i);
    // An existing post in B that is saved with a fact id of A is refused too.
    const own = (await call("beta", "/api/posts", "POST", POST)).body;
    const save = await call("beta", `/api/posts/${own.id}`, "PUT", { ...POST, version: own.version, facts: [fact.id] });
    expect(save.status).toBe(400);
    // The writing help only works with facts of the project itself.
    const help = await call("beta", "/api/writing-help", "POST", {
      task: "fields",
      template: "Statement",
      channel: "linkedin",
      note: "",
      facts: [fact.id],
      fields: [{ id: "headline", label: "Headline", kind: "headline", max: 90, emphasis: true }],
    });
    expect(help.status).toBe(400);
  });

  it("lets a post link a fact of its own project, also a withdrawn one", async () => {
    const { call } = await start();
    const fact = (await call("postwright", "/api/facts", "POST", { ...FACT, status: "withdrawn" })).body;
    const post = await call("postwright", "/api/posts", "POST", { ...POST, facts: [fact.id] });
    expect(post.status).toBe(201);
    const save = await call("postwright", `/api/posts/${post.body.id}`, "PUT", {
      ...POST,
      version: post.body.version,
      facts: [fact.id],
      title: "Renamed",
    });
    expect(save.status).toBe(200);
  });

  it("keeps uploaded images apart", async () => {
    const { call, base } = await start();
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      Buffer.from("IHDR"),
      Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    const up = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "content-type": "image/png", "x-postwright-project": "postwright" },
      body: new Uint8Array(png),
    });
    expect(up.status).toBe(201);
    expect((await call("postwright", "/api/media")).body.media).toHaveLength(1);
    expect((await call("beta", "/api/media")).body.media).toEqual([]);
  });
});

describe("the brand per project", () => {
  async function withBrand() {
    const s = await start();
    const brand = JSON.parse(JSON.stringify((await s.call("postwright", "/api/brand")).body));
    const betaDir = join(s.dataDir, "projects", "beta");
    mkdirSync(join(betaDir, "brand", "logo"), { recursive: true });
    writeFileSync(join(betaDir, "brand", "logo", "x.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    writeFileSync(join(betaDir, "secret.json"), "do-not-serve");
    writeFileSync(
      join(betaDir, "brand", "brand.json"),
      JSON.stringify({ ...brand, name: "Beta brand", logos: { default: "logo/x.svg" } }),
    );
    return s;
  }

  it("gives each project its own brand and files", async () => {
    const { call, base } = await withBrand();
    expect((await call("beta", "/api/brand")).body.name).toBe("Beta brand");
    expect((await call("postwright", "/api/brand")).body.name).toBe("Postwright");
    const own = await fetch(base + "/brand/logo/x.svg", { headers: { "x-postwright-project": "beta" } });
    expect(own.status).toBe(200);
    const other = await fetch(base + "/brand/logo/x.svg");
    expect(other.status).toBe(404);
  });

  it("answers 404 for a static brand file of an unknown project, and blocks paths outside the folder", async () => {
    const { base } = await withBrand();
    const unknown = await fetch(base + "/brand/logo/x.svg", { headers: { "x-postwright-project": "nope" } });
    expect(unknown.status).toBe(404);
    for (const path of ["/brand/..%2fsecret.json", "/brand/../secret.json", "/brand/%2e%2e%2fsecret.json"]) {
      const r = await raw(base, { path, headers: { "x-postwright-project": "beta" } });
      expect(r.status, path).toBe(404);
      expect(r.text).not.toContain("do-not-serve");
    }
  });
});
