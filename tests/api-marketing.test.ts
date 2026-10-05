// De studio-routes onder /api: recepten met versiecontrole, statusovergangen die de merkcontrole als
// poort gebruiken, en uploads die alleen echte PNG/JPEG/WebP toelaten.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { maakPost } from "../src/data/marketing.js";
import { startStudio } from "./helpers/studio.js";
import type { Post } from "../src/model/marketing-schema.js";

let basis = "";
let dataDir = "";
let sluit: () => Promise<void>;

const API = "/api";

async function vraag(pad: string, opties: { methode?: string; body?: unknown; headers?: Record<string, string>; ruw?: Buffer } = {}) {
  const headers: Record<string, string> = { ...(opties.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opties.ruw) body = new Uint8Array(opties.ruw);
  else if (opties.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opties.body); }
  const r = await fetch(basis + pad, { method: opties.methode ?? (body ? "POST" : "GET"), headers, body });
  const tekst = await r.text();
  let data: any = null;
  try { data = tekst ? JSON.parse(tekst) : null; } catch { data = tekst; }
  return { status: r.status, body: data, headers: r.headers };
}

const nu = () => new Date().toISOString();
const GROEN = () => ({ fouten: 0, letOp: 0, op: nu() });

function recept(extra: Record<string, unknown> = {}) {
  return {
    titel: "Stelling: nu bent u aan zet",
    soort: "beeld",
    sjabloon: "stelling",
    formaten: ["li-vierkant", "li-staand"],
    inhoud: { ondergrond: "blauw", kop: "Genoeg gezien. *Nu bent u aan zet.*", tekst: "Een korte tekst bij de kop." },
    merkVersie: "test-1.0",
    controle: GROEN(),
    ...extra,
  };
}

async function nieuwePost(extra: Record<string, unknown> = {}): Promise<Post> {
  const r = await vraag(`${API}/posts`, { body: recept(extra) });
  expect(r.status).toBe(201);
  return r.body;
}

beforeAll(async () => {
  ({ dataDir, basis, sluit } = await startStudio());
});

afterAll(async () => {
  await sluit();
});

