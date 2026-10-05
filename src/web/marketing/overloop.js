// Marketingstudio — de overloopmeting. Of een tekstblok buiten het beeld valt, een ander tekstblok
// raakt of in een veilige zone staat, is alleen in een echte opmaak te zien. Daarom rendert deze
// module elk formaat op ware grootte in een verborgen iframe en meet de elementen met `data-veld`.
// Een geschaald voorbeeld meet niet betrouwbaar (afronding, subpixels).
import { documentHtml } from "./render.js";
import { overlapt } from "./formaten.js";

const VASTE_NAMEN = { voet: "de voetregel", bron: "de bron", keten: "de keten" };

let pool = [];

function vrijIframe() {
  const vrij = pool.find((f) => !f.dataset.bezet);
  if (vrij) {
    vrij.dataset.bezet = "1";
    return vrij;
  }
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-same-origin");
  f.setAttribute("aria-hidden", "true");
  f.setAttribute("tabindex", "-1");
  f.className = "studio-meet-iframe";
  f.dataset.bezet = "1";
  document.body.append(f);
  pool.push(f);
  return f;
}

function laad(iframe, html) {
  return new Promise((ok) => {
    const klaar = () => {
      iframe.removeEventListener("load", klaar);
      ok();
    };
    iframe.addEventListener("load", klaar);
    iframe.srcdoc = html;
  });
}

/**
 * Meet één beeld. `namen` vertaalt een `data-veld` naar een leesbare naam ("de kop").
 * @returns {Promise<Array<{ formaat: string, dia: number|null, veld: string, veldId: string, soort: string, reden?: string, met?: string }>>}
 */
export async function meetOverloop(beeld, formaat, { dia = null, namen = {} } = {}) {
  const iframe = vrijIframe();
  try {
    iframe.style.width = `${beeld.breedte}px`;
    iframe.style.height = `${beeld.hoogte}px`;
    await laad(iframe, documentHtml(beeld));
    const doc = iframe.contentDocument;
    if (!doc) return [];
    await doc.fonts?.ready;
    const beeldEl = doc.querySelector(".beeld");
    if (!beeldEl) return [];
    const b = beeldEl.getBoundingClientRect();
    const naam = (id) => namen[id] ?? VASTE_NAMEN[id] ?? id;
    const elementen = [...doc.querySelectorAll("[data-veld]")]
      .map((el) => ({ el, id: el.getAttribute("data-veld"), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height > 0);
    const uit = [];
    const rel = (r) => ({ x: r.left - b.left, y: r.top - b.top, breedte: r.width, hoogte: r.height });
    for (const x of elementen) {
      const r = rel(x.r);
      // Alleen de positie van het blok telt, niet scrollHeight: de kit zet koppen op line-height
      // 1,03, dus de letters steken altijd een fractie buiten hun regelvak zonder dat er iets
      // wegvalt (de eerste browsercontrole gaf daardoor op elke kop een vals alarm).
      if (r.x < -1 || r.y < -1 || r.x + r.breedte > b.width + 1 || r.y + r.hoogte > b.height + 1) {
        uit.push({ formaat: formaat.sleutel, dia, veld: naam(x.id), veldId: x.id, soort: "buiten-beeld" });
        continue;
      }
      for (const z of formaat.veiligeZones) {
        if (overlapt(r, z, 1)) {
          uit.push({
            formaat: formaat.sleutel,
            dia,
            veld: naam(x.id),
            veldId: x.id,
            soort: "veilige-zone",
            reden: z.reden,
          });
          break;
        }
      }
    }
    for (let i = 0; i < elementen.length; i++) {
      for (let j = i + 1; j < elementen.length; j++) {
        const a = elementen[i];
        const c = elementen[j];
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        if (overlapt(rel(a.r), rel(c.r), 2))
          uit.push({
            formaat: formaat.sleutel,
            dia,
            veld: naam(a.id),
            veldId: a.id,
            soort: "overlap",
            met: naam(c.id),
          });
      }
    }
    return uit;
  } finally {
    delete iframe.dataset.bezet;
  }
}

/** Ruimt de meetframes op (bij het verlaten van de editor). */
export function ruimMeetframesOp() {
  for (const f of pool) f.remove();
  pool = [];
}
