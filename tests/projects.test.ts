// Projects: the slug of a name, creating and finding projects, and the one-off move of the
// old single-brand folders into the project "postwright".
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server/http.js";
import {
  PROJECT_SLUG,
  createProject,
  listProjects,
  prepareData,
  projectRoutes,
  resolveProject,
  slugOf,
} from "../src/server/projects.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "pw-projects-")), "data");
const at = (data: string, ...parts: string[]) => join(data, ...parts);

describe("slugOf", () => {
  it.each([
    ["Acme", "acme"],
    ["  Acme & Sons  ", "acme-sons"],
    ["Café Ünïcode!", "cafe-unicode"],
    ["★★★", "project"],
    ["", "project"],
    ["a".repeat(40) + " b", "a".repeat(40)],
  ])("turns %j into %j", (name, slug) => {
    expect(slugOf(name)).toBe(slug);
  });

  it("never gives more than 41 characters or an invalid slug", () => {
    for (const name of ["x".repeat(100), "-- x --", "9 lives", "Ünï".repeat(30)]) {
      expect(slugOf(name)).toMatch(PROJECT_SLUG);
    }
  });
});

describe("createProject and listProjects", () => {
  it("gives a name that is taken a number, also when the slug is at its longest", async () => {
    const data = tmp();
    const first = await createProject(data, "Acme");
    const second = await createProject(data, "Acme");
    const third = await createProject(data, "acme");
    expect([first.slug, second.slug, third.slug]).toEqual(["acme", "acme-2", "acme-3"]);
    const long = "x".repeat(60);
    const a = await createProject(data, long);
    const b = await createProject(data, long);
    expect(a.slug).toHaveLength(41);
    expect(b.slug).toHaveLength(41);
    expect(b.slug).toMatch(PROJECT_SLUG);
    expect(b.slug.endsWith("-2")).toBe(true);
  });

  it("writes project.json with the shown name", async () => {
    const data = tmp();
    const p = await createProject(data, "  Acme Studio ");
    expect(p).toMatchObject({ slug: "acme-studio", name: "Acme Studio", dir: join(data, "projects", "acme-studio") });
    expect(JSON.parse(readFileSync(join(p.dir, "project.json"), "utf8"))).toMatchObject({ name: "Acme Studio" });
  });

  it("lists oldest first and skips folders without a valid project.json", async () => {
    const data = tmp();
    const write = (slug: string, body: string) => {
      mkdirSync(at(data, "projects", slug), { recursive: true });
      writeFileSync(at(data, "projects", slug, "project.json"), body);
    };
    write("beta", JSON.stringify({ name: "Beta", created: "2026-02-01T00:00:00.000Z" }));
    write("alpha", JSON.stringify({ name: "Alpha", created: "2026-01-01T00:00:00.000Z" }));
    write("broken", "{nope");
    mkdirSync(at(data, "projects", "no-file"), { recursive: true });
    mkdirSync(at(data, "projects", "Not A Slug"), { recursive: true });
    expect((await listProjects(data)).map((p) => p.slug)).toEqual(["alpha", "beta"]);
  });
});

describe("resolveProject", () => {
  it("gives the first project without a header and the named one with a header", async () => {
    const data = tmp();
    await prepareData(data);
    await createProject(data, "Beta");
    expect((await resolveProject(data, undefined)).slug).toBe("postwright");
    expect((await resolveProject(data, "")).slug).toBe("postwright");
    expect((await resolveProject(data, "beta")).name).toBe("Beta");
  });

  it.each(["nope", "../x", "..%2fx", "Postwright", "a/b", "x".repeat(60), "postwright, beta"])(
    "says Unknown project for %j",
    async (header) => {
      const data = tmp();
      await prepareData(data);
      await expect(resolveProject(data, header)).rejects.toMatchObject({ status: 404, message: "Unknown project" });
    },
  );
});

