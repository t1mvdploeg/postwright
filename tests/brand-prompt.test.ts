// The downloadable prompt: an agent that follows it only needs this file and the project folder.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildPrompt } from "../src/server/brand-prompt.js";
import { LOGO_MODES } from "../src/server/brand-proposal.js";
import { font, pdf, SVG, webpHeader } from "./helpers/brand-files.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});

const example = readFileSync("src/web/brand/brand.json", "utf8");
const input = {
  files: [
    { name: "logo.svg", kind: "logo" as const, bytes: 400 },
    { name: "image-0a1b2c3d.png", kind: "image" as const, bytes: 2048 },
    { name: "guide.pdf", kind: "guide" as const, bytes: 90_000 },
  ],
  website: "https://acme.example",
  notes: "tone: business, but warm",
};

describe("buildPrompt", () => {
  const text = buildPrompt({ slug: "acme", input, example });

  it("says where the proposal goes and which project it is for", () => {
    expect(text).toContain('# Make a brand kit for the project "acme"');
    expect(text).toContain("data/projects/acme/brand-input/proposal/");
  });

  it("lists the material by name, the website and the notes", () => {
    for (const name of ["logo.svg", "image-0a1b2c3d.png", "guide.pdf"])
      expect(text).toContain(`data/projects/acme/brand-input/${name}`);
    expect(text).toContain("https://acme.example");
    expect(text).toContain("tone: business, but warm");
    expect(text).toMatch(/fetch tool/i);
  });

  it("has the schema, the example, the 14 css variables and all eight logo modes", () => {
    for (const field of ["version", "name", "url", "font", "css", "colors", "grounds", "logos"])
      expect(text).toContain(`\`${field}\``);
    expect(text).toContain('"name": "Postwright"');
    expect(text).toContain("--soft-warning");
    for (const mode of LOGO_MODES) expect(text).toContain(`\`${mode}\``);
    expect(text).toContain("4.5:1");
    expect(text).toContain("extras.json");
  });

  it("tells the agent the limit on the version", () => {
    expect(text).toMatch(/version.*at most 40 characters/);
  });

  it("tells the agent to check its work and what it must not do", () => {
    expect(text).toContain("npm run brand:check -- acme");
    expect(text).toMatch(/do not write outside/i);
    expect(text).toMatch(/other projects/i);
  });

  it("copes with no website, no notes and no files", () => {
    const bare = buildPrompt({ slug: "x", input: { files: [], website: "", notes: "" }, example });
    expect(bare).toContain("Website: none");
    expect(bare).not.toContain("Notes from the user");
  });

  it("holds no path of this computer", () => {
    expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
  });
});

describe("GET /api/brand/prompt", () => {
  async function start() {
    const s = await startStudio();
    studios.push(s);
    const upload = (role: string, body: Buffer | string, project?: string) =>
      fetch(`${s.base}/api/brand/input/${role}`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          ...(project ? { "x-postwright-project": project } : {}),
        },
        body: typeof body === "string" ? body : new Uint8Array(body),
      });
    return { ...s, upload };
  }

  it("answers 400 without a logo", async () => {
    const { base } = await start();
    const r = await fetch(`${base}/api/brand/prompt`);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe("Add a logo first");
  });

  it("is a markdown download with the files, website and notes of this project", async () => {
    const { base, upload, dataDir } = await start();
    await upload("logo", SVG);
    await upload("image", webpHeader(5, 5));
    await upload("guide", pdf(10));
    await upload("font", font("woff2"));
    await fetch(`${base}/api/brand/input`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ website: "https://acme.example", notes: "warm" }),
    });
    const r = await fetch(`${base}/api/brand/prompt`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="brand-kit-prompt-postwright.md"');
    const body = await r.text();
    expect(body).toContain("data/projects/postwright/brand-input/logo.svg");
    expect(body).toMatch(/data\/projects\/postwright\/brand-input\/image-[0-9a-f]{8}\.webp/);
    expect(body).toMatch(/brand-input\/font-[0-9a-f]{8}\.woff2/);
    expect(body).toContain("https://acme.example");
    expect(body).not.toContain(dataDir);
  });

  it("is about the project in the header", async () => {
    const { base, upload } = await start();
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Beta Studio" }),
    });
    await upload("logo", SVG, "beta-studio");
    const r = await fetch(`${base}/api/brand/prompt`, { headers: { "x-postwright-project": "beta-studio" } });
    expect(r.headers.get("content-disposition")).toContain("brand-kit-prompt-beta-studio.md");
    expect(await r.text()).toContain("npm run brand:check -- beta-studio");
    // The first project has no logo.
    expect((await fetch(`${base}/api/brand/prompt`)).status).toBe(400);
  });
});
