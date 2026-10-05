// Bestanden in de datamap die een gebruiker met de hand kapot kan maken: de studio noemt dan het bestand
// in een leesbare fout (500) en schrijft er niets overheen of naast.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { startStudio } from "./helpers/studio.js";

const studios: Array<{ sluit: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.sluit();
});

async function start() {
  const s = await startStudio();
  studios.push(s);
  const bestand = (...delen: string[]) => join(s.dataDir, ...delen);
  const zet = (naam: string, inhoud: string) => {
    mkdirSync(join(bestand(naam), ".."), { recursive: true });
    writeFileSync(bestand(naam), inhoud);
  };
  const vraag = async (pad: string, methode = "GET", body?: unknown) => {
    const r = await fetch(s.basis + pad, {
      method: methode,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  return { ...s, bestand, zet, vraag };
}

const POST_ID = "p-00000000-0000-4000-8000-000000000001";

describe("een kapot lijstbestand", () => {
  it.each([
    ["geen JSON", "{kapot"],
    ["een object in plaats van een lijst", '{"a":1}'],
    ["een lijst zonder id's", '[{"tekst":"x"}]'],
    ["een lijst met iets anders dan objecten", "[1,2]"],
  ])("geeft een 500 die marketing/feiten.json noemt: %s", async (_naam, inhoud) => {
    const { zet, vraag, bestand } = await start();
    zet("marketing/feiten.json", inhoud);
    const lees = await vraag("/api/feiten");
    expect(lees.status).toBe(500);
    expect(lees.body.fout).toContain("marketing/feiten.json");
    const schrijf = await vraag("/api/feiten", "POST", {
      tekst: "Een feit.",
      soort: "product",
      bron: { soort: "site", verwijzing: "README.md" },
      geldigVan: null,
      geldigTot: null,
      status: "actief",
    });
    expect(schrijf.status).toBe(500);
    expect(schrijf.body.fout).toContain("marketing/feiten.json");
    // De schrijfhulp leest dezelfde lijst.
    const hulp = await vraag("/api/schrijfhulp", "POST", {
      taak: "posttekst",
      sjabloon: "Stelling",
      kanaal: "linkedin",
      toelichting: "",
      velden: [],
      feiten: [],
    });
    expect(hulp.status).toBe(500);
    expect(hulp.body.fout).toContain("marketing/feiten.json");
    // Er is niets overschreven.
    expect(readFileSync(bestand("marketing", "feiten.json"), "utf8")).toBe(inhoud);
  });
});

describe("een kapot postbestand", () => {
  it.each([
    ["geen JSON", "{kapot"],
    ["een object met een ander id", JSON.stringify({ id: "p-00000000-0000-4000-8000-000000000002" })],
    ["een object zonder velden", '{"a":1}'],
  ])("geeft een 500 die het bestand noemt, ook in de lijst: %s", async (_naam, inhoud) => {
    const { zet, vraag, bestand } = await start();
    const naam = `marketing/posts/${POST_ID}.json`;
    zet(naam, inhoud);
    for (const [pad, methode] of [
      ["/api/posts", "GET"],
      [`/api/posts/${POST_ID}`, "GET"],
      [`/api/posts/${POST_ID}`, "DELETE"],
      ["/api/overzicht", "GET"],
    ]) {
      const r = await vraag(pad, methode);
      expect(r.status, `${methode} ${pad}`).toBe(500);
      expect(r.body.fout, `${methode} ${pad}`).toContain(naam);
    }
    expect(readFileSync(bestand(naam), "utf8")).toBe(inhoud);
  });
});

describe("PUT /api/instellingen", () => {
  it("meldt een onleesbaar bestand in plaats van het te overschrijven", async () => {
    const { zet, vraag, bestand } = await start();
    zet("marketing/instellingen.json", "{kapot");
    const r = await vraag("/api/instellingen", "PUT", STANDAARD_MARKETING_INSTELLINGEN);
    expect(r.status).toBe(500);
    expect(r.body.fout).toContain("marketing/instellingen.json");
    expect(readFileSync(bestand("marketing", "instellingen.json"), "utf8")).toBe("{kapot");
  });

  it("bewaart gewoon als het bestand er niet is of in orde is", async () => {
    const { vraag } = await start();
    const nieuw = { ...STANDAARD_MARKETING_INSTELLINGEN, standaardHashtags: "#anders" };
    expect((await vraag("/api/instellingen", "PUT", nieuw)).status).toBe(200);
    expect((await vraag("/api/instellingen", "PUT", STANDAARD_MARKETING_INSTELLINGEN)).status).toBe(200);
  });
});

describe("POST /api/startvulling", () => {
  it.each([
    ["kapotte instellingen", "marketing/instellingen.json", "{kapot", "marketing/instellingen.json"],
    ["een kapot merk", "brand/merk.json", "{kapot", "data/brand/merk.json"],
  ])("schrijft niets als er %s zijn", async (_naam, bestandNaam, inhoud, genoemd) => {
    const { zet, vraag, bestand } = await start();
    zet(bestandNaam, inhoud);
    const r = await vraag("/api/startvulling", "POST", {});
    expect(r.status).toBe(500);
    expect(r.body.fout).toContain(genoemd);
    for (const n of ["feiten.json", "teksten.json", "posts"])
      expect(existsSync(bestand("marketing", n)), n).toBe(false);
  });
});
