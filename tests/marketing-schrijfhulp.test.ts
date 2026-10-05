// Marketingstudio — schrijfhulp. De schrijfhulp werkt alleen met actieve feiten die de server zelf
// laadt, rekent elk voorstel na op getallen zonder feit, boekt elke aanroep en respecteert het
// maandplafond.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { marketingInstructie, MarketingVoorstelSchema, type MarketingOpdracht } from "../src/model/marketing-schrijfhulp.js";
import { AiFout, LEGE_USAGE, type AiProvider, type AiResultaat } from "../src/server/ai/provider.js";
import type { MarketingVoorstel } from "../src/model/marketing-schrijfhulp.js";
import { maandtotaalUsd } from "../src/server/ai/verbruik.js";
import { voorbeeldProvider } from "../src/server/ai/voorbeeld.js";
import { startStudio } from "./helpers/studio.js";

const nep = {
  gezien: null as MarketingOpdracht | null,
  antwoord: null as ((o: MarketingOpdracht) => AiResultaat<MarketingVoorstel>) | null,
  vertraging: 0,
};
const provider: AiProvider = {
  naam: "anthropic",
  model: "claude-sonnet-5-5",
  marketingTekst: async (o) => {
    nep.gezien = o;
    if (nep.vertraging) await new Promise((ok) => setTimeout(ok, nep.vertraging));
    return nep.antwoord!(o);
  },
  marketingIdeeen: async () => { throw new Error("mag niet"); },
};

let basis = "";
let dataDir = "";
let sluit: () => Promise<void>;
const API = "/api";

async function vraag(pad: string, body?: unknown, methode = body === undefined ? "GET" : "POST") {
  const r = await fetch(basis + pad, {
    method: methode, headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() as any };
}

async function feit(tekst: string, status = "actief") {
  const r = await vraag(`${API}/feiten`, { tekst, soort: "product", bron: { soort: "site", verwijzing: "README.md" }, status });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

const verzoek = (feiten: string[], extra: Record<string, unknown> = {}) => ({
  taak: "velden", sjabloon: "Stelling", kanaal: "linkedin", toelichting: "Voor HR-managers.",
  velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }, { id: "tekst", label: "Tekst", soort: "tekst", max: 160, nadruk: false }],
  feiten, ...extra,
});

beforeAll(async () => {
  const s = await startStudio({ provider });
  basis = s.basis;
  dataDir = s.dataDir;
  sluit = s.sluit;
});
afterAll(async () => { await sluit(); });
beforeEach(async () => {
  nep.gezien = null;
  nep.vertraging = 0;
  nep.antwoord = (o) => ({
    voorstel: { varianten: [0, 1, 2, 3].map((i) => ({ velden: [{ id: "kop", tekst: `Voorstel ${i} *kop*` }, { id: "tekst", tekst: "A unit price of € 62,75." }, { id: "geheim", tekst: "x" }], posttekst: "", altTekst: "", gebruikteFeiten: o.feiten.map((f) => f.id) })) },
    model: "claude-sonnet-5-5", usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 }, duurMs: 5,
  });
  await zetSchrijfhulp(true);
});

const boekingen = () => readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

async function zetSchrijfhulp(aan: boolean, plafond = 10) {
  const r = await vraag(`${API}/instellingen`, { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan, plafondUsdPerMaand: plafond } }, "PUT");
  expect(r.status).toBe(200);
}

