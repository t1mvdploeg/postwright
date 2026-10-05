// The material for a brand kit: uploads are checked on content, kept in brand-input/ of the
// project, and never served as a page.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { font, pdf, pngHeader, SVG, webpHeader } from "./helpers/brand-files.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

async function start() {
  const s = await startStudio();
  studios.push(s);
  const upload = (role: string, body: Buffer | string, project?: string) =>
    fetch(`${s.base}/api/brand/input/${role}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(project ? { "x-postwright-project": project } : {}) },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
  const input = async (project?: string) =>
    (
      await fetch(`${s.base}/api/brand/input`, { headers: project ? { "x-postwright-project": project } : {} })
    ).json() as Promise<any>;
  const json = (path: string, method: string, body: unknown, project?: string) =>
    fetch(s.base + path, {
      method,
      headers: { "content-type": "application/json", ...(project ? { "x-postwright-project": project } : {}) },
      body: JSON.stringify(body),
    });
  return { ...s, upload, input, json };
}

describe("the logo", () => {
  it("takes an SVG and stores it as text under logo.svg", async () => {
    const { upload, input, projectDir } = await start();
    const r = await upload("logo", SVG);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ name: "logo.svg", kind: "logo", bytes: SVG.length });
    expect(readFileSync(join(projectDir, "brand-input", "logo.svg"), "utf8")).toBe(SVG);
    expect((await input()).files).toEqual([{ name: "logo.svg", kind: "logo", bytes: SVG.length }]);
  });

  it("takes a PNG, and a new logo replaces the old one whatever its type", async () => {
    const { upload, input, projectDir } = await start();
    await upload("logo", SVG);
    expect((await upload("logo", pngHeader(64, 32))).status).toBe(201);
    expect((await input()).files.map((f: any) => f.name)).toEqual(["logo.png"]);
    expect(existsSync(join(projectDir, "brand-input", "logo.svg"))).toBe(false);
  });

  it.each([
    ["an HTML page named .svg", "<html><body><script>alert(1)</script></body></html>"],
    ["an SVG with a script", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ["an SVG with a foreignObject", '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>'],
    ["plain text", "just words"],
  ])("refuses %s", async (_n, body) => {
    const { upload, input } = await start();
    const r = await upload("logo", body);
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toMatch(/SVG or a PNG/);
    expect((await input()).files).toEqual([]);
  });

  it("refuses a JPEG and an empty body", async () => {
    const { upload } = await start();
    expect((await upload("logo", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).status).toBe(400);
    expect((await upload("logo", Buffer.alloc(0))).status).toBe(400);
  });
});

describe("images, guide and fonts", () => {
  it("keeps at most 8 images, and the same image twice is one file", async () => {
    const { upload, input } = await start();
    for (let i = 1; i <= 8; i++) expect((await upload("image", webpHeader(i, 10))).status).toBe(201);
    expect((await upload("image", webpHeader(3, 10))).status).toBe(201); // already there
    const ninth = await upload("image", webpHeader(9, 10));
    expect(ninth.status).toBe(409);
    expect((await input()).files.filter((f: any) => f.kind === "image")).toHaveLength(8);
  });

  it("refuses an image that lies about its type, and one over 5 MB", async () => {
    const { upload } = await start();
    expect((await upload("image", "<html>not an image</html>")).status).toBe(400);
    expect((await upload("image", SVG)).status).toBe(400); // no SVG among the images
    expect((await upload("image", webpHeader(1, 1, 5 * 1024 * 1024))).status).toBe(413);
  });

  it("accepts a PDF by its first bytes and refuses a fake one", async () => {
    const { upload, input } = await start();
    expect((await upload("guide", "<html>not a pdf</html>")).status).toBe(400);
    expect((await upload("guide", pdf(1000))).status).toBe(201);
    expect((await input()).files).toMatchObject([{ name: "guide.pdf", kind: "guide" }]);
  });

  it("refuses a PDF over 20 MB", async () => {
    const { upload } = await start();
    expect((await upload("guide", pdf(20 * 1024 * 1024))).status).toBe(413);
  });

  it("accepts fonts by their magic bytes and refuses a fake one", async () => {
    const { upload, input } = await start();
    for (const kind of ["woff2", "woff", "ttf", "otf"] as const)
      expect((await upload("font", font(kind))).status).toBe(201);
    const fake = await upload("font", "<html>not a font</html>");
    expect(fake.status).toBe(400);
    const names = (await input()).files.map((f: any) => f.name);
    expect(names).toHaveLength(4);
    expect(names.every((n: string) => /^font-[0-9a-f]{8}\.(woff2|woff|ttf|otf)$/.test(n))).toBe(true);
  });

  it("refuses an unknown role", async () => {
    const { upload } = await start();
    expect((await upload("video", pdf())).status).toBe(400);
  });

  it("keeps logo, images and guide together under 22 MB", async () => {
    const { upload } = await start();
    expect((await upload("guide", pdf(19 * 1024 * 1024))).status).toBe(201);
    const over = await upload("image", webpHeader(1, 1, 4 * 1024 * 1024));
    expect(over.status).toBe(413);
  });
});

describe("website and notes", () => {
  it("stores them in input.json and gives them back", async () => {
    const { json, input } = await start();
    const r = await json("/api/brand/input", "PUT", {
      website: " https://acme.example/about ",
      notes: "tone: business, but warm",
    });
    expect(r.status).toBe(200);
    expect(await input()).toMatchObject({ website: "https://acme.example/about", notes: "tone: business, but warm" });
  });

  it.each([
    [{ website: "http://acme.example", notes: "" }],
    [{ website: "javascript:alert(1)", notes: "" }],
    [{ website: "acme.example", notes: "" }],
    [{ website: "", notes: "x".repeat(2001) }],
    [{ website: "", notes: "", extra: 1 }],
  ])("refuses %j", async (body) => {
    const { json } = await start();
    expect((await json("/api/brand/input", "PUT", body)).status).toBe(400);
  });

  it("starts empty and tells the screen whether generating is possible", async () => {
    const { input } = await start();
    expect(await input()).toEqual({ files: [], website: "", notes: "", generate: { available: false, model: null } });
  });
});

describe("removing and isolation", () => {
  it("removes a file and says 404 for one that is not there", async () => {
    const { upload, input, base } = await start();
    await upload("logo", SVG);
    const gone = await fetch(`${base}/api/brand/input/logo.svg`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect((await input()).files).toEqual([]);
    expect((await fetch(`${base}/api/brand/input/logo.svg`, { method: "DELETE" })).status).toBe(404);
  });

  it.each(["..%2f..%2fproject.json", "input.json", "logo.exe", "image-zzzz.png"])(
    "refuses to remove %s",
    async (name) => {
      const { base } = await start();
      expect((await fetch(`${base}/api/brand/input/${name}`, { method: "DELETE" })).status).toBe(400);
    },
  );

  it("keeps the material of two projects apart", async () => {
    const { upload, input, base } = await start();
    await fetch(base + "/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Beta" }),
    });
    await upload("logo", SVG);
    expect((await input("beta")).files).toEqual([]);
    expect((await upload("logo", pngHeader(), "beta")).status).toBe(201);
    expect((await input()).files.map((f: any) => f.name)).toEqual(["logo.svg"]);
  });

  it("never serves brand-input as a page", async () => {
    const { upload, base } = await start();
    await upload("logo", SVG);
    expect((await fetch(`${base}/brand-input/logo.svg`)).status).toBe(404);
    expect((await fetch(`${base}/brand/logo.svg`)).status).toBe(404);
  });
});
