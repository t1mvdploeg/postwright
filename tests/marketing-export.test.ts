// Marketingstudio — de exportmodules die in de browser draaien: ZIP (stored), PDF uit JPEG's en de
// agenda-export (.ics). Allemaal puur; hier getoetst op de structuur die andere programma's lezen.
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { crc32, maakZip } from "../src/web/marketing/zip.js";
import { maakPdf } from "../src/web/marketing/pdf.js";
import { icsTekst, icsTijd, maakIcs, vouw } from "../src/web/marketing/ics.js";

const enc = new TextEncoder();

describe("zip", () => {
  it("berekent de CRC-32 van een bekende tekst", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("levert een ZIP die fflate uitpakt tot dezelfde namen en bytes, ook met accenten", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250]);
    const zip = maakZip(
      [
        { naam: "postwright_stelling_li-vierkant_1200x1200.png", bytes: png },
        { naam: "posttekst café.txt", bytes: "Genoeg gezien. Nu bent u aan zet." },
      ],
      new Date(2026, 8, 24, 13, 30, 10),
    );
    const uit = unzipSync(zip);
    expect(Object.keys(uit)).toEqual(["postwright_stelling_li-vierkant_1200x1200.png", "posttekst café.txt"]);
    expect([...uit["postwright_stelling_li-vierkant_1200x1200.png"]]).toEqual([...png]);
    expect(strFromU8(uit["posttekst café.txt"])).toBe("Genoeg gezien. Nu bent u aan zet.");
  });

  it("maakt een geldige lege ZIP", () => {
    const zip = maakZip([]);
    expect(zip.length).toBe(22);
    expect(Object.keys(unzipSync(zip))).toEqual([]);
  });
});

describe("pdf", () => {
  // De kop van een JPEG is genoeg: de PDF controleert de beeldbytes niet, hij draagt ze alleen.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]);
  const tekst = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

  it("heeft één pagina per dia met de juiste MediaBox en de JPEG ongewijzigd in de stream", () => {
    const pdf = maakPdf(
      [
        { jpeg, breedte: 1080, hoogte: 1350 },
        { jpeg, breedte: 1080, hoogte: 1350 },
      ],
      { titel: "Carrousel" },
    );
    const t = tekst(pdf);
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t).toContain("/Count 2");
    expect(t.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(t).toContain("/MediaBox [0 0 1080 1350]");
    expect(t).toContain("/Filter /DCTDecode");
    expect(t).toContain(tekst(jpeg));
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("heeft een xref waarvan elke offset naar het begin van zijn object wijst", () => {
    const pdf = maakPdf([
      { jpeg, breedte: 1200, hoogte: 1200 },
      { jpeg, breedte: 1200, hoogte: 1200 },
      { jpeg, breedte: 1200, hoogte: 1200 },
    ]);
    const t = tekst(pdf);
    const startxref = Number(t.match(/startxref\n(\d+)\n/)![1]);
    expect(t.slice(startxref, startxref + 4)).toBe("xref");
    const [, aantal] = t.slice(startxref).match(/xref\n0 (\d+)\n/)!;
    const regels = t
      .slice(startxref)
      .split("\n")
      .slice(3, 2 + Number(aantal));
    regels.forEach((regel, i) => {
      const offset = Number(regel.slice(0, 10));
      expect(t.slice(offset, offset + `${i + 1} 0 obj`.length), `object ${i + 1}`).toBe(`${i + 1} 0 obj`);
    });
  });

  it("schrijft een titel met accenten als UTF-16 en weigert een PDF zonder pagina's", () => {
    const t = tekst(maakPdf([{ jpeg, breedte: 10, hoogte: 10 }], { titel: "Één" }));
    expect(t).toContain("/Title <FEFF00C900E9006E>");
    expect(tekst(maakPdf([{ jpeg, breedte: 10, hoogte: 10 }], { titel: "A (b)" }))).toContain("/Title (A \\(b\\))");
    expect(() => maakPdf([])).toThrow(/minstens één pagina/);
  });
});

describe("ics", () => {
  it("escapet volgens RFC 5545", () => {
    expect(icsTekst("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });

  it("vouwt op 75 octets zonder een UTF-8-teken te splitsen", () => {
    const regel = `SUMMARY:${"a".repeat(66)}ëëëë`;
    const gevouwen = vouw(regel);
    for (const deel of gevouwen.split("\r\n")) expect(enc.encode(deel).length).toBeLessThanOrEqual(75);
    expect(
      gevouwen
        .split("\r\n")
        .map((d, i) => (i ? d.slice(1) : d))
        .join(""),
    ).toBe(regel);
    expect(vouw("kort")).toBe("kort");
  });

  it("zet tijden om naar UTC, ook over de wisseling naar wintertijd", () => {
    expect(icsTijd("2026-10-24T09:30:00+02:00")).toBe("20261024T073000Z");
    expect(icsTijd("2026-10-26T09:30:00+01:00")).toBe("20261026T083000Z");
    expect(() => icsTijd("morgen")).toThrow(/Ongeldig/);
  });

  it("maakt per geplande post een afspraak met vast UID, herinnering en link, met CRLF", () => {
    const ics = maakIcs(
      [
        {
          id: "p-1",
          titel: "Stelling, accent",
          gepland: "2026-10-06T08:30:00+02:00",
          posttekst: { linkedin: "Genoeg gezien." },
        },
        { id: "p-2", titel: "Zonder datum", gepland: null },
      ],
      { basisUrl: "https://postwright.example", merknaam: "Postwright", nu: new Date("2026-10-01T00:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:p-1@postwright.local");
    expect(ics).toContain("DTSTART:20261006T063000Z");
    expect(ics).toContain("DTEND:20261006T064500Z");
    expect(ics).toContain("SUMMARY:Post: Stelling\\, accent");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics.replace(/\r\n /g, "")).toContain("URL:https://postwright.example/#maken/p-1");
    expect(ics.split("\r\n").every((r) => !r.includes("\n"))).toBe(true);
  });

  it("trekt een afspraak in van een post die niet meer gepland staat", () => {
    const ics = maakIcs(
      [
        { id: "p-1", titel: "Gepland", gepland: "2026-10-06T08:30:00+02:00", status: "gepland" },
        { id: "p-2", titel: "Terug naar concept", gepland: "2026-10-07T08:30:00+02:00", status: "concept" },
      ],
      { basisUrl: "https://postwright.example", merknaam: "Postwright" },
    );
    const [gepland, ingetrokken] = ics.split("BEGIN:VEVENT").slice(1);
    expect(gepland).toContain("SEQUENCE:0");
    expect(gepland).not.toContain("STATUS:CANCELLED");
    expect(ingetrokken).toContain("UID:p-2@postwright.local");
    expect(ingetrokken).toContain("SEQUENCE:1");
    expect(ingetrokken).toContain("STATUS:CANCELLED");
    expect(ingetrokken).not.toContain("VALARM");
  });

  it("geeft een geldige lege agenda zonder afspraken", () => {
    const ics = maakIcs([], { basisUrl: "https://postwright.example", merknaam: "Ander Merk" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Marketing Ander Merk");
    expect(ics).not.toContain("VEVENT");
  });
});
