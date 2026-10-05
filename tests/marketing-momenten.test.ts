// De actualiteitenkalender: elk moment staat op zijn kennispagina (skill cao-kennis, "geen cao-feit
// zonder bron"), en de API maakt er een concept-feit van zonder dubbelingen.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOMENTEN, alleMomenten, momentenIn, plusDagen, wmlMomenten, type Moment } from "../src/model/marketing-momenten.js";
import { haalGetallen } from "../src/web/marketing/getallen.js";
import { laadParameters } from "../src/core/parameters.js";
import { startServer } from "../src/server/http.js";
import { adminCookie } from "./helpers/sessie.js";
import { FeitInvoerSchema } from "../src/model/marketing-schema.js";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const dagMaand = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MAANDEN[m - 1]}`; };
/** Dag en maand, en binnen 25 tekens op dezelfde regel het jaar. */
const datumMetJaar = (iso: string) => new RegExp(`\\b${dagMaand(iso)}[^\\n]{0,25}?\\b${iso.slice(0, 4)}\\b`);

describe("MOMENTEN", () => {
  it("elk moment is goed gevormd en staat op zijn kennispagina", () => {
    expect(MOMENTEN.length).toBeGreaterThanOrEqual(4);
    expect(new Set(MOMENTEN.map((m) => m.sleutel)).size).toBe(MOMENTEN.length);
    for (const m of MOMENTEN) {
      expect(m.sleutel).toMatch(/^[a-z0-9-]{3,60}$/);
      expect(m.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.datum >= "2026-01-01", m.sleutel).toBe(true);
      if (m.tot) expect(m.tot >= m.datum, m.sleutel).toBe(true);
      if (m.geldigTot) expect(m.geldigTot >= m.datum, m.sleutel).toBe(true);
      expect(m.bron).toMatch(/^docs\/kennis\/[a-z0-9-]+\.md$/);
      expect(existsSync(m.bron), m.bron).toBe(true);
      const bron = readFileSync(m.bron, "utf8").toLowerCase();
      expect(bron, `${m.sleutel}: ${dagMaand(m.datum)}`).toContain(dagMaand(m.datum));
      if (m.tot) expect(bron, `${m.sleutel}: ${dagMaand(m.tot)}`).toContain(dagMaand(m.tot));
      // Ook het jaar, vlak na dag en maand op dezelfde regel ("1 november t/m 31 december 2026"):
      // een moment dat een jaar verschoven staat, valt anders niet op (afsluitende review, C2).
      expect(bron, `${m.sleutel}: ${datumMetJaar(m.datum)}`).toMatch(datumMetJaar(m.datum));
      if (m.tot) expect(bron, `${m.sleutel}: ${datumMetJaar(m.tot)}`).toMatch(datumMetJaar(m.tot));
      const inBron = new Set(haalGetallen(readFileSync(m.bron, "utf8")).map((g) => g.waarde));
      for (const g of haalGetallen(m.tekst)) expect(inBron.has(g.waarde), `${m.sleutel}: ${g.tekst}`).toBe(true);
      expect(m.tekst).not.toMatch(/!|\b(je|jij|jouw)\b/i);
      // Het feit dat de route ervan maakt, moet later ook gewoon te bewerken zijn.
      const feit = { tekst: m.tekst, soort: "cao", bron: { soort: "kennis", verwijzing: m.bron }, geldigTot: m.geldigTot, status: "concept" };
      expect(FeitInvoerSchema.safeParse(feit).success, m.sleutel).toBe(true);
    }
  });
});

describe("momentenIn en plusDagen", () => {
  const m = (sleutel: string, datum: string, tot: string | null = null): Moment => ({ sleutel, datum, tot, titel: sleutel, tekst: sleutel, bron: "docs/kennis/wtta.md", soort: "wet", geldigTot: null });
  const lijst = [m("dag", "2026-11-01"), m("venster", "2026-11-01", "2026-12-31"), m("later", "2027-01-01")];
  it("neemt een moment mee als het de periode raakt, ook een venster dat ervoor begint", () => {
    expect(momentenIn(lijst, "2026-12-01", "2026-12-31").map((x) => x.sleutel)).toEqual(["venster"]);
    expect(momentenIn(lijst, "2026-10-01", "2026-11-01").map((x) => x.sleutel)).toEqual(["dag", "venster"]);
    expect(momentenIn(lijst, "2027-01-02", "2027-02-01")).toEqual([]);
  });
  it("telt dagen op kalenderdatums, ook over de wintertijd en de jaargrens", () => {
    expect(plusDagen("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("wmlMomenten", () => {
  it("maakt per ingangsdatum van het minimumloon een moment met de kennispagina als bron", () => {
    const p = laadParameters(2026, "data");
    const w = wmlMomenten(p);
    expect(w.map((x) => x.datum)).toEqual(["2025-01-01", "2025-07-01", "2026-01-01", "2026-07-01"]);
    expect(w.every((x) => x.bron === "docs/kennis/minimumloon.md" && x.soort === "loon")).toBe(true);
    expect(w[3].tekst).toContain("14,99");
    const alle = alleMomenten(p).map((x) => x.datum);
    expect(alle).toEqual([...alle].sort());
    expect(alleMomenten(p)).toHaveLength(MOMENTEN.length + w.length);
  });
});

describe("routes momenten", () => {
  let basis = ""; let cookie = ""; let dataDir = ""; let sluit: () => Promise<void>;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ct-momenten-"));
    // De route laadt de parameters van het ingestelde jaar (standaard 2026) uit de dataDir.
    cpSync("data/parameters", join(dataDir, "parameters"), { recursive: true });
    const s = await startServer({ poort: 0, dataDir, maxAanvragenPerMinuut: 10_000 });
    basis = `http://127.0.0.1:${s.poort}`; sluit = s.sluit;
    cookie = await adminCookie(basis);
  });
  afterAll(async () => { await sluit(); rmSync(dataDir, { recursive: true, force: true }); });
  const haal = (pad: string) => fetch(basis + pad, { headers: { cookie } });
  // Elke POST zonder ruwe body eist application/json (http.ts), ook als de route de body niet leest.
  const post = (pad: string) => fetch(basis + pad, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });

  it("geeft de momenten in een periode en maakt er één keer een concept-feit van", async () => {
    const eerste = MOMENTEN[0];
    const lijst = (await (await haal(`/api/beheer/marketing/momenten?van=${eerste.datum}&tot=${eerste.datum}`)).json()).momenten;
    expect(lijst.map((x: Moment) => x.sleutel)).toContain(eerste.sleutel);
    const een = await post(`/api/beheer/marketing/momenten/${eerste.sleutel}/feit`);
    expect(een.status).toBe(201);
    const feit = await een.json();
    expect(feit).toMatchObject({ tekst: eerste.tekst, soort: "cao", status: "concept", bron: { soort: "kennis", verwijzing: eerste.bron }, geldigTot: eerste.geldigTot });
    const twee = await post(`/api/beheer/marketing/momenten/${eerste.sleutel}/feit`);
    expect(twee.status).toBe(200);
    expect((await twee.json()).id).toBe(feit.id);
    const feiten = (await (await haal("/api/beheer/marketing/feiten")).json()).feiten;
    expect(feiten.filter((f: { tekst: string }) => f.tekst === eerste.tekst)).toHaveLength(1);
    const onbekend = await post("/api/beheer/marketing/momenten/bestaat-niet/feit");
    expect(onbekend.status).toBe(404);
    // "Maak post" in de planner (ideeen-ui.js) herkent aan precies deze tekst dat het moment weg is.
    expect((await onbekend.json()).fout).toBe("Onbekend moment");
  });

  it("geeft een actief feit terug, maar weigert met 409 als het feit is ingetrokken (afsluitende review, A3)", async () => {
    const m = MOMENTEN[1];
    const pad = `/api/beheer/marketing/momenten/${m.sleutel}/feit`;
    const een = await post(pad);
    expect(een.status).toBe(201);
    const feit = await een.json();
    const zet = (status: string) => fetch(`${basis}/api/beheer/marketing/feiten/${feit.id}`, {
      method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tekst: feit.tekst, soort: feit.soort, bron: feit.bron, geldigVan: feit.geldigVan, geldigTot: feit.geldigTot, status }),
    });
    expect((await zet("actief")).status).toBe(200);
    const actief = await post(pad);
    expect(actief.status).toBe(200);
    expect(await actief.json()).toMatchObject({ id: feit.id, status: "actief" });
    expect((await zet("ingetrokken")).status).toBe(200);
    const ingetrokken = await post(pad);
    expect(ingetrokken.status).toBe(409);
    expect((await ingetrokken.json()).fout).toBe("Het feit bij dit moment is ingetrokken; zet het in de Feitenbank terug op concept als u het weer wilt gebruiken");
    // Er komt ook geen tweede feit met dezelfde tekst bij.
    const feiten = (await (await haal("/api/beheer/marketing/feiten")).json()).feiten;
    expect(feiten.filter((f: { tekst: string }) => f.tekst === m.tekst)).toHaveLength(1);
  });

  it("neemt ook een moment uit de parameters (minimumloon) mee", async () => {
    const lijst = (await (await haal("/api/beheer/marketing/momenten?van=2026-07-01&tot=2026-07-01")).json()).momenten;
    expect(lijst.map((x: Moment) => x.sleutel)).toContain("wml-2026-07-01");
    expect((await post("/api/beheer/marketing/momenten/wml-2026-07-01/feit")).status).toBe(201);
  });

  it("weigert een ongeldige periode", async () => {
    expect((await haal("/api/beheer/marketing/momenten?van=gisteren")).status).toBe(400);
    // Wel het juiste patroon, geen echte datum: geen 500 uit plusDagen, en geen stille 2 maart.
    expect((await haal("/api/beheer/marketing/momenten?van=2026-13-01")).status).toBe(400);
    expect((await haal("/api/beheer/marketing/momenten?van=2026-02-30")).status).toBe(400);
    expect((await haal("/api/beheer/marketing/momenten?van=2026-02-01&tot=2026-02-30")).status).toBe(400);
    expect((await haal("/api/beheer/marketing/momenten?van=2026-12-01&tot=2026-11-01")).status).toBe(400);
    expect((await haal("/api/beheer/marketing/momenten?van=2026-11-01")).status).toBe(200);
  });
});
