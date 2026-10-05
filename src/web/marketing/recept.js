// Marketingstudio — een recept (de post zoals de server hem bewaart) opbouwen en bijwerken, plus de
// tijdhulpjes voor planning en agenda. Puur, zodat vitest het zonder browser test.
import { sjabloon as sjabloonVan, standaardInhoud, veldenVan } from "./sjablonen.js";
import { titelUit } from "./merkcontrole.js";

const AMSTERDAM_DATUM = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });

/** De kalenderdatum (JJJJ-MM-DD) in Nederland. */
export function vandaagAmsterdam(nu = new Date()) {
  return AMSTERDAM_DATUM.format(nu);
}

const AMSTERDAM_KLOK = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** De Amsterdamse kloktijd van een tijdstip als "JJJJ-MM-DDTUU:MM:SS". */
function amsterdamKlok(ms) {
  return AMSTERDAM_KLOK.format(ms).replace(" ", "T");
}

/**
 * Een kloktijd uit een `datetime-local`-veld ("2026-10-06T08:30") als ISO-tijdstip met de
 * Amsterdamse offset ("2026-10-06T08:30:00+02:00"), ongeacht de tijdzone van de browser. Zo
 * bewaart de server de bedoelde kloktijd én het juiste moment, ook over de wisseling van
 * zomer- naar wintertijd.
 */
export function metOffset(lokaal) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(lokaal ?? "");
  if (!m) return null;
  const wand = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  if (Number.isNaN(wand)) return null;
  const offsetOp = (ms) => Math.round((Date.parse(`${amsterdamKlok(ms)}Z`) - ms) / 60000);
  let min = offsetOp(wand);
  min = offsetOp(wand - min * 60000);
  const teken = min >= 0 ? "+" : "-";
  const p = (n) => String(Math.abs(n)).padStart(2, "0");
  return `${m[1]}T${m[2]}:${m[3]}:00${teken}${p(Math.trunc(min / 60))}:${p(min % 60)}`;
}

/** Een ISO-tijdstip terug naar de waarde van een `datetime-local`-veld, in Amsterdamse tijd. */
export function naarLokaal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return amsterdamKlok(d.getTime()).slice(0, 16);
}

