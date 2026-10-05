// Type declaration next to zip.js (plain browser ESM, no build step).
export function crc32(bytes: Uint8Array): number;
export function createZip(files: Array<{ name: string; bytes: Uint8Array | string }>, now?: Date): Uint8Array;
