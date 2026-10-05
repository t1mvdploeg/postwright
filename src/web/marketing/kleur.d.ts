// Typedeclaratie naast kleur.js (platte browser-ESM, geen build-stap).
export function contrastVerhouding(a: string, b: string): number;
export const GRONDEN: Record<"licht" | "inkt" | "blauw", { achtergrond: string; tekst: string; nadruk: string; zacht: string }>;
export function contrastenOp(grond: string): Array<{ wat: string; verhouding: number; drempel: number }>;
