// Marketingstudio — schrijfhulp en feiten uit de parameters. De schrijfhulp werkt alleen met
// actieve feiten die de server zelf laadt, rekent elk voorstel na op getallen zonder feit, boekt de
// kosten als platformkosten en respecteert zijn eigen maandplafond.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/http.js";
import { adminCookie } from "./helpers/sessie.js";
import { leesKosten, PLATFORM_BEDRIJF, type Kostenregel } from "../src/model/kosten.js";
import { parameterFeiten } from "../src/model/marketing-parameters.js";
import { laadParameters } from "../src/core/parameters.js";
import { FeitInvoerSchema, STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { MarketingVoorstelSchema, type MarketingOpdracht } from "../src/model/marketing-schrijfhulp.js";
import { AnalyseFout, leesMarketingAntwoord, type AnalyseProvider, type MarketingResultaat } from "../src/model/provider.js";
import { NepProvider } from "../src/model/nep.js";
import { verzamelStatistieken } from "../src/model/statistieken.js";

const LEEG = { input: 0, output: 0, cacheLezen: 0, cacheSchrijven: 0 };
const nep = {
  gezien: null as MarketingOpdracht | null,
  antwoord: null as ((o: MarketingOpdracht) => MarketingResultaat) | null,
};
const provider: AnalyseProvider = {
  naam: "nep-marketing",
  analyseer: async () => { throw new Error("mag niet"); },
  praat: async () => { throw new Error("mag niet"); },
  marketingTekst: async (o) => { nep.gezien = o; return nep.antwoord!(o); },
};

let basis = "";
let cookie = "";
let dataDir = "";
let sluit: () => Promise<void>;
const API = "/api";

async function vraag(pad: string, body?: unknown, methode = body === undefined ? "GET" : "POST") {
  const r = await fetch(basis + pad, {
    method: methode, headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() as any };
}

async function feit(tekst: string, status = "actief") {
  const r = await vraag(`${API}/feiten`, { tekst, soort: "voorbeelddossier", bron: { soort: "site", verwijzing: "src/web/landing.html" }, status });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

const verzoek = (feiten: string[], extra: Record<string, unknown> = {}) => ({
  taak: "velden", sjabloon: "Stelling", kanaal: "linkedin", toelichting: "Voor HR-managers.",
  velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }, { id: "tekst", label: "Tekst", soort: "tekst", max: 160, nadruk: false }],
  feiten, ...extra,
});

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "ct-marketing-hulp-"));
  cpSync("data/parameters", join(dataDir, "parameters"), { recursive: true });
  const s = await startServer({ poort: 0, dataDir, provider, maxAanvragenPerMinuut: 10_000 });
  basis = `http://127.0.0.1:${s.poort}`;
  sluit = s.sluit;
  cookie = await adminCookie(basis);
});
afterAll(async () => { await sluit(); rmSync(dataDir, { recursive: true, force: true }); });
beforeEach(() => {
  nep.gezien = null;
  nep.antwoord = (o) => ({
    voorstel: { varianten: [0, 1, 2, 3].map((i) => ({ velden: [{ id: "kop", tekst: `Voorstel ${i} *kop*` }, { id: "tekst", tekst: "Een uurtarief van € 62,75." }, { id: "geheim", tekst: "x" }], posttekst: "", altTekst: "", gebruikteFeiten: o.feiten.map((f) => f.id) })) },
    model: "nep-model", usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 }, duurMs: 5,
  });
});

async function zetSchrijfhulp(aan: boolean, plafond = 10) {
  const r = await vraag(`${API}/instellingen`, { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan, plafondEurPerMaand: plafond } }, "PUT");
  expect(r.status).toBe(200);
}

