// Marketingstudio — de posttekst per kanaal: tellen, limieten, hashtags en UTM-links. Puur.
//
// De limieten zijn die van de platforms zelf (nagelopen 24 september 2026). Waar "meer
// weergeven" valt, verschilt per scherm; `vouw` is daarom een richtgetal, geen grens.

export const KANAAL_REGELS = {
  linkedin: { naam: "LinkedIn", maxTekens: 3000, vouw: 210, maxHashtags: null, plaatsen: "https://www.linkedin.com/feed/" },
  instagram: { naam: "Instagram", maxTekens: 2200, vouw: 125, maxHashtags: 30, plaatsen: "https://www.instagram.com/" },
  x: { naam: "X", maxTekens: 280, vouw: null, maxHashtags: null, linkTelt: 23, plaatsen: "https://x.com/compose/post" },
  facebook: { naam: "Facebook", maxTekens: 63206, vouw: null, maxHashtags: null, plaatsen: "https://www.facebook.com/" },
};

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("nl", { granularity: "grapheme" }) : null;

/** Tekens zoals een lezer ze telt: een emoji of een letter met accent is één teken. */
export function telTekens(tekst) {
  const t = String(tekst ?? "");
  if (!segmenter) return [...t].length;
  let n = 0;
  for (const _ of segmenter.segment(t)) n++;
  return n;
}

const URL_PATROON = /https?:\/\/[^\s<>"]+/g;

// Leestekens direct achter een link horen bij de zin, niet bij de link.
const LINK_STAART = /[.,;:!?)\]]+$/;

/**
 * Zet in elke link met utm_source de parameter utm_content op `id` (het post-id). Links zonder
 * utm_source blijven ongemoeid: die maakte de studio niet. De server roept dit aan bij aanmaken,
 * opslaan en dupliceren, zodat ook een link die vóór het eerste Bewaren is ingevoegd, of een link
 * in een kopie, naar de eigen post wijst.
 */
export function zetUtmInhoud(tekst, id) {
  return String(tekst ?? "").replace(URL_PATROON, (ruw) => {
    const staart = ruw.match(LINK_STAART)?.[0] ?? "";
    const link = staart ? ruw.slice(0, -staart.length) : ruw;
    let u;
    try { u = new URL(link); } catch { return ruw; }
    if (!u.searchParams.has("utm_source")) return ruw;
    u.searchParams.set("utm_content", id);
    return `${u.toString()}${staart}`;
  });
}

/** De lengte zoals het kanaal hem telt: op X telt elke link als 23 tekens. */
export function lengteVoor(kanaal, tekst) {
  const regels = KANAAL_REGELS[kanaal];
  const t = String(tekst ?? "");
  if (!regels?.linkTelt) return telTekens(t);
  return telTekens(t.replace(URL_PATROON, "")) + (t.match(URL_PATROON) ?? []).length * regels.linkTelt;
}

/** Wat er vóór "meer weergeven" staat, en wat erna. Zonder vouw staat alles boven. */
export function splitsBijVouw(kanaal, tekst) {
  const vouw = KANAAL_REGELS[kanaal]?.vouw;
  const t = String(tekst ?? "");
  if (!vouw) return { boven: t, onder: "" };
  const tekens = segmenter ? [...segmenter.segment(t)].map((s) => s.segment) : [...t];
  return { boven: tekens.slice(0, vouw).join(""), onder: tekens.slice(vouw).join("") };
}

const HASHTAG = /(?:^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]+)/gu;

/** De hashtags in een tekst, met dubbele (hoofdletterongevoelig) en afgebroken (#woord-woord). */
export function hashtags(tekst) {
  const t = String(tekst ?? "");
  const lijst = [...t.matchAll(HASHTAG)].map((m) => m[1]);
  const gezien = new Set();
  const dubbel = [];
  for (const h of lijst) {
    const k = h.toLocaleLowerCase("nl");
    if (gezien.has(k) && !dubbel.includes(h)) dubbel.push(h);
    gezien.add(k);
  }
  const afgebroken = [...t.matchAll(/#([\p{L}\p{N}_]+[-'’.][\p{L}\p{N}]+)/gu)].map((m) => m[1]);
  return { lijst, dubbel, afgebroken };
}

/**
 * Zet de UTM-parameters op een https-link. Bestaande parameters en het #anker blijven staan; alleen
 * `utm_*` wordt overschreven. Geeft null bij iets dat geen https-adres is: zo'n link hoort niet in
 * een post (en `javascript:` al helemaal niet).
 */
export function voegUtmToe(link, { bron, medium, campagne, inhoud } = {}) {
  let u;
  try { u = new URL(String(link ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const zet = (naam, waarde) => { if (waarde) u.searchParams.set(naam, waarde); else u.searchParams.delete(naam); };
  zet("utm_source", bron);
  zet("utm_medium", medium);
  zet("utm_campaign", campagne);
  zet("utm_content", inhoud);
  return u.toString();
}

/** De links in een tekst die geen utm_source hebben. */
export function linksZonderUtm(tekst) {
  return (String(tekst ?? "").match(URL_PATROON) ?? []).filter((l) => !/[?&]utm_source=/.test(l));
}

/**
 * De bevindingen over één posttekst: leeg, te lang, te veel of rare hashtags, links zonder UTM.
 * @returns {Array<{ niveau: "fout" | "let-op", code: string, tekst: string, kanaal: string }>}
 */
export function controleerPosttekst(kanaal, tekst) {
  const r = KANAAL_REGELS[kanaal];
  if (!r) return [];
  const uit = [];
  const t = String(tekst ?? "");
  if (!t.trim()) return [{ niveau: "let-op", code: "posttekst-leeg", tekst: `Nog geen posttekst voor ${r.naam}`, kanaal }];
  const lengte = lengteVoor(kanaal, t);
  if (lengte > r.maxTekens) uit.push({ niveau: "fout", code: "posttekst-te-lang", tekst: `De posttekst voor ${r.naam} is ${lengte} tekens; ${r.naam} laat er ${r.maxTekens} toe`, kanaal });
  const h = hashtags(t);
  if (r.maxHashtags !== null && h.lijst.length > r.maxHashtags) {
    uit.push({ niveau: "fout", code: "te-veel-hashtags", tekst: `${h.lijst.length} hashtags voor ${r.naam}; hooguit ${r.maxHashtags}`, kanaal });
  }
  for (const d of h.dubbel) uit.push({ niveau: "let-op", code: "hashtag-dubbel", tekst: `#${d} staat er meer dan één keer in (${r.naam})`, kanaal });
  for (const a of h.afgebroken) uit.push({ niveau: "let-op", code: "hashtag-afgebroken", tekst: `#${a} breekt af bij het leesteken; schrijf hem aaneen (${r.naam})`, kanaal });
  for (const l of linksZonderUtm(t)) uit.push({ niveau: "let-op", code: "link-zonder-utm", tekst: `Link zonder UTM in de posttekst voor ${r.naam}: ${l.length > 60 ? `${l.slice(0, 57)}…` : l}`, kanaal });
  return uit;
}
