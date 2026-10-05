// Type declaration next to brand.js (plain browser ESM, no build step).
import type { Brand } from "./templates.js";
export function asDataUri(blob: Blob): Promise<string>;
export function loadBrand(): Promise<Brand & Record<string, unknown>>;
export function loadMedia(ids: string[], maxSide?: number): Promise<Record<string, string>>;
