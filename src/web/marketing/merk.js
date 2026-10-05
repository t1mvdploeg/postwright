// Marketingstudio — het merk laden in de browser: het actieve merk van `GET /api/merk`, de logo's
// en het lettertype als data-URI. Een beeld in een foreignObject mag niets van buiten ophalen (dan
// blijft het leeg of wordt het canvas "vervuild"); met alles ingebed is voorbeeld gelijk aan export.
// De bestanden komen van `/marketing/merk/`: de map `data/brand` als daar een eigen merk staat.

let merkBelofte = null;
const mediaCache = new Map();

/** Een blob als data-URI. Via arrayBuffer en btoa (in stukken, anders loopt de stack vol), zodat het ook in Node werkt. */
export async function alsDataUri(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

async function haalDataUri(pad, type) {
  const r = await fetch(pad);
  if (!r.ok) throw new Error(`Kon ${pad} niet laden (${r.status})`);
  return alsDataUri(new Blob([await r.arrayBuffer()], { type }));
}

const LETTERTYPE_FORMAAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
const LETTERTYPE_MIME = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
const MERK_MAP = "/marketing/merk";

/**
 * Het merk, één keer per pagina geladen. Het lettertype is één variabel bestand voor alle gewichten
 * (of meerdere bestanden die samen de familie vormen); beide worden als @font-face ingebed.
 */
export function laadMerk() {
  merkBelofte ??= (async () => {
    const r = await fetch("/api/merk");
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.fout ?? "Het merk kon niet worden geladen");
    const m = await r.json();
    const logos = Object.fromEntries(await Promise.all(Object.entries(m.logos)
      .map(async ([stand, pad]) => [stand, await haalDataUri(`${MERK_MAP}/${pad}`, "image/svg+xml")])));
    const familie = m.lettertype.familie.replace(/["\\]/g, "");
    const letters = await Promise.all(m.lettertype.bestanden.map((pad) => {
      const ext = pad.split(".").pop().toLowerCase();
      return haalDataUri(`${MERK_MAP}/${pad}`, LETTERTYPE_MIME[ext] ?? "application/octet-stream")
        .then((src) => `@font-face { font-family: "${familie}"; font-style: normal; font-weight: 100 900; src: url("${src}") format("${LETTERTYPE_FORMAAT[ext] ?? "woff2"}"); }`);
    }));
    return { ...m, logos, lettertypeCss: letters.join("\n") };
  })();
  merkBelofte.catch(() => { merkBelofte = null; });
  return merkBelofte;
}

/**
 * Geüploade beelden als data-URI, verkleind tot hooguit `maxZijde` pixels: een foto van 5 MB als
 * base64 in een SVG maakt tekenen traag, en groter dan twee keer het grootste formaat wordt het
 * beeld toch niet.
 */
export async function laadMedia(ids, maxZijde = 3200) {
  const uit = {};
  await Promise.all([...new Set(ids)].filter((id) => /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(id)).map(async (id) => {
    if (!mediaCache.has(id)) {
      mediaCache.set(id, (async () => {
        const r = await fetch(`/api/media/${id}`);
        if (!r.ok) return null;
        const blob = await r.blob();
        const bitmap = await createImageBitmap(blob);
        if (Math.max(bitmap.width, bitmap.height) <= maxZijde) { bitmap.close(); return alsDataUri(blob); }
        const schaal = maxZijde / Math.max(bitmap.width, bitmap.height);
        const c = document.createElement("canvas");
        c.width = Math.round(bitmap.width * schaal);
        c.height = Math.round(bitmap.height * schaal);
        c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
        bitmap.close();
        return c.toDataURL(id.endsWith(".png") ? "image/png" : "image/jpeg", 0.92);
      })().catch(() => null));
    }
    const bron = await mediaCache.get(id);
    // Een mislukte lading niet onthouden: anders blijft het beeld tot een herlaad leeg in voorbeeld
    // én export, zonder melding. De volgende keer gewoon opnieuw proberen.
    if (bron) uit[id] = bron; else mediaCache.delete(id);
  }));
  return uit;
}