describe("prepareData", () => {
  it("moves the old marketing and brand folders into the project postwright and keeps the rest", async () => {
    const data = tmp();
    mkdirSync(at(data, "marketing", "posts"), { recursive: true });
    writeFileSync(at(data, "marketing", "facts.json"), "[]");
    mkdirSync(at(data, "brand"), { recursive: true });
    writeFileSync(at(data, "brand", "brand.json"), "{}");
    writeFileSync(at(data, "ai-usage.jsonl"), "x\n");
    await prepareData(data);
    const project = at(data, "projects", "postwright");
    expect(readFileSync(at(project, "marketing", "facts.json"), "utf8")).toBe("[]");
    expect(existsSync(at(project, "marketing", "posts"))).toBe(true);
    expect(readFileSync(at(project, "brand", "brand.json"), "utf8")).toBe("{}");
    expect(existsSync(at(data, "marketing"))).toBe(false);
    expect(existsSync(at(data, "brand"))).toBe(false);
    expect(readFileSync(at(data, "ai-usage.jsonl"), "utf8")).toBe("x\n");
    expect(JSON.parse(readFileSync(at(project, "project.json"), "utf8"))).toMatchObject({ name: "Postwright" });
  });

  it("makes an empty project postwright when there is no data", async () => {
    const data = tmp();
    await prepareData(data);
    expect((await listProjects(data)).map((p) => p.slug)).toEqual(["postwright"]);
  });

  it("does nothing when data/projects already exists", async () => {
    const data = tmp();
    mkdirSync(at(data, "projects", "other"), { recursive: true });
    writeFileSync(at(data, "projects", "other", "project.json"), JSON.stringify({ name: "Other", created: "x" }));
    mkdirSync(at(data, "marketing"), { recursive: true });
    writeFileSync(at(data, "marketing", "facts.json"), "[]");
    await prepareData(data);
    expect(existsSync(at(data, "marketing", "facts.json"))).toBe(true);
    expect(existsSync(at(data, "projects", "postwright"))).toBe(false);
  });

  it("stops with a message and puts back what it moved when a move fails", async () => {
    const data = tmp();
    mkdirSync(at(data, "marketing"), { recursive: true });
    writeFileSync(at(data, "marketing", "facts.json"), "[]");
    mkdirSync(at(data, "brand"), { recursive: true });
    writeFileSync(at(data, "brand", "brand.json"), "{}");
    const failing = async (from: string, to: string) => {
      if (from.endsWith("brand")) throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
      await rename(from, to);
    };
    await expect(prepareData(data, failing)).rejects.toThrow(/Could not move data\/brand.*EXDEV.*Nothing was changed/s);
    expect(readFileSync(at(data, "marketing", "facts.json"), "utf8")).toBe("[]");
    expect(readFileSync(at(data, "brand", "brand.json"), "utf8")).toBe("{}");
    expect(existsSync(at(data, "projects"))).toBe(false);
    // The next start can try again.
    await prepareData(data);
    expect(existsSync(at(data, "projects", "postwright", "brand", "brand.json"))).toBe(true);
  });
});

describe("GET and POST /api/projects", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start() {
    const dataDir = tmp();
    await prepareData(dataDir);
    const s = await startServer({ dataDir, port: 0, routes: projectRoutes({ dataDir }) });
    close = s.close;
    const post = (body: unknown, type = "application/json") =>
      fetch(s.url + "/api/projects", { method: "POST", headers: { "content-type": type }, body: JSON.stringify(body) });
    return { ...s, post };
  }

  it("lists the projects with slug and name only", async () => {
    const { url } = await start();
    const r = await fetch(url + "/api/projects");
    expect(await r.json()).toEqual({ projects: [{ slug: "postwright", name: "Postwright" }] });
  });

  it("creates a project and answers 201", async () => {
    const { url, post } = await start();
    const r = await post({ name: "Acme Studio" });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ slug: "acme-studio", name: "Acme Studio" });
    const list = (await (await fetch(url + "/api/projects")).json()) as { projects: { slug: string }[] };
    expect(list.projects.map((p) => p.slug)).toEqual(["postwright", "acme-studio"]);
  });

  it.each([{}, { name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: "ok", extra: 1 }])(
    "refuses %j with 400",
    async (body) => {
      const { post } = await start();
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toMatch(/name|unrecognized/i);
    },
  );
});