describe("posts", () => {
  it("maakt een concept aan met versie 1 en een geschiedenisregel, in de rootmap", async () => {
    const p = await nieuwePost();
    expect(p.id).toMatch(/^p-[0-9a-f-]{36}$/);
    expect(p).toMatchObject({ versie: 1, status: "concept", gepland: null, gepubliceerd: null });
    expect(p.geschiedenis).toHaveLength(1);
    expect(existsSync(join(dataDir, "marketing", "posts", `${p.id}.json`))).toBe(true);
  });

  it("leest, lijst zonder geschiedenis en filtert op status", async () => {
    const p = await nieuwePost({ titel: "Voor de lijst" });
    expect((await vraag(`${API}/posts/${p.id}`)).body.titel).toBe("Voor de lijst");
    const lijst = await vraag(`${API}/posts?status=concept`);
    const regel = lijst.body.posts.find((x: Post) => x.id === p.id);
    expect(regel.titel).toBe("Voor de lijst");
    expect(regel.geschiedenis).toBeUndefined();
    expect((await vraag(`${API}/posts?status=gepubliceerd`)).body.posts.some((x: Post) => x.id === p.id)).toBe(false);
  });

  it("slaat op met de verwachte versie en weigert een verouderde versie met 409", async () => {
    const p = await nieuwePost();
    const r1 = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...recept({ titel: "Eerste wijziging" }), versie: 1 } });
    expect(r1.status).toBe(200);
    expect(r1.body.versie).toBe(2);
    const r2 = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...recept({ titel: "Oud venster" }), versie: 1 } });
    expect(r2.status).toBe(409);
    expect(r2.body.fout).toMatch(/ander venster/);
    expect((await vraag(`${API}/posts/${p.id}`)).body.titel).toBe("Eerste wijziging");
  });

  it("wist de controle als de inhoud verandert zonder nieuwe controle, en houdt hem bij alleen een nieuwe titel", async () => {
    const p = await nieuwePost();
    const { controle: _c, ...zonderControle } = recept();
    const titel = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...zonderControle, titel: "Andere titel", versie: 1 } });
    expect(titel.body.controle).not.toBeNull();
    const inhoud = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...zonderControle, inhoud: { kop: "Nieuwe *kop*" }, versie: 2 } });
    expect(inhoud.body.controle).toBeNull();
  });

  it("weigert onbekende formaten, een http-link, onbekende velden en een campagne die niet bestaat", async () => {
    expect((await vraag(`${API}/posts`, { body: recept({ formaten: ["poster-a0"] }) })).status).toBe(400);
    expect((await vraag(`${API}/posts`, { body: recept({ formaten: ["li-vierkant", "li-vierkant"] }) })).status).toBe(400);
    expect((await vraag(`${API}/posts`, { body: recept({ link: "javascript:alert(1)" }) })).status).toBe(400);
    expect((await vraag(`${API}/posts`, { body: recept({ link: "http://example.com" }) })).status).toBe(400);
    expect((await vraag(`${API}/posts`, { body: recept({ geheim: "x" }) })).status).toBe(400);
    expect((await vraag(`${API}/posts`, { body: recept({ inhoud: { kop: "x".repeat(2001) } }) })).status).toBe(400);
    const r = await vraag(`${API}/posts`, { body: recept({ campagne: "c-00000000-0000-4000-8000-000000000000" }) });
    expect(r.status).toBe(400);
    expect(r.body.fout).toMatch(/campagne/);
  });

  it("weigert een ongeldig id met 400 en een onbekend id met 404", async () => {
    expect((await vraag(`${API}/posts/..%2F..%2Fbedrijven`)).status).toBe(400);
    expect((await vraag(`${API}/posts/p-00000000-0000-4000-8000-000000000000`)).status).toBe(404);
  });

  it("dupliceert als nieuw concept en wist", async () => {
    const p = await nieuwePost({ titel: "Origineel" });
    const kopie = await vraag(`${API}/posts/${p.id}/dupliceer`, { body: {} });
    expect(kopie.status).toBe(201);
    expect(kopie.body).toMatchObject({ titel: "Kopie van Origineel", status: "concept", versie: 1 });
    expect(kopie.body.id).not.toBe(p.id);
    expect((await vraag(`${API}/posts/${kopie.body.id}`, { methode: "DELETE" })).status).toBe(200);
    expect((await vraag(`${API}/posts/${kopie.body.id}`)).status).toBe(404);
  });
});

describe("utm_content wijst naar de eigen post", () => {
  it("zet bij aanmaken, opslaan en dupliceren het eigen post-id in elke studio-link", async () => {
    const link = "https://example.com/?utm_source=linkedin&utm_medium=social";
    const p = await nieuwePost({ posttekst: { linkedin: `Lees meer op ${link}.` } });
    expect(p.posttekst.linkedin).toBe(`Lees meer op ${link}&utm_content=${p.id}.`);
    const kopie = (await vraag(`${API}/posts/${p.id}/dupliceer`, { body: {} })).body;
    expect(kopie.posttekst.linkedin).toContain(`utm_content=${kopie.id}`);
    expect(kopie.posttekst.linkedin).not.toContain(p.id);
    const r = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...recept({ posttekst: { linkedin: `${link}&utm_content=p-verkeerd` } }), versie: p.versie } });
    expect(r.status).toBe(200);
    expect(r.body.posttekst.linkedin).toBe(`${link}&utm_content=${p.id}`);
  });
});