/** Datum en tijd leesbaar in het Nederlands, in Nederlandse tijd: "di 6 okt 2026, 08.30". */
export function leesbaarMoment(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Een nieuw recept voor een sjabloon. De formaten zijn die van het sjabloon die in de instellingen
 * aan staan (en anders het eerste formaat van het sjabloon).
 */
export function nieuwRecept(id, { formatenAan = [], merkVersie = "" } = {}) {
  const s = sjabloonVan(id);
  if (!s) throw new Error(`Onbekend sjabloon: ${id}`);
  const formaten = s.formaten.filter((f) => formatenAan.includes(f));
  const dias = s.soort === "carrousel" ? structuredClone(s.standaardDias) : [];
  const recept = {
    titel: "", soort: s.soort, sjabloon: s.id,
    formaten: formaten.length ? formaten : [s.formaten[0]],
    inhoud: s.soort === "carrousel" ? {} : standaardInhoud(s),
    dias, posttekst: {}, altTekst: "", link: "", feiten: [], campagne: null, merkVersie,
  };
  recept.titel = titelUit(recept, s);
  return recept;
}

/**
 * Het deel van een post dat naar de server gaat bij bewaren: alleen de velden van het schema, alleen
 * velden die het sjabloon (of de diasoort) kent, en geen lege postteksten.
 */
export function naarInvoer(post, s, controle) {
  const alleen = (inhoud, velden) => Object.fromEntries(velden.map((v) => [v.id, String(inhoud?.[v.id] ?? v.standaard ?? "")]));
  return {
    titel: String(post.titel ?? "").trim().slice(0, 120) || titelUit(post, s),
    soort: s.soort,
    sjabloon: s.id,
    formaten: [...new Set(post.formaten)].filter((f) => s.formaten.includes(f)),
    inhoud: s.soort === "carrousel" ? {} : alleen(post.inhoud, s.velden),
    dias: s.soort === "carrousel" ? (post.dias ?? []).map((d) => ({ soort: d.soort, inhoud: alleen(d.inhoud, veldenVan(s, d.soort)) })) : [],
    posttekst: Object.fromEntries(Object.entries(post.posttekst ?? {}).filter(([, t]) => String(t ?? "").trim())),
    altTekst: String(post.altTekst ?? ""),
    link: String(post.link ?? "").trim(),
    feiten: [...new Set(post.feiten ?? [])],
    campagne: post.campagne || null,
    merkVersie: post.merkVersie,
    controle,
  };
}

/** Verplaatst een dia (`richting` −1 of +1) en geeft de nieuwe index; buiten de lijst gebeurt er niets. */
export function verplaatsDia(dias, index, richting) {
  const doel = index + richting;
  if (index < 0 || index >= dias.length || doel < 0 || doel >= dias.length) return index;
  const [dia] = dias.splice(index, 1);
  dias.splice(doel, 0, dia);
  return doel;
}

const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

/** Waarden die in `velden` passen: zelfde id, een keuze alleen als optie, een beeld alleen als media-id. */
function neemOver(bron, velden, doel) {
  for (const v of velden) {
    const w = bron?.[v.id];
    if (typeof w !== "string" || !w.trim()) continue;
    if (v.soort === "keuze" && !v.opties.some((o) => o.waarde === w)) continue;
    if (v.soort === "media" && !MEDIA_ID.test(w)) continue;
    doel[v.id] = w;
  }
}

/**
 * Een post als nieuw recept in een ander sjabloon ("Omzetten"). Van en naar een carrousel
 * gaat via de omslagdia. Het origineel blijft ongemoeid: alles wat meegaat, is een kopie.
 */
export function zetOm(post, doelId, { formatenAan = [], merkVersie = "" } = {}) {
  const bron = sjabloonVan(post.sjabloon);
  const doel = sjabloonVan(doelId);
  if (!bron || !doel) throw new Error(`Onbekend sjabloon: ${bron ? doelId : post.sjabloon}`);
  const r = nieuwRecept(doelId, { formatenAan, merkVersie });
  const waarden = bron.soort === "carrousel" ? post.dias?.[0]?.inhoud ?? {} : post.inhoud ?? {};
  if (doel.soort === "carrousel") neemOver(waarden, veldenVan(doel, r.dias[0].soort), r.dias[0].inhoud);
  else neemOver(waarden, doel.velden, r.inhoud);
  return Object.assign(r, {
    titel: `${post.titel} (${doel.naam})`.slice(0, 120),
    posttekst: structuredClone(post.posttekst ?? {}),
    altTekst: post.altTekst ?? "",
    link: post.link ?? "",
    feiten: [...(post.feiten ?? [])],
    campagne: post.campagne ?? null,
  });
}

/** Een nieuw recept uit een idee: de kop in het kopveld (bij een carrousel op de omslag), plus feiten, campagne en titel. */
export function ideeNaarRecept(idee, { formatenAan = [], merkVersie = "" } = {}) {
  const r = nieuwRecept(idee.sjabloon, { formatenAan, merkVersie });
  const s = sjabloonVan(idee.sjabloon);
  if (idee.kop) {
    const carrousel = s.soort === "carrousel";
    const doel = carrousel ? r.dias[0]?.inhoud : r.inhoud;
    if (doel && veldenVan(s, carrousel ? r.dias[0]?.soort : null).some((v) => v.id === "kop")) doel.kop = idee.kop;
  }
  r.titel = String(idee.titel ?? "").slice(0, 120) || r.titel;
  r.feiten = [...(idee.feiten ?? [])];
  r.campagne = idee.campagne ?? null;
  return r;
}
