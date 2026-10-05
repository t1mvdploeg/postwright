// Marketingstudio — een PDF uit beelden, voor een LinkedIn-documentpost (carrousel).
//
// Waarom uit beelden en niet uit HTML: een grote `box-shadow` die over een ander element valt,
// wordt in Chrome's PDF-uitvoer een grijs vlak (docs/golven/2026-09-24-brand-kit.md, versie Claude). De kit
// maakt de PDF daarom uit de PNG's; de studio doet hetzelfde, met JPEG's (DCTDecode), want die
// kan een PDF zonder omzetting bevatten. Eén pagina per dia, 1 px = 1 pt; LinkedIn schaalt zelf.

const enc = new TextEncoder();

/** Een tekst als PDF-string: ASCII zoals hij is, anders UTF-16BE met BOM (voor accenten in de titel). */
function pdfTekst(t) {
  if (/^[\x20-\x7e]*$/.test(t)) return `(${t.replace(/[\\()]/g, "\\$&")})`;
  let hex = "FEFF";
  for (const teken of t) {
    const code = teken.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      hex += ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)).toUpperCase();
    } else hex += code.toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

/**
 * @param {Array<{ jpeg: Uint8Array, breedte: number, hoogte: number }>} paginas
 * @param {{ titel?: string }} opties
 * @returns {Uint8Array}
 */
export function maakPdf(paginas, { titel = "" } = {}) {
  if (!paginas.length) throw new Error("Een PDF heeft minstens één pagina nodig");
  const delen = [];
  const offsets = [];
  let lengte = 0;
  const schrijf = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; delen.push(b); lengte += b.length; };
  const object = (nr, inhoud) => { offsets[nr] = lengte; schrijf(`${nr} 0 obj\n`); inhoud(); schrijf("\nendobj\n"); };

  // Objectnummers: 1 catalogus, 2 pagina's, 3 info, daarna per pagina drie: pagina, beeld, inhoud.
  const paginaNr = (i) => 4 + i * 3;
  schrijf("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, () => schrijf("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => schrijf(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${paginaNr(i)} 0 R`).join(" ")}] /Count ${paginas.length} >>`));
  object(3, () => schrijf(`<< /Title ${pdfTekst(titel)} /Producer (Mijntarieftool Marketingstudio) >>`));
  paginas.forEach((p, i) => {
    const nr = paginaNr(i);
    object(nr, () => schrijf(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.breedte} ${p.hoogte}] /Resources << /XObject << /Im${i} ${nr + 1} 0 R >> >> /Contents ${nr + 2} 0 R >>`));
    object(nr + 1, () => {
      schrijf(`<< /Type /XObject /Subtype /Image /Width ${p.breedte} /Height ${p.hoogte} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      schrijf(p.jpeg);
      schrijf("\nendstream");
    });
    const inhoud = `q ${p.breedte} 0 0 ${p.hoogte} 0 0 cm /Im${i} Do Q`;
    object(nr + 2, () => schrijf(`<< /Length ${inhoud.length} >>\nstream\n${inhoud}\nendstream`));
  });
  const aantal = 4 + paginas.length * 3;
  const xref = lengte;
  schrijf(`xref\n0 ${aantal}\n0000000000 65535 f \n`);
  for (let nr = 1; nr < aantal; nr++) schrijf(`${String(offsets[nr]).padStart(10, "0")} 00000 n \n`);
  schrijf(`trailer\n<< /Size ${aantal} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const uit = new Uint8Array(lengte);
  let p = 0;
  for (const d of delen) { uit.set(d, p); p += d.length; }
  return uit;
}
