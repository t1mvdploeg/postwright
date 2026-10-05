// Marketingstudio golf 2 — ideeën voorstellen over een periode. De server kiest wat het model ziet
// en rekent alles na wat terugkomt: datums binnen de periode, bestaande sjablonen, alleen
// meegegeven feiten en momenten, en getallen zonder bron gemeld. Er wordt niets vanzelf bewaard.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/http.js";
import { adminCookie } from "./helpers/sessie.js";
import { leesKosten, telMee } from "../src/model/kosten.js";
import { leesAudit } from "../src/model/audit.js";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { plusDagen } from "../src/model/marketing-momenten.js";
import { IdeeenVoorstelSchema, ruimIdeeenOp, werkdagen, type IdeeenOpdracht } from "../src/model/marketing-ideeen.js";
import type { AnalyseProvider, IdeeenResultaat } from "../src/model/provider.js";
import { NepProvider } from "../src/model/nep.js";

const OPDRACHT: IdeeenOpdracht = {
  van: "2026-10-05", tot: "2026-10-16", aantal: 3, kanaal: "linkedin", toelichting: "",
  sjablonen: [{ id: "stelling", naam: "Stelling", doel: "" }, { id: "vraag", naam: "Vraag", doel: "" }],
  feiten: [{ id: "f-00000000-0000-4000-8000-000000000001", tekst: "Het minimumuurloon is € 14,99 per uur.", soort: "cao" }],
  momenten: [{ sleutel: "wtta-aanmelden-overgang", datum: "2026-11-01", tot: "2026-12-31", titel: "Wtta", tekst: "Aanmelden kan van 1 november tot en met 31 december 2026." }],
  bestaand: [], campagne: null, resultaten: [],
};
const idee = (x: Partial<{ datum: string; titel: string; toelichting: string; sjabloon: string; kop: string; feiten: string[]; moment: string }>) =>
  ({ datum: "2026-10-06", titel: "Een idee", toelichting: "", sjabloon: "stelling", kop: "Een *kop.*", feiten: [], moment: "", ...x });

