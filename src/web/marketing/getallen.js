// Marketingstudio — getallen in een tekst herkennen, voor de feitenbank (geen
// getal in een post zonder een feit met bron). Puur.
//
// Bekende grens, ook in de interface uitgelegd: getallen in woorden ("acht procent") worden niet
// herkend. De controle helpt, maar vervangt het nalezen niet.

/**
 * Een Nederlands genoteerd getal naar een getal: "1.250" → 1250, "62,75" → 62.75, "8,33" → 8.33.
 * Een punt gevolgd door precies drie cijfers is een duizendtalscheiding; een komma is de decimaal.
 */
function naarGetal(tekst) {
  let t = tekst.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
  t = t.replace(",-", "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const BEDRAG = /€\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}|-))?|(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s?(?:euro|EUR)\b/gi;
const PROCENT = /(\d+(?:,\d+)?)\s?(?:%|procent\b)/gi;
const GETAL = /(?<![\p{L}\p{N}.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?![\p{L}\p{N}]|[.,]\d)/gu;

/**
 * De getallen in een tekst, genormaliseerd: `{ soort, waarde, tekst }`. Bedragen en percentages
 * altijd; kale getallen vanaf twee cijfers of met decimalen (een losse 1 of 4 is meestal een
 * telwoord, geen claim). Jaartallen (1900–2100) zonder decimalen tellen niet mee: "per 1 juli
 * 2026" is een datum, geen bewering die een bron nodig heeft.
 */
export function haalGetallen(tekst) {
  // Links eerst weg: een UTM-link met post-id (p-3fa2c1d0-7731-4821-…) of een datum in een pad
  // is geen bewering. Vervangen door spaties houdt de posities gelijk.
  const t = String(tekst ?? "").replace(/\b(?:https?:\/\/|www\.)[^\s<>"]+/gi, (l) => " ".repeat(l.length));
  const uit = [];
  const bezet = [];
  const vrij = (i, j) => !bezet.some(([a, b]) => i < b && a < j);
  for (const m of t.matchAll(BEDRAG)) {
    const heel = m[1] ?? m[3];
    const dec = m[2] ?? m[4];
    const waarde = naarGetal(dec && dec !== "-" ? `${heel},${dec}` : heel);
    if (waarde === null) continue;
    uit.push({ soort: "bedrag", waarde, tekst: m[0].trim() });
    bezet.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(PROCENT)) {
    if (!vrij(m.index, m.index + m[0].length)) continue;
    const waarde = naarGetal(m[1]);
    if (waarde === null) continue;
    uit.push({ soort: "procent", waarde, tekst: m[0].trim() });
    bezet.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(GETAL)) {
    if (!vrij(m.index, m.index + m[0].length)) continue;
    const ruw = m[1];
    const waarde = naarGetal(ruw);
    if (waarde === null) continue;
    const decimaal = ruw.includes(",");
    if (!decimaal && waarde < 10) continue;
    if (!decimaal && Number.isInteger(waarde) && waarde >= 1900 && waarde <= 2100) continue;
    uit.push({ soort: "getal", waarde, tekst: ruw });
  }
  return uit;
}

/**
 * De getallen uit `tekst` die in geen van de `feiten` staan. Vergelijkt op waarde, niet op
 * notatie: "€ 62,75" in het feit dekt "62,75 per uur" in de post.
 */
export function ongedekteGetallen(tekst, feiten) {
  const gedekt = new Set(feiten.flatMap((f) => haalGetallen(f.tekst).map((g) => g.waarde)));
  return haalGetallen(tekst).filter((g) => !gedekt.has(g.waarde));
}
