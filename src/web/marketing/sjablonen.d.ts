// Typedeclaratie naast sjablonen.js (platte browser-ESM, geen build-stap).
import type { FormaatSleutel, Formaat, Vorm } from "./formaten.js";

export interface KeuzeOptie {
  waarde: string;
  tekst: string;
}
export interface Veld {
  id: string;
  label: string;
  soort: "kop" | "tekst" | "regel" | "keuze" | "media";
  standaard?: string;
  max?: number;
  verplicht?: boolean;
  nadruk?: "precies-een";
  hulp?: string;
  opties?: KeuzeOptie[];
}

export interface SjabloonContext {
  formaat: Formaat;
  vorm: Vorm;
  dia: { index: number; aantal: number; stap: number; stappen: number } | null;
  t(naam: string): string;
  e(naam: string): string;
  leeg(naam: string): boolean;
  voet(naam: string): string;
  merkUrl: string;
  logoBron(stand: string): string;
  logo(stand: string, klasse?: string): string;
  media(naam: string): string | null;
  icoon(naam: string): string;
  route(): string;
  symbolen: string;
}

export interface DiaSoort {
  soort: string;
  naam: string;
  telt: boolean;
  velden: Veld[];
  html(v: Record<string, string>, c: SjabloonContext): string;
  css?: string;
}

export interface Dia {
  soort: string;
  inhoud: Record<string, string>;
}

export interface Sjabloon {
  id: string;
  naam: string;
  doel: string;
  soort: "beeld" | "carrousel";
  formaten: FormaatSleutel[];
  velden: Veld[];
  html(v: Record<string, string>, c: SjabloonContext): string;
  css?: string;
  dias?: DiaSoort[];
  standaardDias?: Dia[];
  maxDias?: number;
}

export interface Merk {
  versie: string;
  naam: string;
  url: string;
  lettertype: { familie: string };
  css: Record<string, string>;
  gronden: Record<"licht" | "inkt" | "accent", { achtergrond: string; tekst: string }>;
  logos: Record<string, string>;
  lettertypeCss?: string;
}

export interface Beeld {
  html: string;
  css: string;
  breedte: number;
  hoogte: number;
  vorm: Vorm;
  titel: string;
}

export const SJABLONEN: Sjabloon[];
export function sjabloon(id: string): Sjabloon | null;
export function escapeHtml(tekst: unknown): string;
export function telNadruk(tekst: unknown): number;
export function metNadruk(tekst: unknown): string;
export function zonderNadruk(tekst: unknown): string;
export function nadrukOmSelectie(
  tekst: unknown,
  begin: number,
  eind: number,
): { tekst: string; begin: number; eind: number } | null;
export function remNaarPx(css: string, breedte: number): string;
export function standaardInhoud(s: Sjabloon, diaSoort?: string | null): Record<string, string>;
export function veldenVan(s: Sjabloon, diaSoort?: string | null): Veld[];
export function bouwBeeld(o: {
  sjabloon: string;
  inhoud?: Record<string, string>;
  dias?: Dia[];
  dia?: number;
  formaat: string;
  merk: Merk;
  media?: Record<string, string>;
}): Beeld;
export function aantalBeelden(s: Sjabloon, dias: Dia[]): number;
