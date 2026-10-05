// Own templates on disk: a round trip, a broken file that is skipped (with a warning, never a
// failed request), templates that stay in their own project, and a delete that a post blocks.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteOwnTemplate,
  loadOwnTemplates,
  readOwnTemplates,
  renameOwnTemplate,
  saveOwnTemplate,
} from "../src/server/template-store.js";
import { LIMITS, checkTemplate } from "../src/web/studio/own-template.js";
import { carouselExample, exampleTemplate, saved, writeOwn } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const dirs: string[] = [];
const studios: Array<{ close: () => Promise<void> }> = [];
const project = () => {
  const d = mkdtempSync(join(tmpdir(), "pw-templates-"));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  while (studios.length) await studios.pop()!.close();
});

describe("saving and reading", () => {
  it("round-trips a template: the server makes the id and the time, the file keeps everything else", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    expect(file.id).toMatch(/^own-[0-9a-f]{8}$/);
    expect(Date.parse(file.created)).not.toBeNaN();
    expect(JSON.parse(readFileSync(join(dir, "templates", `${file.id}.json`), "utf8"))).toEqual(file);
    expect(await loadOwnTemplates(dir)).toEqual([file]);
    expect(file).toMatchObject({ ...exampleTemplate(), id: file.id });
  });

  it("refuses a proposal that has an id of its own, or that is not valid", async () => {
    const dir = project();
    await expect(saveOwnTemplate(dir, saved(exampleTemplate()))).rejects.toThrow(/must not have them/);
    await expect(saveOwnTemplate(dir, { ...exampleTemplate(), css: ".a { background: url(x); }" })).rejects.toThrow(
      /url\(\)/,
    );
    expect(await loadOwnTemplates(dir)).toEqual([]);
  });

  it("refuses a proposal that only goes over the size limit once the id and the time are added", async () => {
    const dir = project();
    const c = carouselExample();
    const text = (n: number) => "x".repeat(n);
    const LITERALS = 20;
    for (const s of c.slides) {
      s.fields = Array.from({ length: 12 }, (_, i) => ({
        id: `f${i}`,
        label: "F",
        kind: "text",
        max: 400,
        defaultValue: "",
        help: text(160),
      }));
      s.tree = [{ tag: "div", children: Array.from({ length: LITERALS }, () => ({ literal: text(80) })) }];
    }
    c.defaultSlides = Array.from({ length: 8 }, (_, n) => ({
      kind: n === 0 ? "cover" : "content",
      content: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, text(400)])),
    }));
    c.css = `${c.css}\n${" ".repeat(LIMITS.css - c.css.length - 1)}`;
    // Trim the default texts until the proposal is 20 characters under the limit.
    let over = JSON.stringify(c).length - (LIMITS.file - 20);
    for (const d of c.defaultSlides) {
      for (const id of Object.keys(d.content)) {
        const cut = Math.min(over, 390);
        if (cut > 0) d.content[id] = d.content[id].slice(cut);
        over -= Math.max(cut, 0);
      }
    }
    expect(JSON.stringify(c).length).toBe(LIMITS.file - 20);
    const r = checkTemplate(c, { mode: "proposal" });
    expect(r.ok ? [] : r.problems).toEqual([]);
    await expect(saveOwnTemplate(dir, c)).rejects.toMatchObject({ status: 409 });
    expect(await loadOwnTemplates(dir)).toEqual([]);
  });

  it("lists nothing for a project without templates", async () => {
    expect(await readOwnTemplates(project())).toEqual({ templates: [], skipped: [] });
  });

  it("allows 30 templates and refuses the 31st, also when saved at the same time", async () => {
    const dir = project();
    await Promise.all(Array.from({ length: 30 }, () => saveOwnTemplate(dir, exampleTemplate())));
    expect((await loadOwnTemplates(dir)).length).toBe(30);
    expect(new Set((await loadOwnTemplates(dir)).map((t) => t.id)).size).toBe(30);
    await expect(saveOwnTemplate(dir, exampleTemplate())).rejects.toThrow(/at most 30 own templates/);
  });
});

