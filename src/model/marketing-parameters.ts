// Marketingstudio — feiten uit de parameters (golf M4.7). Een vaste lijst: alleen waarden die in
// docs/kennis/toetsing-parameters.md als "klopt" staan en op een kennispagina met bron voorkomen
// (skill cao-kennis; "geen cao-feit zonder bron"). Elk feit krijgt de kennispagina als bron en de
// volgende ingangsdatum als einde, zodat het vanzelf als verlopen opvalt.
//
// Bronnen per waarde:
//  - wettelijk minimumuurloon per datum: docs/kennis/minimumloon.md (tabel met ingangsdata);
//  - StiPP-werkgeverspremie 15,9 %: docs/kennis/pensioen-stipp-en-compensatie.md (cao art. 45 lid 5);
//  - SFU-premie 2026 0,2 %: docs/kennis/sfu-en-sociaal-fonds.md.
import type { Parameters } from "../core/types.js";

export interface ParameterFeit {
  sleutel: string;
  naam: string;
  tekst: string;
  geldigVan: string | null;
  geldigTot: string | null;
  bron: string;
}

const bedrag = (n: number) => new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const procent = (fractie: number) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(Math.round(fractie * 10000) / 100);
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const datumTekst = (iso: string) => { const [j, m, d] = iso.split("-").map(Number); return `${d} ${MAANDEN[m - 1]} ${j}`; };

/** De dag vóór een JJJJ-MM-DD. */
function dagErvoor(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function parameterFeiten(p: Parameters): ParameterFeit[] {
  const uit: ParameterFeit[] = [];
  const wml = [...(p.wettelijk?.minimumuurloon ?? [])].sort((a, b) => a.vanaf.localeCompare(b.vanaf));
  wml.forEach((r, i) => {
    const volgende = wml[i + 1];
    uit.push({
      sleutel: `wml-${r.vanaf}`,
      naam: `Wettelijk minimumuurloon per ${datumTekst(r.vanaf)}`,
      tekst: `Het wettelijk minimumuurloon voor 21 jaar en ouder is € ${bedrag(r.bedrag)} per uur, per ${datumTekst(r.vanaf)}.`,
      geldigVan: r.vanaf,
      geldigTot: volgende ? dagErvoor(volgende.vanaf) : null,
      bron: "docs/kennis/minimumloon.md",
    });
  });
  if (typeof p.pensioen?.stippPct === "number") {
    uit.push({
      sleutel: `stipp-werkgever-${p.jaar}`,
      naam: `StiPP-werkgeverspremie ${p.jaar}`,
      tekst: `De werkgeverspremie voor het StiPP-pensioen is ${procent(p.pensioen.stippPct)}% van de pensioengrondslag (${p.jaar}).`,
      geldigVan: `${p.jaar}-01-01`,
      geldigTot: `${p.jaar}-12-31`,
      bron: "docs/kennis/pensioen-stipp-en-compensatie.md",
    });
  }
  if (typeof p.werkgeverslasten?.sociaalFonds === "number") {
    uit.push({
      sleutel: `sfu-${p.jaar}`,
      naam: `SFU-premie ${p.jaar}`,
      // De parameter staat in procenten (0,2 = 0,2 %), anders dan stippPct (een fractie).
      tekst: `De SFU-premie voor ${p.jaar} is ${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(p.werkgeverslasten.sociaalFonds)}% van de loonsom.`,
      geldigVan: `${p.jaar}-01-01`,
      geldigTot: `${p.jaar}-12-31`,
      bron: "docs/kennis/sfu-en-sociaal-fonds.md",
    });
  }
  return uit;
}
