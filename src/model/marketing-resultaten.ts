// Marketingstudio — resultaten per sjabloon, voor het Overzicht en als richting voor de ideeën.
import type { Post } from "./marketing-schema.js";

export interface ResultaatRegel {
  sjabloon: string;
  posts: number;
  vertoningen: number;
  reacties: number;
  klikken: number;
}

/**
 * Per sjabloon de gepubliceerde posts met een resultaat, gepubliceerd op of na `vanaf` (JJJJ-MM-DD),
 * opgeteld; een leeg veld telt als 0. Meeste posts eerst. Een gearchiveerde post telt mee zolang hij
 * een publicatie en een resultaat heeft: archiveren laat beide staan.
 * Bewuste beperking: vergelijkt op de UTC-datum van publicatie; hooguit één dag verschil aan de rand.
 */
export function resultatenPerSjabloon(posts: Post[], vanaf: string): ResultaatRegel[] {
  const per = new Map<string, ResultaatRegel>();
  for (const p of posts) {
    if (p.status !== "gepubliceerd" && p.status !== "gearchiveerd") continue;
    if (!p.resultaat || !p.gepubliceerd || p.gepubliceerd.op.slice(0, 10) < vanaf) continue;
    const r = per.get(p.sjabloon) ?? { sjabloon: p.sjabloon, posts: 0, vertoningen: 0, reacties: 0, klikken: 0 };
    r.posts += 1;
    r.vertoningen += p.resultaat.vertoningen ?? 0;
    r.reacties += p.resultaat.reacties ?? 0;
    r.klikken += p.resultaat.klikken ?? 0;
    per.set(p.sjabloon, r);
  }
  return [...per.values()].sort((a, b) => b.posts - a.posts || a.sjabloon.localeCompare(b.sjabloon));
}
