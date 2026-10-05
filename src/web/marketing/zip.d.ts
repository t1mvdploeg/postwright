// Typedeclaratie naast zip.js (platte browser-ESM, geen build-stap).
export function crc32(bytes: Uint8Array): number;
export function maakZip(bestanden: Array<{ naam: string; bytes: Uint8Array | string }>, nu?: Date): Uint8Array;
