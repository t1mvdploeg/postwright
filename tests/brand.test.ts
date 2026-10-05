// The brand: the built-in brand is valid and complete, a custom brand in data/brand wins,
// and a broken custom brand gives a clear error without taking the server down.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server/http.js";
import { raw } from "./helpers/raw.js";
import { BrandSchema, loadBrand, brandFolder, brandRoutes } from "../src/server/brand.js";
import { contrastRatio } from "../src/web/studio/color.js";
import { runCheck } from "../src/web/studio/brand-check.js";
import { template, defaultContent } from "../src/web/studio/templates.js";

const BUILT_IN = "src/web/brand";
const SECRET = "this-should-not-come-out";
const builtIn = JSON.parse(readFileSync(join(BUILT_IN, "brand.json"), "utf8"));

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

/**
 * A server with the brand route and the brand files, on a fresh data folder; `brand` puts
 * files in data/brand.
 */
async function start(brand?: Record<string, string>) {
  const dataDir = join(mkdtempSync(join(tmpdir(), "pw-brand-")), "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "secret.json"), SECRET);
  if (brand) {
    mkdirSync(join(dataDir, "brand", "logo"), { recursive: true });
    for (const [path, content] of Object.entries(brand)) writeFileSync(join(dataDir, "brand", path), content);
  }
  const s = await startServer({
    dataDir,
    routes: brandRoutes({ dataDir }),
    static: [{ prefix: "/brand/", dir: () => brandFolder(dataDir) }],
  });
  close = s.close;
  return s;
}

const customBrand = { ...builtIn, name: "Test brand", logos: { default: "logo/x.svg" } };

describe("the built-in brand", () => {
  it("satisfies the schema and only names files that exist", () => {
    const m = BrandSchema.parse(builtIn);
    for (const path of [...Object.values(m.logos), ...m.font.files]) {
      expect(existsSync(join(BUILT_IN, path)), path).toBe(true);
    }
    expect(existsSync(join(BUILT_IN, "fonts", "LICENSE.txt"))).toBe(true);
  });

  it("reaches contrast 4.5 to 1 on every ground", () => {
    for (const [name, g] of Object.entries(BrandSchema.parse(builtIn).grounds)) {
      expect(contrastRatio(g.text, g.background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("has the logo modes the templates ask for", () => {
    for (const mode of ["default", "on-ink", "on-accent", "mark", "mark-on-ink"]) {
      expect(builtIn.logos, mode).toHaveProperty(mode);
    }
  });
});

describe("GET /api/brand", () => {
  it("gives the built-in brand without an own brand, and serves its files", async () => {
    const { url } = await start();
    const r = await fetch(`${url}/api/brand`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(builtIn);
    const logo = await fetch(`${url}/brand/${builtIn.logos.default}`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    const font = await fetch(`${url}/brand/${builtIn.font.files[0]}`);
    expect(font.headers.get("content-type")).toBe("font/woff2");
  });

  it("gives a valid brand from data/brand, and serves the file from data/brand", async () => {
    const { url } = await start({ "brand.json": JSON.stringify(customBrand), "logo/x.svg": "<svg>custom</svg>" });
    expect(await (await fetch(`${url}/api/brand`)).json()).toMatchObject({
      name: "Test brand",
      logos: { default: "logo/x.svg" },
    });
    const logo = await fetch(`${url}/brand/logo/x.svg`);
    expect(await logo.text()).toBe("<svg>custom</svg>");
    // A file that is only in the built-in brand does not silently come along.
    expect((await fetch(`${url}/brand/${builtIn.logos.default}`)).status).toBe(404);
  });

  it("gives 500 with file and field for a brand with an invalid url, and the server keeps running", async () => {
    const { url } = await start({ "brand.json": JSON.stringify({ ...customBrand, url: "no-url" }) });
    const r = await fetch(`${url}/api/brand`);
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toContain("data/brand/brand.json");
    expect(error).toContain("url");
    expect((await fetch(`${url}/api/brand`)).status).toBe(500);
    expect((await fetch(`${url}/api/does-not-exist`)).status).toBe(404);
  });

  it("gives 500 for a brand.json that is not JSON, without naming the path on disk", async () => {
    const { url } = await start({ "brand.json": "{ broken" });
    const r = await fetch(`${url}/api/brand`);
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toContain("data/brand/brand.json");
    expect(error).not.toContain(tmpdir());
    expect((await fetch(`${url}/api/brand`)).status).toBe(500);
  });

  it("does not serve files outside the brand folder, even if they really exist", async () => {
    // `start` puts `secret.json` directly next to data/brand; without the guard, `..%2f` would
    // give it.
    const { url } = await start({ "brand.json": JSON.stringify(customBrand), "logo/x.svg": "<svg/>" });
    for (const path of [
      "/brand/..%2fsecret.json",
      "/brand/..%2Fsecret.json",
      "/brand/logo/..%2f..%2fsecret.json",
      "/brand/%2e%2e%2fsecret.json",
      "/brand/../secret.json",
    ]) {
      const r = await raw(url, { path });
      expect(r.status, path).toBe(404);
      expect(r.text, path).not.toContain(SECRET);
    }
    expect((await raw(url, { path: "/brand/logo/x.svg" })).status).toBe(200);
  });
});

describe("loadBrand", () => {
  it("names the field where the brand fails", async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), "pw-brand-")), "data");
    mkdirSync(join(dataDir, "brand"), { recursive: true });
    writeFileSync(join(dataDir, "brand", "brand.json"), JSON.stringify({ ...customBrand, colors: [] }));
    await expect(loadBrand(dataDir, BUILT_IN)).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/^data\/brand\/brand\.json: colors:/),
    });
  });
});

describe("brand version in the brand check", () => {
  it("reports a post made with another brand version", () => {
    const s = template("statement")!;
    const post = { template: "statement", formats: ["li-square"], content: defaultContent(s), brandVersion: "old" };
    const report = runCheck({
      post,
      template: s,
      settings: { channels: [], bannedWords: [] },
      today: "2026-10-01",
      brandVersion: builtIn.version,
    });
    expect(report.findings.map((b) => b.code)).toContain("brand-version");
    const equal = runCheck({
      post: { ...post, brandVersion: builtIn.version },
      template: s,
      settings: { channels: [], bannedWords: [] },
      today: "2026-10-01",
      brandVersion: builtIn.version,
    });
    expect(equal.findings.map((b) => b.code)).not.toContain("brand-version");
  });

  it("gives an error if the text on a ground has too little contrast", () => {
    const s = template("statement")!;
    const brand = { grounds: { ...builtIn.grounds, accent: { background: "#D63E22", text: "#E0603F" } } };
    const report = runCheck({
      post: {
        template: "statement",
        formats: ["li-square"],
        content: { ...defaultContent(s), ground: "accent" },
      },
      template: s,
      settings: { channels: [], bannedWords: [] },
      today: "2026-10-01",
      brand,
    });
    expect(report.findings.find((b) => b.code === "contrast")).toMatchObject({ level: "error" });
  });
});
