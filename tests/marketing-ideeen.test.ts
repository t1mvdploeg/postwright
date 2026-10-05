// Marketingstudio — ideeën voorstellen over een periode. De server kiest wat het model ziet
// en rekent alles na wat terugkomt: datums binnen de periode, bestaande sjablonen, alleen
// meegegeven feiten en momenten, en getallen zonder bron gemeld. Er wordt niets vanzelf bewaard.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { plusDagen } from "../src/model/marketing-momenten.js";
import {
  ideeenInstructie,
  IdeeenVoorstelSchema,
  ruimIdeeenOp,
  werkdagen,
  type IdeeenOpdracht,
  type IdeeenVoorstel,
} from "../src/model/marketing-ideeen.js";
import { LEGE_USAGE, type AiProvider, type AiResultaat } from "../src/server/ai/provider.js";
import { maandtotaalUsd } from "../src/server/ai/verbruik.js";
import { voorbeeldProvider } from "../src/server/ai/voorbeeld.js";
import { startStudio } from "./helpers/studio.js";

const OPDRACHT: IdeeenOpdracht = {
  van: "2026-10-05",
  tot: "2026-10-16",
  aantal: 3,
  kanaal: "linkedin",
  toelichting: "",
  sjablonen: [
    { id: "stelling", naam: "Stelling", doel: "" },
    { id: "vraag", naam: "Vraag", doel: "" },
  ],
  feiten: [
    { id: "f-00000000-0000-4000-8000-000000000001", tekst: "The minimum hourly rate is € 14,99.", soort: "extern" },
  ],
  momenten: [
    {
      sleutel: "aanmelden-overgang",
      datum: "2026-11-01",
      titel: "Registration",
      zin: "Registration is open from 1 November to 31 December 2026.",
    },
  ],
  bestaand: [],
  campagne: null,
  resultaten: [],
  merk: { merknaam: "Testmerk" },
};
const idee = (
  x: Partial<{
    datum: string;
    titel: string;
    toelichting: string;
    sjabloon: string;
    kop: string;
    feiten: string[];
    moment: string;
  }>,
) => ({
  datum: "2026-10-06",
  titel: "Een idee",
  toelichting: "",
  sjabloon: "stelling",
  kop: "Een *kop.*",
  feiten: [],
  moment: "",
  ...x,
});