describe("statusovergangen", () => {
  const TOEKOMST = "2099-06-01T09:30:00+02:00";

  it("plant alleen met een controle zonder fouten en een moment in de toekomst", async () => {
    const zonder = await nieuwePost({ controle: null });
    const r0 = await vraag(`${API}/posts/${zonder.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } });
    expect(r0.status).toBe(409);
    expect(r0.body.fout).toMatch(/merkcontrole/);

    const fout = await nieuwePost({ controle: { fouten: 2, letOp: 0, op: nu() } });
    const r1 = await vraag(`${API}/posts/${fout.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } });
    expect(r1.status).toBe(409);
    expect(r1.body.fout).toMatch(/2 fouten/);

    const p = await nieuwePost();
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland" } })).status).toBe(400);
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: "2020-01-01T09:00:00+01:00" } })).status).toBe(400);
    const ok = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "gepland", gepland: TOEKOMST });
    // Verzetten mag: gepland → gepland met een nieuwe datum.
    const verzet = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: "2099-06-02T09:30:00+02:00" } });
    expect(verzet.body.gepland).toBe("2099-06-02T09:30:00+02:00");
    expect(verzet.body.geschiedenis.at(-1).wat).toMatch(/verzet/);
  });

  it("weigert plannen en publiceren als een gekoppeld feit intussen is ingetrokken, verlopen of gewist (reviewbevinding 2)", async () => {
    const f = await vraag(`${API}/feiten`, { body: { tekst: "Postwright exports PNG, PDF and ZIP", soort: "product", bron: { soort: "site", verwijzing: "README.md" }, status: "actief" } });
    const p = await nieuwePost({ feiten: [f.body.id] });
    const { id: _i, aangemaakt: _a, gewijzigd: _g, ...rest } = f.body;
    await vraag(`${API}/feiten/${f.body.id}`, { methode: "PUT", body: { ...rest, status: "ingetrokken" } });
    const r = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } });
    expect(r.status).toBe(409);
    expect(r.body.fout).toMatch(/feit/);
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd" } })).status).toBe(409);
    await vraag(`${API}/feiten/${f.body.id}`, { methode: "PUT", body: { ...rest, status: "actief", geldigTot: "2020-01-01", geldigVan: null } });
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } })).status).toBe(409);
    await vraag(`${API}/feiten/${f.body.id}`, { methode: "PUT", body: { ...rest, status: "actief", geldigTot: null } });
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } })).status).toBe(200);
    // Terug naar concept en archiveren blijven altijd kunnen.
    await vraag(`${API}/feiten/${f.body.id}`, { methode: "PUT", body: { ...rest, status: "ingetrokken" } });
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "concept" } })).status).toBe(200);
  });

  it("zet een geplande post terug naar concept als hij na een wijziging niet meer door de controle komt", async () => {
    const p = await nieuwePost();
    const gepland = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } });
    const r = await vraag(`${API}/posts/${p.id}`, { methode: "PUT", body: { ...recept({ controle: { fouten: 1, letOp: 0, op: nu() } }), versie: gepland.body.versie } });
    expect(r.body.status).toBe("concept");
    expect(r.body.geschiedenis.at(-1).wat).toMatch(/terug naar concept/);
  });

  it("publiceert met een https-url, archiveert, en haalt uit het archief alleen via concept", async () => {
    const p = await nieuwePost();
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd", url: "http://linkedin.com/x" } })).status).toBe(400);
    const pub = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd", url: "https://www.linkedin.com/feed/update/1" } });
    expect(pub.body.status).toBe("gepubliceerd");
    expect(pub.body.gepubliceerd.url).toBe("https://www.linkedin.com/feed/update/1");
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } })).status).toBe(409);
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd" } })).status).toBe(409);
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gearchiveerd" } })).status).toBe(200);
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: TOEKOMST } })).status).toBe(409);
    const terug = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "concept" } });
    expect(terug.body).toMatchObject({ status: "concept", gepubliceerd: { url: "https://www.linkedin.com/feed/update/1" } });
    expect((await vraag(`${API}/posts/${p.id}`)).body.geschiedenis.map((g: { wat: string }) => g.wat)).toEqual(
      expect.arrayContaining(["gepubliceerd", "gearchiveerd", "terug naar concept"]),
    );
  });
});