describe("a broken file", () => {
  it("is skipped with a warning and listed with its problem; the others stay", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = project();
    writeOwn(dir, exampleTemplate(), "own-11111111");
    writeOwn(dir, { ...exampleTemplate(), css: ".a { background: url(x); }" }, "own-22222222");
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    writeOwn(dir, exampleTemplate(), "own-44444444");
    writeFileSync(
      join(dir, "templates", "own-44444444.json"),
      JSON.stringify(saved(exampleTemplate(), "own-55555555")),
    );
    writeFileSync(join(dir, "templates", "notes.txt"), "ignored");
    const r = await readOwnTemplates(dir);
    expect(r.templates.map((t) => t.id)).toEqual(["own-11111111"]);
    expect(r.skipped.map((s) => s.file)).toEqual(["own-22222222.json", "own-33333333.json", "own-44444444.json"]);
    expect(r.skipped[0].problem).toMatch(/url\(\) is not allowed/);
    expect(r.skipped[2].problem).toMatch(/does not match the file name/);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.join("\n")).not.toContain(dir);
  });
});

describe("rename and delete", () => {
  it("renames and keeps the rest; a missing or broken template says so", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    const renamed = await renameOwnTemplate(dir, file.id, "Quote");
    expect(renamed).toEqual({ ...file, name: "Quote" });
    expect((await loadOwnTemplates(dir))[0].name).toBe("Quote");
    await expect(renameOwnTemplate(dir, "own-99999999", "x")).rejects.toMatchObject({ status: 404 });
    await expect(renameOwnTemplate(dir, "../x", "x")).rejects.toMatchObject({ status: 400 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    await expect(renameOwnTemplate(dir, "own-33333333", "x")).rejects.toMatchObject({ status: 409 });
  });

  it("deletes a template, and also a broken file", async () => {
    const dir = project();
    const file = await saveOwnTemplate(dir, exampleTemplate());
    await deleteOwnTemplate(dir, file.id);
    expect(await loadOwnTemplates(dir)).toEqual([]);
    await expect(deleteOwnTemplate(dir, file.id)).rejects.toMatchObject({ status: 404 });
    writeFileSync(join(dir, "templates", "own-33333333.json"), "{ not json");
    await deleteOwnTemplate(dir, "own-33333333");
    expect((await readOwnTemplates(dir)).skipped).toEqual([]);
  });

  it("refuses to delete a template that a post uses, with the count, and allows it once the post is gone", async () => {
    const s = await startTemplates({ withClient: false });
    studios.push(s);
    const id = writeOwn(s.projectDir);
    const post = (title: string) => ({
      title,
      kind: "image",
      template: id,
      formats: ["li-square"],
      content: { headline: "A *b*" },
      brandVersion: "v1",
    });
    const one = await s.call("/api/posts", "POST", post("One"));
    expect(one.status).toBe(201);
    await s.call("/api/posts", "POST", post("Two"));
    const blocked = await s.call(`/api/templates/${id}`, "DELETE");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("This template is used by 2 posts; change or delete them first");
    await s.call(`/api/posts/${one.body.id}`, "DELETE");
    const oneLeft = await s.call(`/api/templates/${id}`, "DELETE");
    expect(oneLeft.body.error).toBe("This template is used by 1 post; change or delete it first");
    const rest = (await s.call("/api/posts")).body.posts;
    for (const p of rest) await s.call(`/api/posts/${p.id}`, "DELETE");
    expect((await s.call(`/api/templates/${id}`, "DELETE")).status).toBe(200);
    expect((await s.call("/api/templates")).body).toEqual({ templates: [], skipped: [] });
  });
});

describe("projects", () => {
  it("keeps the templates of one project out of another", async () => {
    const s = await startTemplates({ withClient: false });
    studios.push(s);
    writeOwn(s.projectDir);
    await s.call("/api/projects", "POST", { name: "Beta" });
    expect((await s.call("/api/templates")).body.templates).toHaveLength(1);
    expect((await s.call("/api/templates", "GET", undefined, "beta")).body.templates).toEqual([]);
    expect((await s.call("/api/templates/own-0123abcd", "DELETE", undefined, "beta")).status).toBe(404);
  });
});
