// Marketingstudio — de sjabloonmotor. Van een recept (sjabloon + velden + formaat) naar een
// HTML-fragment plus CSS dat het voorbeeld-iframe en de export (foreignObject → canvas) allebei
// letterlijk zo gebruiken: wat je ziet is wat je downloadt.
//
// Puur: geen DOM en geen fetch. Het merk (kleuren, logo's als data-URI, de letter) komt als
// argument binnen; in de browser laadt `merk.js` het, in de tests komt het van schijf.
//
// Al het escapen gebeurt hier, in `escapeHtml` en `metNadruk`. Een sjabloon krijgt zijn velden
// alleen via `c.t()` (tekst met nadruk) en `c.e()` (platte tekst) en zet nooit zelf ruwe invoer in
// de markup; tests/marketing-sjablonen.test.ts probeert voor elk sjabloon en elk veld injectie.
import { formaat as formaatVan, vormVan } from "./formaten.js";
import { BASIS_CSS } from "./sjabloon-css.js";
import stelling from "./sjablonen/stelling.js";
import vraag from "./sjablonen/vraag.js";
import werkroute from "./sjablonen/werkroute.js";
import productbeeld from "./sjablonen/productbeeld.js";
import cijfer from "./sjablonen/cijfer.js";
import linkvoorbeeld from "./sjablonen/linkvoorbeeld.js";
import profielbanner from "./sjablonen/profielbanner.js";
import bedrijfsomslag from "./sjablonen/bedrijfsomslag.js";
import carrousel from "./sjablonen/carrousel.js";

/** Alle sjablonen, in de volgorde van de galerij. */
export const SJABLONEN = [
  stelling,
  vraag,
  werkroute,
  productbeeld,
  cijfer,
  carrousel,
  linkvoorbeeld,
  profielbanner,
  bedrijfsomslag,
];

const PER_ID = new Map(SJABLONEN.map((s) => [s.id, s]));

/** Het sjabloon bij een id, of null. */
export function sjabloon(id) {
  return PER_ID.get(id) ?? null;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Tekst veilig als HTML-tekst of attribuutwaarde. */
export function escapeHtml(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (t) => ESCAPES[t]);
}

/**
 * Een frase tussen sterretjes is de gekleurde nadruk van de kop (`*helder verhaal.*`). Het
 * sterretje moet direct tegen een woord staan, zodat "€ 5*" of "3 * 4" gewoon sterren blijven.
 */
const NADRUK = /\*(?=\S)([^*\n]*?\S)\*/g;

/** Hoeveel frases nadruk hebben. */
export function telNadruk(tekst) {
  return (String(tekst ?? "").match(NADRUK) ?? []).length;
}

/** Tekst als HTML: eerst escapen, dan `*…*` als <em>, dan regeleinden als <br>. */
export function metNadruk(tekst) {
  return escapeHtml(tekst).replace(NADRUK, "<em>$1</em>").replace(/\r?\n/g, "<br>");
}

/**
 * Zet de nadruk om een selectie (`begin`..`eind`) en haalt een eerdere nadruk weg: er is er
 * precies één. Witruimte aan de randen van de selectie blijft búiten de sterretjes staan; een
 * dubbelklik op Windows neemt de spatie na het woord mee, en die mag niet verdwijnen
 *. Geeft null bij een lege selectie of alleen witruimte.
 */
export function nadrukOmSelectie(tekst, begin, eind) {
  const waarde = String(tekst ?? "");
  const sterrenVoor = (i) => (waarde.slice(0, i).match(/\*/g) ?? []).length;
  const zonder = waarde.replace(/\*/g, "");
  let a = begin - sterrenVoor(begin);
  let b = eind - sterrenVoor(eind);
  while (a < b && /\s/.test(zonder[a])) a++;
  while (b > a && /\s/.test(zonder[b - 1])) b--;
  if (a >= b) return null;
  return { tekst: `${zonder.slice(0, a)}*${zonder.slice(a, b)}*${zonder.slice(b)}`, begin: a, eind: b + 2 };
}

/** Tekst zonder de nadruksterretjes, bv. voor een alt-tekst of een titel. */
export function zonderNadruk(tekst) {
  return String(tekst ?? "").replace(NADRUK, "$1");
}

