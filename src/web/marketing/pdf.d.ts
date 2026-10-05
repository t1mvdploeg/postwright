// Typedeclaratie naast pdf.js (platte browser-ESM, geen build-stap).
export function maakPdf(
  paginas: Array<{ jpeg: Uint8Array; breedte: number; hoogte: number }>,
  opties?: { titel?: string },
): Uint8Array;
