// The export modules that run in the browser: ZIP (stored), PDF from
// JPEGs and the calendar export (.ics). All pure; tested here against the structure that
// other programs read.
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { crc32, createZip } from "../src/web/studio/zip.js";
import { createPdf } from "../src/web/studio/pdf.js";
import { icsText, icsTime, createIcs, fold } from "../src/web/studio/ics.js";

const enc = new TextEncoder();

describe("zip", () => {
  it("calculates the CRC-32 of a known text", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("delivers a ZIP that fflate unpacks to the same names and bytes, also with accents", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250]);
    const zip = createZip(
      [
        { name: "postwright_statement_li-square_1200x1200.png", bytes: png },
        { name: "caption café.txt", bytes: "Seen enough. Your turn has come." },
      ],
      new Date(2026, 8, 24, 13, 30, 10),
    );
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["postwright_statement_li-square_1200x1200.png", "caption café.txt"]);
    expect([...files["postwright_statement_li-square_1200x1200.png"]]).toEqual([...png]);
    expect(strFromU8(files["caption café.txt"])).toBe("Seen enough. Your turn has come.");
  });

  it("makes a valid empty ZIP", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(Object.keys(unzipSync(zip))).toEqual([]);
  });
});

describe("pdf", () => {
  // The header of a JPEG is enough: the PDF does not check the image bytes, it only carries
  // them.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]);
  const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

  it("has one page per slide with the right MediaBox and the JPEG unchanged in the stream", () => {
    const pdf = createPdf(
      [
        { jpeg, width: 1080, height: 1350 },
        { jpeg, width: 1080, height: 1350 },
      ],
      { title: "Carousel" },
    );
    const t = text(pdf);
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t).toContain("/Count 2");
    expect(t.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(t).toContain("/MediaBox [0 0 1080 1350]");
    expect(t).toContain("/Filter /DCTDecode");
    expect(t).toContain(text(jpeg));
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("has an xref whose every offset points to the start of its object", () => {
    const pdf = createPdf([
      { jpeg, width: 1200, height: 1200 },
      { jpeg, width: 1200, height: 1200 },
      { jpeg, width: 1200, height: 1200 },
    ]);
    const t = text(pdf);
    const startxref = Number(t.match(/startxref\n(\d+)\n/)![1]);
    expect(t.slice(startxref, startxref + 4)).toBe("xref");
    const [, count] = t.slice(startxref).match(/xref\n0 (\d+)\n/)!;
    const lines = t
      .slice(startxref)
      .split("\n")
      .slice(3, 2 + Number(count));
    lines.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(t.slice(offset, offset + `${i + 1} 0 obj`.length), `object ${i + 1}`).toBe(`${i + 1} 0 obj`);
    });
  });

  it("writes a title with accents as UTF-16 and refuses a PDF without pages", () => {
    const t = text(createPdf([{ jpeg, width: 10, height: 10 }], { title: "Één" }));
    expect(t).toContain("/Title <FEFF00C900E9006E>");
    expect(text(createPdf([{ jpeg, width: 10, height: 10 }], { title: "A (b)" }))).toContain("/Title (A \\(b\\))");
    expect(() => createPdf([])).toThrow(/at least one page/);
  });
});

describe("ics", () => {
  it("escapes according to RFC 5545", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });

  it("folds at 75 octets without splitting a UTF-8 character", () => {
    const line = `SUMMARY:${"a".repeat(66)}ëëëë`;
    const folded = fold(line);
    for (const part of folded.split("\r\n")) expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((d, i) => (i ? d.slice(1) : d))
        .join(""),
    ).toBe(line);
    expect(fold("short")).toBe("short");
  });

  it("converts times to UTC, also across the change to winter time", () => {
    expect(icsTime("2026-10-24T09:30:00+02:00")).toBe("20261024T073000Z");
    expect(icsTime("2026-10-26T09:30:00+01:00")).toBe("20261026T083000Z");
    expect(() => icsTime("tomorrow")).toThrow(/Invalid/);
  });

  it("makes an event per scheduled post with fixed UID, reminder and link, with CRLF", () => {
    const ics = createIcs(
      [
        {
          id: "p-1",
          title: "Statement, accent",
          scheduled: "2026-10-06T08:30:00+02:00",
          caption: { linkedin: "Seen enough." },
        },
        { id: "p-2", title: "Without date", scheduled: null },
      ],
      { baseUrl: "https://postwright.example", brandName: "Postwright", now: new Date("2026-10-01T00:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:p-1@postwright.local");
    expect(ics).toContain("DTSTART:20261006T063000Z");
    expect(ics).toContain("DTEND:20261006T064500Z");
    expect(ics).toContain("SUMMARY:Post: Statement\\, accent");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics.replace(/\r\n /g, "")).toContain("URL:https://postwright.example/#editor/p-1");
    expect(ics.split("\r\n").every((r) => !r.includes("\n"))).toBe(true);
  });

  it("withdraws an event for a post that is no longer scheduled", () => {
    const ics = createIcs(
      [
        { id: "p-1", title: "Scheduled", scheduled: "2026-10-06T08:30:00+02:00", status: "scheduled" },
        { id: "p-2", title: "Back to draft", scheduled: "2026-10-07T08:30:00+02:00", status: "draft" },
      ],
      { baseUrl: "https://postwright.example", brandName: "Postwright" },
    );
    const [scheduled, withdrawn] = ics.split("BEGIN:VEVENT").slice(1);
    expect(scheduled).toContain("SEQUENCE:0");
    expect(scheduled).not.toContain("STATUS:CANCELLED");
    expect(withdrawn).toContain("UID:p-2@postwright.local");
    expect(withdrawn).toContain("SEQUENCE:1");
    expect(withdrawn).toContain("STATUS:CANCELLED");
    expect(withdrawn).not.toContain("VALARM");
  });

  it("gives a valid empty calendar without events", () => {
    const ics = createIcs([], { baseUrl: "https://postwright.example", brandName: "Other Brand" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Marketing Other Brand");
    expect(ics).not.toContain("VEVENT");
  });
});
