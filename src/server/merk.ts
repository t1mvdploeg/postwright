import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ApiFout, route, type Route } from "./http.js";

const GROND = z.object({ achtergrond: z.string(), tekst: z.string() });

export const MerkSchema = z.object({
  versie: z.string().min(1),
  naam: z.string().min(1),
  url: z.string().url(),
  lettertype: z.object({ familie: z.string().min(1), bestanden: z.array(z.string()).min(1) }),
  css: z.record(z.string().regex(/^--[a-z-]+$/), z.string()),
  kleuren: z
    .array(z.object({ naam: z.string(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), gebruik: z.string() }))
    .min(3),
  gronden: z.object({ licht: GROND, inkt: GROND, accent: GROND }),
  logos: z.record(z.string(), z.string()),
});
export type Merk = z.infer<typeof MerkSchema>;

const INGEBOUWD = fileURLToPath(new URL("../web/marketing/merk", import.meta.url));

/** De map van het actieve merk: `data/brand` als daar een `merk.json` staat, anders de ingebouwde map. */
export function merkMap(dataDir: string, ingebouwd: string = INGEBOUWD): string {
  const eigen = join(dataDir, "brand");
  return existsSync(join(eigen, "merk.json")) ? eigen : ingebouwd;
}

/** Het actieve merk, gecontroleerd. Een fout noemt het bestand en het veld, zonder het pad op de schijf. */
export async function laadMerk(dataDir: string, ingebouwd: string = INGEBOUWD): Promise<Merk> {
  const map = merkMap(dataDir, ingebouwd);
  const label = map === ingebouwd ? "merk/merk.json" : "data/brand/merk.json";
  let ruw: unknown;
  try {
    ruw = JSON.parse(await readFile(join(map, "merk.json"), "utf8"));
  } catch {
    throw new ApiFout(500, `${label}: geen geldige JSON`);
  }
  const r = MerkSchema.safeParse(ruw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ApiFout(500, `${label}: ${i.path.join(".") || "(bestand)"}: ${i.message}`);
  }
  return r.data;
}

/** `GET /api/merk`: het actieve merk. De bestanden erbij staan onder `/marketing/merk/`, zie `merkMap`. */
export function merkRoutes(o: { dataDir: string }): Route[] {
  return [route("GET", "/api/merk", () => laadMerk(o.dataDir))];
}
