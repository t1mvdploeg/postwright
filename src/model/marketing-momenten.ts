// Marketingstudio golf 2 — de actualiteitenkalender: data uit de kennisbank die voor een
// uitzendbureau iets betekenen, als aanleiding voor een post. Handmatig bijgehouden met de skill
// cao-kennis; tests/marketing-momenten.test.ts eist dat elke datum en elk getal op de bronpagina staat.
import type { Parameters } from "../core/types.js";
import { parameterFeiten } from "./marketing-parameters.js";

export interface Moment {
  sleutel: string;
  /** Het moment zelf, of het begin van een venster (JJJJ-MM-DD). */
  datum: string;
  /** Het einde van een venster, of null bij één dag. */
  tot: string | null;
  titel: string;
  /** Eén neutrale zin die als feit in marketing kan staan. */
  tekst: string;
  /** De kennispagina (docs/kennis/…). */
  bron: string;
  soort: "wet" | "cao" | "loon";
  /** Tot wanneer de zin klopt als marketingtekst; wordt de geldigTot van het feit. */
  geldigTot: string | null;
}

/**
 * De momenten, op datum. `geldigTot`: bij een venster het einde; bij een zin die na de datum blijft
 * kloppen `null`; bij een verwachting ("gaat naar verwachting … in") de datum zelf, want daarna is
 * het geen verwachting meer. Het minimumloon staat hier niet: dat komt uit de parameters.
 */
