// Type declaration next to color.js (plain browser ESM, no build step).
import type { Brand } from "./templates.js";
export function contrastRatio(a: string, b: string): number;
export const THRESHOLD: number;
export function contrastOn(brand: Pick<Brand, "grounds">, ground: string): { ratio: number; threshold: number } | null;
