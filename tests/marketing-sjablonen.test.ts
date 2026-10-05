// Marketingstudio — de sjabloonmotor: escapen, nadruk, rem naar pixels, en elk sjabloon in elk
// formaat. De injectietests lopen over élk veld van élk sjabloon (en elke diasoort), zodat een
// nieuw sjabloon dat ergens ruwe invoer in de markup zet hier meteen rood wordt.
import { describe, it, expect } from "vitest";
import {
  SJABLONEN, bouwBeeld, escapeHtml, metNadruk, nadrukOmSelectie, remNaarPx, sjabloon, standaardInhoud, telNadruk, veldenVan, zonderNadruk,
  type Dia, type Sjabloon, type Veld,
} from "../src/web/marketing/sjablonen.js";
import { FORMATEN } from "../src/web/marketing/formaten.js";
import { merkVanSchijf } from "./helpers/marketing-merk.js";

const merk = merkVanSchijf();
const KWAAD = `<img src=x onerror=alert(1)></style><script>alert(1)</script>"'&`;

/** Alle (sjabloon, diasoort | null) paren, met hun velden. */
function alleVeldsets(): Array<{ s: Sjabloon; dia: string | null; velden: Veld[] }> {
  return SJABLONEN.flatMap((s): Array<{ s: Sjabloon; dia: string | null; velden: Veld[] }> => (s.soort === "carrousel"
    ? (s.dias ?? []).map((d) => ({ s, dia: d.soort, velden: d.velden }))
    : [{ s, dia: null, velden: s.velden }]));
}

function bouw(s: Sjabloon, dia: string | null, inhoud: Record<string, string>, formaat = s.formaten[0]) {
  return dia
    ? bouwBeeld({ sjabloon: s.id, dias: [{ soort: dia, inhoud }], dia: 0, formaat, merk })
    : bouwBeeld({ sjabloon: s.id, inhoud, formaat, merk });
}

describe("hulpfuncties", () => {
  it("escapet alle vijf de tekens", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(escapeHtml(null)).toBe("");
  });

  it("maakt van *frase* nadruk, maar laat losse sterren en sterren met spaties staan", () => {
    expect(metNadruk("Achter elk tarief een *helder verhaal.*")).toBe("Achter elk tarief een <em>helder verhaal.</em>");
    expect(metNadruk("Kost € 5* per maand")).toBe("Kost € 5* per maand");
    expect(metNadruk("3 * 4 * 5")).toBe("3 * 4 * 5");
    expect(metNadruk("*<b>*")).toBe("<em>&lt;b&gt;</em>");
    expect(metNadruk("Eerst begrijpen.\nDan berekenen.")).toBe("Eerst begrijpen.<br>Dan berekenen.");
    expect(telNadruk("*een* en *twee*")).toBe(2);
    expect(telNadruk("geen")).toBe(0);
    expect(telNadruk("€ 5*")).toBe(0);
    expect(zonderNadruk("Nu bent u *aan zet.*")).toBe("Nu bent u aan zet.");
  });

  it("zet nadruk om een selectie zonder de spaties eromheen op te eten (reviewbevinding 5)", () => {
    const t = "Nu bent u aan zet.";
    // Dubbelklik op Windows selecteert "aan " inclusief de spatie erachter.
    expect(nadrukOmSelectie(t, 10, 14)).toEqual({ tekst: "Nu bent u *aan* zet.", begin: 10, eind: 15 });
    expect(nadrukOmSelectie(t, 9, 13)!.tekst).toBe("Nu bent u *aan* zet.");
    // Een bestaande nadruk verhuist: er blijft er precies één.
    expect(nadrukOmSelectie("*Nu* bent u aan zet.", 12, 15)!.tekst).toBe("Nu bent u *aan* zet.");
    expect(nadrukOmSelectie(t, 3, 3)).toBeNull();
    expect(nadrukOmSelectie(t, 9, 10)).toBeNull();
  });

  it("rekent rem om naar pixels op één honderdachtste van de breedte", () => {
    expect(remNaarPx("padding: 8rem; margin: -.5rem 1.25rem;", 1080)).toBe("padding: 80px; margin: -5px 12.5px;");
    expect(remNaarPx("font-size: 10.4rem", 1200)).toBe("font-size: 115.556px");
    expect(remNaarPx("width: 2em; --x: 3", 1080)).toBe("width: 2em; --x: 3");
  });
});