describe("werkdagen", () => {
  it("geeft maandag tot en met vrijdag in de periode", () => {
    expect(werkdagen("2026-10-23", "2026-10-27")).toEqual(["2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(werkdagen("2026-10-24", "2026-10-25")).toEqual([]);
  });
});

describe("ruimIdeeenOp", () => {
  it("laat ongeldige en buitenperiode-datums en lege titels vallen, kapt af en sorteert", () => {
    const uit = ruimIdeeenOp(
      {
        ideeen: [
          idee({ datum: "2026-10-09", titel: "B" }),
          idee({ datum: "2026-02-30" }),
          idee({ datum: "2026-10-20" }),
          idee({ datum: "2026-10-06", titel: "A" }),
          idee({ titel: "   " }),
          idee({ datum: "2026-10-07", titel: "C" }),
          idee({ datum: "2026-10-08", titel: "D" }),
        ],
      },
      OPDRACHT,
    );
    expect(uit.map((i) => i.titel)).toEqual(["A", "C", "B"]);
  });
  it("struikelt niet over een datum die geen datum is (maand 13 geeft in JavaScript een ongeldige Date)", () => {
    expect(
      ruimIdeeenOp(
        { ideeen: [idee({ datum: "2026-13-01" }), idee({ datum: "2026-10-00" }), idee({ titel: "Goed" })] },
        OPDRACHT,
      ).map((i) => i.titel),
    ).toEqual(["Goed"]);
  });
  it("maakt een onbekend sjabloon null en laat verzonnen feiten en momenten weg", () => {
    const [i] = ruimIdeeenOp(
      { ideeen: [idee({ sjabloon: "canva", feiten: ["f-verzonnen", OPDRACHT.feiten[0].id], moment: "bestaat-niet" })] },
      OPDRACHT,
    );
    expect(i).toMatchObject({ sjabloon: null, feiten: [OPDRACHT.feiten[0].id], moment: null });
  });
  it("meldt getallen zonder bron; een gekoppeld feit of moment dekt ze", () => {
    const [zonder] = ruimIdeeenOp(
      { ideeen: [idee({ toelichting: "The rate is € 14,99 and the fine € 50.000." })] },
      OPDRACHT,
    );
    expect(zonder.ongedekt).toEqual(["€ 14,99", "€ 50.000"]);
    const [met] = ruimIdeeenOp(
      {
        ideeen: [
          idee({
            toelichting: "The rate is € 14,99; register before 31 December.",
            feiten: [OPDRACHT.feiten[0].id],
            moment: "aanmelden-overgang",
          }),
        ],
      },
      OPDRACHT,
    );
    expect(met.ongedekt).toEqual([]);
  });
});

describe("voorbeeldgever en instructie", () => {
  it("geeft precies het gevraagde aantal ideeën op werkdagen in de periode, die het narekenen doorstaan", async () => {
    const r = await voorbeeldProvider.marketingIdeeen(OPDRACHT);
    expect(IdeeenVoorstelSchema.safeParse(r.voorstel).success).toBe(true);
    expect(r.voorstel.ideeen).toHaveLength(3);
    const uit = ruimIdeeenOp(r.voorstel, OPDRACHT);
    expect(uit).toHaveLength(3);
    expect(
      uit.every(
        (i) =>
          werkdagen(OPDRACHT.van, OPDRACHT.tot).includes(i.datum) && i.sjabloon !== null && i.ongedekt.length === 0,
      ),
    ).toBe(true);
    expect(uit[0].moment).toBe("aanmelden-overgang");
    expect(r.usage).toEqual(LEGE_USAGE);
  });

  it("neemt de merknaam van het merk over en houdt de regel over de feiten overeind", () => {
    const tekst = ideeenInstructie({ merknaam: "Voorbeeldmerk" });
    expect(tekst).toContain("Voorbeeldmerk");
    expect(tekst).toContain("Tone: plain and calm");
    expect(tekst).toContain("use only the facts provided");
  });
});

// ---------------------------------------------------------------------------------------------
// De route, met een eigen testprovider zoals in marketing-schrijfhulp.test.ts.
// ---------------------------------------------------------------------------------------------
const nep = {
  gezien: null as IdeeenOpdracht | null,
  antwoord: null as ((o: IdeeenOpdracht) => AiResultaat<IdeeenVoorstel>) | null,
};
const provider: AiProvider = {
  naam: "anthropic",
  model: "claude-sonnet-5-5",
  marketingIdeeen: async (o) => {
    nep.gezien = o;
    return nep.antwoord!(o);
  },
  // Alleen voor de plafondtest: een schrijfhulp-aanroep die iets kost ($ 0,40).
  marketingTekst: async () => ({
    voorstel: {
      varianten: [{ velden: [{ id: "kop", tekst: "Een *kop*" }], posttekst: "", altTekst: "", gebruikteFeiten: [] }],
    },
    model: "claude-sonnet-5-5",
    usage: { input: 100_000, output: 20_000, cacheLezen: 0, cacheSchrijven: 0 },
    duurMs: 5,
  }),
};

let basis = "";
let dataDir = "";
let sluit: () => Promise<void>;
const API = "/api";
/** Dezelfde Amsterdam-datum als de server. */
const vandaag = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

async function vraag(pad: string, body?: unknown, methode = body === undefined ? "GET" : "POST") {
  const r = await fetch(basis + pad, {
    method: methode,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}

async function zetAiHulp(aan: boolean, plafond = 10) {
  const r = await vraag(
    `${API}/instellingen`,
    { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan, plafondUsdPerMaand: plafond } },
    "PUT",
  );
  expect(r.status).toBe(200);
}

const verzoek = (van: string, tot: string, extra: Record<string, unknown> = {}) => ({
  van,
  tot,
  aantal: 2,
  kanaal: "linkedin",
  toelichting: "Voor planners.",
  campagne: null,
  ...extra,
});

const boekingen = () => {
  try {
    return readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

beforeAll(async () => {
  const s = await startStudio({ provider });
  basis = s.basis;
  dataDir = s.dataDir;
  sluit = s.sluit;
});
afterAll(async () => {
  await sluit();
});
beforeEach(() => {
  nep.gezien = null;
  nep.antwoord = (o) => ({
    voorstel: { ideeen: [idee({ datum: o.van, titel: "Eerste" })] },
    model: "claude-sonnet-5-5",
    usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 },
    duurMs: 5,
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
      voorstel: {
        ideeen: [
          idee({ datum: o.van, titel: "Binnen" }),
          idee({ datum: plusDagen(o.tot, 5), titel: "Erbuiten" }),
          idee({ datum: plusDagen(o.van, 2), titel: "Onbekend sjabloon", sjabloon: "onbekend" }),
        ],
      },
      model: "claude-sonnet-5-5",
      usage: { input: 100, output: 50, cacheLezen: 0, cacheSchrijven: 0 },
      duurMs: 5,
    });
    const voor = boekingen().length;
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, tot));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ model: "claude-sonnet-5-5", van, voorbeeld: false });
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
    // Eén boeking, met taak ideeen:<van>..<tot>.
    const regels = boekingen();
    expect(regels.length).toBe(voor + 1);
    expect(regels.at(-1)).toMatchObject({ taak: `ideeen:${van}..${tot}`, ok: true, model: "claude-sonnet-5-5" });
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
    await zetAiHulp(true, 1000);
    const hulp = await vraag(`${API}/schrijfhulp`, {
      taak: "velden",
      sjabloon: "Stelling",
      kanaal: "linkedin",
      toelichting: "",
      feiten: [],
      velden: [{ id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true }],
    });
    expect(hulp.status).toBe(200);
    const laatste = boekingen().at(-1);
    expect(laatste).toMatchObject({ taak: "schrijfhulp:velden", ok: true });
    expect(laatste.usd).toBeCloseTo(0.4, 8); // 100.000 in en 20.000 uit tegen $ 2 en $ 10 per miljoen
    // Het plafond precies op wat deze maand is besteed, schrijfhulp meegeteld: dan is het bereikt.
    await zetAiHulp(true, await maandtotaalUsd(dataDir, new Date()));
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9)));
    expect(r.status).toBe(429);
    expect(r.body.fout).toMatch(/maandplafond/);
    expect(nep.gezien).toBeNull();
  });

  it("geeft het model alleen bruikbare feiten, en de campagne met naam en doel (afsluitende review, C3)", async () => {
    await zetAiHulp(true, 1000);
    const feit = async (tekst: string, status: string, geldigTot: string | null = null) => {
      const r = await vraag(`${API}/feiten`, {
        tekst,
        soort: "product",
        bron: { soort: "site", verwijzing: "README.md" },
        status,
        geldigTot,
      });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    const actief = await feit("An active fact for the ideas help.", "actief");
    const concept = await feit("A draft fact for the ideas help.", "concept");
    const verlopen = await feit("An expired fact for the ideas help.", "actief", plusDagen(vandaag(), -1));
    const ingetrokken = await feit("A withdrawn fact for the ideas help.", "ingetrokken");
    const campagne = await vraag(`${API}/campagnes`, {
      naam: "Najaar",
      utmCampagne: "najaar-ideeen",
      doel: "Point readers to the new release.",
    });
    expect(campagne.status).toBe(201);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(`${API}/ideeen/voorstellen`, verzoek(van, plusDagen(van, 9), { campagne: campagne.body.id }));
    expect(r.status).toBe(200);
    const gezien = nep.gezien!.feiten.map((f) => f.id);
    expect(gezien).toContain(actief);
    for (const id of [concept, verlopen, ingetrokken]) expect(gezien).not.toContain(id);
    expect(nep.gezien!.campagne).toEqual({ naam: "Najaar", doel: "Point readers to the new release." });
  });

  it("weigert een campagne die niet bestaat met 400, zonder het model te vragen", async () => {
    await zetAiHulp(true, 1000);
    const van = plusDagen(vandaag(), 1);
    const r = await vraag(
      `${API}/ideeen/voorstellen`,
      verzoek(van, plusDagen(van, 9), { campagne: "c-00000000-0000-4000-8000-000000000000" }),
    );
    expect(r.status).toBe(400);
    expect(r.body.fout).toMatch(/campagne/);
    expect(nep.gezien).toBeNull();
  });
});
