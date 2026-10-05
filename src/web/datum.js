// Eindreview B3, ronde 2, fix 8: gedeelde, DOM-loze kalenderdatumhelpers (JJJJ-MM-DD) — losgetrokken
// uit `web/marketing/kalender.js` (waar ze al DOM-loos stonden, maar met de rest van de
// Marketingstudio-module erbij: `recept.js`, `sjablonen.js`, `merkcontrole.js`) zodat de
// Facturatie-schermen (`facturatie/gedeeld.js`) en `bedrijf.js` (dat `gedeeld.js` alleen voor
// `euro`/`procent`/`statusInfo` nodig heeft) die hele marketingmodulegraaf niet meer in hun bundel
// meeslepen. `kalender.js` re-exporteert deze twee functies gewoon (zie daar), voor zijn eigen
// bestaande consumenten (api-marketing.ts, marketing-ideeen.ts, de planningschermen) — dit is de
// ene bron, geen tweede implementatie.
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Een bestaande kalenderdatum JJJJ-MM-DD. Het patroon alleen laat 2026-13-01 door (een ongeldige
 * Date, en `toISOString` gooit dan) en 2026-02-30 (rolt stil door naar 2 maart).
 */
export function echteDatum(d) {
  if (!DATUM.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** `n` kalenderdagen verder (of terug), op datums en niet op klokken: geen verschuiving rond de wintertijd. */
export function plusDagen(datum, n) {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const AMSTERDAM_DAG = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });

/** FT-26: de Amsterdamse kalenderdag (JJJJ-MM-DD) van een ISO-tijdstip; de lijst toont die dag, dus filters gebruiken hem ook. */
export function amsterdamDag(iso) {
  return AMSTERDAM_DAG.format(new Date(iso));
}
