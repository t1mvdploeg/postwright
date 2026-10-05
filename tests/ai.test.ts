// De AI van de studio: de keuze tussen Claude en de voorbeeldgever, de kosten en het maandplafond, en
// wat de routes ervan laten zien. Er gaat geen enkele aanroep naar het netwerk.
import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnthropicProvider, STANDAARD_MODEL, type MaakClient } from "../src/server/ai/anthropic.js";
import { aiStand, kiesProvider } from "../src/server/ai/kies.js";
import { AiFout, LEGE_USAGE, type AiProvider } from "../src/server/ai/provider.js";
import { boek, kostenUsd, maandtotaalUsd } from "../src/server/ai/verbruik.js";
import { voorbeeldProvider } from "../src/server/ai/voorbeeld.js";
import { MarketingVoorstelSchema, type MarketingOpdracht } from "../src/model/marketing-schrijfhulp.js";
import { IdeeenVoorstelSchema, type IdeeenOpdracht } from "../src/model/marketing-ideeen.js";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { ongedekteGetallen } from "../src/web/marketing/getallen.js";
import { startStudio } from "./helpers/studio.js";

const MERK = { merknaam: "Testmerk" };
const FEIT = {
  id: "f-00000000-0000-4000-8000-000000000001",
  tekst: "Orders over 12 units ship free.",
  bron: "README.md",
};
const opdracht = (taak: MarketingOpdracht["taak"], feiten = [FEIT]): MarketingOpdracht => ({
  taak,
  sjabloon: "Stelling",
  kanaal: "linkedin",
  toelichting: "",
  huidig: { velden: {}, posttekst: "", altTekst: "" },
  feiten,
  merk: MERK,
  velden: [
    { id: "kop", label: "Kop", soort: "kop", max: 90, nadruk: true },
    { id: "tekst", label: "Tekst", soort: "tekst", max: 160, nadruk: false },
  ],
});
const IDEEEN: IdeeenOpdracht = {
  van: "2026-10-05",
  tot: "2026-10-16",
  aantal: 3,
  kanaal: "linkedin",
  toelichting: "",
  sjablonen: [{ id: "stelling", naam: "Stelling", doel: "" }],
  feiten: [{ id: FEIT.id, tekst: FEIT.tekst, soort: "product" }],
  momenten: [{ sleutel: "dag", datum: "2026-10-08", titel: "Some day", zin: "Something happens." }],
  bestaand: [],
  campagne: null,
  resultaten: [],
  merk: MERK,
};

describe("kiesProvider en aiStand", () => {
  it("kiest de voorbeeldgever zonder sleutel en Claude met een sleutel", () => {
    expect(kiesProvider({}).naam).toBe("voorbeeld");
    expect(kiesProvider({ ANTHROPIC_API_KEY: "  " }).naam).toBe("voorbeeld");
    expect(kiesProvider({ ANTHROPIC_API_KEY: "x" }).naam).toBe("anthropic");
  });

  it("meldt de stand, en POSTWRIGHT_MODEL overschrijft het model", () => {
    expect(aiStand(kiesProvider({}))).toEqual({ stand: "voorbeeld", model: null });
    expect(aiStand(kiesProvider({ ANTHROPIC_API_KEY: "x" }))).toEqual({ stand: "live", model: STANDAARD_MODEL });
    expect(aiStand(kiesProvider({ ANTHROPIC_API_KEY: "x", POSTWRIGHT_MODEL: "claude-haiku-4-5" }))).toEqual({
      stand: "live",
      model: "claude-haiku-4-5",
    });
  });
});

