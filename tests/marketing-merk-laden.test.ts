// Marketingstudio — geüploade beelden laden in de browser (merk.js), met fetch en
// createImageBitmap als stubs. Een mislukte lading mag niet voor de rest van de
// sessie als "geen beeld" in de cache blijven staan.
import { describe, it, expect, afterEach, vi } from "vitest";
import { alsDataUri, laadMedia } from "../src/web/marketing/merk.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("merk laden", () => {
  it("maakt van een blob een data-URI", async () => {
    expect(await alsDataUri(new Blob([new Uint8Array([104, 105])], { type: "text/plain" }))).toBe(
      "data:text/plain;base64,aGk=",
    );
  });

  it("probeert een beeld opnieuw na een mislukte lading, in plaats van de fout te onthouden", async () => {
    const id = `${"b".repeat(32)}.png`;
    let pogingen = 0;
    vi.stubGlobal("fetch", async () => {
      pogingen += 1;
      return pogingen === 1
        ? new Response("stuk", { status: 503 })
        : new Response(new Blob([PNG], { type: "image/png" }), { status: 200 });
    });
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10, close() {} }));
    expect(await laadMedia([id])).toEqual({});
    const tweede = await laadMedia([id]);
    expect(tweede[id]).toMatch(/^data:image\/png;base64,/);
    // Een gelukte lading wordt wél onthouden.
    await laadMedia([id]);
    expect(pogingen).toBe(2);
  });

  it("negeert id's die geen media-id zijn", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("mag niet");
    });
    expect(await laadMedia(["../geheim.png", "https://kwaad.nl/x.png"])).toEqual({});
  });
});
