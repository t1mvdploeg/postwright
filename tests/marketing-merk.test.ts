// Marketingstudio — de merkbestanden van de studio zijn letterlijk die van de kit (ontwerpregel 3).
// Past iemand de kit aan zonder de studio mee te nemen (of andersom), dan valt dat hier op.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const STUDIO = "src/web/marketing/merk";
const merk = JSON.parse(readFileSync(join(STUDIO, "merk.json"), "utf8"));
const KIT = merk.kit as string;

/** De bron in de kit van een studiobestand. */
function bronVan(pad: string): string {
  if (pad === "logo/mijntarieftool-logo-e-mail.png") {
    // De Mixed-kit heeft geen PNG-logo's; het e-maillogo komt uit de Claude-kit.
    return "docs/ontwerpen/brand-kits/Claude/mijntarieftool/logo/png/mijntarieftool-logo-e-mail.png";
  }
  if (pad.startsWith("profiel/")) return join(KIT, "profielfotos", pad.slice("profiel/".length));
  if (pad === "iconen.svg") return join(KIT, "iconen", "iconen.svg");
  return join(KIT, pad);
}

function alleBestanden(map: string): string[] {
  return readdirSync(map).flatMap((n) => {
    const p = join(map, n);
    return statSync(p).isDirectory() ? alleBestanden(p) : [p];
  });
}

// Task 7 removes this skip: the brand files and this test are replaced there.
describe.skip("merkbestanden van de studio", () => {
  it("is elk bestand byte-gelijk aan zijn bron in de kit", () => {
    const bestanden = alleBestanden(STUDIO).map((p) => relative(STUDIO, p)).filter((p) => p !== "merk.json");
    expect(bestanden.length).toBeGreaterThan(30);
    for (const p of bestanden) {
      expect(readFileSync(join(STUDIO, p)).equals(readFileSync(bronVan(p))), p).toBe(true);
    }
  });

  it("noemt in merk.json alleen bestanden die bestaan, en alle logo's", () => {
    const genoemd = [
      ...Object.values(merk.logos as Record<string, string>),
      ...merk.bestanden.logo, ...merk.bestanden.motieven, ...merk.bestanden.profiel,
      merk.bestanden.iconen, merk.bestanden.eMailLogo,
    ] as string[];
    for (const p of genoemd) expect(() => statSync(join(STUDIO, p)), p).not.toThrow();
    expect(merk.bestanden.logo.length).toBe(readdirSync(join(STUDIO, "logo")).length);
  });

  it("heeft dezelfde kleuren als de kit: de sjabloonvariabelen uit merk.css en het palet uit tokens.json", () => {
    const kitCss = readFileSync(join(KIT, "merk.css"), "utf8");
    for (const [naam, waarde] of Object.entries(merk.css as Record<string, string>)) {
      expect(kitCss, naam).toContain(`${naam}: ${waarde};`);
    }
    const tokens = JSON.parse(readFileSync(join(KIT, "paletten", "tokens.json"), "utf8"));
    expect(merk.kleuren.map((k: { hex: string }) => k.hex)).toEqual(tokens.kleuren.map((k: { hex: string }) => k.hex));
  });
});
