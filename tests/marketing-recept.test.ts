// Marketingstudio — recepten opbouwen en naar de server sturen, en de tijdhulpjes.
import { describe, it, expect } from "vitest";
import {
  ideeNaarRecept,
  leesbaarMoment,
  metOffset,
  naarInvoer,
  naarLokaal,
  nieuwRecept,
  vandaagAmsterdam,
  verplaatsDia,
  zetOm,
} from "../src/web/marketing/recept.js";
import { sjabloon, type Dia } from "../src/web/marketing/sjablonen.js";
import { PostInvoerSchema } from "../src/model/marketing-schema.js";

describe("tijd", () => {
  it("geeft de Nederlandse kalenderdatum, ook rond middernacht UTC", () => {
    expect(vandaagAmsterdam(new Date("2026-10-01T22:30:00Z"))).toBe("2026-10-02");
    expect(vandaagAmsterdam(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("zet een datetime-local-waarde om naar een tijdstip met offset en terug", () => {
    const iso = metOffset("2026-10-06T08:30")!;
    expect(iso).toMatch(/^2026-10-06T08:30:00[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(new Date("2026-10-06T08:30").getTime());
    expect(naarLokaal(iso)).toBe("2026-10-06T08:30");
    expect(metOffset("geen datum")).toBeNull();
    expect(naarLokaal("x")).toBe("");
  });

  it("leest de invoer als Amsterdamse kloktijd, ongeacht de tijdzone van de browser (BM-20)", () => {
    const tz = process.env.TZ;
    try {
      for (const zone of ["Europe/London", "America/New_York", "Europe/Amsterdam"]) {
        process.env.TZ = zone;
        expect(metOffset("2026-10-06T08:30")).toBe("2026-10-06T08:30:00+02:00");
        expect(metOffset("2026-12-01T09:00")).toBe("2026-12-01T09:00:00+01:00");
        expect(naarLokaal("2026-10-06T08:30:00+02:00")).toBe("2026-10-06T08:30");
        expect(naarLokaal("2026-12-01T08:00:00Z")).toBe("2026-12-01T09:00");
      }
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("toont een moment leesbaar in Nederlandse tijd", () => {
    expect(leesbaarMoment("2026-10-06T06:30:00Z")).toMatch(/6 okt\.? 2026.*08:30/);
    expect(leesbaarMoment("x")).toBe("–");
  });
});

describe("recepten", () => {
  it("maakt een nieuw recept met de standaardinhoud en de formaten die aan staan", () => {
    const r = nieuwRecept("stelling", {
      formatenAan: ["li-vierkant", "li-staand", "li-link"],
      merkVersie: "postwright-1.0",
    });
    expect(r.formaten).toEqual(["li-vierkant", "li-staand"]);
    expect(r.inhoud.ondergrond).toBe("accent");
    expect(r.titel).toBe("On-brand posts, without the design tool.");
    expect(nieuwRecept("linkvoorbeeld", { formatenAan: [] }).formaten).toEqual(["li-link"]);
    const c = nieuwRecept("carrousel", { formatenAan: ["li-carrousel"] });
    expect(c.dias).toHaveLength(6);
    expect(c.inhoud).toEqual({});
    expect(() => nieuwRecept("poster")).toThrow();
  });

  it("stuurt alleen velden die het sjabloon kent, en dat komt door het serverschema", () => {
    const s = sjabloon("stelling")!;
    const r = {
      ...nieuwRecept("stelling", { formatenAan: ["li-vierkant"], merkVersie: "postwright-1.0" }),
      inhoud: { kop: "Een *kop*", vreemd: "weg" },
      posttekst: { linkedin: "Tekst", x: "  " },
    };
    const invoer = naarInvoer(r, s, { fouten: 0, letOp: 1, op: "2026-10-01T10:00:00.000Z" });
    expect(invoer.inhoud).not.toHaveProperty("vreemd");
    expect(invoer.inhoud.kop).toBe("Een *kop*");
    expect(invoer.inhoud.ondergrond).toBe("accent");
    expect(invoer.posttekst).toEqual({ linkedin: "Tekst" });
    expect(PostInvoerSchema.safeParse(invoer).success).toBe(true);
    const c = sjabloon("carrousel")!;
    const ci = naarInvoer(
      nieuwRecept("carrousel", { formatenAan: ["li-carrousel"], merkVersie: "postwright-1.0" }),
      c,
      null,
    );
    expect(ci.dias).toHaveLength(6);
    expect(PostInvoerSchema.safeParse(ci).success).toBe(true);
  });

  it("verplaatst dia's binnen de lijst", () => {
    const dias: Dia[] = [
      { soort: "omslag", inhoud: {} },
      { soort: "stap", inhoud: { kop: "a" } },
      { soort: "slot", inhoud: {} },
    ];
    expect(verplaatsDia(dias, 1, -1)).toBe(0);
    expect(dias.map((d) => d.soort)).toEqual(["stap", "omslag", "slot"]);
    expect(verplaatsDia(dias, 0, -1)).toBe(0);
    expect(verplaatsDia(dias, 2, 1)).toBe(2);
  });
});

describe("ideeNaarRecept", () => {
  it("vult de kop, feiten, campagne en titel in", () => {
    const r = ideeNaarRecept(
      {
        sjabloon: "stelling",
        titel: "Wtta uitleggen",
        kop: "De Wtta komt. *Bent u klaar?*",
        feiten: ["f-1"],
        campagne: null,
      },
      { formatenAan: ["li-vierkant"], merkVersie: "m" },
    );
    expect(r).toMatchObject({
      sjabloon: "stelling",
      titel: "Wtta uitleggen",
      feiten: ["f-1"],
      campagne: null,
      formaten: ["li-vierkant"],
      merkVersie: "m",
    });
    expect(r.inhoud.kop).toBe("De Wtta komt. *Bent u klaar?*");
  });
  it("zet bij een carrousel de kop op de omslag en laat een lege kop de standaard", () => {
    const r = ideeNaarRecept({ sjabloon: "carrousel", titel: "Reeks", kop: "Vier *stappen.*" });
    expect(r.dias[0].soort).toBe("omslag");
    expect(r.dias[0].inhoud.kop).toBe("Vier *stappen.*");
    const zonder = ideeNaarRecept({ sjabloon: "stelling", titel: "x", kop: "" });
    expect(zonder.inhoud.kop).toBe(nieuwRecept("stelling").inhoud.kop);
  });
});

describe("zetOm", () => {
  const stelling = {
    ...nieuwRecept("stelling"),
    titel: "Mijn post",
    inhoud: { ...nieuwRecept("stelling").inhoud, ondergrond: "accent", kop: "Mijn *kop.*", tekst: "Mijn tekst." },
    posttekst: { linkedin: "Hallo" },
    feiten: ["f-1"],
    campagne: "c-1",
    altTekst: "Alt",
    link: "https://postwright.example/",
  };
  it("neemt velden met dezelfde naam over; keuzes alleen als het daar een optie is", () => {
    const r = zetOm(stelling, "vraag");
    expect(r).toMatchObject({
      sjabloon: "vraag",
      titel: "Mijn post (Vraag en antwoord)",
      feiten: ["f-1"],
      campagne: "c-1",
      altTekst: "Alt",
      link: "https://postwright.example/",
    });
    expect(r.inhoud.kop).toBe("Mijn *kop.*");
    expect(r.inhoud.tekst).toBe("Mijn tekst.");
    expect(r.inhoud).not.toHaveProperty("ondergrond");
    expect(
      zetOm({ ...stelling, inhoud: { ...stelling.inhoud, ondergrond: "licht" } }, "carrousel").dias[0].inhoud
        .ondergrond,
    ).toBe("inkt");
    expect(zetOm(stelling, "carrousel").dias[0].inhoud).toMatchObject({
      ondergrond: "accent",
      kop: "Mijn *kop.*",
      tekst: "Mijn tekst.",
    });
  });
  it("haalt uit een carrousel de omslag en kopieert de posttekst los van het origineel", () => {
    const c = { ...nieuwRecept("carrousel"), titel: "Reeks" };
    c.dias[0].inhoud.kop = "Omslag *kop.*";
    const r = zetOm(c, "stelling");
    expect(r.inhoud.kop).toBe("Omslag *kop.*");
    const s = zetOm(stelling, "vraag");
    s.posttekst.linkedin = "Anders";
    expect(stelling.posttekst.linkedin).toBe("Hallo");
  });
  it("neemt alleen een geldig media-id over", () => {
    const p = {
      ...nieuwRecept("productbeeld"),
      titel: "x",
      inhoud: { ...nieuwRecept("productbeeld").inhoud, beeld: "javascript:alert(1)" },
    };
    expect(zetOm(p, "productbeeld").inhoud.beeld).toBe(nieuwRecept("productbeeld").inhoud.beeld);
  });
});
