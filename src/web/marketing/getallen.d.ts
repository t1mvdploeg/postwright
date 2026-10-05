// Typedeclaratie naast getallen.js (platte browser-ESM, geen build-stap).
export interface Getal {
  soort: "bedrag" | "procent" | "getal";
  waarde: number;
  tekst: string;
}
export function haalGetallen(tekst: unknown): Getal[];
export function ongedekteGetallen(tekst: unknown, feiten: Array<{ tekst: string }>): Getal[];
