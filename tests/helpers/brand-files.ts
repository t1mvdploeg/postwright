// Small files with exactly the bytes the brand-kit uploads look at, and nothing more.

export const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#d63e22"/></svg>';

/** A PNG header with a size: enough for the upload checks (there are no pixels). */
export function pngHeader(width = 1, height = 1): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = 6;
  return b;
}

/** A WebP (VP8X) header with a size; every width gives a different file. */
export function webpHeader(width = 1, height = 1, extra = 0): Buffer {
  const b = Buffer.alloc(30 + extra);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

export const pdf = (extra = 0) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(extra)]);

const MAGIC = {
  woff2: Buffer.from("wOF2"),
  woff: Buffer.from("wOFF"),
  ttf: Buffer.from([0, 1, 0, 0]),
  otf: Buffer.from("OTTO"),
};
export const font = (kind: keyof typeof MAGIC, extra = 32) => Buffer.concat([MAGIC[kind], Buffer.alloc(extra)]);
