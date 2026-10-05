// The browser side of projects: which project is active, the header on every call, and the
// brand loader. No DOM needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeProject, api, pinProject, projectHeaders, setActiveProject } from "../src/web/ui.js";
import { pickProject } from "../src/web/projects.js";
import { loadBrand, loadMedia } from "../src/web/studio/brand.js";

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}
afterEach(() => {
  vi.unstubAllGlobals();
  pinProject(null);
});

describe("the active project", () => {
  it("is null and sends no header until one is chosen", () => {
    stubStorage();
    expect(activeProject()).toBeNull();
    expect(projectHeaders()).toEqual({});
  });

  it("is remembered and sent as a header", () => {
    stubStorage();
    setActiveProject("acme");
    expect(activeProject()).toBe("acme");
    expect(projectHeaders()).toEqual({ "x-postwright-project": "acme" });
  });

  it("survives a browser where storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(activeProject()).toBeNull();
    expect(() => setActiveProject("acme")).not.toThrow();
  });
});

describe("a pinned project", () => {
  it("keeps the header on the page's project when the remembered one changes", () => {
    stubStorage({ "postwright-project": "acme" });
    pinProject("acme");
    setActiveProject("beta"); // another tab, or a switch that was cancelled
    expect(activeProject()).toBe("beta");
    expect(projectHeaders()).toEqual({ "x-postwright-project": "acme" });
  });
});

describe("api()", () => {
  it("puts the project header on every call", async () => {
    stubStorage({ "postwright-project": "acme" });
    const fetchStub = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    await api("/api/posts");
    const init = (fetchStub.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["x-postwright-project"]).toBe("acme");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });
});

describe("pickProject", () => {
  const list = [
    { slug: "postwright", name: "Postwright" },
    { slug: "acme", name: "Acme" },
  ];
  it("keeps the remembered project when it still exists", () => {
    expect(pickProject(list, "acme")).toBe("acme");
  });
  it("falls back to the first project when the remembered one is gone or nothing is remembered", () => {
    expect(pickProject(list, "deleted-by-hand")).toBe("postwright");
    expect(pickProject(list, null)).toBe("postwright");
  });
  it("gives null, and does not throw, when there is no project at all", () => {
    expect(pickProject([], "acme")).toBeNull();
    expect(pickProject([], null)).toBeNull();
  });
});

describe("the brand loader", () => {
  it("sends the project header on the brand and on every file", async () => {
    stubStorage({ "postwright-project": "acme" });
    const seen: Array<[string, Record<string, string>]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push([url, (init?.headers ?? {}) as Record<string, string>]);
        if (url === "/api/brand") {
          return new Response(
            JSON.stringify({
              name: "Acme",
              font: { family: "Inter", files: ["fonts/x.woff2"] },
              logos: { default: "logo/a.svg" },
            }),
          );
        }
        return new Response(new Uint8Array([1, 2, 3]));
      }),
    );
    await loadBrand();
    expect(seen.map(([url]) => url)).toEqual(["/api/brand", "/brand/logo/a.svg", "/brand/fonts/x.woff2"]);
    for (const [, headers] of seen) expect(headers["x-postwright-project"]).toBe("acme");
  });
});

describe("the media loader", () => {
  const id = `${"c".repeat(32)}.png`;

  it("sends the project header", async () => {
    stubStorage({ "postwright-project": "acme" });
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push((init?.headers ?? {}) as Record<string, string>);
        return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
      }),
    );
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10, close() {} }));
    await loadMedia([`${"d".repeat(32)}.png`]);
    expect(seen[0]?.["x-postwright-project"]).toBe("acme");
  });

  it("keeps a small thumbnail apart from the full-size image", async () => {
    stubStorage();
    let fetches = 0;
    vi.stubGlobal("fetch", async () => {
      fetches += 1;
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    });
    // 1000 px wide: left alone at the default size, scaled down for a 160 px thumbnail.
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1000, height: 1000, close() {} }));
    const drawn: number[] = [];
    vi.stubGlobal("document", {
      createElement: () => ({
        set width(w: number) {
          drawn.push(w);
        },
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => "data:image/png;base64,THUMB",
      }),
    });
    const thumb = await loadMedia([id], 160);
    const full = await loadMedia([id]);
    expect(thumb[id]).toBe("data:image/png;base64,THUMB");
    expect(full[id]).not.toBe(thumb[id]);
    expect(drawn).toEqual([160]);
    expect(fetches).toBe(2);
  });
});
