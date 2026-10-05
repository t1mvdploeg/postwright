// Loading the brand in the browser: the active brand from
// `GET /api/brand`, the logos and the font as data URIs. An image in a foreignObject must
// not fetch anything from outside (the image stays empty or the canvas gets "tainted");
// with everything embedded, preview equals export. The files come from `/brand/`: the
// folder `data/projects/<slug>/brand/` if a custom brand is there.

let brandPromise = null;
const mediaCache = new Map();

/**
 * A blob as a data URI. Via arrayBuffer and btoa (in chunks, otherwise the stack
 * overflows), so that it also works in Node.
 */
export async function asDataUri(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

async function getDataUri(path, type) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return asDataUri(new Blob([await r.arrayBuffer()], { type }));
}

const FONT_FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
const FONT_MIME = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
const BRAND_FOLDER = "/brand";

/**
 * The brand, loaded once per page. The font is one variable file for all weights (or
 * several files that together form the family); both are embedded as @font-face.
 */
export function loadBrand() {
  brandPromise ??= (async () => {
    const r = await fetch("/api/brand");
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The brand could not be loaded");
    const m = await r.json();
    const logos = Object.fromEntries(
      await Promise.all(
        Object.entries(m.logos).map(async ([mode, path]) => [
          mode,
          await getDataUri(`${BRAND_FOLDER}/${path}`, "image/svg+xml"),
        ]),
      ),
    );
    const family = m.font.family.replace(/["\\]/g, "");
    const fontFaces = await Promise.all(
      m.font.files.map((path) => {
        const ext = path.split(".").pop().toLowerCase();
        return getDataUri(`${BRAND_FOLDER}/${path}`, FONT_MIME[ext] ?? "application/octet-stream").then(
          (src) =>
            `@font-face { font-family: "${family}"; font-style: normal; font-weight: 100 900; src: url("${src}") format("${FONT_FORMAT[ext] ?? "woff2"}"); }`,
        );
      }),
    );
    return { ...m, logos, fontCss: fontFaces.join("\n") };
  })();
  brandPromise.catch(() => {
    brandPromise = null;
  });
  return brandPromise;
}

/**
 * Uploaded images as data URIs, scaled down to at most `maxSide` pixels: a 5 MB photo as
 * base64 in an SVG makes rendering slow, and the image is never shown larger than twice
 * the largest format anyway.
 */
export async function loadMedia(ids, maxSide = 3200) {
  const out = {};
  await Promise.all(
    [...new Set(ids)]
      .filter((id) => /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(id))
      .map(async (id) => {
        if (!mediaCache.has(id)) {
          mediaCache.set(
            id,
            (async () => {
              const r = await fetch(`/api/media/${id}`);
              if (!r.ok) return null;
              const blob = await r.blob();
              const bitmap = await createImageBitmap(blob);
              if (Math.max(bitmap.width, bitmap.height) <= maxSide) {
                bitmap.close();
                return asDataUri(blob);
              }
              const scale = maxSide / Math.max(bitmap.width, bitmap.height);
              const c = document.createElement("canvas");
              c.width = Math.round(bitmap.width * scale);
              c.height = Math.round(bitmap.height * scale);
              c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
              bitmap.close();
              return c.toDataURL(id.endsWith(".png") ? "image/png" : "image/jpeg", 0.92);
            })().catch(() => null),
          );
        }
        const source = await mediaCache.get(id);
        // Do not remember a failed load: otherwise the image stays empty in preview and export
        // until a reload, without a notice. Next time just try again.
        if (source) out[id] = source;
        else mediaCache.delete(id);
      }),
  );
  return out;
}
