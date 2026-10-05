// Marketingstudio — een ZIP in de browser, zonder afhankelijkheid. PNG's en PDF's zijn al
// gecomprimeerd, dus "stored" (methode 0) is genoeg: lokale headers, de bytes, een centrale
// directory en het slotrecord. `fflate` staat wel in package.json, maar wordt niet naar de browser
// geserveerd (er is geen bundler); de test pakt deze ZIP juist met fflate uit.

let crcTabel = null;

/** CRC-32 (IEEE 802.3), zoals ZIP hem eist. */
export function crc32(bytes) {
  if (!crcTabel) {
    crcTabel = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTabel[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTabel[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** De DOS-tijd en -datum die ZIP per bestand bewaart. */
function dosTijd(d) {
  return {
    tijd: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Maakt een ZIP van `[{ naam, bytes }]` (bytes als Uint8Array, of een string die als UTF-8 gaat).
 * Namen zijn UTF-8 (vlag 0x0800), zodat een accent in een bestandsnaam overal goed aankomt.
 * @returns {Uint8Array}
 */
export function maakZip(bestanden, nu = new Date()) {
  const enc = new TextEncoder();
  const { tijd, datum } = dosTijd(nu);
  const lokaal = [];
  const centraal = [];
  let offset = 0;
  for (const b of bestanden) {
    const naam = enc.encode(b.naam);
    const data = typeof b.bytes === "string" ? enc.encode(b.bytes) : b.bytes;
    const crc = crc32(data);
    const kop = new DataView(new ArrayBuffer(30));
    kop.setUint32(0, 0x04034b50, true);
    kop.setUint16(4, 20, true);
    kop.setUint16(6, 0x0800, true);
    kop.setUint16(8, 0, true);
    kop.setUint16(10, tijd, true);
    kop.setUint16(12, datum, true);
    kop.setUint32(14, crc, true);
    kop.setUint32(18, data.length, true);
    kop.setUint32(22, data.length, true);
    kop.setUint16(26, naam.length, true);
    kop.setUint16(28, 0, true);
    lokaal.push(new Uint8Array(kop.buffer), naam, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, tijd, true);
    c.setUint16(14, datum, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, naam.length, true);
    c.setUint32(42, offset, true);
    centraal.push(new Uint8Array(c.buffer), naam);
    offset += 30 + naam.length + data.length;
  }
  const centraalGrootte = centraal.reduce((s, d) => s + d.length, 0);
  const slot = new DataView(new ArrayBuffer(22));
  slot.setUint32(0, 0x06054b50, true);
  slot.setUint16(8, bestanden.length, true);
  slot.setUint16(10, bestanden.length, true);
  slot.setUint32(12, centraalGrootte, true);
  slot.setUint32(16, offset, true);
  const delen = [...lokaal, ...centraal, new Uint8Array(slot.buffer)];
  const uit = new Uint8Array(delen.reduce((s, d) => s + d.length, 0));
  let p = 0;
  for (const d of delen) { uit.set(d, p); p += d.length; }
  return uit;
}
