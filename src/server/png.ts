// A small PNG reader and writer on `node:zlib`, for one job: the logo variants. It reads the
// alpha channel (that is all a single-colour logo needs) and writes an RGBA image. What it
// cannot read (Adam7, odd bit depths, damaged data, a decompression bomb) is reported as unsupported, and the
// caller falls back to the original file.
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXELS = 16_000_000;
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export interface PngAlpha {
  width: number;
  height: number;
  /** One byte per pixel; `null` when the image has no transparency at all. */
  alpha: Uint8Array | null;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw: Buffer, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = y > 0 ? dst - stride : -1;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const above = up >= 0 ? out[up + x] : 0;
      const corner = x >= bpp && up >= 0 ? out[up + x - bpp] : 0;
      let add: number;
      if (type === 0) add = 0;
      else if (type === 1) add = left;
      else if (type === 2) add = above;
      else if (type === 3) add = (left + above) >> 1;
      else if (type === 4) add = paeth(left, above, corner);
      else throw new Error("unknown filter");
      out[dst + x] = (raw[src + x] + add) & 255;
    }
  }
  return out;
}

export function readPng(b: Buffer): PngAlpha | null {
  if (b.length < 33 || !b.subarray(0, 8).equals(SIGNATURE)) return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = -1;
  let interlace = 0;
  let trns: Buffer | null = null;
  const data: Buffer[] = [];
  for (let i = 8; i + 8 <= b.length;) {
    const length = b.readUInt32BE(i);
    const type = b.toString("latin1", i + 4, i + 8);
    const body = b.subarray(i + 8, i + 8 + length);
    if (body.length < length) return null; // cut off
    if (type === "IHDR" && length >= 13) {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === "tRNS") trns = body;
    else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    i += 12 + length;
  }
  const channels = CHANNELS[colour];
  if (!channels || !width || !height || interlace !== 0 || width * height > MAX_PIXELS) return null;
  const hasAlphaChannel = colour === 4 || colour === 6;
  const palette = colour === 3;
  if (!hasAlphaChannel && !(palette && trns)) return { width, height, alpha: null };
  if (palette ? ![1, 2, 4, 8].includes(depth) : depth !== 8 && depth !== 16) return null;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  let pixels: Uint8Array;
  try {
    // The header says how much data to expect; more than that is a decompression bomb.
    const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height });
    if (raw.length < (stride + 1) * height) return null;
    pixels = unfilter(raw, height, stride, Math.max(1, bitsPerPixel >> 3));
  } catch {
    return null;
  }
  const alpha = new Uint8Array(width * height);
  const sample = depth >> 3; // bytes per sample, for 8 and 16 bits
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = y * stride;
      if (hasAlphaChannel) {
        alpha[y * width + x] = pixels[row + x * channels * sample + (channels - 1) * sample];
      } else {
        const bit = x * depth;
        const index = (pixels[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        alpha[y * width + x] = trns && index < trns.length ? trns[index] : 255;
      }
    }
  }
  return { width, height, alpha };
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** An RGBA image (8 bits per channel, no filtering). */
export function writePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export type PngSilhouette = { kind: "ok"; png: Buffer } | { kind: "opaque" } | { kind: "unreadable" };

/**
 * The logo as a single colour: the alpha of `b`, every pixel in `hex` (#rrggbb). A PNG
 * without transparency has no shape to fill (`opaque`); one the reader cannot handle is
 * `unreadable`.
 */
export function silhouettePng(b: Buffer, hex: string): PngSilhouette {
  const info = readPng(b);
  if (!info) return { kind: "unreadable" };
  const { width, height, alpha } = info;
  if (!alpha || alpha.every((a) => a === 255)) return { kind: "opaque" };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const bl = parseInt(hex.slice(5, 7), 16);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < alpha.length; i++) rgba.set([r, g, bl, alpha[i]], i * 4);
  return { kind: "ok", png: writePng(width, height, rgba) };
}