/** Elke rem wordt pixels: één rem is een honderdachtste van de breedte. */
export function remNaarPx(css, breedte) {
  return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${Number(((Number(n) * breedte) / 108).toFixed(3))}px`);
}

/** De standaardwaarden van een sjabloon (of van één diasoort van de carrousel). */
export function standaardInhoud(s, diaSoort = null) {
  const velden = diaSoort ? (s.dias.find((d) => d.soort === diaSoort)?.velden ?? []) : s.velden;
  return Object.fromEntries(velden.map((v) => [v.id, v.standaard ?? ""]));
}

/** De velden van een sjabloon of diasoort. */
export function veldenVan(s, diaSoort = null) {
  return diaSoort ? (s.dias.find((d) => d.soort === diaSoort)?.velden ?? []) : s.velden;
}

/** De iconen die de sjablonen gebruiken, als symbolen in het beeld zelf. */
const SYMBOLEN =
  '<svg class="symbolen" aria-hidden="true">' +
  '<symbol id="pijl" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>' +
  '<symbol id="vink" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>' +
  "</svg>";

/** De route: de zigzag van de W uit het logo op grote schaal, als watermerk (zelfde pad als merk/motieven/route.svg). */
const ROUTE =
  '<svg class="route" viewBox="5.5 7.5 21 17" aria-hidden="true"><path d="M7 9l5 14 4-10 4 10 5-14"/></svg>';

/** De naam van een lettertypefamilie als CSS-tekenreeks; aanhalingstekens en backslashes vallen weg. */
const lettertypeNaam = (familie) => String(familie).replace(/["\\]/g, "");

/** De kleuren, de ondergronden en de letter van het merk, op de wikkel van het beeld. */
function merkCss(merk) {
  const variabelen = [
    ...Object.entries(merk.css).map(([k, v]) => `${k}: ${v};`),
    ...Object.entries(merk.gronden).flatMap(([g, k]) => [
      `--grond-${g}: ${k.achtergrond};`,
      `--grond-${g}-tekst: ${k.tekst};`,
    ]),
  ].join(" ");
  return `${merk.lettertypeCss ?? ""}
.merk { ${variabelen} font-family: "${lettertypeNaam(merk.lettertype.familie)}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--inkt); font-synthesis: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
.merk figure { margin: 0; }`;
}

/**
 * Het beeld van één recept in één formaat. `inhoud` mag velden missen (dan de standaard); een
 * onbekend veld wordt genegeerd. Bij een carrousel geeft `dia` aan welke dia (0-gebaseerd).
 *
 * @returns {{ html: string, css: string, breedte: number, hoogte: number, vorm: string, titel: string }}
 */
export function bouwBeeld({ sjabloon: id, inhoud = {}, dias = [], dia = 0, formaat: sleutel, merk, media = {} }) {
  const s = sjabloon(id);
  if (!s) throw new Error(`Onbekend sjabloon: ${id}`);
  if (!s.formaten.includes(sleutel)) throw new Error(`Sjabloon ${id} kent formaat ${sleutel} niet`);
  const f = formaatVan(sleutel);
  const vorm = vormVan(f);

  let velden = s.velden;
  let waarden = inhoud;
  let diaInfo = null;
  let render = s.html;
  let eigenCss = s.css ?? "";
  if (s.soort === "carrousel") {
    const lijst = dias.length ? dias : s.standaardDias;
    const huidige = lijst[Math.min(Math.max(dia, 0), lijst.length - 1)];
    const soort = s.dias.find((d) => d.soort === huidige.soort);
    if (!soort) throw new Error(`Onbekende diasoort: ${huidige.soort}`);
    velden = soort.velden;
    waarden = huidige.inhoud ?? {};
    render = soort.html;
    eigenCss = `${s.css ?? ""}\n${soort.css ?? ""}`;
    const stappen = lijst.filter((d) => s.dias.find((x) => x.soort === d.soort)?.telt);
    diaInfo = {
      index: dia,
      aantal: lijst.length,
      stap: stappen.indexOf(huidige) + 1,
      stappen: stappen.length,
    };
  }
  const v = Object.fromEntries(
    velden.map((veld) => {
      const w = waarden[veld.id];
      return [veld.id, typeof w === "string" ? w : String(veld.standaard ?? "")];
    }),
  );
  // Een keuzeveld kan alleen een van zijn opties zijn; alles anders wordt de standaard. Zo komt
  // een keuzewaarde (die als klassenaam in de markup belandt) nooit ongecontroleerd in het beeld.
  for (const veld of velden) {
    if (veld.soort === "keuze" && !veld.opties.some((o) => o.waarde === v[veld.id])) v[veld.id] = veld.standaard;
  }

  const c = {
    formaat: f,
    vorm,
    dia: diaInfo,
    t: (naam) => metNadruk(v[naam]),
    e: (naam) => escapeHtml(v[naam]),
    leeg: (naam) => !String(v[naam] ?? "").trim(),
    logoBron: (stand) => {
      const bron = merk.logos[stand];
      if (!bron) throw new Error(`Onbekende logostand: ${stand}`);
      return bron;
    },
    logo: (stand, klasse = "logo") =>
      `<img class="${klasse}" src="${c.logoBron(stand)}" alt="${escapeHtml(merk.naam)}">`,
    /** De website van het merk zonder protocol, voor een voetregel. */
    merkUrl: escapeHtml(merk.url.replace(/^https?:\/\//, "").replace(/\/$/, "")),
    /** Een voetregelveld; leeg betekent de website van het merk. */
    voet: (naam) => (c.leeg(naam) ? c.merkUrl : c.e(naam)),
    /** Een geüpload beeld als data-URI; alleen id's die de server uitdeelde, dus geen vrije URL. */
    media: (naam) => {
      const id = v[naam];
      return /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(id) ? (media[id] ?? null) : null;
    },
    icoon: (naam) => `<svg class="icoon"><use href="#${naam}"/></svg>`,
    route: () => ROUTE,
    symbolen: SYMBOLEN,
  };

  const html = `<div class="merk vorm-${vorm} sjabloon-${s.id}" style="--breedte:${f.breedte}px;--hoogte:${f.hoogte}px">${render(v, c)}</div>`;
  const css = remNaarPx(`${merkCss(merk)}\n${BASIS_CSS}\n${eigenCss}`, f.breedte);
  const titel = zonderNadruk(v.kop ?? s.naam);
  return { html, css, breedte: f.breedte, hoogte: f.hoogte, vorm, titel };
}

/** Hoeveel beelden een recept in één formaat oplevert (een carrousel: één per dia). */
export function aantalBeelden(s, dias) {
  return s.soort === "carrousel" ? dias.length || s.standaardDias.length : 1;
}
