// De startvulling: alles wat erin staat, staat letterlijk op de site (ontwerpregel "Teksten komen
// letterlijk van de site"); de route vult alleen aan en is dus veilig om twee keer te draaien.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/http.js";
import { adminCookie } from "./helpers/sessie.js";
import { leesAudit } from "../src/model/audit.js";
import { STARTFEITEN, STARTTEKSTEN, zichtbareTekst } from "../src/model/marketing-startvulling.js";
import { FeitInvoerSchema, TekstInvoerSchema, STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";

const pagina = (verwijzing: string) => zichtbareTekst(readFileSync(verwijzing.split(",")[0].trim(), "utf8"));

describe("startvulling", () => {
  it("zichtbareTekst haalt tags, scripts en entiteiten weg", () => {
    expect(zichtbareTekst('<p>Een <b>tarief</b>&nbsp;van €&nbsp;62,75</p><script>x()</script><style>p{}</style>')).toBe("Een tarief van € 62,75");
  });
  it("elk feit is een geldig concept-feit dat letterlijk op de genoemde pagina staat", () => {
    expect(STARTFEITEN.length).toBeGreaterThanOrEqual(8);
    for (const f of STARTFEITEN) {
      expect(FeitInvoerSchema.safeParse({ ...f, status: "concept" }).success, f.tekst).toBe(true);
      expect(f.bron.verwijzing).toMatch(/^src\/web\/(landing|over-ons)\.html/);
      expect(pagina(f.bron.verwijzing), f.tekst).toContain(f.tekst);
    }
    expect(new Set(STARTFEITEN.map((f) => f.tekst)).size).toBe(STARTFEITEN.length);
    expect(STARTFEITEN.some((f) => f.soort === "voorbeelddossier" && f.tekst.includes("62,75"))).toBe(true);
  });
  it("de vaste teksten zijn geldig en (op de hashtags na) letterlijk van de site", () => {
    const site = pagina("src/web/landing.html") + "\n" + pagina("src/web/over-ons.html");
    for (const t of STARTTEKSTEN) {
      expect(TekstInvoerSchema.safeParse(t).success, t.naam).toBe(true);
      if (t.soort === "hashtags") expect(t.tekst).toBe(STANDAARD_MARKETING_INSTELLINGEN.standaardHashtags);
      else for (const zin of t.tekst.split(/\n+/)) expect(site, zin).toContain(zin.trim());
    }
    expect(STARTTEKSTEN.map((t) => t.soort).sort()).toEqual(["afsluiter", "boilerplate", "hashtags"]);
  });
});

describe("POST /startvulling", () => {
  let basis = ""; let cookie = ""; let dataDir = ""; let sluit: () => Promise<void>;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ct-startvulling-"));
    const s = await startServer({ poort: 0, dataDir, maxAanvragenPerMinuut: 10_000 });
    basis = `http://127.0.0.1:${s.poort}`; sluit = s.sluit;
    cookie = await adminCookie(basis);
  });
  afterAll(async () => { await sluit(); rmSync(dataDir, { recursive: true, force: true }); });
  // Elke POST zonder ruwe body eist application/json (http.ts), ook als de route de body niet leest.
  const post = (pad: string, metSessie = true) =>
    fetch(basis + pad, { method: "POST", headers: { ...(metSessie ? { cookie } : {}), "content-type": "application/json" }, body: "{}" });
  it("vult aan als concept en voegt bij een tweede keer niets dubbel toe", async () => {
    const een = await (await post("/api/beheer/marketing/startvulling")).json();
    expect(een).toEqual({ feiten: STARTFEITEN.length, teksten: STARTTEKSTEN.length });
    const twee = await (await post("/api/beheer/marketing/startvulling")).json();
    expect(twee).toEqual({ feiten: 0, teksten: 0 });
    const feiten = (await (await fetch(basis + "/api/beheer/marketing/feiten", { headers: { cookie } })).json()).feiten;
    expect(feiten).toHaveLength(STARTFEITEN.length);
    expect(feiten.every((f: { status: string }) => f.status === "concept")).toBe(true);
    const teksten = (await (await fetch(basis + "/api/beheer/marketing/teksten", { headers: { cookie } })).json()).teksten;
    expect(teksten.map((t: { tekst: string }) => t.tekst).sort()).toEqual(STARTTEKSTEN.map((t) => t.tekst).sort());
    const audit = await leesAudit({ dir: dataDir });
    expect(audit.filter((r) => r.actie === "marketing.startvulling").map((r) => r.doelwit))
      .toEqual([`${STARTFEITEN.length} feiten, ${STARTTEKSTEN.length} teksten`, "0 feiten, 0 teksten"]);
  });
  it("zonder beheersessie mag het niet", async () => {
    expect((await post("/api/beheer/marketing/startvulling", false)).status).toBe(401);
  });
});
