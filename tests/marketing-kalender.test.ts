// Marketingstudio — maandraster, weeknummers, verzetten.
import { describe, it, expect } from "vitest";
import { aantalWerkdagen, dagenGeleden, dagVan, echteDatum, isoWeek, kiesPeriode, komendeWeken, maandRaster, plusDagen, standaardAantal, verzetNaarDag, volgendeMaand } from "../src/web/marketing/kalender.js";
import { plusDagen as plusDagenModel } from "../src/model/marketing-momenten.js";

describe("kalender", () => {
  it("bouwt een maand van maandag tot zondag met aangevulde dagen", () => {
    const oktober = maandRaster(2026, 9);
    expect(oktober[0][0]).toEqual({ datum: "2026-09-28", inMaand: false });
    expect(oktober[0][3]).toEqual({ datum: "2026-10-01", inMaand: true });
    expect(oktober.at(-1)!.at(-1)!.datum).toBe("2026-11-01");
    expect(oktober.every((w) => w.length === 7)).toBe(true);
    // Februari 2027 begint op maandag en telt precies vier weken.
    expect(maandRaster(2027, 1)).toHaveLength(4);
  });

  it("rekent ISO-weken, ook rond de jaarwisseling", () => {
    expect(isoWeek("2026-10-06")).toEqual({ jaar: 2026, week: 41 });
    expect(isoWeek("2027-01-01")).toEqual({ jaar: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ jaar: 2027, week: 1 });
  });

  it("verzet naar een andere dag met dezelfde kloktijd, ook over de wisseling naar wintertijd", () => {
    const zomer = "2026-10-23T08:30:00+02:00";
    const winter = verzetNaarDag(zomer, "2026-10-27")!;
    expect(winter).toBe("2026-10-27T08:30:00+01:00");
    expect(dagVan(winter)).toBe("2026-10-27");
    expect(volgendeMaand(2026, 11, 1)).toEqual({ jaar: 2027, maand: 0 });
    expect(volgendeMaand(2026, 0, -1)).toEqual({ jaar: 2025, maand: 11 });
  });
});

describe("komendeWeken", () => {
  it("begint bij de maandag van deze week en loopt over de wintertijd heen", () => {
    expect(komendeWeken("2026-10-21", 2)).toEqual([
      { jaar: 2026, week: 43, maandag: "2026-10-19", zondag: "2026-10-25" },
      { jaar: 2026, week: 44, maandag: "2026-10-26", zondag: "2026-11-01" },
    ]);
  });
  it("kent week 53 van 2026 en een zondag als vandaag", () => {
    expect(komendeWeken("2026-12-30", 2).map((w) => [w.jaar, w.week, w.maandag])).toEqual([[2026, 53, "2026-12-28"], [2027, 1, "2027-01-04"]]);
    expect(komendeWeken("2026-10-25", 1)[0].maandag).toBe("2026-10-19");
  });
});

describe("kiesPeriode", () => {
  const leeg = { van: null, tot: null };
  it("eerste klik begin, tweede klik eind, ook in omgekeerde volgorde", () => {
    const een = kiesPeriode(leeg, "2026-10-14");
    expect(een).toEqual({ van: "2026-10-14", tot: null });
    expect(kiesPeriode(een, "2026-10-20")).toEqual({ van: "2026-10-14", tot: "2026-10-20" });
    expect(kiesPeriode(een, "2026-10-02")).toEqual({ van: "2026-10-02", tot: "2026-10-14" });
  });
  it("een klik op een hele periode begint opnieuw; shift breidt uit, ook over een maandgrens", () => {
    const heel = { van: "2026-10-14", tot: "2026-10-20" };
    expect(kiesPeriode(heel, "2026-10-16")).toEqual({ van: "2026-10-16", tot: null });
    expect(kiesPeriode(heel, "2026-11-03", { uitbreiden: true })).toEqual({ van: "2026-10-14", tot: "2026-11-03" });
    expect(kiesPeriode(heel, "2026-10-01", { uitbreiden: true })).toEqual({ van: "2026-10-01", tot: "2026-10-20" });
    expect(kiesPeriode(heel, "2026-10-16", { uitbreiden: true })).toEqual(heel);
    expect(kiesPeriode(leeg, "2026-10-16", { uitbreiden: true })).toEqual({ van: "2026-10-16", tot: null });
  });
});