describe("voorbeeldgever", () => {
  it("geeft drie varianten die alleen tekst uit de feiten gebruiken, zonder kosten", async () => {
    const r = await voorbeeldProvider.marketingTekst(opdracht("posttekst"));
    expect(MarketingVoorstelSchema.safeParse(r.voorstel).success).toBe(true);
    expect(r.voorstel.varianten).toHaveLength(3);
    expect(r.usage).toEqual(LEGE_USAGE);
    for (const v of r.voorstel.varianten) {
      expect(v.posttekst).toMatch(/^Sample caption \d: Orders over 12 units ship free\.$/);
      expect(ongedekteGetallen(v.posttekst, [FEIT])).toEqual([]);
      expect(v.gebruikteFeiten).toEqual([FEIT.id]);
    }
  });

  it("zet in een kopveld met nadruk precies één frase tussen sterretjes, en vult de rest met het feit", async () => {
    const r = await voorbeeldProvider.marketingTekst(opdracht("velden"));
    for (const v of r.voorstel.varianten) {
      expect(v.velden[0].tekst.match(/\*[^*]+\*/g)).toHaveLength(1);
      expect(v.velden[1].tekst).toBe(FEIT.tekst);
    }
    const zonder = await voorbeeldProvider.marketingTekst(opdracht("velden", []));
    expect(zonder.voorstel.varianten[0].velden[1].tekst).toBe("Sample text 1 for tekst.");
    expect(zonder.voorstel.varianten[0].gebruikteFeiten).toEqual([]);
  });

  it("geeft de gevraagde ideeën op werkdagen, met het eerste moment, en rekent niets", async () => {
    const r = await voorbeeldProvider.marketingIdeeen(IDEEEN);
    expect(IdeeenVoorstelSchema.safeParse(r.voorstel).success).toBe(true);
    expect(r.voorstel.ideeen).toHaveLength(3);
    expect(r.voorstel.ideeen[0]).toMatchObject({ titel: "Some day", moment: "dag", toelichting: "Something happens." });
    expect(r.voorstel.ideeen[1].titel).toBe("Sample idea 2");
    expect(r.usage).toEqual(LEGE_USAGE);
  });
});

