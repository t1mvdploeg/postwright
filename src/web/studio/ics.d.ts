// Type declaration next to ics.js (plain browser ESM, no build step).
export function icsText(t: unknown): string;
export function fold(line: string): string;
export function icsTime(moment: string | number | Date): string;
export function createIcs(
  posts: Array<{
    id: string;
    title: string;
    scheduled: string | null;
    status?: string;
    caption?: Record<string, string>;
  }>,
  options: { baseUrl: string; brandName: string; now?: Date },
): string;
