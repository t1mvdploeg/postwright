// Marketingstudio — de rekenkant van de planning: maandraster (maandag eerst), ISO-weeknummers en
// een post naar een andere dag verzetten met dezelfde kloktijd. Puur.
import { metOffset, naarLokaal, vandaagAmsterdam } from "./recept.js";
// `echteDatum`/`plusDagen` staan in het gedeelde, DOM-loze `web/datum.js` (geen tweede
// implementatie) en worden hier alleen doorgegeven, voor api-marketing.ts, marketing-ideeen.ts en
// de planningschermen.
export { echteDatum, plusDagen } from "../datum.js";

const p2 = (n) => String(n).padStart(2, "0");

/** JJJJ-MM-DD van een lokale datum. */
function dag(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }

/**
 * De weken van een maand (maand 0–11), elk zeven dagen van maandag tot en met zondag, met de dagen
 * van de vorige en volgende maand aangevuld.
 */
export function maandRaster(jaar, maand) {
  const eerste = new Date(jaar, maand, 1);
  const verschuiving = (eerste.getDay() + 6) % 7;
  const start = new Date(jaar, maand, 1 - verschuiving);
  const weken = [];
  const d = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ datum: dag(d), inMaand: d.getMonth() === maand });
      d.setDate(d.getDate() + 1);
    }
    weken.push(week);
  } while (d.getMonth() === maand);
  return weken;
}

/** Het ISO-weeknummer (week 1 bevat de eerste donderdag van het jaar) van een JJJJ-MM-DD. */
export function isoWeek(datum) {
  const [j, m, d] = datum.split("-").map(Number);
  const t = new Date(Date.UTC(j, m - 1, d));
  const weekdag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - weekdag);
  const jaarStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { jaar: t.getUTCFullYear(), week: Math.ceil(((t - jaarStart) / 86400000 + 1) / 7) };
}

/** De kalenderdag in Nederland van een moment. */
export function dagVan(iso) {
  return vandaagAmsterdam(new Date(iso));
}

/**
 * Hoeveel kalenderdagen in Nederland het moment `iso` vóór `nu` ligt: gisteren 23.00 is om 08.00
 * één dag geleden, niet nul. Op datums via UTC-middag, dus de wintertijd verschuift niets.
 */
export function dagenGeleden(iso, nu = new Date()) {
  return Math.round((Date.parse(`${vandaagAmsterdam(nu)}T12:00:00Z`) - Date.parse(`${dagVan(iso)}T12:00:00Z`)) / 86400000);
}

/** Zelfde kloktijd, andere dag: voor slepen in de maandweergave. */
export function verzetNaarDag(iso, nieuweDag) {
  const tijd = naarLokaal(iso).slice(11, 16) || "09:00";
  return metOffset(`${nieuweDag}T${tijd}`);
}

/** Een maand verder of terug, als { jaar, maand }. */
export function volgendeMaand(jaar, maand, stap) {
  const d = new Date(jaar, maand + stap, 1);
  return { jaar: d.getFullYear(), maand: d.getMonth() };
}

/**
 * De komende `n` ISO-weken vanaf de week van `vandaag` (JJJJ-MM-DD), elk met maandag en zondag.
 * Rekent op datums (UTC-middag), dus de wintertijd verschuift niets.
 */
export function komendeWeken(vandaag, n) {
  const d = new Date(`${vandaag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const uit = [];
  for (let i = 0; i < n; i++) {
    const maandag = d.toISOString().slice(0, 10);
    const zondag = new Date(d.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    uit.push({ ...isoWeek(maandag), maandag, zondag });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return uit;
}

/**
 * De periodekeuze in de maandweergave. Eerste klik: begin. Tweede klik: eind (de volgorde maakt
 * niet uit). Een klik terwijl er al een hele periode staat: opnieuw beginnen. Met `uitbreiden`
 * (shift-klik) groeit de bestaande periode tot deze dag. De keuze is los van de getoonde maand,
 * dus bladeren tussen twee klikken werkt.
 */
export function kiesPeriode(huidig, datum, { uitbreiden = false } = {}) {
  const { van, tot } = huidig;
  if (uitbreiden && van) {
    const rij = [van, tot ?? van, datum].sort();
    return { van: rij[0], tot: rij[2] };
  }
  if (van && !tot) return datum < van ? { van: datum, tot: van } : { van, tot: datum };
  return { van: datum, tot: null };
}

/** Standaard aantal ideeën voor een periode: twee per week, minstens één, hooguit twintig. */
export function standaardAantal(van, tot) {
  const dagen = Math.round((Date.parse(`${tot}T12:00:00Z`) - Date.parse(`${van}T12:00:00Z`)) / 86400000) + 1;
  return Math.min(20, Math.max(1, Math.round((dagen / 7) * 2)));
}

/** Het aantal werkdagen (maandag tot en met vrijdag) van `van` tot en met `tot`; op datums, zonder lus over de hele periode. */
export function aantalWerkdagen(van, tot) {
  const dagen = Math.round((Date.parse(`${tot}T12:00:00Z`) - Date.parse(`${van}T12:00:00Z`)) / 86400000) + 1;
  if (!(dagen > 0)) return 0;
  const start = new Date(`${van}T12:00:00Z`).getUTCDay();
  let n = Math.floor(dagen / 7) * 5;
  for (let i = 0; i < dagen % 7; i++) if ((start + i) % 7 !== 0 && (start + i) % 7 !== 6) n++;
  return n;
}