describe("sjabloonbeschrijvingen", () => {
  const formaatSleutels = new Set(FORMATEN.map((f) => f.sleutel));

  it("hebben geldige id's, bekende formaten en velden die de server accepteert", () => {
    expect(new Set(SJABLONEN.map((s) => s.id)).size).toBe(SJABLONEN.length);
    for (const s of SJABLONEN) {
      expect(s.id).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
      expect(s.formaten.length, s.id).toBeGreaterThan(0);
      for (const f of s.formaten) expect(formaatSleutels.has(f), `${s.id}: ${f}`).toBe(true);
    }
    for (const { s, dia, velden } of alleVeldsets()) {
      expect(new Set(velden.map((v) => v.id)).size, `${s.id}/${dia}`).toBe(velden.length);
      for (const v of velden) {
        expect(v.id, `${s.id}/${dia}`).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/);
        expect(["kop", "tekst", "regel", "keuze", "media"]).toContain(v.soort);
        expect(v.label, v.id).toBeTruthy();
        if (v.soort === "keuze") expect(v.opties!.map((o) => o.waarde), `${s.id}.${v.id}`).toContain(v.standaard);
        if (v.max !== undefined && v.standaard) expect(v.standaard.length, `${s.id}.${v.id}`).toBeLessThanOrEqual(v.max);
        if (v.nadruk === "precies-een") expect(telNadruk(v.standaard), `${s.id}.${v.id}`).toBe(1);
      }
    }
  });

  it("geeft de standaardinhoud van een sjabloon en van een diasoort", () => {
    expect(standaardInhoud(sjabloon("stelling")!).ondergrond).toBe("accent");
    expect(standaardInhoud(sjabloon("carrousel")!, "omslag").ondergrond).toBe("inkt");
    expect(veldenVan(sjabloon("carrousel")!, "stap").some((v) => v.id === "illustratie")).toBe(true);
  });
});

