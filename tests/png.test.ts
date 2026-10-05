import { crc32, deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readPng, silhouettePng, writePng } from "../src/server/png.js";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** The PNG rule for a predictor, written out from the specification. */
function predictor(type: number, a: number, b: number, c: number): number {
  if (type === 1) return a;
  if (type === 2) return b;
  if (type === 3) return Math.floor((a + b) / 2);
  if (type === 4) {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  return 0;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface Spec {
  width: number;
  height: number;
  colour: number;
  depth: number;
  rows: number[][]; // the pixel bytes of each row, unfiltered
  filters?: number[]; // the filter type per row
  interlace?: number;
  plte?: number[];
  trns?: number[];
}

function png(o: Spec): Buffer {
  const bpp = Math.max(1, (CHANNELS[o.colour] * o.depth) >> 3);
  const raw: number[] = [];
  o.rows.forEach((row, y) => {
    const type = o.filters?.[y] ?? 0;
    const prev = o.rows[y - 1] ?? row.map(() => 0);
    raw.push(
      type,
      ...row.map((v, i) => {
        const a = i >= bpp ? row[i - bpp] : 0;
        const c = i >= bpp ? prev[i - bpp] : 0;
        return (v - predictor(type, a, prev[i], c) + 256) & 255;
      }),
    );
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0);
  ihdr.writeUInt32BE(o.height, 4);
  ihdr[8] = o.depth;
  ihdr[9] = o.colour;
  ihdr[12] = o.interlace ?? 0;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    ...(o.plte ? [chunk("PLTE", Buffer.from(o.plte))] : []),
    ...(o.trns ? [chunk("tRNS", Buffer.from(o.trns))] : []),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The pixels of a PNG made by `writePng` (filter 0 only). */
function pixelsOf(b: Buffer): { rgba: number[]; alpha: number[] } {
  const data: Buffer[] = [];
  let width = 0;
  for (let i = 8; i < b.length;) {
    const length = b.readUInt32BE(i);
    const type = b.toString("latin1", i + 4, i + 8);
    if (type === "IHDR") width = b.readUInt32BE(i + 8);
    if (type === "IDAT") data.push(b.subarray(i + 8, i + 8 + length));
    i += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const rgba: number[] = [];
  const stride = width * 4 + 1;
  for (let y = 0; y < raw.length / stride; y++) {
    expect(raw[y * stride]).toBe(0);
    rgba.push(...raw.subarray(y * stride + 1, (y + 1) * stride));
  }
  return { rgba, alpha: rgba.filter((_, i) => i % 4 === 3) };
}

const RGBA_ROWS = [
  [255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255],
  [10, 20, 30, 255, 40, 50, 60, 10, 70, 80, 90, 0],
];
const RGBA_ALPHA = [0, 128, 255, 255, 10, 0];

describe("readPng", () => {
  it.each([
    ["Sub then Paeth", [1, 4]],
    ["Up then Average", [2, 3]],
    ["no filter", [0, 0]],
    ["Paeth then Sub", [4, 1]],
  ])("reads the alpha of an RGBA image with filters %s", (_name, filters) => {
    const r = readPng(png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS, filters }));
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ width: 3, height: 2 });
    expect(Array.from(r!.alpha!)).toEqual(RGBA_ALPHA);
  });

  it("reads grey with alpha", () => {
    const rows = [
      [100, 255, 120, 0],
      [130, 64, 140, 200],
    ];
    const r = readPng(png({ width: 2, height: 2, colour: 4, depth: 8, rows, filters: [3, 2] }));
    expect(Array.from(r!.alpha!)).toEqual([255, 0, 64, 200]);
  });

  it("reads 16-bit alpha as its high byte", () => {
    const rows = [[0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0x80, 0x00]];
    const r = readPng(png({ width: 2, height: 1, colour: 6, depth: 16, rows }));
    expect(Array.from(r!.alpha!)).toEqual([255, 128]);
  });

  it("reads a palette with tRNS, here 2 bits per pixel", () => {
    const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
    const r = readPng(png({ width: 4, height: 1, colour: 3, depth: 2, rows: [[0b00011011]], plte, trns: [0, 128] }));
    expect(Array.from(r!.alpha!)).toEqual([0, 128, 255, 255]);
  });

  it("gives alpha null for images without transparency", () => {
    const rgb = png({ width: 2, height: 1, colour: 2, depth: 8, rows: [[1, 2, 3, 4, 5, 6]] });
    expect(readPng(rgb)).toMatchObject({ width: 2, height: 1, alpha: null });
    const plain = png({ width: 1, height: 1, colour: 3, depth: 8, rows: [[0]], plte: [1, 2, 3] });
    expect(readPng(plain)!.alpha).toBeNull();
  });

  it("gives null for what it does not support", () => {
    expect(readPng(png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS, interlace: 1 }))).toBeNull();
    expect(readPng(png({ width: 1, height: 1, colour: 6, depth: 4, rows: [[0, 0]] }))).toBeNull();
    expect(readPng(Buffer.from("not a png at all, just some text to fill the header"))).toBeNull();
    expect(readPng(Buffer.concat([SIGNATURE, Buffer.from("garbage after the signature, not chunks")]))).toBeNull();
    const truncated = png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS });
    expect(readPng(truncated.subarray(0, truncated.length - 30))).toBeNull();
  });

  it("gives null for an IDAT that inflates beyond what the header allows (decompression bomb)", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const expected = (2 * 4 + 1) * 1;
    const bomb = deflateSync(Buffer.alloc(50_000_000));
    expect(bomb.length).toBeLessThan(100_000);
    const make = (raw: Buffer) =>
      Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    expect(readPng(make(Buffer.alloc(expected)))).not.toBeNull();
    expect(readPng(make(Buffer.alloc(50_000_000)))).toBeNull();
    expect(
      readPng(Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", bomb), chunk("IEND", Buffer.alloc(0))])),
    ).toBeNull();
  });

  it("gives null, without throwing, for an unknown filter type or a missing IDAT", () => {
    const rows = [[0, 0, 0, 0]];
    expect(readPng(png({ width: 1, height: 1, colour: 6, depth: 8, rows, filters: [9] }))).toBeNull();
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    expect(readPng(Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]))).toBeNull();
  });
});