describe("schrijfhulp", () => {
  it("staat standaard aan, en uit als de gebruiker dat zo zet", async () => {
    expect(STANDAARD_MARKETING_INSTELLINGEN.schrijfhulp).toEqual({ aan: true, plafondUsdPerMaand: 10 });
    await zetSchrijfhulp(false);
    const r = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(r.status).toBe(409);
    expect(r.body.fout).toMatch(/staat uit/);
  });

  it("weigert een onbekend of niet-actief feit", async () => {
    const concept = await feit("A draft with € 5", "concept");
    expect((await vraag(`${API}/schrijfhulp`, verzoek([concept]))).status).toBe(400);
    expect((await vraag(`${API}/schrijfhulp`, verzoek(["f-00000000-0000-4000-8000-000000000000"]))).status).toBe(400);
    expect((await vraag(`${API}/schrijfhulp`, verzoek([], { taak: "gedicht" }))).status).toBe(400);
  });

  it("stuurt het model alleen de feiten die de server zelf laadt, en rekent getallen na", async () => {
    const id = await feit("Cost price is € 52,75 per hour");
    const r = await vraag(`${API}/schrijfhulp`, verzoek([id]));
    expect(r.status).toBe(200);
    expect(r.body.voorbeeld).toBe(false);
    expect(nep.gezien!.feiten).toEqual([{ id, tekst: "Cost price is € 52,75 per hour", bron: "README.md" }]);
    expect(nep.gezien!.merk.merknaam).toBe("Postwright");
    expect(r.body.varianten).toHaveLength(3);
    const v = r.body.varianten[0];
    expect(Object.keys(v.velden)).toEqual(["kop", "tekst"]);
    expect(v.ongedekt).toEqual(["€ 62,75"]);
    expect(v.gebruikteFeiten).toEqual([id]);
  });

  it("geeft de huidige postinhoud aan het model mee", async () => {
    const huidig = { velden: { kop: "Genoeg *gezien*" }, posttekst: "Een tekst.", altTekst: "" };
    expect((await vraag(`${API}/schrijfhulp`, verzoek([], { taak: "alt-tekst", huidig }))).status).toBe(200);
    expect(nep.gezien!.huidig).toEqual(huidig);
    expect((await vraag(`${API}/schrijfhulp`, verzoek([]))).status).toBe(200);
    expect(nep.gezien!.huidig).toEqual({ velden: {}, posttekst: "", altTekst: "" });
  });

  it("boekt elke aanroep met taak en kosten, ook bij een fout", async () => {
    const voor = boekingen().length;
    await vraag(`${API}/schrijfhulp`, verzoek([]));
    nep.antwoord = () => { throw new AiFout("The model did not return valid JSON", { input: 1_000_000, output: 0, cacheLezen: 0, cacheSchrijven: 0 }); };
    const fout = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(fout.status).toBe(502);
    expect(fout.body).not.toHaveProperty("voorbeeld");
    const nieuw = boekingen().slice(voor);
    expect(nieuw).toHaveLength(2);
    expect(nieuw[0]).toMatchObject({ taak: "schrijfhulp:velden", model: "claude-sonnet-5-5", ok: true });
    expect(nieuw[0].usd).toBeCloseTo(0.0007, 8); // 100 in en 50 uit tegen $ 2 en $ 10 per miljoen
    expect(nieuw[1]).toMatchObject({ ok: false });
  });

  it("stopt bij het maandplafond", async () => {
    await zetSchrijfhulp(true, 0);
    const r = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(r.status).toBe(429);
    expect(r.body.fout).toMatch(/maandplafond/);
  });

  it("laat bij gelijktijdige aanroepen niet meer door dan het plafond toelaat", async () => {
    // Eén aanroep kost $ 0,90, meer dan de ruimte onder het plafond; zonder serialisatie zagen alle drie nog ruimte.
    await zetSchrijfhulp(true, (await maandtotaalUsd(dataDir, new Date())) + 0.5);
    const traag = nep.antwoord!;
    nep.antwoord = (o) => ({ ...traag(o), usage: { input: 200_000, output: 50_000, cacheLezen: 0, cacheSchrijven: 0 } });
    nep.vertraging = 80;
    const uitslagen = await Promise.all([vraag(`${API}/schrijfhulp`, verzoek([])), vraag(`${API}/schrijfhulp`, verzoek([])), vraag(`${API}/schrijfhulp`, verzoek([]))]);
    expect(uitslagen.map((u) => u.status).sort()).toEqual([200, 429, 429]);
  });
});

describe("instructie en schema", () => {
  it("neemt de merknaam van het merk over en houdt de regel over de feiten overeind", () => {
    const tekst = marketingInstructie({ merknaam: "Voorbeeldmerk" });
    expect(tekst).toContain("Voorbeeldmerk");
    expect(tekst).toContain("Tone: plain and calm");
    expect(tekst).toContain("use only the facts provided");
  });

  it("de voorbeeldgever voldoet aan het antwoordschema", async () => {
    const o: MarketingOpdracht = { taak: "velden", sjabloon: "Stelling", kanaal: "linkedin", toelichting: "", huidig: { velden: {}, posttekst: "", altTekst: "" }, feiten: [], velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }], merk: { merknaam: "X" } };
    const a = await voorbeeldProvider.marketingTekst(o);
    expect(a.voorstel.varianten).toHaveLength(3);
    expect(MarketingVoorstelSchema.safeParse(a.voorstel).success).toBe(true);
    expect(a.usage).toEqual(LEGE_USAGE);
  });
});
