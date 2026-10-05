// Het merk: het ingebouwde merk is geldig en compleet, een eigen merk in data/brand wint, en een kapot
// eigen merk geeft een duidelijke fout zonder de server neer te halen.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server/http.js";
import { MerkSchema, laadMerk, merkMap, merkRoutes } from "../src/server/merk.js";
import { contrastVerhouding } from "../src/web/marketing/kleur.js";
import { controleer } from "../src/web/marketing/merkcontrole.js";
import { sjabloon, standaardInhoud } from "../src/web/marketing/sjablonen.js";

const INGEBOUWD = "src/web/marketing/merk";
const ingebouwd = JSON.parse(readFileSync(join(INGEBOUWD, "merk.json"), "utf8"));

let sluit: (() => Promise<void>) | undefined;
afterEach(async () => {
  await sluit?.();
  sluit = undefined;
});

/** Een server met de merkroute en de merkbestanden, op een verse datamap; `brand` zet bestanden in data/brand. */
async function start(brand?: Record<string, string>) {
  const dataDir = join(mkdtempSync(join(tmpdir(), "pw-merk-")), "data");
  if (brand) {
    mkdirSync(join(dataDir, "brand", "logo"), { recursive: true });
    for (const [pad, inhoud] of Object.entries(brand)) writeFileSync(join(dataDir, "brand", pad), inhoud);
  }
  const s = await startServer({
    dataDir,
    routes: merkRoutes({ dataDir }),
    statisch: [{ prefix: "/marketing/merk/", map: () => merkMap(dataDir) }],
  });
  sluit = s.sluit;
  return s;
}

const eigenMerk = { ...ingebouwd, naam: "Testmerk", logos: { standaard: "logo/x.svg" } };

describe("het ingebouwde merk", () => {
  it("voldoet aan het schema en noemt alleen bestanden die bestaan", () => {
    const m = MerkSchema.parse(ingebouwd);
    for (const pad of [...Object.values(m.logos), ...m.lettertype.bestanden]) {
      expect(existsSync(join(INGEBOUWD, pad)), pad).toBe(true);
    }
    expect(existsSync(join(INGEBOUWD, "fonts", "LICENSE.txt"))).toBe(true);
  });

  it("haalt in elke ondergrond contrast 4,5 op 1", () => {
    for (const [naam, g] of Object.entries(MerkSchema.parse(ingebouwd).gronden)) {
      expect(contrastVerhouding(g.tekst, g.achtergrond), naam).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("heeft de logostanden die de sjablonen vragen", () => {
    for (const stand of ["standaard", "op-inkt", "op-accent", "merkteken", "merkteken-op-inkt"]) {
      expect(ingebouwd.logos, stand).toHaveProperty(stand);
    }
  });
});

describe("GET /api/merk", () => {
  it("geeft zonder eigen merk het ingebouwde merk, en serveert zijn bestanden", async () => {
    const { url } = await start();
    const r = await fetch(`${url}/api/merk`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(ingebouwd);
    const logo = await fetch(`${url}/marketing/merk/${ingebouwd.logos.standaard}`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    const font = await fetch(`${url}/marketing/merk/${ingebouwd.lettertype.bestanden[0]}`);
    expect(font.headers.get("content-type")).toBe("font/woff2");
  });

  it("geeft een geldig merk uit data/brand, en serveert het bestand uit data/brand", async () => {
    const { url } = await start({ "merk.json": JSON.stringify(eigenMerk), "logo/x.svg": "<svg>eigen</svg>" });
    expect(await (await fetch(`${url}/api/merk`)).json()).toMatchObject({
      naam: "Testmerk",
      logos: { standaard: "logo/x.svg" },
    });
    const logo = await fetch(`${url}/marketing/merk/logo/x.svg`);
    expect(await logo.text()).toBe("<svg>eigen</svg>");
    // Een bestand dat alleen in het ingebouwde merk staat, komt niet stilletjes mee.
    expect((await fetch(`${url}/marketing/merk/${ingebouwd.logos.standaard}`)).status).toBe(404);
  });

  it("geeft 500 met bestand en veld bij een merk met een ongeldige url, en de server blijft draaien", async () => {
    const { url } = await start({ "merk.json": JSON.stringify({ ...eigenMerk, url: "geen-url" }) });
    const r = await fetch(`${url}/api/merk`);
    expect(r.status).toBe(500);
    const { fout } = await r.json();
    expect(fout).toContain("data/brand/merk.json");
    expect(fout).toContain("url");
    expect((await fetch(`${url}/api/merk`)).status).toBe(500);
    expect((await fetch(`${url}/api/bestaat-niet`)).status).toBe(404);
  });

  it("geeft 500 bij een merk.json dat geen JSON is, zonder het pad op de schijf te noemen", async () => {
    const { url } = await start({ "merk.json": "{ kapot" });
    const r = await fetch(`${url}/api/merk`);
    expect(r.status).toBe(500);
    const { fout } = await r.json();
    expect(fout).toContain("data/brand/merk.json");
    expect(fout).not.toContain(tmpdir());
    expect((await fetch(`${url}/api/merk`)).status).toBe(500);
  });

  it("laat geen bestanden buiten de merkmap uit", async () => {
    const { url } = await start({ "merk.json": JSON.stringify(eigenMerk), "logo/x.svg": "<svg/>" });
    expect((await fetch(`${url}/marketing/merk/..%2F..%2Fgeheim.json`)).status).toBe(404);
    expect((await fetch(`${url}/marketing/merk/%2e%2e/merk.json`)).status).toBe(404);
  });
});

describe("laadMerk", () => {
  it("noemt het veld waar het merk faalt", async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), "pw-merk-")), "data");
    mkdirSync(join(dataDir, "brand"), { recursive: true });
    writeFileSync(join(dataDir, "brand", "merk.json"), JSON.stringify({ ...eigenMerk, kleuren: [] }));
    await expect(laadMerk(dataDir, INGEBOUWD)).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/^data\/brand\/merk\.json: kleuren:/),
    });
  });
});

