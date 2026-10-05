// Marketing studio: loading uploaded images in the browser (brand.js), with fetch and
// createImageBitmap as stubs. A failed load must not stay in the cache as "no image" for
// the rest of the session.
import { describe, it, expect, afterEach, vi } from "vitest";
import { asDataUri, loadMedia } from "../src/web/studio/brand.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("brand loading", () => {
  it("turns a blob into a data URI", async () => {
    expect(await asDataUri(new Blob([new Uint8Array([104, 105])], { type: "text/plain" }))).toBe(
      "data:text/plain;base64,aGk=",
    );
  });

  it("retries an image after a failed load, instead of remembering the error", async () => {
    const id = `${"b".repeat(32)}.png`;
    let attempts = 0;
    vi.stubGlobal("fetch", async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("piece", { status: 503 })
        : new Response(new Blob([PNG], { type: "image/png" }), { status: 200 });
    });
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10, close() {} }));
    expect(await loadMedia([id])).toEqual({});
    const second = await loadMedia([id]);
    expect(second[id]).toMatch(/^data:image\/png;base64,/);
    // A successful load is remembered, though.
    await loadMedia([id]);
    expect(attempts).toBe(2);
  });

  it("ignores ids that are not media ids", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("must not");
    });
    expect(await loadMedia(["../secret.png", "https://evil.io/x.png"])).toEqual({});
  });
});
