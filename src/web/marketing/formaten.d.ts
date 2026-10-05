// Typedeclaratie naast formaten.js (platte browser-ESM, geen build-stap), zodat de tests de
// module type-veilig kunnen importeren.

export type FormaatSleutel =
  | "li-vierkant" | "li-staand" | "li-carrousel" | "li-link" | "li-profiel" | "li-bedrijf"
  | "ig-vierkant" | "ig-staand" | "story" | "breed";
export type Kanaal = "linkedin" | "instagram" | "x" | "facebook";
export type Vorm = "banner" | "liggend" | "vierkant" | "staand" | "story";

export interface Rechthoek { x: number; y: number; breedte: number; hoogte: number }
export interface VeiligeZone extends Rechthoek { reden: string }

export interface Formaat {
  sleutel: FormaatSleutel;
  naam: string;
  kanaal: Kanaal;
  breedte: number;
  hoogte: number;
  veiligeZones: VeiligeZone[];
  carrousel?: boolean;
}

export const KANALEN: Record<Kanaal, string>;
export const FORMATEN: Formaat[];
export function formaat(sleutel: string): Formaat;
export function vormVan(f: Pick<Formaat, "breedte" | "hoogte">): Vorm;
export function slugVan(tekst: unknown, max?: number): string;
export function bestandsnaam(o: { merk?: string; campagne?: string; post?: string; formaat: string; dia?: number | null; extensie?: string }): string;
export function overlapt(a: Rechthoek, b: Rechthoek, tolerantie?: number): boolean;
export function kanalenVan(post: { formaten?: string[]; posttekst?: Record<string, string> }): string[];