describe("campagnes, teksten en feiten", () => {
  it("maakt campagnes met een unieke UTM-naam en weigert wissen zolang er een post bij hoort", async () => {
    const c = await vraag(`${API}/campagnes`, { body: { naam: "Najaar", utmCampagne: "najaar-2026", van: "2026-10-01", tot: "2026-12-31" } });
    expect(c.status).toBe(201);
    expect((await vraag(`${API}/campagnes`, { body: { naam: "Dubbel", utmCampagne: "najaar-2026" } })).status).toBe(409);
    expect((await vraag(`${API}/campagnes`, { body: { naam: "Omgekeerd", utmCampagne: "omgekeerd", van: "2026-12-01", tot: "2026-01-01" } })).status).toBe(400);
    expect((await vraag(`${API}/campagnes`, { body: { naam: "Hoofdletters", utmCampagne: "Najaar" } })).status).toBe(400);
    const p = await nieuwePost({ campagne: c.body.id });
    const weg = await vraag(`${API}/campagnes/${c.body.id}`, { methode: "DELETE" });
    expect(weg.status).toBe(409);
    expect(weg.body.fout).toMatch(/archiveer/);
    await vraag(`${API}/posts/${p.id}`, { methode: "DELETE" });
    expect((await vraag(`${API}/campagnes/${c.body.id}`, { methode: "DELETE" })).status).toBe(200);
  });

  it("wijzigt en wist teksten", async () => {
    const t = await vraag(`${API}/teksten`, { body: { soort: "hashtags", naam: "Standaard", tekst: "#launch" } });
    expect(t.status).toBe(201);
    const w = await vraag(`${API}/teksten/${t.body.id}`, { methode: "PUT", body: { soort: "hashtags", naam: "Standaard", tekst: "#release" } });
    expect(w.body.tekst).toBe("#release");
    expect(w.body.aangemaakt).toBe(t.body.aangemaakt);
    expect((await vraag(`${API}/teksten/t-00000000-0000-4000-8000-000000000000`, { methode: "PUT", body: { soort: "opening", naam: "x", tekst: "y" } })).status).toBe(404);
    expect((await vraag(`${API}/teksten/${t.body.id}`, { methode: "DELETE" })).status).toBe(200);
  });

  it("eist bij een externe bron een https-adres, en weigert wissen zolang een post het feit gebruikt", async () => {
    const zonder = await vraag(`${API}/feiten`, { body: { tekst: "Een claim", soort: "extern", bron: { soort: "extern", verwijzing: "geen adres" } } });
    expect(zonder.status).toBe(400);
    expect(zonder.body.fout).toMatch(/https/);
    expect((await vraag(`${API}/feiten`, { body: { tekst: "Een claim", soort: "oud", bron: { soort: "site", verwijzing: "README.md" } } })).status).toBe(400);
    expect((await vraag(`${API}/feiten`, { body: { tekst: "Een claim", soort: "extern", bron: { soort: "kennis", verwijzing: "x" } } })).status).toBe(400);
    const f = await vraag(`${API}/feiten`, { body: { tekst: "Een claim", soort: "extern", bron: { soort: "extern", verwijzing: "https://example.com/bron" }, geldigTot: "2026-12-31" } });
    expect(f.status).toBe(201);
    expect(f.body).toMatchObject({ status: "concept", soort: "extern" });
    const p = await nieuwePost({ feiten: [f.body.id] });
    const weg = await vraag(`${API}/feiten/${f.body.id}`, { methode: "DELETE" });
    expect(weg.status).toBe(409);
    expect(weg.body.fout).toMatch(/ingetrokken/);
    await vraag(`${API}/posts/${p.id}`, { methode: "DELETE" });
  });
});

describe("instellingen en overzicht", () => {
  it("geeft standaardinstellingen, bewaart geldige en weigert ongeldige", async () => {
    const standaard = await vraag(`${API}/instellingen`);
    expect(standaard.body.kanalen).toEqual(["linkedin"]);
    expect(standaard.body.schrijfhulp.aan).toBe(false);
    const nieuw = { ...standaard.body, kanalen: ["linkedin", "instagram"], verbodenWoorden: ["gratis"] };
    expect((await vraag(`${API}/instellingen`, { methode: "PUT", body: nieuw })).status).toBe(200);
    expect((await vraag(`${API}/instellingen`)).body.kanalen).toEqual(["linkedin", "instagram"]);
    expect((await vraag(`${API}/instellingen`, { methode: "PUT", body: { ...nieuw, kanalen: ["tiktok"] } })).status).toBe(400);
  });

  it("telt geplande, achterstallige en concepten, en noemt de eerstvolgende", async () => {
    const morgen = new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace("Z", "+00:00");
    const p = await nieuwePost({ titel: "Morgen" });
    await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepland", gepland: morgen } });
    // Een post die gisteren gepland stond: die kan niet via de API (datum in het verleden), dus rechtstreeks.
    const gisteren = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await maakPost({ dir: dataDir }, {
      ...(await vraag(`${API}/posts/${p.id}`)).body, id: "p-11111111-1111-4111-8111-111111111111", status: "gepland", gepland: gisteren,
    });
    const o = await vraag(`${API}/overzicht`);
    expect(o.status).toBe(200);
    expect(o.body.geplandDezeWeek).toBeGreaterThanOrEqual(1);
    expect(o.body.overDatum).toBeGreaterThanOrEqual(1);
    expect(o.body.concepten).toBeGreaterThanOrEqual(1);
    expect(o.body.volgende.some((v: Post) => v.titel === "Morgen")).toBe(true);
    expect(o.body.volgende.every((v: Post) => v.geschiedenis === undefined)).toBe(true);
  });
});

