// The material for an own template: screenshots checked on their content, pasted texts, a brief,
// the kind and the formats, per project, and nothing served as a page.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { splitTexts } from "../src/server/template-input.js";
import { SVG, pngHeader, webpHeader } from "./helpers/brand-files.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});
async function start(withClient = true) {
  const s = await startTemplates({ withClient });
  studios.push(s);
  return s;
}

describe("GET and PUT /api/template-input", () => {
  it("starts empty: a single square image, and says whether Claude can generate", async () => {
    const withKey = await start();
    expect((await withKey.call("/api/template-input")).body).toEqual({
      images: [],
      texts: "",
      brief: "",
      kind: "image",
      formats: ["li-square"],
      generate: { available: true, model: "claude-opus-5-5" },
    });
    const noKey = await start(false);
    expect((await noKey.call("/api/template-input")).body.generate).toEqual({ available: false, model: null });
  });

  it("saves the texts, the brief, the kind and the formats, and trims the brief", async () => {
    const { call, projectDir } = await start();
    const body = {
      texts: "One post\n---\nTwo posts",
      brief: "  Quotes from customers  ",
      kind: "image",
      formats: ["li-square", "story"],
    };
    const r = await call("/api/template-input", "PUT", body);
    expect(r.status).toBe(200);
    expect(r.body.brief).toBe("Quotes from customers");
    expect((await call("/api/template-input")).body).toMatchObject({ ...body, brief: "Quotes from customers" });
    expect(JSON.parse(readFileSync(join(projectDir, "template-input", "input.json"), "utf8")).formats).toEqual([
      "li-square",
      "story",
    ]);
    const carousel = await call("/api/template-input", "PUT", { ...body, kind: "carousel", formats: ["li-carousel"] });
    expect(carousel.status).toBe(200);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["texts over 8,000 characters", { texts: "x".repeat(8001) }, /texts/],
    ["a brief over 600 characters", { brief: "x".repeat(601) }, /brief/],
    ["an unknown kind", { kind: "video" }, /kind/],
    ["no formats", { formats: [] }, /formats/],
    ["a banner format", { formats: ["li-profile"] }, /formats/],
    ["a company cover", { formats: ["li-company"] }, /formats/],
    ["li-carousel for a single image", { formats: ["li-carousel"] }, /cannot use li-carousel/],
    ["a carousel with other formats", { kind: "carousel", formats: ["li-square"] }, /exactly "li-carousel"/],
    ["a format twice", { formats: ["story", "story"] }, /twice/],
    ["an unknown key", { extra: 1 }, /Unrecognized key|extra/],
  ])("refuses %s", async (_name, change, expected) => {
    const { call } = await start();
    const r = await call("/api/template-input", "PUT", {
      texts: "",
      brief: "",
      kind: "image",
      formats: ["li-square"],
      ...change,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(expected);
  });

  it("keeps the material of one project apart from another", async () => {
    const { call, upload } = await start();
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", { texts: "mine", brief: "", kind: "image", formats: ["story"] });
    await upload(webpHeader(5, 5));
    expect((await call("/api/template-input", "GET", undefined, "beta")).body).toMatchObject({
      images: [],
      texts: "",
      formats: ["li-square"],
    });
  });
});

describe("a damaged input.json", () => {
  it("is a plain 500 that names the file, not a stack or a silent default", async () => {
    const { call, projectDir } = await start();
    mkdirSync(join(projectDir, "template-input"), { recursive: true });
    writeFileSync(join(projectDir, "template-input", "input.json"), "{ not json");
    const r = await call("/api/template-input");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/^template-input\/input\.json cannot be read: /);
    writeFileSync(join(projectDir, "template-input", "input.json"), JSON.stringify({ texts: 5 }));
    expect((await call("/api/template-input")).body.error).toMatch(/texts/);
  });
});

describe("screenshots", () => {
  it("takes a PNG and a WebP, stores them under a name made from the content, and lists them", async () => {
    const { upload, call, projectDir } = await start();
    const png = pngHeader(40, 30);
    const r = await upload(png);
    expect(r.status).toBe(201);
    const stored = (await r.json()) as { name: string; bytes: number };
    expect(stored.name).toMatch(/^image-[0-9a-f]{8}\.png$/);
    expect(stored.bytes).toBe(png.length);
    expect(existsSync(join(projectDir, "template-input", stored.name))).toBe(true);
    expect((await upload(webpHeader(3, 3))).status).toBe(201);
    expect((await call("/api/template-input")).body.images).toHaveLength(2);
  });

  it("keeps at most six, and the same image twice is one file", async () => {
    const { upload, call } = await start();
    for (let i = 1; i <= 6; i++) expect((await upload(webpHeader(i, 10))).status).toBe(201);
    expect((await upload(webpHeader(3, 10))).status).toBe(201);
    const seventh = await upload(webpHeader(7, 10));
    expect(seventh.status).toBe(409);
    expect(((await seventh.json()) as any).error).toBe("At most 6 screenshots; remove one first");
    expect((await call("/api/template-input")).body.images).toHaveLength(6);
  });

  it.each<[string, Buffer | string, number]>([
    ["an HTML page", "<html><script>alert(1)</script></html>", 400],
    ["an SVG", SVG, 400],
    ["a PNG that is too large in pixels", pngHeader(9000, 10), 400],
    ["an empty body", Buffer.alloc(0), 400],
    ["an image over 3 MB", webpHeader(1, 1, 3 * 1024 * 1024), 413],
  ])("refuses %s", async (_name, body, status) => {
    const { upload, call } = await start();
    expect((await upload(body)).status).toBe(status);
    expect((await call("/api/template-input")).body.images).toEqual([]);
  });

  it("removes a screenshot, and says so for a bad or unknown name", async () => {
    const { upload, call, projectDir } = await start();
    const { name } = (await (await upload(webpHeader(4, 4))).json()) as { name: string };
    expect((await call(`/api/template-input/${name}`, "DELETE")).status).toBe(200);
    expect(existsSync(join(projectDir, "template-input", name))).toBe(false);
    expect((await call(`/api/template-input/${name}`, "DELETE")).status).toBe(404);
    expect((await call("/api/template-input/input.json", "DELETE")).status).toBe(400);
    expect((await call("/api/template-input/..%2Fproject.json", "DELETE")).status).toBe(400);
  });

  it("never serves the material as a page", async () => {
    const { upload, base } = await start();
    const { name } = (await (await upload(webpHeader(4, 4))).json()) as { name: string };
    expect((await fetch(`${base}/template-input/${name}`)).status).toBe(404);
  });
});

describe("splitTexts", () => {
  it("splits on a line with only three dashes, trims, and drops empty pieces", () => {
    expect(splitTexts("One\nline\n---\n  Two  \n---\n\n---\nThree --- not a split")).toEqual([
      "One\nline",
      "Two",
      "Three --- not a split",
    ]);
    expect(splitTexts("")).toEqual([]);
    expect(splitTexts("---")).toEqual([]);
  });
});
