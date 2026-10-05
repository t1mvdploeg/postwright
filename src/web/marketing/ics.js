// Marketingstudio — de agenda-export (RFC 5545). Elke geplande post wordt een afspraak van een
// kwartier met een herinnering vooraf. Het UID is vast per post, dus opnieuw importeren werkt de
// afspraak bij in plaats van hem te verdubbelen. Een post die niet meer gepland staat (terug naar
// concept of gearchiveerd) gaat mee als STATUS:CANCELLED met een hogere SEQUENCE, zodat opnieuw
// importeren de afspraak uit de agenda haalt (BM-19). Een gewiste post laat niets achter om in te trekken. Tijden gaan als UTC ("…Z") de agenda in; de
// agenda-app zet ze zelf om naar de tijdzone van de lezer.

const enc = new TextEncoder();

/** Escapen volgens RFC 5545 §3.3.11: backslash, puntkomma, komma en regeleinden. */
export function icsTekst(t) {
  return String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Vouwt een regel op 75 octets (RFC 5545 §3.1): vervolgregels beginnen met één spatie. Nooit
 * midden in een UTF-8-teken, dus er wordt per teken geteld in bytes.
 */
export function vouw(regel) {
  const uit = [];
  let huidig = "";
  let bytes = 0;
  const limiet = () => (uit.length === 0 ? 75 : 74);
  for (const teken of regel) {
    const n = enc.encode(teken).length;
    if (bytes + n > limiet()) { uit.push(huidig); huidig = ""; bytes = 0; }
    huidig += teken;
    bytes += n;
  }
  uit.push(huidig);
  return uit.map((r, i) => (i === 0 ? r : ` ${r}`)).join("\r\n");
}

/** Een moment als UTC-tijdstempel: 20261006T063000Z. */
export function icsTijd(moment) {
  const d = new Date(moment);
  if (Number.isNaN(d.getTime())) throw new Error(`Ongeldig moment: ${moment}`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * @param {Array<{ id: string, titel: string, gepland: string, status?: string, posttekst?: Record<string, string>, kop?: string }>} posts
 * @param {{ basisUrl: string, merknaam: string, nu?: Date }} opties
 * @returns {string}
 */
export function maakIcs(posts, { basisUrl, merknaam, nu = new Date() }) {
  const regels = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Postwright//Postwright//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsTekst(`Marketing ${merknaam}`)}`,
  ];
  const stempel = icsTijd(nu);
  for (const p of posts) {
    if (!p.gepland) continue;
    const begin = new Date(p.gepland);
    const eind = new Date(begin.getTime() + 15 * 60 * 1000);
    const tekst = Object.values(p.posttekst ?? {}).find((t) => t && t.trim()) ?? "";
    const beschrijving = [tekst.length > 300 ? `${tekst.slice(0, 300)}…` : tekst, `Openen in de studio: ${basisUrl}/#maken/${p.id}`]
      .filter(Boolean).join("\n\n");
    const ingetrokken = p.status === "concept" || p.status === "gearchiveerd";
    regels.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@postwright.local`,
      `SEQUENCE:${ingetrokken ? 1 : 0}`,
      ...(ingetrokken ? ["STATUS:CANCELLED"] : []),
      `DTSTAMP:${stempel}`,
      `DTSTART:${icsTijd(begin)}`,
      `DTEND:${icsTijd(eind)}`,
      `SUMMARY:${icsTekst(`Post: ${p.titel}`)}`,
      `DESCRIPTION:${icsTekst(beschrijving)}`,
      `URL:${basisUrl}/#maken/${p.id}`,
      ...(ingetrokken ? [] : [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsTekst(`Vandaag posten: ${p.titel}`)}`,
        "TRIGGER:-PT15M",
        "END:VALARM",
      ]),
      "END:VEVENT",
    );
  }
  regels.push("END:VCALENDAR");
  return regels.map(vouw).join("\r\n") + "\r\n";
}