describe("media", () => {
  function png(breedte: number, hoogte: number): Buffer {
    const b = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1");
    b.writeUInt32BE(breedte, 16); b.writeUInt32BE(hoogte, 20);
    return b;
  }
  function jpeg(breedte: number, hoogte: number): Buffer {
    // SOI, APP0 (lengte 16), SOF0 met hoogte en breedte.
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, hoogte >> 8, hoogte & 255, breedte >> 8, breedte & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
  }
  function webp(breedte: number, hoogte: number): Buffer {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0, "latin1"); b.write("WEBP", 8, "latin1"); b.write("VP8X", 12, "latin1");
    b.writeUIntLE(breedte - 1, 24, 3); b.writeUIntLE(hoogte - 1, 27, 3);
    return b;
  }
  const upload = (inhoud: Buffer, type = "application/octet-stream") => vraag(`${API}/media`, {
    methode: "POST", ruw: inhoud, headers: { "content-type": type },
  });
  // Een echte, kleinste PNG: 1 bij 1 pixel.
  const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  it("neemt PNG, JPEG en WebP aan, met de afmetingen uit het bestand", async () => {
    const a = await upload(png(1440, 900));
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ breedte: 1440, hoogte: 900 });
    expect(a.body.id).toMatch(/^[0-9a-f]{32}\.png$/);
    expect((await upload(jpeg(800, 600))).body).toMatchObject({ breedte: 800, hoogte: 600 });
    expect((await upload(webp(640, 480))).body).toMatchObject({ breedte: 640, hoogte: 480 });
    // Hetzelfde bestand opnieuw: hetzelfde id.
    expect((await upload(png(1440, 900))).body.id).toBe(a.body.id);
    const lijst = await vraag(`${API}/media`);
    expect(lijst.body.media.length).toBeGreaterThanOrEqual(3);
  });

  it("vindt de afmetingen in de lijst ook als de kop van een JPEG groot is, zonder elk bestand helemaal te lezen (reviewbevinding 7)", async () => {
    // Twee APP1-segmenten van bijna 64 kB (zoals EXIF met een miniatuur) vóór de SOF-marker.
    const app = (n: number) => Buffer.concat([Buffer.from([0xff, 0xe1, 0xff, 0xf0]), Buffer.alloc(0xffee, n)]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const groot = Buffer.concat([Buffer.from([0xff, 0xd8]), app(1), app(2), app(3), app(4), app(5), sof]);
    const a = await upload(groot);
    expect(a.body).toMatchObject({ breedte: 800, hoogte: 600 });
    const regel = (await vraag(`${API}/media`)).body.media.find((m: { id: string }) => m.id === a.body.id);
    expect(regel).toMatchObject({ breedte: 800, hoogte: 600, bytes: groot.length });
  });

  it("weigert SVG en HTML, ook als de aanvraag zegt dat het een PNG is", async () => {
    const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/png");
    expect(svg.status).toBe(400);
    const html = await upload(Buffer.from("<!doctype html><script>alert(1)</script>"), "image/png");
    expect(html.status).toBe(400);
    expect(html.body.fout).toMatch(/PNG, JPEG of WebP/);
    expect((await upload(Buffer.alloc(0), "image/png")).status).toBe(400);
    expect((await upload(png(9000, 10))).status).toBe(400);
  });

  it("weigert 5 MB + 1 byte met 413 en neemt precies 5 MB wel aan", async () => {
    const MB5 = 5 * 1024 * 1024;
    const kop = png(10, 10);
    expect((await upload(Buffer.concat([kop, Buffer.alloc(MB5 + 1 - kop.length)]), "image/png")).status).toBe(413);
    expect((await upload(Buffer.concat([kop, Buffer.alloc(MB5 - kop.length)]), "image/png")).status).toBe(201);
  });

  it("bewaart een geldig PNG van 1 bij 1 en geeft precies die bytes terug", async () => {
    const a = await upload(PNG_1X1, "image/png");
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ breedte: 1, hoogte: 1, bytes: PNG_1X1.length });
    const r = await fetch(`${basis}${API}/media/${a.body.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG_1X1)).toBe(true);
  });

  it("serveert een beeld met het juiste type en een afsluitende CSP, en geeft 400/404 bij een fout id", async () => {
    const a = await upload(png(20, 20));
    const r = await fetch(`${basis}${API}/media/${a.body.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(Buffer.from(await r.arrayBuffer()).equals(png(20, 20))).toBe(true);
    expect((await vraag(`${API}/media/..%2Fpackage.json`)).status).toBe(400);
    expect((await vraag(`${API}/media/${"0".repeat(32)}.png`)).status).toBe(404);
    expect(readFileSync(join(dataDir, "marketing", "media", a.body.id)).length).toBe(40);
  });

  it("wist een ongebruikt beeld en weigert een beeld dat een post gebruikt, ook een gearchiveerde", async () => {
    const id = (await upload(png(12, 12))).body.id;
    const p = await nieuwePost({ sjabloon: "productbeeld", inhoud: { beeld: id, kop: "Een *kop.*" } });
    await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gearchiveerd" } });
    const lijst = (await vraag(`${API}/media`)).body.media;
    expect(lijst.find((m: { id: string }) => m.id === id).gebruikt).toBe(1);
    const geweigerd = await vraag(`${API}/media/${id}`, { methode: "DELETE" });
    expect(geweigerd.status).toBe(409);
    expect(geweigerd.body.fout).toMatch(/1 post/);
    await vraag(`${API}/posts/${p.id}`, { methode: "DELETE" });
    expect((await vraag(`${API}/media/${id}`, { methode: "DELETE" })).status).toBe(200);
    expect((await vraag(`${API}/media/${id}`)).status).toBe(404);
    expect((await vraag(`${API}/media/${id}`, { methode: "DELETE" })).status).toBe(404);
    expect((await vraag(`${API}/media/geen-id`, { methode: "DELETE" })).status).toBe(400);
  });
});

