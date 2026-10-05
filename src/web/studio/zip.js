// A ZIP in the browser, without a dependency. PNGs and PDFs are already
// compressed, so "stored" (method 0) is enough: local headers, the bytes, a central
// directory and the end record. `fflate` is in package.json but is not served to the
// browser (there is no bundler); the test deliberately unpacks this ZIP with fflate.

let crcTable = null;

/** CRC-32 (IEEE 802.3), as ZIP requires it. */
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The DOS time and date that ZIP stores per file. */
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Makes a ZIP from `[{ name, bytes }]` (bytes as a Uint8Array, or a string that goes in as
 * UTF-8). Names are UTF-8 (flag 0x0800), so that an accent in a file name arrives
 * correctly everywhere.
 * @returns {Uint8Array}
 */
export function createZip(files, now = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosTime(now);
  const local = [];
  const central = [];
  let offset = 0;
  for (const b of files) {
    const name = enc.encode(b.name);
    const data = typeof b.bytes === "string" ? enc.encode(b.bytes) : b.bytes;
    const crc = crc32(data);
    const headline = new DataView(new ArrayBuffer(30));
    headline.setUint32(0, 0x04034b50, true);
    headline.setUint16(4, 20, true);
    headline.setUint16(6, 0x0800, true);
    headline.setUint16(8, 0, true);
    headline.setUint16(10, time, true);
    headline.setUint16(12, date, true);
    headline.setUint32(14, crc, true);
    headline.setUint32(18, data.length, true);
    headline.setUint32(22, data.length, true);
    headline.setUint16(26, name.length, true);
    headline.setUint16(28, 0, true);
    local.push(new Uint8Array(headline.buffer), name, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((s, d) => s + d.length, 0);
  const slot = new DataView(new ArrayBuffer(22));
  slot.setUint32(0, 0x06054b50, true);
  slot.setUint16(8, files.length, true);
  slot.setUint16(10, files.length, true);
  slot.setUint32(12, centralSize, true);
  slot.setUint32(16, offset, true);
  const chunks = [...local, ...central, new Uint8Array(slot.buffer)];
  const out = new Uint8Array(chunks.reduce((s, d) => s + d.length, 0));
  let p = 0;
  for (const d of chunks) {
    out.set(d, p);
    p += d.length;
  }
  return out;
}
