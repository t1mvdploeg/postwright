// A PDF from images, for a LinkedIn document post (carousel).
//
// Why from images and not from HTML: a large `box-shadow` that falls over another element
// becomes a grey block in Chrome's PDF output. The PDF is therefore made from images,
// using JPEGs (DCTDecode), because a PDF can embed those without conversion. One page per
// slide, 1 px = 1 pt; LinkedIn scales it itself.

const enc = new TextEncoder();

/**
 * A text as a PDF string: ASCII as it is, otherwise UTF-16BE with BOM (for accents in the
 * title).
 */
function pdfText(t) {
  if (/^[\x20-\x7e]*$/.test(t)) return `(${t.replace(/[\\()]/g, "\\$&")})`;
  let hex = "FEFF";
  for (const char of t) {
    const code = char.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      hex += ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)).toUpperCase();
    } else hex += code.toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

/**
 * @param {Array<{ jpeg: Uint8Array, width: number, height: number }>} pages
 * @param {{ title?: string }} options
 * @returns {Uint8Array}
 */
export function createPdf(pages, { title = "" } = {}) {
  if (!pages.length) throw new Error("A PDF needs at least one page");
  const chunks = [];
  const offsets = [];
  let length = 0;
  const write = (d) => {
    const b = typeof d === "string" ? enc.encode(d) : d;
    chunks.push(b);
    length += b.length;
  };
  const object = (nr, content) => {
    offsets[nr] = length;
    write(`${nr} 0 obj\n`);
    content();
    write("\nendobj\n");
  };

  // Object numbers: 1 catalogue, 2 pages, 3 info, then three per page: page, image, content.
  const pageNr = (i) => 4 + i * 3;
  write("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, () => write("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    write(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNr(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`),
  );
  object(3, () => write(`<< /Title ${pdfText(title)} /Producer (Postwright) >>`));
  pages.forEach((p, i) => {
    const nr = pageNr(i);
    object(nr, () =>
      write(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources << /XObject << /Im${i} ${nr + 1} 0 R >> >> /Contents ${nr + 2} 0 R >>`,
      ),
    );
    object(nr + 1, () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      );
      write(p.jpeg);
      write("\nendstream");
    });
    const content = `q ${p.width} 0 0 ${p.height} 0 0 cm /Im${i} Do Q`;
    object(nr + 2, () => write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let nr = 1; nr < count; nr++) write(`${String(offsets[nr]).padStart(10, "0")} 00000 n \n`);
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let p = 0;
  for (const d of chunks) {
    out.set(d, p);
    p += d.length;
  }
  return out;
}
