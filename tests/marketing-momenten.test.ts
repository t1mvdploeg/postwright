// De kalender: een vaste lijst jaarlijkse dagen plus eigen momenten uit momenten.json, en de route
// die van een moment een concept-feit maakt zonder dubbelingen.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { alleMomenten, type Moment } from "../src/model/marketing-momenten.js";
import { plusDagen } from "../src/web/marketing/kalender.js";
import { leesEigenMomenten } from "../src/server/api-marketing.js";
import { FeitInvoerSchema } from "../src/model/marketing-schema.js";
import { startStudio } from "./helpers/studio.js";

const eigen = (x: Partial<Moment> = {}): Moment => ({
  sleutel: "eigen-lancering",
  datum: "2026-11-03",
  titel: "Launch day",
  zin: "Show the launch.",
  soort: "eigen",
  ...x,
});

describe("alleMomenten", () => {
  it("geeft de jaarlijkse dagen van het bereik, gesorteerd, met de datum als sleutel", () => {
    const m = alleMomenten("2026-04-01", "2026-04-30");
    expect(m.map((x) => x.sleutel)).toEqual(["2026-04-21", "2026-04-22"]);
    expect(m[1]).toEqual({
      sleutel: "2026-04-22",
      datum: "2026-04-22",
      titel: "Earth Day",
      zin: "Share one concrete thing you do, not a promise.",
      soort: "dag",
    });
  });

  it("geeft bij een bereik over de jaarwisseling de momenten van beide jaren", () => {
    const m = alleMomenten("2026-12-20", "2027-01-05");
    expect(m.map((x) => x.datum)).toEqual(["2026-12-25", "2027-01-01"]);
  });

  it("neemt de grenzen mee en laat wat erbuiten valt weg", () => {
    expect(alleMomenten("2026-12-25", "2026-12-25")).toHaveLength(1);
    expect(alleMomenten("2026-12-26", "2027-01-01").map((x) => x.datum)).toEqual(["2027-01-01"]);
    expect(alleMomenten("2026-12-26", "2026-12-31")).toEqual([]);
  });

  it("voegt eigen momenten toe, ook uit een jaar zonder vaste dag, en filtert ze op het bereik", () => {
    const m = alleMomenten("2026-10-01", "2026-12-31", [
      eigen(),
      eigen({ sleutel: "eigen-buiten", datum: "2027-03-01" }),
    ]);
    expect(m.map((x) => [x.datum, x.soort])).toEqual([
      ["2026-10-10", "dag"],
      ["2026-11-03", "eigen"],
      ["2026-12-25", "dag"],
    ]);
  });

  it("sorteert op datum en dan op sleutel", () => {
    const m = alleMomenten("2026-12-25", "2026-12-25", [eigen({ sleutel: "a", datum: "2026-12-25" })]);
    expect(m.map((x) => x.sleutel)).toEqual(["2026-12-25", "a"]);
  });

  it("elke vaste dag heeft een unieke sleutel, een titel en een zin die op een punt eindigt", () => {
    const alle = alleMomenten("2026-01-01", "2026-12-31");
    expect(alle).toHaveLength(8);
    expect(new Set(alle.map((m) => m.sleutel)).size).toBe(8);
    for (const m of alle) {
      expect(m.sleutel).toMatch(/^[a-z0-9-]{3,60}$/);
      expect(m.titel.length).toBeGreaterThan(0);
      expect(m.zin).toMatch(/\.$/);
    }
  });

  it("telt dagen op kalenderdatums, ook over de wintertijd en de jaargrens", () => {
    expect(plusDagen("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("leesEigenMomenten", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.sluit();
  });
  const schrijf = (inhoud: string) => {
    mkdirSync(join(studio.dataDir, "marketing"), { recursive: true });
    writeFileSync(join(studio.dataDir, "marketing", "momenten.json"), inhoud);
  };
  const haal = (pad: string) => fetch(studio.basis + pad);

  it("geeft een lege lijst zolang het bestand er niet is", async () => {
    expect(await leesEigenMomenten({ dir: studio.dataDir })).toEqual([]);
  });

  it("leest eigen momenten en markeert ze als eigen; ze komen mee in de route", async () => {
    schrijf(
      JSON.stringify([
        { sleutel: "eigen-lancering", datum: "2026-11-03", titel: "Launch day", zin: "Show the launch." },
      ]),
    );
    expect(await leesEigenMomenten({ dir: studio.dataDir })).toEqual([eigen()]);
    const lijst = (await (await haal("/api/momenten?van=2026-11-01&tot=2026-11-30")).json()).momenten;
    expect(lijst).toEqual([eigen()]);
  });

  it("geeft een ApiFout 500 met de bestandsnaam bij kapotte JSON of een verkeerde vorm", async () => {
    schrijf("{kapot");
    await expect(leesEigenMomenten({ dir: studio.dataDir })).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("momenten.json"),
    });
    const r = await haal("/api/momenten");
    expect(r.status).toBe(500);
    expect((await r.json()).fout).toContain("momenten.json");
    schrijf(JSON.stringify([{ sleutel: "x", datum: "2026-13-45", titel: "Fout" }]));
    await expect(leesEigenMomenten({ dir: studio.dataDir })).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("momenten.json"),
    });
    schrijf("[]");
  });
});

