// Wat de AI kost en wat er deze maand al is besteed. Eén regel per aanroep in `<datamap>/ai-usage.jsonl`.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pad } from "../../data/bestanden.js";
import { ApiFout } from "../http.js";
import type { Usage } from "./provider.js";

/**
 * Dollars per miljoen tokens: [invoer, uitvoer, cache lezen]. Cache schrijven (5 minuten) kost 1,25 keer
 * de invoerprijs. Bron: de modellentabel van Anthropic (prijzen per 2026-09-25) en de
 * uitleg over prompt caching; cache lezen is 0,1 keer de invoerprijs, behalve waar de
 * bron een eigen bedrag noemt (Fable 5.1: 0,25; Opus 5.5: 0,20).
 */
const PRIJZEN: Record<string, readonly [number, number, number]> = {
  "claude-fable-5-1": [10, 50, 0.25],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-opus-4-8": [5, 25, 0.5],
  "claude-opus-4-7": [5, 25, 0.5],
  "claude-opus-4-6": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-sonnet-4-6": [3, 15, 0.3],
  "claude-haiku-4-5": [1, 5, 0.1],
};
/** Een model dat niet in de tabel staat, rekent met de duurste prijs: het plafond mag nooit te laag tellen. */
const ONBEKEND = PRIJZEN["claude-fable-5-1"];

export function kostenUsd(model: string, u: Usage): number {
  const [invoer, uitvoer, lezen] = PRIJZEN[model] ?? ONBEKEND;
  return (u.input * invoer + u.output * uitvoer + u.cacheLezen * lezen + u.cacheSchrijven * invoer * 1.25) / 1_000_000;
}

export interface VerbruikRegel {
  tijdstip: string;
  model: string;
  taak: string;
  usd: number;
  ok: boolean;
}

const bestand = (dataDir: string) => pad({ dir: dataDir }, "ai-usage.jsonl");

/** Zet de regel achter de bestaande. Eindigt het bestand niet op een regeleinde (een gecrasht proces), dan begint de nieuwe regel op een eigen regel. */
export async function boek(dataDir: string, regel: VerbruikRegel): Promise<void> {
  const p = bestand(dataDir);
  await mkdir(dirname(p), { recursive: true, mode: 0o700 });
  const bestaand = await readFile(p, "utf8").catch((e) => {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw e;
  });
  const begin = bestaand && !bestaand.endsWith("\n") ? "\n" : "";
  await appendFile(p, begin + JSON.stringify(regel) + "\n", { mode: 0o600 });
}

/**
 * Alles wat in de maand van `nu` (UTC) is geboekt, ook de mislukte aanroepen: die kostten tokens. Het
 * plafond mag nooit te laag tellen, dus een regel die niet te lezen is, of waarvan `usd` geen getal is,
 * geeft een 500 (de live-aanroep wordt dan geweigerd). Alleen een laatste regel zonder regeleinde, het
 * spoor van een gecrasht proces, wordt genegeerd.
 */
export async function maandtotaalUsd(dataDir: string, nu: Date): Promise<number> {
  let tekst: string;
  try {
    tekst = await readFile(bestand(dataDir), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
  const maand = nu.toISOString().slice(0, 7);
  const lijnen = tekst.split("\n");
  let som = 0;
  for (const [i, lijn] of lijnen.entries()) {
    if (!lijn.trim()) continue;
    const onleesbaar = () =>
      new ApiFout(500, `ai-usage.jsonl: regel ${i + 1} is onleesbaar; herstel of verwijder die regel`);
    let r: Partial<VerbruikRegel> | null;
    try {
      r = JSON.parse(lijn);
    } catch {
      if (i === lijnen.length - 1) continue; // de laatste regel zonder regeleinde: een afgebroken schrijfactie
      throw onleesbaar();
    }
    if (typeof r !== "object" || r === null || typeof r.tijdstip !== "string" || !Number.isFinite(r.usd))
      throw onleesbaar();
    if (r.tijdstip.slice(0, 7) === maand) som += r.usd as number;
  }
  return som;
}
