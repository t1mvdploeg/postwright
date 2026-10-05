import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

function dataDir(): string {
  return process.env.POSTWRIGHT_DATA_DIR ?? join(process.cwd(), "data");
}

/** Waar de gegevens staan. `dir` is de datamap; zonder `dir` geldt `POSTWRIGHT_DATA_DIR` of `./data`. */
export interface Opslag { dir?: string }

/**
 * Pad binnen de datamap, bijvoorbeeld `pad(o, "marketing", "posts", "123.json")`. Een resultaat
 * dat buiten de datamap uitkomt (bijvoorbeeld door `..` in een id) wordt geweigerd, zodat één
 * vergeten validatie in een route een fout geeft in plaats van een bestand elders.
 */
export function pad(o: Opslag | undefined, ...delen: string[]): string {
  const wortel = o?.dir ?? dataDir();
  const p = join(wortel, ...delen);
  const rel = relative(wortel, p);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Pad valt buiten de datamap");
  return p;
}

function isOntbreekt(e: unknown): boolean {
  return (e as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** Leest een JSON-bestand; null als het niet bestaat. Onleesbare JSON gooit wel een fout. */
export async function leesJson<T>(p: string): Promise<T | null> {
  let tekst: string;
  try {
    tekst = await readFile(p, "utf8");
  } catch (e) {
    if (isOntbreekt(e)) return null;
    throw e;
  }
  return JSON.parse(tekst) as T;
}

// In-process wachtrij per sleutel: de server draait als één proces.
const wachtrijen = new Map<string, Promise<unknown>>();

/**
 * Voert acties met dezelfde sleutel strikt na elkaar uit; verschillende sleutels lopen
 * parallel. Een fout in een actie blokkeert de volgende acties niet (`vorige.then(actie, actie)`)
 * en gaat alleen naar de aanroeper van die actie. De opruiming in `finally` vergelijkt de
 * bewaarde promise met wat er in de map staat, zodat een inmiddels ingeplande volgende actie
 * niet wordt weggegooid.
 *
 * Nooit genest aanroepen met dezelfde sleutel vanuit een actie die zelf al binnen `serialiseer`
 * van die sleutel draait: dat blokkeert permanent.
 */
export async function serialiseer<T>(sleutel: string, actie: () => Promise<T>): Promise<T> {
  const vorige = wachtrijen.get(sleutel) ?? Promise.resolve();
  const eigen = vorige.then(actie, actie);
  const wacht = eigen.catch(() => undefined);
  wachtrijen.set(sleutel, wacht);
  try {
    return await eigen;
  } finally {
    if (wachtrijen.get(sleutel) === wacht) wachtrijen.delete(sleutel);
  }
}

/**
 * Schrijft naar een uniek tijdelijk bestand, dwingt het naar schijf (fsync) en hernoemt daarna
 * (atomisch op hetzelfde bestandssysteem). Per pad geserialiseerd, zodat de laatste aanroep ook
 * als laatste hernoemt.
 */
export async function schrijfBytesAtomisch(p: string, data: Buffer | string): Promise<void> {
  await serialiseer(`pad:${p}`, async () => {
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    const tmp = `${p}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      const f = await open(tmp, "w", 0o600);
      try {
        await f.writeFile(data);
        await f.sync();
      } finally {
        await f.close();
      }
      await rename(tmp, p);
    } catch (e) {
      await unlink(tmp).catch(() => undefined);
      throw e;
    }
  });
}

export async function schrijfJsonAtomisch(p: string, data: unknown): Promise<void> {
  await schrijfBytesAtomisch(p, JSON.stringify(data, null, 2) + "\n");
}

/** Bestandsnamen in een map; een lege lijst als de map nog niet bestaat. */
export async function lijstMap(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch (e) {
    if (isOntbreekt(e)) return [];
    throw e;
  }
}

/** Verwijdert een bestand; doet niets als het al weg is. */
export async function verwijder(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch (e) {
    if (!isOntbreekt(e)) throw e;
  }
}
