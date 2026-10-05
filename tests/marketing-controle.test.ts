// Marketingstudio — posttekst, getallen, contrast en de merkcontrole als geheel.
import { describe, it, expect } from "vitest";
import {
  controleerPosttekst,
  hashtags,
  lengteVoor,
  linksZonderUtm,
  splitsBijVouw,
  telTekens,
  voegUtmToe,
  zetUtmInhoud,
} from "../src/web/marketing/posttekst.js";
import { haalGetallen, ongedekteGetallen } from "../src/web/marketing/getallen.js";
import { contrastVerhouding, contrastOp } from "../src/web/marketing/kleur.js";
import { bevatWoord, controleer, feitBruikbaar, tekstenVan, titelUit } from "../src/web/marketing/merkcontrole.js";
import { sjabloon } from "../src/web/marketing/sjablonen.js";
import { feitOnbruikbaar } from "../src/server/api-marketing.js";
import { STANDAARD_MARKETING_INSTELLINGEN } from "../src/model/marketing-schema.js";
import { merkVanSchijf } from "./helpers/marketing-merk.js";

describe("posttekst", () => {
  it("telt tekens zoals een lezer: een emoji of letter met accent is één teken", () => {
    expect(telTekens("café")).toBe(4);
    expect(telTekens("👍🏽 ok")).toBe(4);
    expect(telTekens("")).toBe(0);
  });

  it("telt op X elke link als 23 tekens", () => {
    expect(lengteVoor("x", "Lees meer: https://example.com/?utm_source=x&utm_medium=social")).toBe(
      "Lees meer: ".length + 23,
    );
    expect(lengteVoor("linkedin", "https://a.nl")).toBe(12);
  });

  it("geeft een fout net boven de limiet en niet erop", () => {
    expect(controleerPosttekst("x", "a".repeat(280)).some((b) => b.code === "posttekst-te-lang")).toBe(false);
    expect(controleerPosttekst("x", "a".repeat(281)).some((b) => b.code === "posttekst-te-lang")).toBe(true);
    expect(controleerPosttekst("linkedin", "a".repeat(3001))[0]).toMatchObject({
      niveau: "fout",
      code: "posttekst-te-lang",
    });
    expect(controleerPosttekst("linkedin", "  ")[0]).toMatchObject({ niveau: "let-op", code: "posttekst-leeg" });
  });

  it("vindt hashtags, dubbele en afgebroken, en telt ze voor Instagram", () => {
    const h = hashtags("Lees #Planning en #planning, #merkbewust-posten. Geen tag: a#b of &#39;");
    expect(h.lijst).toEqual(["Planning", "planning", "merkbewust"]);
    expect(h.dubbel).toEqual(["planning"]);
    expect(h.afgebroken).toEqual(["merkbewust-posten"]);
    const teVeel = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(controleerPosttekst("instagram", teVeel).some((b) => b.code === "te-veel-hashtags")).toBe(true);
    expect(controleerPosttekst("linkedin", teVeel).some((b) => b.code === "te-veel-hashtags")).toBe(false);
  });

  it("zet UTM op een https-link en laat bestaande parameters en het anker staan", () => {
    expect(
      voegUtmToe("https://example.com/?ref=a#demo", {
        bron: "linkedin",
        medium: "social",
        campagne: "najaar",
        inhoud: "p-1",
      }),
    ).toBe("https://example.com/?ref=a&utm_source=linkedin&utm_medium=social&utm_campaign=najaar&utm_content=p-1#demo");
    expect(voegUtmToe("https://example.com/?utm_source=oud", { bron: "x" })).toBe("https://example.com/?utm_source=x");
    expect(voegUtmToe("javascript:alert(1)", { bron: "x" })).toBeNull();
    expect(voegUtmToe("http://example.com", { bron: "x" })).toBeNull();
    expect(voegUtmToe("geen url", {})).toBeNull();
    expect(linksZonderUtm("a https://a.nl/?utm_source=x b https://b.nl/c")).toEqual(["https://b.nl/c"]);
  });

  it("splitst bij de vouw", () => {
    const t = "a".repeat(250);
    expect(splitsBijVouw("linkedin", t).boven).toHaveLength(210);
    expect(splitsBijVouw("linkedin", t).onder).toHaveLength(40);
    expect(splitsBijVouw("x", t).onder).toBe("");
  });
});

