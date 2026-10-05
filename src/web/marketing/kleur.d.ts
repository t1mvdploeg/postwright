// Typedeclaratie naast kleur.js (platte browser-ESM, geen build-stap).
import type { Merk } from "./sjablonen.js";
export function contrastVerhouding(a: string, b: string): number;
export const DREMPEL: number;
export function contrastOp(merk: Pick<Merk, "gronden">, grond: string): { verhouding: number; drempel: number } | null;