describe("schrijfhulp", () => {
  it("staat standaard uit", async () => {
    const r = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(r.status).toBe(409);
    expect(r.body.fout).toMatch(/staat uit/);
  });

  it("weigert een onbekend of niet-actief feit", async () => {
    await zetSchrijfhulp(true);
    const concept = await feit("Een concept met € 5", "concept");
    expect((await vraag(`${API}/schrijfhulp`, verzoek([concept]))).status).toBe(400);
    expect((await vraag(`${API}/schrijfhulp`, verzoek(["f-00000000-0000-4000-8000-000000000000"]))).status).toBe(400);
    expect((await vraag(`${API}/schrijfhulp`, verzoek([], { taak: "gedicht" }))).status).toBe(400);
  });

  it("stuurt het model alleen de feiten die de server zelf laadt, en rekent getallen na", async () => {
    await zetSchrijfhulp(true);
    const id = await feit("Voorbeelddossier: kostprijs € 52,75 per uur");
    const r = await vraag(`${API}/schrijfhulp`, verzoek([id]));
    expect(r.status).toBe(200);
    expect(nep.gezien!.feiten).toEqual([{ id, tekst: "Voorbeelddossier: kostprijs € 52,75 per uur", bron: "src/web/landing.html" }]);
    expect(r.body.varianten).toHaveLength(3);
    const v = r.body.varianten[0];
    expect(Object.keys(v.velden)).toEqual(["kop", "tekst"]);
    expect(v.ongedekt).toEqual(["€ 62,75"]);
    expect(v.gebruikteFeiten).toEqual([id]);
  });

  it("geeft de huidige postinhoud aan het model mee (BM-13)", async () => {
    await zetSchrijfhulp(true);
    const huidig = { velden: { kop: "Genoeg *gezien*" }, posttekst: "Een tekst.", altTekst: "" };
    expect((await vraag(`${API}/schrijfhulp`, verzoek([], { taak: "alt-tekst", huidig }))).status).toBe(200);
    expect(nep.gezien!.huidig).toEqual(huidig);
    expect((await vraag(`${API}/schrijfhulp`, verzoek([]))).status).toBe(200);
    expect(nep.gezien!.huidig).toEqual({ velden: {}, posttekst: "", altTekst: "" });
  });

  it("boekt de kosten als platformkosten met soort marketing, ook bij een fout", async () => {
    await zetSchrijfhulp(true);
    await vraag(`${API}/schrijfhulp`, verzoek([]));
    nep.antwoord = () => { throw new AnalyseFout("Het model gaf geen geldige JSON terug", { input: 10, output: 5, cacheLezen: 0, cacheSchrijven: 0 }, "fout"); };
    const fout = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(fout.status).toBe(502);
    const regels = (await leesKosten({ dir: dataDir })).filter((r) => r.soort === "marketing");
    expect(regels.length).toBeGreaterThanOrEqual(2);
    expect(regels.every((r) => r.bedrijf === PLATFORM_BEDRIJF)).toBe(true);
    expect(regels.some((r) => r.uitkomst === "fout" && r.usage.input === 10)).toBe(true);
    expect(existsSync(join(dataDir, "tenants"))).toBe(false);
  });

  it("stopt bij het maandplafond", async () => {
    await zetSchrijfhulp(true, 0);
    const r = await vraag(`${API}/schrijfhulp`, verzoek([]));
    expect(r.status).toBe(429);
    expect(r.body.fout).toMatch(/maandplafond/);
  });

  it("laat bij gelijktijdige aanroepen niet meer door dan het plafond toelaat (reviewbevinding 6)", async () => {
    await zetSchrijfhulp(true, 0.000001);
    const traag = nep.antwoord!;
    nep.antwoord = (o) => ({ ...traag(o), usage: { input: 200_000, output: 50_000, cacheLezen: 0, cacheSchrijven: 0 } });
    const echte = provider.marketingTekst!;
    provider.marketingTekst = async (o, opt) => { await new Promise((ok) => setTimeout(ok, 80)); return echte(o, opt); };
    try {
      rmSync(join(dataDir, "analyses.log"), { force: true });
      const uitslagen = await Promise.all([vraag(`${API}/schrijfhulp`, verzoek([])), vraag(`${API}/schrijfhulp`, verzoek([])), vraag(`${API}/schrijfhulp`, verzoek([]))]);
      expect(uitslagen.map((u) => u.status).sort()).toEqual([200, 429, 429]);
    } finally { provider.marketingTekst = echte; }
  });

  it("zegt het netjes als de provider de schrijfhulp niet kent", async () => {
    await zetSchrijfhulp(true);
    const zonder = provider.marketingTekst;
    delete provider.marketingTekst;
    try {
      expect((await vraag(`${API}/schrijfhulp`, verzoek([]))).status).toBe(501);
    } finally { provider.marketingTekst = zonder; }
  });
});