describe("zetUtmInhoud", () => {
  it("zet utm_content alleen in links met utm_source en laat leestekens erbuiten", () => {
    const t =
      "Zie https://example.com/?utm_source=linkedin. En https://example.org/pad, ook (https://x.nl/?utm_source=x&utm_content=oud).";
    expect(zetUtmInhoud(t, "p-1")).toBe(
      "Zie https://example.com/?utm_source=linkedin&utm_content=p-1. En https://example.org/pad, ook (https://x.nl/?utm_source=x&utm_content=p-1).",
    );
  });
  it("laat tekst zonder links, lege tekst en kapotte links ongemoeid", () => {
    expect(zetUtmInhoud("geen link hier", "p-1")).toBe("geen link hier");
    expect(zetUtmInhoud("", "p-1")).toBe("");
    expect(zetUtmInhoud(undefined, "p-1")).toBe("");
  });
  it("is idempotent", () => {
    const een = zetUtmInhoud("https://a.nl/?utm_source=x", "p-1");
    expect(zetUtmInhoud(een, "p-1")).toBe(een);
  });
});

describe("getallen", () => {
  const waarden = (t: string) => haalGetallen(t).map((g) => [g.soort, g.waarde]);

  it("herkent bedragen, percentages en getallen in Nederlandse notatie", () => {
    const gevallen: Array<[string, Array<[string, number]>]> = [
      ["€ 12,50 per uur", [["bedrag", 12.5]]],
      ["€12,50", [["bedrag", 12.5]]],
      ["12,50 euro", [["bedrag", 12.5]]],
      ["€ 1.250,- per maand", [["bedrag", 1250]]],
      ["€ 1.250", [["bedrag", 1250]]],
      ["€ 5", [["bedrag", 5]]],
      ["8%", [["procent", 8]]],
      ["8,33 %", [["procent", 8.33]]],
      ["8,4 procent", [["procent", 8.4]]],
      ["een werkweek van 40 uur", [["getal", 40]]],
      [
        "27 + 13 dagen",
        [
          ["getal", 27],
          ["getal", 13],
        ],
      ],
      ["1.250 medewerkers", [["getal", 1250]]],
      ["factor 1,5", [["getal", 1.5]]],
    ];
    for (const [tekst, verwacht] of gevallen) expect(waarden(tekst), tekst).toEqual(verwacht);
  });

  it("ziet cijfers in een link (UTM met post-id) niet als claim", () => {
    expect(
      waarden(
        "Lees meer: https://example.com/?utm_source=linkedin&utm_content=p-3fa2c1d0-7731-4821-9a0b-000000000000 en 40 uur",
      ),
    ).toEqual([["getal", 40]]);
    expect(waarden("Zie http://voorbeeld.nl/2026/10/artikel-1234")).toEqual([]);
  });

  it("slaat losse telwoorden, jaartallen en tekst zonder cijfers over", () => {
    expect(waarden("in 4 stappen, per 1 juli 2026")).toEqual([]);
    expect(waarden("example.com")).toEqual([]);
    expect(waarden("Stap 3 van 4")).toEqual([]);
    expect(waarden("acht procent")).toEqual([]);
  });

  it("vergelijkt op waarde, niet op notatie", () => {
    const feiten = [{ tekst: "Voorbeeld: abonnement € 12,50" }];
    expect(ongedekteGetallen("12,50 per uur", feiten)).toEqual([]);
    expect(ongedekteGetallen("€ 12,50 en 8,4%", feiten).map((g) => g.waarde)).toEqual([8.4]);
  });
});

describe("contrast", () => {
  it("rekent de WCAG-verhouding uit, in beide richtingen", () => {
    expect(contrastVerhouding("#000000", "#ffffff")).toBe(21);
    expect(contrastVerhouding("#ffffff", "#000000")).toBe(21);
    expect(contrastVerhouding("#777777", "#777777")).toBe(1);
    // Wit op #767676 is de bekende grens van 4,5:1.
    expect(contrastVerhouding("#ffffff", "#767676")).toBeGreaterThanOrEqual(4.5);
    expect(contrastVerhouding("#ffffff", "#777777")).toBeLessThan(4.5);
  });

  it("haalt op elke ondergrond van het merk de drempel", () => {
    const merk = merkVanSchijf();
    for (const grond of Object.keys(merk.gronden)) {
      const c = contrastOp(merk, grond)!;
      expect(c.verhouding, grond).toBeGreaterThanOrEqual(c.drempel);
    }
    expect(contrastOp(merk, "onbekend")).toBeNull();
  });
});