describe("ideeën", () => {
  it("bewaart, wijzigt en wist een idee; een onbekend sjabloon mag niet", async () => {
    const r = await vraag(`${API}/ideeen`, { body: { datum: "2026-10-06", titel: "Een idee", sjabloon: "stelling", kop: "Een *kop.*" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: expect.stringMatching(/^i-/), herkomst: "hand", post: null, feiten: [], moment: null, toelichting: "" });
    const { id, aangemaakt: _a, gewijzigd: _g, ...rest } = r.body;
    const w = await vraag(`${API}/ideeen/${id}`, { methode: "PUT", body: { ...rest, datum: "2026-10-07" } });
    expect(w.body.datum).toBe("2026-10-07");
    expect((await vraag(`${API}/ideeen`, { body: { datum: "2026-10-06", titel: "x", sjabloon: "bestaat-niet" } })).status).toBe(400);
    expect((await vraag(`${API}/ideeen`, { body: { datum: "6-10-2026", titel: "x" } })).status).toBe(400);
    expect((await vraag(`${API}/ideeen/${id}`, { methode: "DELETE" })).status).toBe(200);
    expect((await vraag(`${API}/ideeen`)).body.ideeen.some((i: { id: string }) => i.id === id)).toBe(false);
  });
});

describe("resultaten", () => {
  it("alleen bij een gepubliceerde post; terug naar concept en dupliceren wissen het", async () => {
    const p = await nieuwePost();
    expect((await vraag(`${API}/posts/${p.id}/resultaat`, { methode: "PUT", body: { vertoningen: 10, reacties: 1, klikken: 0 } })).status).toBe(409);
    await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd" } });
    const r = await vraag(`${API}/posts/${p.id}/resultaat`, { methode: "PUT", body: { vertoningen: 10, reacties: null, klikken: 0 } });
    expect(r.status).toBe(200);
    expect(r.body.resultaat).toMatchObject({ vertoningen: 10, reacties: null, klikken: 0 });
    expect((await vraag(`${API}/posts/${p.id}/resultaat`, { methode: "PUT", body: { vertoningen: -1, reacties: null, klikken: null } })).status).toBe(400);
    expect((await vraag(`${API}/posts/${p.id}/resultaat`, { methode: "PUT", body: { vertoningen: 1.5, reacties: null, klikken: null } })).status).toBe(400);
    const kopie = (await vraag(`${API}/posts/${p.id}/dupliceer`, { body: {} })).body;
    expect(kopie.resultaat ?? null).toBeNull();
    const terug = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "concept" } });
    expect(terug.body.resultaat).toBeNull();
  });

  it("behoudt publicatie en resultaat bij archiveren en terughalen (BM-18)", async () => {
    const p = await nieuwePost();
    await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd" } });
    await vraag(`${API}/posts/${p.id}/resultaat`, { methode: "PUT", body: { vertoningen: 1200, reacties: 14, klikken: 37 } });
    await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gearchiveerd" } });
    const terug = await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "concept" } });
    expect(terug.body.resultaat).toMatchObject({ vertoningen: 1200, reacties: 14, klikken: 37 });
    expect(terug.body.gepubliceerd).not.toBeNull();
  });
});

