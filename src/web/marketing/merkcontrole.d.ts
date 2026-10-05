// Typedeclaratie naast merkcontrole.js (platte browser-ESM, geen build-stap).
import type { Sjabloon, Dia, Merk } from "./sjablonen.js";
import type { Bevinding } from "./posttekst.js";

export interface ControlePost {
  sjabloon: string;
  formaten: string[];
  inhoud: Record<string, string>;
  dias?: Dia[];
  posttekst?: Record<string, string>;
  altTekst?: string;
  link?: string;
  feiten?: string[];
  merkVersie?: string;
}
export interface ControleFeit {
  id: string;
  tekst: string;
  soort?: string;
  status: string;
  geldigVan: string | null;
  geldigTot: string | null;
}
export interface Overloop {
  formaat: string;
  dia?: number | null;
  veld: string;
  veldId?: string | null;
  soort: "buiten-beeld" | "overlap" | "veilige-zone";
  reden?: string;
  met?: string;
}

export function bevatWoord(tekst: unknown, woord: unknown): boolean;
export function tekstenVan(
  post: ControlePost,
  s: Sjabloon,
): Array<{ waar: string; veld: string | null; dia: number | null; kanaal?: string; tekst: string }>;
export function feitBruikbaar(f: ControleFeit, vandaag: string): boolean;
export function controleer(invoer: {
  post: ControlePost;
  sjabloon: Sjabloon;
  instellingen: { kanalen: string[]; verbodenWoorden: string[] };
  feiten?: ControleFeit[] | null;
  vandaag: string;
  merkVersie?: string | null;
  merk?: Pick<Merk, "gronden"> | null;
  overloop?: Overloop[];
}): { bevindingen: Bevinding[]; fouten: number; letOp: number };
export function titelUit(post: ControlePost, s: Sjabloon): string;
