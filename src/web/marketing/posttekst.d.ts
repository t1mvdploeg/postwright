// Typedeclaratie naast posttekst.js (platte browser-ESM, geen build-stap).
export interface KanaalRegels {
  naam: string;
  maxTekens: number;
  vouw: number | null;
  maxHashtags: number | null;
  linkTelt?: number;
  plaatsen: string;
}
export interface Bevinding {
  niveau: "fout" | "let-op" | "ok";
  code: string;
  tekst: string;
  kanaal?: string;
  veld?: string | null;
  dia?: number | null;
}
export const KANAAL_REGELS: Record<string, KanaalRegels>;
export function telTekens(tekst: unknown): number;
export function lengteVoor(kanaal: string, tekst: unknown): number;
export function splitsBijVouw(kanaal: string, tekst: unknown): { boven: string; onder: string };
export function hashtags(tekst: unknown): { lijst: string[]; dubbel: string[]; afgebroken: string[] };
export function voegUtmToe(
  link: unknown,
  utm?: { bron?: string; medium?: string; campagne?: string; inhoud?: string },
): string | null;
export function zetUtmInhoud(tekst: unknown, id: string): string;
export function linksZonderUtm(tekst: unknown): string[];
export function controleerPosttekst(kanaal: string, tekst: unknown): Bevinding[];