describe("overzicht, golf 2", () => {
  it("geeft laatste publicatie, lege weken, open ideeën, momenten en resultaten", async () => {
    const o = (await vraag(`${API}/overzicht`)).body;
    expect(o).toHaveProperty("laatstGepubliceerd");
    expect(Array.isArray(o.legeWeken) && o.legeWeken.length <= 4).toBe(true);
    for (const w of o.legeWeken) expect(w).toMatchObject({ maandag: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), zondag: expect.any(String) });
    expect(typeof o.openIdeeen).toBe("number");
    expect(Array.isArray(o.momenten) && o.momenten.length <= 5).toBe(true);
    expect(Array.isArray(o.resultaten)).toBe(true);
  });

  it("telt open ideeën: zonder post (ook uit het verleden) en met een inmiddels gewiste post; niet een idee met een bestaande post", async () => {
    // Delta t.o.v. een eerste meting: de server is gedeeld met andere tests, dus het absolute
    // aantal ligt niet vast.
    const voor = (await vraag(`${API}/overzicht`)).body.openIdeeen;
    const toekomst = "2099-01-01";
    expect((await vraag(`${API}/ideeen`, { body: { datum: toekomst, titel: "Zonder post" } })).status).toBe(201);
    // Een open idee van vorige maand raakt niet zoek: het telt mee (afsluitende review, A7).
    expect((await vraag(`${API}/ideeen`, { body: { datum: "2020-01-06", titel: "Blijven liggen" } })).status).toBe(201);
    const metBestaandePost = await nieuwePost();
    expect((await vraag(`${API}/ideeen`, { body: { datum: toekomst, titel: "Met bestaande post", post: metBestaandePost.id } })).status).toBe(201);
    const teWissen = await nieuwePost();
    expect((await vraag(`${API}/ideeen`, { body: { datum: toekomst, titel: "Met gewiste post", post: teWissen.id } })).status).toBe(201);
    expect((await vraag(`${API}/posts/${teWissen.id}`, { methode: "DELETE" })).status).toBe(200);
    const na = (await vraag(`${API}/overzicht`)).body.openIdeeen;
    expect(na - voor).toBe(3);
  });

  it("noemt een gearchiveerde post nog als laatste publicatie (afsluitende review, A4)", async () => {
    const p = await nieuwePost({ titel: "Gepubliceerd en daarna gearchiveerd" });
    const gepubliceerd = (await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gepubliceerd" } })).body;
    expect((await vraag(`${API}/posts/${p.id}/status`, { body: { naar: "gearchiveerd" } })).status).toBe(200);
    expect((await vraag(`${API}/overzicht`)).body.laatstGepubliceerd).toBe(gepubliceerd.gepubliceerd.op);
  });
});