export const MOMENTEN: Moment[] = [
  // gelijkwaardige-beloning.md, Kern: "Gelijkwaardige beloning vervangt per 1 januari 2026 de
  // inlenersbeloning" en het recht op een pakket dat "ten minste gelijkwaardig" is (cao art. 21).
  {
    sleutel: "cao-gelijkwaardige-beloning", datum: "2026-01-01", tot: null,
    titel: "Cao: gelijkwaardige beloning vervangt de inlenersbeloning",
    tekst: "Per 1 januari 2026 vervangt gelijkwaardige beloning de inlenersbeloning: het arbeidsvoorwaardenpakket van een uitzendkracht moet in totaal ten minste gelijkwaardig zijn aan dat van een werknemer in een gelijke of vergelijkbare functie bij de opdrachtgever.",
    bron: "docs/kennis/gelijkwaardige-beloning.md", soort: "cao", geldigTot: null,
  },
  // wtta.md, Kern: "aanmelden overgangsregeling 1 november t/m 31 december 2026" (ABU-gids §1.1).
  {
    sleutel: "wtta-aanmelden-overgang", datum: "2026-11-01", tot: "2026-12-31",
    titel: "Wtta: aanmelden voor de overgangsregeling",
    tekst: "Uitleners kunnen zich van 1 november tot en met 31 december 2026 aanmelden voor de overgangsregeling van de Wtta.",
    bron: "docs/kennis/wtta.md", soort: "wet", geldigTot: "2026-12-31",
  },
  // wtta.md: "naar verwachting op 1 januari 2027", "Beoogde invoeringsdatum: 1 januari 2027 …
  // waarop uitleners aan het normenkader moeten voldoen" en "behalve de normeis beloning, die later volgt".
  {
    sleutel: "wtta-invoering", datum: "2027-01-01", tot: null,
    titel: "Wtta: beoogde invoering van het toelatingsstelsel",
    tekst: "Het toelatingsstelsel van de Wtta gaat naar verwachting op 1 januari 2027 in; vanaf die datum moeten uitleners aan het normenkader voldoen, behalve aan de normeis beloning, die later volgt.",
    bron: "docs/kennis/wtta.md", soort: "wet", geldigTot: "2027-01-01",
  },
  // wtta.md: "toelating aanvragen 1 mei t/m 30 juni 2027", "bij aanvraag vóór 1 juli 2027 volstaat
  // een geldig SNA-certificaat in plaats van dat rapport" en "De aanvraag verloopt via toelatinguitleenmarkt.nl".
  {
    sleutel: "wtta-toelating-aanvragen", datum: "2027-05-01", tot: "2027-06-30",
    titel: "Wtta: toelating aanvragen",
    tekst: "Uitleners kunnen de toelating onder de Wtta van 1 mei tot en met 30 juni 2027 aanvragen via toelatinguitleenmarkt.nl; bij een aanvraag vóór 1 juli 2027 volstaat een geldig SNA-certificaat in plaats van een inspectierapport normenkader.",
    bron: "docs/kennis/wtta.md", soort: "wet", geldigTot: "2027-06-30",
  },
  // wtta.md: "handhaving Arbeidsinspectie vanaf 1 januari 2028" (gids §1.1: "handhaven op de
  // toelatingsplicht") en "Vanaf 1 januari 2028 mogen inleners alleen samenwerken met geregistreerde uitleners".
  {
    sleutel: "wtta-handhaving", datum: "2028-01-01", tot: null,
    titel: "Wtta: handhaving op de toelatingsplicht",
    tekst: "Vanaf 1 januari 2028 handhaaft de Arbeidsinspectie op de toelatingsplicht van de Wtta en mogen inleners alleen nog samenwerken met geregistreerde uitleners.",
    bron: "docs/kennis/wtta.md", soort: "wet", geldigTot: null,
  },
  // basisloon-en-ikb.md, Historie: "Artikel 39 wordt per 1 januari 2028 vervangen: de koppeling van de
  // uitsluiting van loondoorbetaling aan 26 weken werken in fase B zonder volledige fase A vervalt, en
  // fase B en C worden samengevoegd tot één grond voor recht op basisloon".
  {
    sleutel: "cao-artikel-39-2028", datum: "2028-01-01", tot: null,
    titel: "Cao: nieuw artikel 39 over loondoorbetaling",
    tekst: "Per 1 januari 2028 wordt artikel 39 van de Cao voor Uitzendkrachten vervangen: de uitsluiting van loondoorbetaling gedurende 26 weken in fase B zonder volledige fase A vervalt, en fase B en C worden samengevoegd tot één grond voor recht op basisloon.",
    bron: "docs/kennis/basisloon-en-ikb.md", soort: "cao", geldigTot: null,
  },
  // fasen-contracten-en-uitzendbeding.md: "Fase B: tot 1-1-2028 3 jaar/max. 6 overeenkomsten, daarna
  // 2 jaar/max. 6", "vanaf 1-1-2028 wordt die tussenpoos 36 maanden voor nieuwe overeenkomsten, 6 maanden
  // blijft gelden voor bestaande" en het overgangsrecht voor fase B (cao art. 14 lid 14 en 15).
  {
    sleutel: "cao-fase-b-2028", datum: "2028-01-01", tot: null,
    titel: "Cao: fase B korter, tussenpoos langer",
    tekst: "Voor uitzendovereenkomsten die vanaf 1 januari 2028 worden aangegaan, duurt fase B maximaal 2 jaar in plaats van 3 jaar en geldt een tussenpoos van 36 maanden in plaats van 6 maanden.",
    bron: "docs/kennis/fasen-contracten-en-uitzendbeding.md", soort: "cao", geldigTot: null,
  },
];

/** De ingangsdata van het minimumloon uit de parameters, met dezelfde tekst als "Feit uit de parameters". */
export function wmlMomenten(p: Parameters): Moment[] {
  return parameterFeiten(p).filter((f) => f.sleutel.startsWith("wml-") && f.geldigVan).map((f) => ({
    sleutel: f.sleutel, datum: f.geldigVan as string, tot: null, titel: f.naam, tekst: f.tekst,
    bron: f.bron, soort: "loon" as const, geldigTot: f.geldigTot,
  }));
}

export function alleMomenten(p: Parameters): Moment[] {
  return [...MOMENTEN, ...wmlMomenten(p)].sort((a, b) => a.datum.localeCompare(b.datum) || a.sleutel.localeCompare(b.sleutel));
}

/** De momenten die de periode [van, tot] raken; een venster telt als het overlapt. */
export function momentenIn(lijst: Moment[], van: string, tot: string): Moment[] {
  return lijst.filter((m) => m.datum <= tot && (m.tot ?? m.datum) >= van);
}

// Eén versie voor server en browser; hier her-geëxporteerd omdat de routes en tests hem hier halen.
export { plusDagen } from "../web/marketing/kalender.js";