describe("kosten en verbruik", () => {
  it("rekent met de prijzen per miljoen tokens van het model", () => {
    expect(
      kostenUsd("claude-sonnet-5-5", { input: 1_000_000, output: 1_000_000, cacheLezen: 0, cacheSchrijven: 0 }),
    ).toBeCloseTo(12);
    // Cache lezen 0,20; cache schrijven 1,25 keer de invoerprijs (2,50).
    expect(
      kostenUsd("claude-sonnet-5-5", { input: 0, output: 0, cacheLezen: 1_000_000, cacheSchrijven: 1_000_000 }),
    ).toBeCloseTo(2.7);
    expect(
      kostenUsd("claude-haiku-4-5", { input: 1_000_000, output: 0, cacheLezen: 0, cacheSchrijven: 0 }),
    ).toBeCloseTo(1);
    expect(kostenUsd("voorbeeld", LEGE_USAGE)).toBe(0);
  });

  it("rekent een onbekend model met de duurste prijs, zodat het plafond niet te laag telt", () => {
    const u = { input: 1_000_000, output: 0, cacheLezen: 0, cacheSchrijven: 0 };
    expect(kostenUsd("een-nieuw-model", u)).toBe(kostenUsd("claude-fable-5-1", u));
    expect(kostenUsd("een-nieuw-model", u)).toBeGreaterThan(kostenUsd("claude-sonnet-5-5", u));
  });

  describe("bestand", () => {
    const mappen: string[] = [];
    afterEach(() => {
      while (mappen.length) rmSync(mappen.pop()!, { recursive: true, force: true });
    });
    const nieuw = () => {
      const d = mkdtempSync(join(tmpdir(), "pw-ai-"));
      mappen.push(d);
      return d;
    };
    const regel = (tijdstip: string, usd: number, ok = true) => ({
      tijdstip,
      model: "m",
      taak: "schrijfhulp:velden",
      usd,
      ok,
    });

    it("boekt naar ai-usage.jsonl en telt alleen de lopende maand", async () => {
      const d = nieuw();
      expect(await maandtotaalUsd(d, new Date("2026-10-05T12:00:00Z"))).toBe(0);
      await boek(d, regel("2026-09-30T23:59:59Z", 5));
      await boek(d, regel("2026-10-01T00:00:00Z", 1.5));
      await boek(d, regel("2026-10-04T10:00:00Z", 0.25, false));
      await boek(d, regel("2026-11-01T00:00:00Z", 7));
      expect(readFileSync(join(d, "ai-usage.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
      expect(await maandtotaalUsd(d, new Date("2026-10-05T12:00:00Z"))).toBeCloseTo(1.75);
      expect(await maandtotaalUsd(d, new Date("2026-09-01T00:00:00Z"))).toBeCloseTo(5);
    });

    it("slaat een halve regel over in plaats van te blokkeren", async () => {
      const d = nieuw();
      await boek(d, regel("2026-10-01T00:00:00Z", 2));
      await import("node:fs/promises").then((f) => f.appendFile(join(d, "ai-usage.jsonl"), '{"tijdstip":"2026-10-0'));
      expect(await maandtotaalUsd(d, new Date("2026-10-05T12:00:00Z"))).toBeCloseTo(2);
    });
  });
});

describe("AnthropicProvider (met een nepclient)", () => {
  const antwoord = (o: Record<string, unknown>) => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ varianten: [] }) }],
    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: null },
    ...o,
  });
  const metClient = (create: (p: Record<string, any>) => unknown) => {
    const gezien: Array<Record<string, any>> = [];
    const client = {
      create: async (p: Record<string, any>) => {
        gezien.push(p);
        return create(p);
      },
    } as unknown as MaakClient;
    return { gezien, provider: new AnthropicProvider({ apiKey: "x", model: "claude-sonnet-5-5", client }) };
  };

  it("stuurt een gestructureerde aanvraag met de merknaam in de instructie en geeft usage terug", async () => {
    const { gezien, provider } = metClient(() => antwoord({}));
    const r = await provider.marketingTekst(opdracht("posttekst"));
    expect(r).toMatchObject({
      model: "claude-sonnet-5-5",
      voorstel: { varianten: [] },
      usage: { input: 100, output: 40, cacheLezen: 10, cacheSchrijven: 0 },
    });
    const p = gezien[0];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.system).toContain("Testmerk");
    expect(p.system).toContain("Tone: plain and calm");
    expect(p.system).toContain("use only the facts provided");
    // De opdracht bevat de feiten, maar niet het merk.
    expect(p.messages[0].content).toContain(FEIT.tekst);
    expect(p.messages[0].content).not.toContain("Testmerk");
  });

  it("gooit een AiFout met de verbruikte tokens bij een weigering, een afgebroken of een onleesbaar antwoord", async () => {
    const gevallen: Array<[Record<string, unknown>, RegExp]> = [
      [{ stop_reason: "refusal" }, /declined/],
      [{ stop_reason: "max_tokens" }, /cut off/],
      [{ content: [{ type: "text", text: "geen json" }] }, /valid JSON/],
      [{ content: [{ type: "text", text: JSON.stringify({ varianten: [{ posttekst: 1 }] }) }] }, /schema/],
    ];
    for (const [extra, melding] of gevallen) {
      const { provider } = metClient(() => antwoord(extra));
      const fout = await provider.marketingTekst(opdracht("posttekst")).catch((e) => e);
      expect(fout).toBeInstanceOf(AiFout);
      expect(fout.message).toMatch(melding);
      expect(fout.usage).toMatchObject({ input: 100, output: 40 });
    }
  });

  it("maakt van een fout van de API een AiFout zonder usage", async () => {
    const { provider } = metClient(() => {
      throw new Error("401 invalid x-api-key");
    });
    const fout = await provider.marketingIdeeen(IDEEEN).catch((e) => e);
    expect(fout).toBeInstanceOf(AiFout);
    expect(fout.usage).toBeUndefined();
  });
});