describe("merkcontrole", () => {
  const stelling = sjabloon("stelling")!;
  const carrousel = sjabloon("carrousel")!;
  const instellingen = { kanalen: ["linkedin"], verbodenWoorden: STANDAARD_MARKETING_INSTELLINGEN.verbodenWoorden };
  const basis = {
    sjabloon: "stelling",
    formaten: ["li-vierkant"],
    inhoud: { ondergrond: "accent", kop: "Genoeg gezien. *Nu bent u aan zet.*", tekst: "Een post vol afspraken." },
    posttekst: { linkedin: "Een post die u kunt uitleggen. https://example.com/?utm_source=linkedin" },
    altTekst: "Tekst op accent: Genoeg gezien.",
    feiten: [] as string[],
  };
  const codes = (r: ReturnType<typeof controleer>) => r.bevindingen.filter((b) => b.niveau !== "ok").map((b) => b.code);

  it("geeft een schone stelling zonder fouten of let-op-punten", () => {
    const r = controleer({
      post: basis,
      sjabloon: stelling,
      instellingen,
      feiten: [],
      vandaag: "2026-10-01",
      merk: merkVanSchijf(),
    });
    expect(codes(r)).toEqual([]);
    expect(r.fouten).toBe(0);
    expect(r.bevindingen.some((b) => b.niveau === "ok" && b.code === "contrast")).toBe(true);
  });

  it("eist precies één gekleurde frase, en vult een ontbrekende kop aan met de standaard", () => {
    expect(
      codes(
        controleer({
          post: { ...basis, inhoud: { ...basis.inhoud, kop: "Zonder nadruk" } },
          sjabloon: stelling,
          instellingen,
          feiten: [],
          vandaag: "2026-10-01",
        }),
      ),
    ).toContain("nadruk");
    const twee = controleer({
      post: { ...basis, inhoud: { ...basis.inhoud, kop: "*Een* en *twee*" } },
      sjabloon: stelling,
      instellingen,
      vandaag: "2026-10-01",
    });
    expect(twee.bevindingen.find((b) => b.code === "nadruk")!.tekst).toMatch(/nu 2/);
    expect(
      codes(
        controleer({
          post: { ...basis, inhoud: { ...basis.inhoud, kop: "  " } },
          sjabloon: stelling,
          instellingen,
          vandaag: "2026-10-01",
        }),
      ),
    ).toContain("verplicht");
  });

  it("meldt te lange velden, uitroeptekens en verboden woorden, maar niet in woorden die ze toevallig bevatten, en laat je en jij met rust", () => {
    const r = controleer({
      post: {
        ...basis,
        inhoud: { ...basis.inhoud, tekst: "Jij bent gegarandeerd klaar!".padEnd(170, ".") },
        posttekst: { linkedin: "Probeer het nu, bijouwerk en jeugd tellen niet." },
      },
      sjabloon: stelling,
      instellingen,
      vandaag: "2026-10-01",
    });
    expect(codes(r)).toEqual(expect.arrayContaining(["te-lang", "uitroepteken", "verboden-woord"]));
    expect(codes(r)).not.toContain("u-vorm");
    expect(bevatWoord("100% zeker", "100%")).toBe(true);
    expect(bevatWoord("de allerbeste", "beste")).toBe(false);
  });

  it("controleert de posttekst per actief kanaal en de alt-tekst", () => {
    const r = controleer({
      post: { ...basis, posttekst: {}, altTekst: "" },
      sjabloon: stelling,
      instellingen: { ...instellingen, kanalen: ["linkedin", "x"] },
      vandaag: "2026-10-01",
    });
    expect(r.bevindingen.filter((b) => b.code === "posttekst-leeg")).toHaveLength(2);
    expect(codes(r)).toContain("alt-tekst");
  });

  it("eist dat elk getal in een gekoppeld, actief en niet verlopen feit staat", () => {
    const feit = {
      id: "f-1",
      tekst: "Voorbeeld: abonnement € 12,50",
      status: "actief",
      geldigVan: null,
      geldigTot: "2026-12-31",
    };
    const post = {
      ...basis,
      inhoud: { ...basis.inhoud, tekst: "Een prijs van € 12,50 per maand, 8,4% korting." },
      feiten: ["f-1"],
    };
    const r = controleer({ post, sjabloon: stelling, instellingen, feiten: [feit], vandaag: "2026-10-01" });
    const getallen = r.bevindingen.filter((b) => b.code === "getal-zonder-feit");
    expect(getallen).toHaveLength(1);
    expect(getallen[0].tekst).toContain("8,4%");
    const verlopen = controleer({ post, sjabloon: stelling, instellingen, feiten: [feit], vandaag: "2027-01-01" });
    expect(codes(verlopen)).toContain("feit-onbruikbaar");
    expect(codes(controleer({ post, sjabloon: stelling, instellingen, feiten: [], vandaag: "2026-10-01" }))).toContain(
      "feit-weg",
    );
    // Kon de feitenbank niet geladen worden, dan is de getallencheck niet gedaan.
    // Dat is een fout (de controle gaat dicht), geen stilzwijgend overslaan dat als "0 fouten" de poort opent.
    const zonder = controleer({ post, sjabloon: stelling, instellingen, feiten: null, vandaag: "2026-10-01" });
    expect(codes(zonder)).toContain("feiten-onbekend");
    expect(zonder.fouten).toBeGreaterThan(0);
  });

  it("gebruikt voor feiten dezelfde regel als de server", () => {
    const gevallen = [
      { status: "actief", geldigVan: null, geldigTot: null },
      { status: "actief", geldigVan: "2027-01-01", geldigTot: null },
      { status: "actief", geldigVan: null, geldigTot: "2026-09-30" },
      { status: "concept", geldigVan: null, geldigTot: null },
      { status: "ingetrokken", geldigVan: null, geldigTot: null },
    ];
    for (const f of gevallen) {
      expect(feitBruikbaar({ id: "f", tekst: "", ...f }, "2026-10-01"), JSON.stringify(f)).toBe(
        !feitOnbruikbaar(f as never, "2026-10-01"),
      );
    }
  });

  it("controleert het aantal dia's en de omslag van een carrousel", () => {
    const dias = carrousel.standaardDias!.map((d) => ({ soort: d.soort, inhoud: { ...d.inhoud } }));
    const post = { ...basis, sjabloon: "carrousel", formaten: ["li-carrousel"], inhoud: {}, dias };
    expect(codes(controleer({ post, sjabloon: carrousel, instellingen, vandaag: "2026-10-01" }))).not.toContain(
      "te-weinig-dias",
    );
    expect(codes(controleer({ post, sjabloon: carrousel, instellingen, vandaag: "2026-10-01" }))).not.toContain(
      "geen-omslag",
    );
    expect(
      codes(
        controleer({
          post: { ...post, dias: dias.slice(0, 1) },
          sjabloon: carrousel,
          instellingen,
          vandaag: "2026-10-01",
        }),
      ),
    ).toContain("te-weinig-dias");
    expect(
      codes(
        controleer({
          post: { ...post, dias: dias.slice(1) },
          sjabloon: carrousel,
          instellingen,
          vandaag: "2026-10-01",
        }),
      ),
    ).toContain("geen-omslag");
  });

  it("zet gemeten overloop om in fouten met het formaat erbij", () => {
    const r = controleer({
      post: basis,
      sjabloon: stelling,
      instellingen,
      vandaag: "2026-10-01",
      overloop: [
        { formaat: "story", veld: "de kop", soort: "veilige-zone", reden: "bediening bovenin" },
        { formaat: "li-staand", veld: "de tekst", soort: "buiten-beeld" },
      ],
    });
    const teksten = r.bevindingen.filter((b) => b.code === "overloop").map((b) => b.tekst);
    expect(teksten).toEqual([
      "Story: de kop staat in de zone van de bediening bovenin",
      "LinkedIn staand: de tekst loopt buiten het beeld",
    ]);
  });

  it("zet fouten voor let-op-punten en die voor bevestigingen", () => {
    const r = controleer({
      post: { ...basis, altTekst: "", inhoud: { ...basis.inhoud, kop: "geen nadruk" } },
      sjabloon: stelling,
      instellingen,
      vandaag: "2026-10-01",
    });
    const niveaus = r.bevindingen.map((b) => b.niveau);
    expect(niveaus).toEqual(
      [...niveaus].sort((a, b) => ["fout", "let-op", "ok"].indexOf(a) - ["fout", "let-op", "ok"].indexOf(b)),
    );
  });

  it("geeft de teksten met hun plek en een titel zonder sterretjes", () => {
    const t = tekstenVan(basis, stelling);
    expect(t.map((x) => x.waar)).toEqual(expect.arrayContaining(["Kop", "Tekst", "Posttekst LinkedIn", "Alt-tekst"]));
    expect(titelUit(basis, stelling)).toBe("Genoeg gezien. Nu bent u aan zet.");
  });
});
