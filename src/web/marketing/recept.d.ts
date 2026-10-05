// Typedeclaratie naast recept.js (platte browser-ESM, geen build-stap).
import type { Dia, Sjabloon } from "./sjablonen.js";

export interface Recept {
  titel: string;
  soort: "beeld" | "carrousel";
  sjabloon: string;
  formaten: string[];
  inhoud: Record<string, string>;
  dias: Dia[];
  posttekst: Record<string, string>;
  altTekst: string;
  link: string;
  feiten: string[];
  campagne: string | null;
  merkVersie: string;
}

export function vandaagAmsterdam(nu?: Date): string;
export function metOffset(lokaal: string): string | null;
export function naarLokaal(iso: string): string;
export function leesbaarMoment(iso: string): string;
export function nieuwRecept(id: string, opties?: { formatenAan?: string[]; merkVersie?: string }): Recept;
export function naarInvoer(post: Partial<Recept>, s: Sjabloon, controle: { fouten: number; letOp: number; op: string } | null): Recept & { controle: unknown };
export function verplaatsDia(dias: Dia[], index: number, richting: number): number;
export function ideeNaarRecept(idee: { sjabloon: string; titel: string; kop?: string; feiten?: string[]; campagne?: string | null }, opties?: { formatenAan?: string[]; merkVersie?: string }): Recept;
export function zetOm(post: Partial<Recept> & { sjabloon: string; titel: string }, doelId: string, opties?: { formatenAan?: string[]; merkVersie?: string }): Recept;