describe("routes", () => {
  const studios: Array<{ sluit: () => Promise<void> }> = [];
  afterEach(async () => {
    while (studios.length) await studios.pop()!.sluit();
  });
  async function start(provider?: AiProvider) {
    const s = await startStudio({ provider });
    studios.push(s);
    const vraag = async (pad: string, body?: unknown, methode = body === undefined ? "GET" : "POST") => {
      const r = await fetch(s.basis + pad, {
        method: methode,
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const tekst = await r.text();
      return { status: r.status, tekst, body: JSON.parse(tekst) as any };
    };
    return { ...s, vraag };
  }
  const verzoek = {
    taak: "posttekst",
    sjabloon: "Stelling",
    kanaal: "linkedin",
    toelichting: "",
    velden: [],
    feiten: [],
  };
  const live = (gedrag: (o: any) => Promise<any>): AiProvider => ({
    naam: "anthropic",
    model: "claude-sonnet-5-5",
    marketingTekst: gedrag,
    marketingIdeeen: gedrag,
  });
  const regels = (dataDir: string) =>
    readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

  it("GET /api/ai geeft de stand, en de sleutel staat in geen enkel antwoord", async () => {
    const zonder = await start();
    expect((await zonder.vraag("/api/ai")).body).toEqual({ stand: "voorbeeld", model: null });
    const geheim = await start(kiesProvider({ ANTHROPIC_API_KEY: "sk-test-geheim" }));
    const ai = await geheim.vraag("/api/ai");
    expect(ai.body).toEqual({ stand: "live", model: STANDAARD_MODEL });
    const instellingen = await geheim.vraag("/api/instellingen");
    expect(instellingen.status).toBe(200);
    for (const r of [ai, instellingen]) expect(r.tekst).not.toContain("sk-test-geheim");
  });

  it("de voorbeeldgever antwoordt met voorbeeld: true, zonder plafond, en boekt $ 0", async () => {
    const { vraag, dataDir } = await start();
    await vraag(
      "/api/instellingen",
      { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan: true, plafondUsdPerMaand: 0 } },
      "PUT",
    );
    const r = await vraag("/api/schrijfhulp", verzoek);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ voorbeeld: true, model: "voorbeeld" });
    expect(r.body.varianten).toHaveLength(3);
    expect(regels(dataDir)).toMatchObject([{ taak: "schrijfhulp:posttekst", usd: 0, ok: true }]);
  });

  it("een live-provider die een AiFout gooit geeft 502 zonder voorbeeld, en de aanroep is geboekt als mislukt", async () => {
    const { vraag, dataDir } = await start(
      live(async () => {
        throw new AiFout("401 invalid x-api-key");
      }),
    );
    const r = await vraag("/api/schrijfhulp", verzoek);
    expect(r.status).toBe(502);
    expect(r.body.fout).toContain("401 invalid x-api-key");
    expect(r.body).not.toHaveProperty("voorbeeld");
    expect(regels(dataDir)).toMatchObject([
      { taak: "schrijfhulp:posttekst", usd: 0, ok: false, model: "claude-sonnet-5-5" },
    ]);
  });

  it("boekt bij een mislukking de tokens die al verbruikt waren", async () => {
    const usage = { input: 1_000_000, output: 0, cacheLezen: 0, cacheSchrijven: 0 };
    const { vraag, dataDir } = await start(
      live(async () => {
        throw new AiFout("cut off", usage);
      }),
    );
    expect((await vraag("/api/schrijfhulp", verzoek)).status).toBe(502);
    expect(regels(dataDir)[0]).toMatchObject({ ok: false, usd: 2 });
  });

  it("het merk van de gebruiker (data/brand/merk.json) geeft de merknaam aan de schrijfhulp en wordt zo geserveerd", async () => {
    const gezien: string[] = [];
    const spy = live(async (o: MarketingOpdracht) => {
      gezien.push(o.merk.merknaam);
      return { voorstel: { varianten: [] }, model: "claude-sonnet-5-5", usage: LEGE_USAGE, duurMs: 1 };
    });
    const { vraag, dataDir, basis } = await start(spy);
    expect((await vraag("/api/schrijfhulp", verzoek)).status).toBe(200);
    expect(gezien).toEqual(["Postwright"]); // het ingebouwde merk
    const ingebouwd = JSON.parse(readFileSync(new URL("../src/web/marketing/merk/merk.json", import.meta.url), "utf8"));
    const eigen = JSON.stringify({ ...ingebouwd, naam: "Eigenmerk", versie: "eigen-9" });
    mkdirSync(join(dataDir, "brand"), { recursive: true });
    writeFileSync(join(dataDir, "brand", "merk.json"), eigen);
    expect((await vraag("/api/schrijfhulp", verzoek)).status).toBe(200);
    expect(gezien).toEqual(["Postwright", "Eigenmerk"]);
    const geserveerd = await fetch(`${basis}/marketing/merk/merk.json`);
    expect(geserveerd.status).toBe(200);
    expect(await geserveerd.text()).toBe(eigen);
  });

  it.each([
    ["een fout type", '{"schrijfhulp":{"aan":"nee"}}'],
    ["geen JSON", "{dit is geen json"],
  ])(
    "weigert een AI-aanroep bij onleesbare instellingen (%s) zonder de provider aan te roepen",
    async (_naam, inhoud) => {
      const spy = vi.fn(async () => {
        throw new Error("mag niet worden aangeroepen");
      });
      const { vraag, dataDir } = await start(live(spy));
      mkdirSync(join(dataDir, "marketing"), { recursive: true });
      writeFileSync(join(dataDir, "marketing", "instellingen.json"), inhoud);
      for (const [pad, body] of [
        ["/api/schrijfhulp", verzoek],
        ["/api/ideeen/voorstellen", { van: "2099-01-01", tot: "2099-01-05", aantal: 1, kanaal: "linkedin" }],
      ] as const) {
        const r = await vraag(pad, body);
        expect(r.status).toBe(500);
        expect(r.body.fout).toContain("marketing/instellingen.json");
      }
      expect(spy).not.toHaveBeenCalled();
      expect(existsSync(join(dataDir, "ai-usage.jsonl"))).toBe(false);
    },
  );

  it("stopt een live-provider bij het maandplafond; de voorbeeldgever blijft werken", async () => {
    const aanroepen: number[] = [];
    const gedrag = async () => {
      aanroepen.push(1);
      return { voorstel: { varianten: [] }, model: "claude-sonnet-5-5", usage: LEGE_USAGE, duurMs: 1 };
    };
    const l = await start(live(gedrag));
    await boek(l.dataDir, { tijdstip: new Date().toISOString(), model: "m", taak: "x", usd: 10, ok: true });
    const geblokkeerd = await l.vraag("/api/schrijfhulp", verzoek);
    expect(geblokkeerd.status).toBe(429);
    expect(geblokkeerd.body.fout).toMatch(/maandplafond/);
    expect(aanroepen).toHaveLength(0);
    // Een iets hoger plafond laat hem weer door.
    await l.vraag(
      "/api/instellingen",
      { ...STANDAARD_MARKETING_INSTELLINGEN, schrijfhulp: { aan: true, plafondUsdPerMaand: 10.01 } },
      "PUT",
    );
    expect((await l.vraag("/api/schrijfhulp", verzoek)).status).toBe(200);

    const v = await start();
    await boek(v.dataDir, { tijdstip: new Date().toISOString(), model: "m", taak: "x", usd: 99, ok: true });
    expect((await v.vraag("/api/schrijfhulp", verzoek)).status).toBe(200);
  });
});