describe("routes momenten", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.sluit();
  });
  const haal = (pad: string) => fetch(studio.basis + pad);
  // Elke POST zonder ruwe body eist application/json, ook als de route de body niet leest.
  const post = (pad: string) =>
    fetch(studio.basis + pad, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  it("geeft de momenten in een periode en maakt er één keer een concept-feit van", async () => {
    const lijst = (await (await haal("/api/momenten?van=2026-04-22&tot=2026-04-22")).json()).momenten;
    expect(lijst.map((x: Moment) => x.sleutel)).toEqual(["2026-04-22"]);
    const een = await post("/api/momenten/2026-04-22/feit");
    expect(een.status).toBe(201);
    const feit = await een.json();
    expect(feit).toMatchObject({
      tekst: "Earth Day: Share one concrete thing you do, not a promise.",
      soort: "extern",
      status: "concept",
      geldigTot: null,
    });
    // Het feit is zelf ook weer te bewerken en op te slaan.
    const { id: _i, aangemaakt: _a, gewijzigd: _g, ...invoer } = feit;
    expect(FeitInvoerSchema.safeParse(invoer).success).toBe(true);
    const twee = await post("/api/momenten/2026-04-22/feit");
    expect(twee.status).toBe(200);
    expect((await twee.json()).id).toBe(feit.id);
    const feiten = (await (await haal("/api/feiten")).json()).feiten;
    expect(feiten.filter((f: { tekst: string }) => f.tekst === feit.tekst)).toHaveLength(1);
    const onbekend = await post("/api/momenten/bestaat-niet/feit");
    expect(onbekend.status).toBe(404);
    // "Maak post" in de planner (ideeen-ui.js) herkent aan precies deze tekst dat het moment weg is.
    expect((await onbekend.json()).fout).toBe("Onbekend moment");
    // Een datum zonder vaste dag is ook onbekend.
    expect((await post("/api/momenten/2026-04-23/feit")).status).toBe(404);
  });

  it("geeft een actief feit terug, maar weigert met 409 als het feit is ingetrokken", async () => {
    const pad = "/api/momenten/2026-09-30/feit";
    const een = await post(pad);
    expect(een.status).toBe(201);
    const feit = await een.json();
    const zet = (status: string) =>
      fetch(`${studio.basis}/api/feiten/${feit.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tekst: feit.tekst,
          soort: feit.soort,
          bron: feit.bron,
          geldigVan: feit.geldigVan,
          geldigTot: feit.geldigTot,
          status,
        }),
      });
    expect((await zet("actief")).status).toBe(200);
    const actief = await post(pad);
    expect(actief.status).toBe(200);
    expect(await actief.json()).toMatchObject({ id: feit.id, status: "actief" });
    expect((await zet("ingetrokken")).status).toBe(200);
    const ingetrokken = await post(pad);
    expect(ingetrokken.status).toBe(409);
    expect((await ingetrokken.json()).fout).toBe(
      "Het feit bij dit moment is ingetrokken; zet het in de Feitenbank terug op concept als u het weer wilt gebruiken",
    );
    // Er komt ook geen tweede feit met dezelfde tekst bij.
    const feiten = (await (await haal("/api/feiten")).json()).feiten;
    expect(feiten.filter((f: { tekst: string }) => f.tekst === feit.tekst)).toHaveLength(1);
  });

  it("weigert een ongeldige periode", async () => {
    expect((await haal("/api/momenten?van=gisteren")).status).toBe(400);
    // Wel het juiste patroon, geen echte datum: geen 500 uit plusDagen, en geen stille 2 maart.
    expect((await haal("/api/momenten?van=2026-13-01")).status).toBe(400);
    expect((await haal("/api/momenten?van=2026-02-30")).status).toBe(400);
    expect((await haal("/api/momenten?van=2026-02-01&tot=2026-02-30")).status).toBe(400);
    expect((await haal("/api/momenten?van=2026-12-01&tot=2026-11-01")).status).toBe(400);
    expect((await haal("/api/momenten?van=2026-11-01")).status).toBe(200);
  });
});