describe("werkdagen", () => {
  it("geeft maandag tot en met vrijdag in de periode", () => {
    expect(werkdagen("2026-10-23", "2026-10-27")).toEqual(["2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(werkdagen("2026-10-24", "2026-10-25")).toEqual([]);
  });
});

describe("ruimIdeeenOp", () => {
  it("laat ongeldige en buitenperiode-datums en lege titels vallen, kapt af en sorteert", () => {
    const uit = ruimIdeeenOp({ ideeen: [
      idee({ datum: "2026-10-09", titel: "B" }), idee({ datum: "2026-02-30" }), idee({ datum: "2026-10-20" }),
      idee({ datum: "2026-10-06", titel: "A" }), idee({ titel: "   " }), idee({ datum: "2026-10-07", titel: "C" }), idee({ datum: "2026-10-08", titel: "D" }),
    ] }, OPDRACHT);
    expect(uit.map((i) => i.titel)).toEqual(["A", "C", "B"]);
  });
  it("struikelt niet over een datum die geen datum is (maand 13 geeft in JavaScript een ongeldige Date)", () => {
    expect(ruimIdeeenOp({ ideeen: [idee({ datum: "2026-13-01" }), idee({ datum: "2026-10-00" }), idee({ titel: "Goed" })] }, OPDRACHT).map((i) => i.titel)).toEqual(["Goed"]);
  });
  it("maakt een onbekend sjabloon null en laat verzonnen feiten en momenten weg", () => {
    const [i] = ruimIdeeenOp({ ideeen: [idee({ sjabloon: "canva", feiten: ["f-verzonnen", OPDRACHT.feiten[0].id], moment: "bestaat-niet" })] }, OPDRACHT);
    expect(i).toMatchObject({ sjabloon: null, feiten: [OPDRACHT.feiten[0].id], moment: null });
  });
  it("meldt getallen zonder bron; een gekoppeld feit of moment dekt ze", () => {
    const [zonder] = ruimIdeeenOp({ ideeen: [idee({ toelichting: "Het WML is € 14,99 en de boete € 50.000." })] }, OPDRACHT);
    expect(zonder.ongedekt).toEqual(["€ 14,99", "€ 50.000"]);
    const [met] = ruimIdeeenOp({ ideeen: [idee({ toelichting: "Het WML is € 14,99; aanmelden tot 31 december.", feiten: [OPDRACHT.feiten[0].id], moment: "wtta-aanmelden-overgang" })] }, OPDRACHT);
    expect(met.ongedekt).toEqual([]);
  });
});

describe("nepprovider", () => {
  it("geeft precies het gevraagde aantal ideeën op werkdagen in de periode, die het narekenen doorstaan", async () => {
    const r = await NepProvider({} as never).marketingIdeeen!(OPDRACHT, { model: "nep" });
    expect(IdeeenVoorstelSchema.safeParse(r.voorstel).success).toBe(true);
    expect(r.voorstel.ideeen).toHaveLength(3);
    const uit = ruimIdeeenOp(r.voorstel, OPDRACHT);
    expect(uit).toHaveLength(3);
    expect(uit.every((i) => werkdagen(OPDRACHT.van, OPDRACHT.tot).includes(i.datum) && i.sjabloon !== null && i.ongedekt.length === 0)).toBe(true);
    expect(uit[0].moment).toBe("wtta-aanmelden-overgang");
  });
});

// ---------------------------------------------------------------------------------------------
// De route, met een eigen testprovider zoals in marketing-schrijfhulp.test.ts.
// ---------------------------------------------------------------------------------------------
const nep = {
  gezien: null as IdeeenOpdracht | null,
  antwoord: null as ((o: IdeeenOpdracht) => IdeeenResultaat) | null,
};
const provider: AnalyseProvider = {
  naam: "nep-ideeen",
  analyseer: async () => { throw new Error("mag niet"); },
  praat: async () => { throw new Error("mag niet"); },
  marketingIdeeen: async (o) => { nep.gezien = o; return nep.antwoord!(o); },
  // Alleen voor de plafondtest: een schrijfhulp-aanroep die iets kost.
  marketingTekst: async () => ({
    voorstel: { varianten: [{ velden: [{ id: "kop", tekst: "Een *kop*" }], posttekst: "", altTekst: "", gebruikteFeiten: [] }] },
    model: "nep-model", usage: { input: 100_000, output: 20_000, cacheLezen: 0, cacheSchrijven: 0 }, duurMs: 5,
  }),
};

let basis = "";
let cookie = "";
let dataDir = "";
let sluit: () => Promise<void>;
const API = "/api/beheer/marketing";
/** Dezelfde Amsterdam-datum als de server. */
const vandaag = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

async function vraag(pad: string, body?: unknown, methode = body === undefined ? "GET" : "POST") {
  const r = await fetch(basis + pad, {
    method: methode, headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() as any };
}

async function zetAiHulp(aan: boolean, plafond = 10) {
  const r = await vraag(`${API}/instellingen`, { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan, plafondEurPerMaand: plafond } }, "PUT");
  expect(r.status).toBe(200);
}

const verzoek = (van: string, tot: string, extra: Record<string, unknown> = {}) =>
  ({ van, tot, aantal: 2, kanaal: "linkedin", toelichting: "Voor planners.", campagne: null, ...extra });

const marketingRegels = async () => (await leesKosten({ dir: dataDir })).filter((r) => r.soort === "marketing");

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "ct-marketing-ideeen-"));
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
    voorstel: { ideeen: [idee({ datum: o.van, titel: "Eerste" })] },
    model: "nep-model", usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 }, duurMs: 5,
  });
});

