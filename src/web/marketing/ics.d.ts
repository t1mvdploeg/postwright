// Typedeclaratie naast ics.js (platte browser-ESM, geen build-stap).
export function icsTekst(t: unknown): string;
export function vouw(regel: string): string;
export function icsTijd(moment: string | number | Date): string;
export function maakIcs(
  posts: Array<{ id: string; titel: string; gepland: string | null; status?: string; posttekst?: Record<string, string> }>,
  opties: { basisUrl: string; nu?: Date },
): string;