describe("bouwBeeld", () => {
  it("bouwt elk sjabloon in elk formaat, met de maten van het formaat en zonder externe bronnen", () => {
    for (const s of SJABLONEN) {
      for (const f of s.formaten) {
        const b = bouwBeeld({ sjabloon: s.id, inhoud: {}, formaat: f, merk });
        const formaat = FORMATEN.find((x) => x.sleutel === f)!;
        expect(b.breedte, `${s.id}/${f}`).toBe(formaat.breedte);
        expect(b.hoogte).toBe(formaat.hoogte);
        expect(b.html).toContain(`--breedte:${formaat.breedte}px`);
        expect(b.html).toMatch(/class="merk vorm-/);
        for (const [, bron] of b.html.matchAll(/\ssrc="([^"]*)"/g)) expect(bron.startsWith("data:"), `${s.id}: ${bron.slice(0, 40)}`).toBe(true);
        expect(b.html).not.toMatch(/<script|\son\w+=|javascript:/i);
        expect(b.css).not.toMatch(/url\(\s*["']?https?:/);
        expect(b.css).not.toMatch(/\d(rem)\b/);
        expect(b.css).not.toMatch(/100v[wh]/);
      }
    }
  });

  it("is deterministisch", () => {
    const a = bouwBeeld({ sjabloon: "stelling", inhoud: { kop: "Een *kop*" }, formaat: "li-staand", merk });
    const b = bouwBeeld({ sjabloon: "stelling", inhoud: { kop: "Een *kop*" }, formaat: "li-staand", merk });
    expect(a).toEqual(b);
  });

  it("escapet kwaadaardige invoer in elk veld van elk sjabloon en elke diasoort", () => {
    for (const { s, dia, velden } of alleVeldsets()) {
      for (const v of velden) {
        const b = bouw(s, dia, { [v.id]: KWAAD });
        const plek = `${s.id}${dia ? `/${dia}` : ""}.${v.id}`;
        expect(b.html, plek).not.toContain("<img src=x");
        expect(b.html, plek).not.toContain("<script");
        expect(b.html, plek).not.toContain("</style>");
        // Alleen als attribuut van een echte tag is het gevaarlijk; als ge-escapete tekst (&lt;img … onerror=) niet.
        expect(b.html, plek).not.toMatch(/<[^>]*\sonerror=/);
      }
    }
  });

  it("laat een keuzeveld alleen een van zijn opties zijn", () => {
    const b = bouwBeeld({ sjabloon: "stelling", inhoud: { ondergrond: 'x" onclick="kwaad' }, formaat: "li-vierkant", merk });
    expect(b.html).toContain('class="beeld grond-accent"');
    expect(b.html).not.toContain("onclick");
  });

  it("zet het logo dat bij de ondergrond hoort", () => {
    const licht = bouwBeeld({ sjabloon: "stelling", inhoud: { ondergrond: "licht" }, formaat: "li-vierkant", merk });
    const inkt = bouwBeeld({ sjabloon: "stelling", inhoud: { ondergrond: "inkt" }, formaat: "li-vierkant", merk });
    expect(licht.html).toContain(merk.logos.standaard);
    expect(inkt.html).toContain(merk.logos["op-inkt"]);
    expect(inkt.html).toContain("grond-inkt");
  });

  it("toont het label Voorbeelddossier altijd bij sjablonen met voorbeelddata, in elk formaat", () => {
    for (const s of SJABLONEN.filter((x) => x.voorbeelddata)) {
      for (const f of s.formaten) {
        expect(bouwBeeld({ sjabloon: s.id, inhoud: {}, formaat: f, merk }).html, `${s.id}/${f}`).toContain(">Voorbeelddossier<");
      }
    }
  });

  it("kiest de kopgrootte automatisch naar lengte, en laat een expliciete keuze staan", () => {
    const kort = bouwBeeld({ sjabloon: "stelling", inhoud: { kop: "Kort en *krachtig.*" }, formaat: "li-vierkant", merk });
    const lang = bouwBeeld({ sjabloon: "stelling", inhoud: { kop: "Van binnengekomen uitvraag naar *goed voorbereid gesprek.*" }, formaat: "li-vierkant", merk });
    const gekozen = bouwBeeld({ sjabloon: "stelling", inhoud: { kop: "Kort en *krachtig.*", kopgrootte: "klein" }, formaat: "li-vierkant", merk });
    expect(kort.html).toContain('class="kop"');
    expect(lang.html).toContain('class="kop middel"');
    expect(gekozen.html).toContain('class="kop klein"');
  });

  it("toont een media-veld alleen als data-URI die de studio zelf aanlevert, nooit als vrije URL", () => {
    const id = `${"a".repeat(32)}.png`;
    const met = bouwBeeld({ sjabloon: "productbeeld", inhoud: { beeld: id }, formaat: "li-vierkant", merk, media: { [id]: "data:image/png;base64,AAAA" } });
    expect(met.html).toContain('src="data:image/png;base64,AAAA"');
    const vrij = bouwBeeld({ sjabloon: "productbeeld", inhoud: { beeld: "https://kwaad.nl/x.png" }, formaat: "li-vierkant", merk });
    expect(vrij.html).not.toContain("kwaad.nl");
    expect(vrij.html).toContain("Kies een schermafbeelding");
  });

  it("weigert een onbekend sjabloon en een formaat dat het sjabloon niet kent", () => {
    expect(() => bouwBeeld({ sjabloon: "poster", formaat: "li-vierkant", merk })).toThrow(/Onbekend sjabloon/);
    expect(() => bouwBeeld({ sjabloon: "linkvoorbeeld", formaat: "story", merk })).toThrow(/kent formaat/);
  });
});

describe("carrousel", () => {
  const s = sjabloon("carrousel")!;

  it("rendert de zes standaarddia's van de kit, met een stapketen op de vier stappen", () => {
    expect(s.standaardDias).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const b = bouwBeeld({ sjabloon: "carrousel", dias: [], dia: i, formaat: "li-carrousel", merk });
      expect(b.breedte).toBe(1080);
      const stap = s.standaardDias![i].soort === "stap";
      expect(b.html.includes('class="stapketen"'), `dia ${i + 1}`).toBe(stap);
      if (stap) expect(b.html).toContain(`aria-label="Stap ${i} van 4"`);
    }
  });

  it("telt alleen stapdia's in de keten, ook met een omslag en slot ertussen", () => {
    const dias: Dia[] = [
      { soort: "omslag", inhoud: {} },
      { soort: "stap", inhoud: { illustratie: "geen" } },
      { soort: "stap", inhoud: { illustratie: "vinklijst" } },
      { soort: "slot", inhoud: {} },
    ];
    const tweede = bouwBeeld({ sjabloon: "carrousel", dias, dia: 2, formaat: "li-carrousel", merk });
    expect(tweede.html).toContain('aria-label="Stap 2 van 2"');
    expect(tweede.html).toContain('class="papier vinklijst"');
    const eerste = bouwBeeld({ sjabloon: "carrousel", dias, dia: 1, formaat: "li-carrousel", merk });
    expect(eerste.html).toContain('class="ruimte"');
  });

  it("weigert een onbekende diasoort", () => {
    expect(() => bouwBeeld({ sjabloon: "carrousel", dias: [{ soort: "poster", inhoud: {} }], formaat: "li-carrousel", merk })).toThrow(/diasoort/);
  });
});
