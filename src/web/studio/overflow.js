// The overflow measurement. Whether a text block falls outside the
// image, touches another text block or sits in a safe zone can only be seen in a real
// layout. This module therefore renders every format at true size in a hidden iframe and
// measures the elements with `data-field`. A scaled preview does not measure reliably
// (rounding, subpixels).
import { documentHtml } from "./render.js";
import { overlaps } from "./formats.js";

const FIXED_NAMES = { footer: "the footer line", source: "the source", chain: "the chain" };

let pool = [];

function freeIframe() {
  const free = pool.find((f) => !f.dataset.occupied);
  if (free) {
    free.dataset.occupied = "1";
    return free;
  }
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-same-origin");
  f.setAttribute("aria-hidden", "true");
  f.setAttribute("tabindex", "-1");
  f.className = "studio-measure-iframe";
  f.dataset.occupied = "1";
  document.body.append(f);
  pool.push(f);
  return f;
}

function load(iframe, html) {
  return new Promise((ok) => {
    const resolve = () => {
      iframe.removeEventListener("load", resolve);
      ok();
    };
    iframe.addEventListener("load", resolve);
    iframe.srcdoc = html;
  });
}

/**
 * Measures one image. `names` translates a `data-field` to a readable name ("the headline").
 * @returns {Promise<Array<{ format: string, slide: number|null, field: string, fieldId: string, kind: string, reason?: string, with?: string }>>}
 */
export async function measureOverflow(image, format, { slide = null, names = {} } = {}) {
  const iframe = freeIframe();
  try {
    iframe.style.width = `${image.width}px`;
    iframe.style.height = `${image.height}px`;
    await load(iframe, documentHtml(image));
    const doc = iframe.contentDocument;
    if (!doc) return [];
    await doc.fonts?.ready;
    const imageEl = doc.querySelector(".image");
    if (!imageEl) return [];
    const b = imageEl.getBoundingClientRect();
    const name = (id) => names[id] ?? FIXED_NAMES[id] ?? id;
    const elements = [...doc.querySelectorAll("[data-field]")]
      .map((el) => ({ el, id: el.getAttribute("data-field"), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height > 0);
    const off = [];
    const rel = (r) => ({ x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height });
    for (const x of elements) {
      const r = rel(x.r);
      // Only the position of the block counts, not scrollHeight: headlines have line-height
      // 1.03, so the letters always stick out a fraction beyond their line box without anything
      // being cut off (the first browser check therefore gave a false alarm on every headline).
      if (r.x < -1 || r.y < -1 || r.x + r.width > b.width + 1 || r.y + r.height > b.height + 1) {
        off.push({ format: format.key, slide, field: name(x.id), fieldId: x.id, kind: "outside-image" });
        continue;
      }
      for (const z of format.safeZones) {
        if (overlaps(r, z, 1)) {
          off.push({
            format: format.key,
            slide,
            field: name(x.id),
            fieldId: x.id,
            kind: "safe-zone",
            reason: z.reason,
          });
          break;
        }
      }
    }
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const c = elements[j];
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        if (overlaps(rel(a.r), rel(c.r), 2))
          off.push({
            format: format.key,
            slide,
            field: name(a.id),
            fieldId: a.id,
            kind: "overlap",
            with: name(c.id),
          });
      }
    }
    return off;
  } finally {
    delete iframe.dataset.occupied;
  }
}

/** Cleans up the measuring frames (when leaving the editor). */
export function removeMeasureFrames() {
  for (const f of pool) f.remove();
  pool = [];
}
