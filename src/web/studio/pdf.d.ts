// Type declaration next to pdf.js (plain browser ESM, no build step).
export function createPdf(
  pages: Array<{ jpeg: Uint8Array; width: number; height: number }>,
  options?: { title?: string },
): Uint8Array;
