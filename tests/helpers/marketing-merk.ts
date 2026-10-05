// Het ingebouwde merk van de Marketingstudio zoals de browser het laadt (`src/web/marketing/merk.js`),
// maar dan van schijf: logo's als data-URI, zonder lettertype (dat maakt de tests niet trager of
// groter en verandert de markup niet; de familienaam staat wel in het merk).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Merk } from "../../src/web/marketing/sjablonen.js";

const MAP = "src/web/marketing/merk";

export function merkVanSchijf(): Merk {
  const m = JSON.parse(readFileSync(join(MAP, "merk.json"), "utf8"));
  const logos = Object.fromEntries(
    Object.entries(m.logos as Record<string, string>).map(([stand, pad]) => [
      stand,
      `data:image/svg+xml;base64,${readFileSync(join(MAP, pad)).toString("base64")}`,
    ]),
  );
  return { ...m, logos, lettertypeCss: "" };
}
