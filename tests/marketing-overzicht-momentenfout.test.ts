// Marketingstudio golf 2, fixronde 1: momenten zijn een extra op het Overzicht, geen voorwaarde.
// Een dataDir zonder data/parameters/<jaar>.json (laadParameters gooit dan) mag het overzicht niet
// slopen — alleen de momentenlijst valt terug op leeg. Eigen bestand met een eigen server: de
// gedeelde server in api-marketing.test.ts kopieert data/parameters juist wél naar zijn dataDir.
// De ideeënhulp heeft de momenten wél nodig: die zegt dan netjes 503 (afsluitende review, C6).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/http.js";
import { adminCookie } from "./helpers/sessie.js";

let basis = "";
let dataDir = "";
let cookie = "";
let sluit: () => Promise<void>;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "ct-marketing-overzicht-zonderparam-"));
  // Bewust geen data/parameters hierheen kopiëren.
  const s = await startServer({ poort: 0, dataDir, maxAanvragenPerMinuut: 10_000 });
  basis = `http://127.0.0.1:${s.poort}`;
  sluit = s.sluit;
  cookie = await adminCookie(basis);
});

afterAll(async () => {
  await sluit();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("overzicht zonder parameters", () => {
  it("blijft 200 geven met een lege momentenlijst als de actualiteitenkalender niet geladen kan worden", async () => {
    const r = await fetch(`${basis}/api/beheer/marketing/overzicht`, { headers: { cookie } });
    expect(r.status).toBe(200);
    const o = await r.json();
    expect(o.momenten).toEqual([]);
    // De rest van het overzicht blijft gewoon werken.
    expect(o).toMatchObject({ geplandDezeWeek: 0, overDatum: 0, concepten: 0, gepubliceerd30: 0, openIdeeen: 0 });
    expect(o).toHaveProperty("laatstGepubliceerd");
    expect(Array.isArray(o.legeWeken)).toBe(true);
    expect(Array.isArray(o.resultaten)).toBe(true);
  });
});

describe("ideeënhulp zonder parameters", () => {
  it("zegt 503 met de reden in plaats van een kale serverfout", async () => {
    const morgen = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await fetch(`${basis}/api/beheer/marketing/ideeen/voorstellen`, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ van: morgen, tot: morgen, aantal: 1, kanaal: "linkedin", toelichting: "", campagne: null }),
    });
    expect(r.status).toBe(503);
    expect((await r.json()).fout).toMatch(/^De actualiteitenkalender is niet te laden: .+/);
  });
});
