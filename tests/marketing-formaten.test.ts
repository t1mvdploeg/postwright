// Marketingstudio — de formatentabel en de bestandsnamen.
import { describe, it, expect } from "vitest";
import {
  FORMATEN,
  KANALEN,
  bestandsnaam,
  formaat,
  kanalenVan,
  overlapt,
  slugVan,
  vormVan,
} from "../src/web/marketing/formaten.js";
import { FORMAAT_SLEUTELS, KANALEN as SERVER_KANALEN } from "../src/model/marketing-schema.js";

describe("formaten", () => {
  it("heeft dezelfde sleutels en kanalen als het serverschema", () => {
    expect(FORMATEN.map((f) => f.sleutel).sort()).toEqual([...FORMAAT_SLEUTELS].sort());
    expect(Object.keys(KANALEN).sort()).toEqual([...SERVER_KANALEN].sort());
  });

  it("heeft unieke sleutels, positieve maten en veilige zones binnen het beeld", () => {
    expect(new Set(FORMATEN.map((f) => f.sleutel)).size).toBe(FORMATEN.length);
    for (const f of FORMATEN) {
      expect(f.breedte).toBeGreaterThan(0);
      expect(f.hoogte).toBeGreaterThan(0);
      for (const z of f.veiligeZones) {
        expect(z.x + z.breedte, f.sleutel).toBeLessThanOrEqual(f.breedte);
        expect(z.y + z.hoogte, f.sleutel).toBeLessThanOrEqual(f.hoogte);
      }
    }
  });

  it("kent de maten van de kit en de story-zones van 250 px", () => {
    expect(formaat("li-vierkant")).toMatchObject({ breedte: 1200, hoogte: 1200 });
    expect(formaat("li-staand")).toMatchObject({ breedte: 1080, hoogte: 1350 });
    expect(formaat("story").veiligeZones.map((z) => z.hoogte)).toEqual([250, 250]);
    expect(() => formaat("poster")).toThrow(/Onbekend formaat/);
  });

  it("bepaalt de vorm uit de beeldverhouding", () => {
    expect(vormVan(formaat("li-vierkant"))).toBe("vierkant");
    expect(vormVan(formaat("li-staand"))).toBe("staand");
    expect(vormVan(formaat("story"))).toBe("story");
    expect(vormVan(formaat("breed"))).toBe("liggend");
    expect(vormVan(formaat("li-link"))).toBe("liggend");
    expect(vormVan(formaat("li-profiel"))).toBe("banner");
    expect(vormVan(formaat("li-bedrijf"))).toBe("banner");
  });
});

describe("bestandsnamen", () => {
  it("maakt slugs zonder accenten en leestekens", () => {
    expect(slugVan("Café Überpost!")).toBe("cafe-uberpost");
    expect(slugVan("  --Najaar 2026--  ")).toBe("najaar-2026");
    expect(slugVan("x".repeat(60))).toHaveLength(40);
    expect(slugVan(null)).toBe("");
  });

  it("volgt het vaste patroon, laat een lege campagne weg en nummert dia's met een voorloopnul", () => {
    expect(
      bestandsnaam({ merk: "Postwright", campagne: "Najaar", post: "Nu bent u aan zet", formaat: "li-staand" }),
    ).toBe("postwright_najaar_nu-bent-u-aan-zet_li-staand_1080x1350.png");
    expect(bestandsnaam({ merk: "Postwright", post: "Stelling", formaat: "li-vierkant" })).toBe(
      "postwright_stelling_li-vierkant_1200x1200.png",
    );
    expect(bestandsnaam({ merk: "Postwright", post: "Carrousel", formaat: "li-carrousel", dia: 3 })).toBe(
      "postwright_carrousel_li-carrousel_1080x1350_dia-03.png",
    );
    expect(bestandsnaam({ merk: "Postwright", post: "", formaat: "li-link", extensie: "jpg" })).toBe(
      "postwright_post_li-link_1200x630.jpg",
    );
    // De merknaam komt uit het merk: een ander merk geeft een ander voorvoegsel, geen merk geeft er geen.
    expect(bestandsnaam({ merk: "Ander Merk", post: "Stelling", formaat: "li-vierkant" })).toBe(
      "ander-merk_stelling_li-vierkant_1200x1200.png",
    );
    expect(bestandsnaam({ post: "Stelling", formaat: "li-vierkant" })).toBe("stelling_li-vierkant_1200x1200.png");
  });

  it("herkent overlap van rechthoeken", () => {
    expect(overlapt({ x: 0, y: 0, breedte: 10, hoogte: 10 }, { x: 5, y: 5, breedte: 10, hoogte: 10 })).toBe(true);
    expect(overlapt({ x: 0, y: 0, breedte: 10, hoogte: 10 }, { x: 10, y: 0, breedte: 10, hoogte: 10 })).toBe(false);
    expect(overlapt({ x: 0, y: 0, breedte: 10, hoogte: 10 }, { x: 9, y: 0, breedte: 10, hoogte: 10 }, 2)).toBe(false);
  });
});

describe("kanalenVan", () => {
  it("combineert de kanalen van de formaten met die van niet-lege postteksten", () => {
    expect(
      kanalenVan({ formaten: ["li-vierkant", "story"], posttekst: { x: "  ", facebook: "Hallo" } }).sort(),
    ).toEqual(["facebook", "instagram", "linkedin"]);
    expect(kanalenVan({})).toEqual([]);
  });
});