describe("standaardAantal", () => {
  it("twee per week, minstens één, hooguit twintig", () => {
    expect(standaardAantal("2026-10-05", "2026-10-11")).toBe(2);
    expect(standaardAantal("2026-10-05", "2026-10-05")).toBe(1);
    expect(standaardAantal("2026-10-05", "2026-11-01")).toBe(8);
    expect(standaardAantal("2026-10-01", "2026-12-31")).toBe(20);
  });
});

describe("aantalWerkdagen", () => {
  it("telt maandag tot en met vrijdag, ook over de wintertijd en de jaarwisseling", () => {
    expect(aantalWerkdagen("2026-10-05", "2026-10-11")).toBe(5);
    expect(aantalWerkdagen("2026-10-10", "2026-10-11")).toBe(0);
    expect(aantalWerkdagen("2026-10-14", "2026-10-14")).toBe(1);
    expect(aantalWerkdagen("2026-10-23", "2026-10-27")).toBe(3);
    expect(aantalWerkdagen("2026-12-28", "2027-01-08")).toBe(10);
    expect(aantalWerkdagen("2026-10-20", "2026-10-14")).toBe(0);
  });
});

// Eén versie van de datumhelpers voor server en browser (afsluitende review, A9).
describe("echteDatum en plusDagen", () => {
  it("laat alleen bestaande kalenderdatums door", () => {
    expect(echteDatum("2026-02-28")).toBe(true);
    expect(echteDatum("2028-02-29")).toBe(true);
    expect(echteDatum("2026-02-29")).toBe(false);
    expect(echteDatum("2026-02-30")).toBe(false);
    expect(echteDatum("2026-13-01")).toBe(false);
    expect(echteDatum("2026-10-00")).toBe(false);
    expect(echteDatum("6-10-2026")).toBe(false);
  });
  it("telt dagen op datums, over de wintertijd en de jaargrens", () => {
    expect(plusDagen("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("is dezelfde functie als die de server en de tests uit marketing-momenten halen", () => {
    expect(plusDagenModel).toBe(plusDagen);
  });

  // Eindreview B3, ronde 2, fix 8: `kalender.js` re-exporteert deze twee nu vanuit het nieuwe,
  // DOM-loze `web/datum.js` (losgetrokken zodat de Facturatie-schermen en `bedrijf.js` niet de
  // hele Marketingstudio-modulegraaf hoeven te laden) — letterlijk dezelfde functie, geen tweede
  // implementatie.
  it("zijn letterlijk de functies uit web/datum.js", async () => {
    const datum = await import("../src/web/datum.js");
    expect(echteDatum).toBe(datum.echteDatum);
    expect(plusDagen).toBe(datum.plusDagen);
  });
});

// "Laatste publicatie" op het Overzicht rekent in kalenderdagen in Nederland (afsluitende review, A8).
describe("dagenGeleden", () => {
  it("gisteren 23.00 heet om 08.00 gisteren, niet vandaag", () => {
    // 23 september 23.00 zomertijd is 21.00 UTC; 24 september 08.00 is 06.00 UTC.
    expect(dagenGeleden("2026-09-23T21:00:00Z", new Date("2026-09-24T06:00:00Z"))).toBe(1);
    expect(dagenGeleden("2026-09-24T06:30:00Z", new Date("2026-09-24T21:00:00Z"))).toBe(0);
    // Middernacht in Nederland is 22.00 UTC: 23.30 UTC op de 23e is al de 24e.
    expect(dagenGeleden("2026-09-23T22:30:00Z", new Date("2026-09-24T06:00:00Z"))).toBe(0);
  });
  it("telt over de wisseling naar wintertijd in hele dagen", () => {
    expect(dagenGeleden("2026-10-24T10:00:00Z", new Date("2026-10-26T10:00:00Z"))).toBe(2);
    expect(dagenGeleden("2026-09-01T10:00:00Z", new Date("2026-09-24T10:00:00Z"))).toBe(23);
  });
});
