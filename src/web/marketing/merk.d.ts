// Typedeclaratie naast merk.js (platte browser-ESM, geen build-stap).
import type { Merk } from "./sjablonen.js";
export function alsDataUri(blob: Blob): Promise<string>;
export function laadMerk(): Promise<Merk & Record<string, unknown>>;
export function laadMedia(ids: string[], maxZijde?: number): Promise<Record<string, string>>;