describe("merkversie in de merkcontrole", () => {
  it("meldt een post die met een andere merkversie is gemaakt", () => {
    const s = sjabloon("stelling")!;
    const post = { sjabloon: "stelling", formaten: ["li-vierkant"], inhoud: standaardInhoud(s), merkVersie: "oud" };
    const uitslag = controleer({
      post,
      sjabloon: s,
      instellingen: { kanalen: [], verbodenWoorden: [] },
      vandaag: "2026-10-01",
      merkVersie: ingebouwd.versie,
    });
    expect(uitslag.bevindingen.map((b) => b.code)).toContain("merkversie");
    const gelijk = controleer({
      post: { ...post, merkVersie: ingebouwd.versie },
      sjabloon: s,
      instellingen: { kanalen: [], verbodenWoorden: [] },
      vandaag: "2026-10-01",
      merkVersie: ingebouwd.versie,
    });
    expect(gelijk.bevindingen.map((b) => b.code)).not.toContain("merkversie");
  });

  it("geeft een fout als de tekst op een ondergrond te weinig contrast heeft", () => {
    const s = sjabloon("stelling")!;
    const merk = { gronden: { ...ingebouwd.gronden, accent: { achtergrond: "#D63E22", tekst: "#E0603F" } } };
    const uitslag = controleer({
      post: {
        sjabloon: "stelling",
        formaten: ["li-vierkant"],
        inhoud: { ...standaardInhoud(s), ondergrond: "accent" },
      },
      sjabloon: s,
      instellingen: { kanalen: [], verbodenWoorden: [] },
      vandaag: "2026-10-01",
      merk,
    });
    expect(uitslag.bevindingen.find((b) => b.code === "contrast")).toMatchObject({ niveau: "fout" });
  });
});
