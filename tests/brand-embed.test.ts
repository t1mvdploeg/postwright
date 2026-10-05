import { afterEach, describe, expect, it, vi } from "vitest";
import { embedBrand } from "../src/web/studio/brand.js";

afterEach(() => vi.unstubAllGlobals());

const manifest = {
  name: "Acme",
  font: { family: "Acme Sans", files: ["fonts/a.woff2"] },
  logos: { default: "logo/a.png", white: "logo/w.svg" },
};

describe("embedBrand", () => {
  it("loads logos and font from the given folder with the project header, and types the logos by extension", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "acme", setItem: () => undefined });
    const seen: Array<[string, Record<string, string>]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push([url, (init?.headers ?? {}) as Record<string, string>]);
        return new Response(new Uint8Array([1, 2, 3]));
      }),
    );
    const brand = await embedBrand(manifest, "/brand-proposal");
    expect(seen.map(([url]) => url).sort()).toEqual([
      "/brand-proposal/fonts/a.woff2",
      "/brand-proposal/logo/a.png",
      "/brand-proposal/logo/w.svg",
    ]);
    for (const [, headers] of seen) expect(headers["x-postwright-project"]).toBe("acme");
    expect(brand.logos.default).toMatch(/^data:image\/png;base64,/);
    expect(brand.logos.white).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(brand.fontCss).toContain('font-family: "Acme Sans"');
    expect(brand.fontCss).toContain("data:font/woff2;base64,");
  });

  it("fails with the path when a file cannot be loaded", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 404 })),
    );
    await expect(embedBrand(manifest, "/brand")).rejects.toThrow(/Could not load \/brand\/(logo|fonts)\//);
  });
});