describe("POST /ideeen/voorstellen", () => {
  it("staat uit zolang de AI-hulp uit staat", async () => {
    await zetAiHulp(false);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9)));
    expect(r.status).toBe(409);
    expect(r.body.fout).toMatch(/staat uit/);
    expect(nep.gezien).toBeNull();
  });

  it("geeft voorstellen binnen de periode, bewaart niets en boekt de kosten als marketing", async () => {
    await zetAiHulp(true);
    const van = plusDagen(vandaag(), 1);
    const tot = plusDagen(van, 9);
    nep.antwoord = (o) => ({
      voorstel: { ideeen: [
        idee({ datum: o.van, titel: "Binnen" }),
        idee({ datum: plusDagen(o.tot, 5), titel: "Erbuiten" }),
        idee({ datum: plusDagen(o.van, 2), titel: "Onbekend sjabloon", sjabloon: "onbekend" }),
      ] },
      model: "nep-model", usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 }, duurMs: 5,
    });
    const voor = (await marketingRegels()).length;
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, tot));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ model: "nep-model", van });
    const voorstellen = r.body.voorstellen as Array<{ datum: string; titel: string; sjabloon: string | null }>;
    expect(voorstellen.length).toBeGreaterThan(0);
    expect(voorstellen.length).toBeLessThanOrEqual(2);
    expect(voorstellen.every((v) => v.datum >= van && v.datum <= tot)).toBe(true);
    expect(voorstellen.map((v) => v.titel)).toEqual(["Binnen", "Onbekend sjabloon"]);
    expect(voorstellen.find((v) => v.titel === "Onbekend sjabloon")!.sjabloon).toBeNull();
    expect(voorstellen.find((v) => v.titel === "Binnen")!.sjabloon).toBe("stelling");
    // Het model kreeg wat de server zelf koos: de periode, het aantal en de echte sjablonen.
    expect(nep.gezien).toMatchObject({ van, tot, aantal: 2, kanaal: "linkedin", campagne: null });
    expect(nep.gezien!.sjablonen.some((s) => s.id === "stelling")).toBe(true);
    // Niets bewaard.
    expect((await vraag(`${API}/ideeen`)).body.ideeen).toEqual([]);
    // Kosten als platformtaak "marketing", onderwerp ideeen:<van>..<tot>.
    const regels = await marketingRegels();
    expect(regels.length).toBe(voor + 1);
    expect(regels.at(-1)).toMatchObject({ soort: "marketing", onderwerp: `ideeen:${van}..${tot}`, uitkomst: "ok", model: "nep-model" });
    const audit = await leesAudit({ dir: dataDir });
    expect(audit.some((a) => a.actie === "marketing.ideeen-voorgesteld" && a.doelwit === `${van}..${tot}`)).toBe(true);
  });

  it("weigert een periode in het verleden en een periode langer dan drie maanden", async () => {
    await zetAiHulp(true);
    const nu = vandaag();
    const verleden = await vraag(`${API}/ideeen/voorstellen`, verzoek(plusDagen(nu, -10), plusDagen(nu, -1)));
    expect(verleden.status).toBe(400);
    expect(verleden.body.fout).toMatch(/verleden/);
    const van = plusDagen(nu, 1);
    // 93 dagen, van en tot meegeteld: te lang.
    const lang = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 92)));
    expect(lang.status).toBe(400);
    expect(lang.body.fout).toMatch(/drie maanden/);
    expect(nep.gezien).toBeNull();
    // Precies 92 dagen, van en tot meegeteld, mag nog.
    expect((await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 91)))).status).toBe(200);
  });

  it("weigert een datum die niet bestaat met 400, niet met een serverfout", async () => {
    await zetAiHulp(true);
    const van = plusDagen(vandaag(), 1);
    expect((await vraag(`${API}/ideeen/voorstellen`, verzoek("2099-13-01", "2099-13-05"))).status).toBe(400);
    // Dag 32 ligt altijd na `van` in dezelfde maand en binnen drie maanden: alleen de datumtoets vangt hem.
    expect((await vraag(`${API}/ideeen/voorstellen`, verzoek(van, `${van.slice(0, 7)}-32`))).status).toBe(400);
    expect(nep.gezien).toBeNull();
  });

  it("zegt 501 als de provider geen ideeën kent, zonder kostenregel", async () => {
    await zetAiHulp(true);
    const zonder = provider.marketingIdeeen;
    delete provider.marketingIdeeen;
    try {
      const voor = (await marketingRegels()).length;
      const van = plusDagen(vandaag(), 1);
      const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9)));
      expect(r.status).toBe(501);
      expect(r.body.fout).toMatch(/geen ideeën/);
      expect((await marketingRegels()).length).toBe(voor);
    } finally { provider.marketingIdeeen = zonder; }
  });

  it("vat een begin in het verleden op als vandaag", async () => {
    await zetAiHulp(true);
    const nu = vandaag();
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(plusDagen(nu, -1), plusDagen(nu, 5)));
    expect(r.status).toBe(200);
    expect(r.body.van).toBe(nu);
    expect(nep.gezien!.van).toBe(nu);
    expect(r.body.voorstellen.every((v: { datum: string }) => v.datum >= nu)).toBe(true);
  });

  it("deelt het maandplafond met de schrijfhulp", async () => {
    // Eerst een schrijfhulp-aanroep die echt iets kost, met ruimte onder het plafond.
    await zetAiHulp(true, 10);
    const hulp = await vraag(`${API}/schrijfhulp`, {
      taak: "velden", sjabloon: "Stelling", kanaal: "linkedin", toelichting: "", feiten: [],
      velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }],
    });
    expect(hulp.status).toBe(200);
    const regels = await marketingRegels();
    expect(regels.at(-1)).toMatchObject({ onderwerp: "schrijfhulp:velden", uitkomst: "ok" });
    expect(regels.at(-1)!.eur).toBeGreaterThan(0);
    // Het plafond precies op wat deze maand is besteed, schrijfhulp meegeteld; dezelfde som als de server.
    const maand = new Date().toISOString().slice(0, 7);
    const besteed = (await leesKosten({ dir: dataDir }))
      .filter((r) => r.soort === "marketing" && r.tijdstip.slice(0, 7) === maand && telMee(r))
      .reduce((som, r) => som + r.eur, 0);
    const zonderSchrijfhulp = regels.filter((r) => r.tijdstip.slice(0, 7) === maand && telMee(r) && !r.onderwerp?.startsWith("schrijfhulp:"))
      .reduce((som, r) => som + r.eur, 0);
    expect(zonderSchrijfhulp).toBeLessThan(besteed);
    await zetAiHulp(true, besteed);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9)));
    expect(r.status).toBe(429);
    expect(r.body.fout).toMatch(/maandplafond/);
    expect(nep.gezien).toBeNull();
  });

  it("geeft het model alleen bruikbare feiten, en de campagne met naam en doel (afsluitende review, C3)", async () => {
    await zetAiHulp(true, 1000);
    const feit = async (tekst: string, status: string, geldigTot: string | null = null) => {
      const r = await vraag(`${API}/feiten`, { tekst, soort: "product", bron: { soort: "site", verwijzing: "src/web/landing.html" }, status, geldigTot });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    const actief = await feit("Een actief feit voor de ideeënhulp.", "actief");
    const concept = await feit("Een concept-feit voor de ideeënhulp.", "concept");
    const verlopen = await feit("Een verlopen feit voor de ideeënhulp.", "actief", plusDagen(vandaag(), -1));
    const ingetrokken = await feit("Een ingetrokken feit voor de ideeënhulp.", "ingetrokken");
    const campagne = await vraag(`${API}/campagnes`, { naam: "Najaar", utmCampagne: "najaar-ideeen", doel: "Uitzendbureaus op de Wtta wijzen." });
    expect(campagne.status).toBe(201);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9), { campagne: campagne.body.id }));
    expect(r.status).toBe(200);
    const gezien = nep.gezien!.feiten.map((f) => f.id);
    expect(gezien).toContain(actief);
    for (const id of [concept, verlopen, ingetrokken]) expect(gezien).not.toContain(id);
    expect(nep.gezien!.campagne).toEqual({ naam: "Najaar", doel: "Uitzendbureaus op de Wtta wijzen." });
  });

  it("weigert een campagne die niet bestaat met 400, zonder het model te vragen", async () => {
    await zetAiHulp(true, 1000);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9), { campagne: "c-00000000-0000-4000-8000-000000000000" }));
    expect(r.status).toBe(400);
    expect(r.body.fout).toMatch(/campagne/);
    expect(nep.gezien).toBeNull();
  });
});