describe("providers en schema", () => {
  it("de nepprovider geeft drie deterministische voorstellen met precies één nadruk in de kop", async () => {
    const p = NepProvider({} as never);
    const o: MarketingOpdracht = { taak: "velden", sjabloon: "Stelling", kanaal: "linkedin", toelichting: "", huidig: { velden: {}, posttekst: "", altTekst: "" }, feiten: [], velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }] };
    const a = await p.marketingTekst!(o, { model: "nep" });
    const b = await p.marketingTekst!(o, { model: "nep" });
    expect(a.voorstel).toEqual(b.voorstel);
    expect(a.voorstel.varianten).toHaveLength(3);
    for (const v of a.voorstel.varianten) expect(v.velden[0].tekst.match(/\*[^*]+\*/g)).toHaveLength(1);
    expect(MarketingVoorstelSchema.safeParse(a.voorstel).success).toBe(true);
  });

  it("leest een geldig antwoord en gooit een AnalyseFout met usage bij onzin", () => {
    const geldig = JSON.stringify({ varianten: [{ velden: [], posttekst: "Tekst", altTekst: "", gebruikteFeiten: [] }] });
    expect(leesMarketingAntwoord(geldig, LEEG).varianten[0].posttekst).toBe("Tekst");
    expect(() => leesMarketingAntwoord("geen json", LEEG)).toThrow(AnalyseFout);
    expect(() => leesMarketingAntwoord(JSON.stringify({ varianten: [{ posttekst: 1 }] }), LEEG)).toThrow(/schema/);
  });

  it("telt de schrijfhulp in de statistieken als platformtaak, niet als analyse", () => {
    const regel = { tijdstip: "2026-10-01T10:00:00Z", bedrijf: PLATFORM_BEDRIJF, soort: "marketing", analyseId: null, opdrachtgever: "", bestand: null, model: "m", usage: LEEG, usd: 0.01, eur: 0.01, duurMs: 1, uitkomst: "ok" } as Kostenregel;
    const s = verzamelStatistieken([regel]);
    expect(s.perBedrijfMaand[0]).toMatchObject({ analyses: 0, platformtaken: 1 });
  });
});

describe("feiten uit de parameters", () => {
  const p = laadParameters(2026, "data");
  const lijst = parameterFeiten(p);

  it("volgt de WML-tabel uit de parameters, met de volgende ingangsdatum als einde", () => {
    const wml = lijst.filter((f) => f.sleutel.startsWith("wml-"));
    expect(wml.map((f) => f.geldigVan)).toEqual(p.wettelijk.minimumuurloon.map((r) => r.vanaf));
    expect(wml.find((f) => f.geldigVan === "2026-01-01")!.geldigTot).toBe("2026-06-30");
    expect(wml.at(-1)!.geldigTot).toBeNull();
    expect(wml.find((f) => f.geldigVan === "2026-07-01")!.tekst).toContain("€ 14,99 per uur");
  });

  it("noemt StiPP en SFU met de waarden uit de parameters", () => {
    expect(lijst.find((f) => f.sleutel === "stipp-werkgever-2026")!.tekst).toContain("15,9%");
    expect(lijst.find((f) => f.sleutel === "sfu-2026")!.tekst).toContain("0,2%");
  });

  it("verwijst alleen naar bestaande kennispagina's en past in het feitenschema als cao-feit", () => {
    for (const f of lijst) {
      expect(existsSync(f.bron), f.bron).toBe(true);
      expect(FeitInvoerSchema.safeParse({ tekst: f.tekst, soort: "cao", bron: { soort: "kennis", verwijzing: f.bron }, geldigVan: f.geldigVan, geldigTot: f.geldigTot }).success, f.sleutel).toBe(true);
    }
  });

  it("maakt via de API een concept-cao-feit met de kennispagina als bron", async () => {
    const l = await vraag(`${API}/parameters`);
    expect(l.body.parameters.length).toBe(lijst.length);
    const r = await vraag(`${API}/parameters/wml-2026-07-01/feit`, {});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ soort: "cao", status: "concept", bron: { soort: "kennis", verwijzing: "docs/kennis/minimumloon.md" }, geldigVan: "2026-07-01" });
    expect((await vraag(`${API}/parameters/bestaat-niet/feit`, {})).status).toBe(404);
  });
});