describe("writePng", () => {
  it("round-trips an RGBA image", () => {
    const rgba = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const out = writePng(3, 1, rgba);
    expect(Array.from(readPng(out)!.alpha!)).toEqual([4, 8, 12]);
    expect(pixelsOf(out).rgba).toEqual(Array.from(rgba));
  });
});

describe("silhouettePng", () => {
  it("keeps the alpha and paints every pixel in the colour", () => {
    const source = png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS, filters: [1, 4] });
    const r = silhouettePng(source, "#FF8800");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const { rgba, alpha } = pixelsOf(r.png);
    expect(alpha).toEqual(RGBA_ALPHA);
    for (let i = 0; i < rgba.length; i += 4) expect(rgba.slice(i, i + 3)).toEqual([255, 136, 0]);
  });

  it("says opaque for an image without transparency, or one that is fully opaque", () => {
    const rgb = png({ width: 1, height: 1, colour: 2, depth: 8, rows: [[1, 2, 3]] });
    expect(silhouettePng(rgb, "#FFFFFF")).toEqual({ kind: "opaque" });
    const solid = png({ width: 2, height: 1, colour: 6, depth: 8, rows: [[1, 2, 3, 255, 4, 5, 6, 255]] });
    expect(silhouettePng(solid, "#FFFFFF")).toEqual({ kind: "opaque" });
  });

  it("says unreadable for what the reader cannot handle", () => {
    const interlaced = png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS, interlace: 1 });
    expect(silhouettePng(interlaced, "#FFFFFF")).toEqual({ kind: "unreadable" });
    expect(silhouettePng(Buffer.from("junk"), "#FFFFFF")).toEqual({ kind: "unreadable" });
  });

  it("handles a 16-bit RGBA image: alpha kept, colour replaced", () => {
    const rows = [[0, 0, 0, 0, 0, 0, 0xff, 0xff, 9, 9, 9, 9, 9, 9, 0x80, 0x00]];
    const r = silhouettePng(png({ width: 2, height: 1, colour: 6, depth: 16, rows }), "#102030");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(pixelsOf(r.png).rgba).toEqual([16, 32, 48, 255, 16, 32, 48, 128]);
  });

  it("says opaque for a 16-bit RGB image and for a palette image without tRNS", () => {
    const rgb16 = png({ width: 1, height: 1, colour: 2, depth: 16, rows: [[0, 1, 0, 2, 0, 3]] });
    expect(silhouettePng(rgb16, "#FFFFFF")).toEqual({ kind: "opaque" });
    const plain = png({ width: 1, height: 1, colour: 3, depth: 8, rows: [[0]], plte: [1, 2, 3] });
    expect(silhouettePng(plain, "#FFFFFF")).toEqual({ kind: "opaque" });
  });

  it("says unreadable for a truncated file, without throwing", () => {
    const good = png({ width: 3, height: 2, colour: 6, depth: 8, rows: RGBA_ROWS });
    expect(silhouettePng(good.subarray(0, good.length - 30), "#FFFFFF")).toEqual({ kind: "unreadable" });
  });
});
