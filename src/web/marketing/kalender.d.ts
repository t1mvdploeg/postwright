// Typedeclaratie naast kalender.js (platte browser-ESM, geen build-stap).
export function maandRaster(jaar: number, maand: number): Array<Array<{ datum: string; inMaand: boolean }>>;
export function isoWeek(datum: string): { jaar: number; week: number };
export function dagVan(iso: string): string;
export function echteDatum(d: string): boolean;
export function plusDagen(datum: string, n: number): string;
export function dagenGeleden(iso: string, nu?: Date): number;
export function verzetNaarDag(iso: string, nieuweDag: string): string | null;
export function volgendeMaand(jaar: number, maand: number, stap: number): { jaar: number; maand: number };
export function komendeWeken(
  vandaag: string,
  n: number,
): Array<{ jaar: number; week: number; maandag: string; zondag: string }>;
export function kiesPeriode(
  huidig: { van: string | null; tot: string | null },
  datum: string,
  opties?: { uitbreiden?: boolean },
): { van: string | null; tot: string | null };
export function standaardAantal(van: string, tot: string): number;
export function aantalWerkdagen(van: string, tot: string): number;
