// De startvulling: voorbeeldfeiten, -teksten en -posts over Postwright zelf. De route vult alleen aan
// en is dus veilig om twee keer te draaien.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { STARTFEITEN, STARTPOSTS, STARTTEKSTEN } from "../src/model/marketing-startvulling.js";
import { FeitInvoerSchema, TekstInvoerSchema, type Feit, type Post } from "../src/model/marketing-schema.js";
import { SJABLONEN } from "../src/web/marketing/sjablonen.js";
import { startStudio } from "./helpers/studio.js";

describe("startvulling", () => {
  it("elk feit is een geldig concept-feit, en het eerste noemt het echte aantal sjablonen", () => {
    expect(STARTFEITEN.length).toBeGreaterThanOrEqual(5);
    for (const f of STARTFEITEN)
      expect(FeitInvoerSchema.safeParse({ ...f, status: "concept" }).success, f.tekst).toBe(true);
    expect(new Set(STARTFEITEN.map((f) => f.tekst)).size).toBe(STARTFEITEN.length);
    expect(STARTFEITEN[0].tekst).toBe(`Postwright ships with ${SJABLONEN.length} post templates.`);
  });

  it("de teksten zijn geldig en hebben elk een eigen naam", () => {
    for (const t of STARTTEKSTEN) expect(TekstInvoerSchema.safeParse(t).success, t.naam).toBe(true);
    expect(new Set(STARTTEKSTEN.map((t) => t.naam)).size).toBe(STARTTEKSTEN.length);
  });

  it("de voorbeeldposts gebruiken bestaande sjablonen, en precies één wordt ingepland", () => {
    expect(STARTPOSTS.map((p) => p.sjabloon)).toEqual(["stelling", "cijfer", "werkroute"]);
    for (const p of STARTPOSTS)
      expect(
        SJABLONEN.some((s) => s.id === p.sjabloon),
        p.sjabloon,
      ).toBe(true);
    expect(STARTPOSTS.filter((p) => p.inDagen !== undefined)).toHaveLength(1);
  });
});

describe("POST /startvulling", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.sluit();
  });
  // Elke POST zonder ruwe body eist application/json, ook als de route de body niet leest.
  const post = (pad: string) =>
    fetch(studio.basis + pad, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const haal = async (pad: string) => (await fetch(studio.basis + pad)).json();

  it("vult aan als concept en voegt bij een tweede keer niets dubbel toe", async () => {
    const een = await (await post("/api/startvulling")).json();
    expect(een).toEqual({ feiten: STARTFEITEN.length, teksten: STARTTEKSTEN.length, posts: STARTPOSTS.length });
    const twee = await (await post("/api/startvulling")).json();
    expect(twee).toEqual({ feiten: 0, teksten: 0, posts: 0 });
    const feiten: Feit[] = (await haal("/api/feiten")).feiten;
    expect(feiten).toHaveLength(STARTFEITEN.length);
    expect(feiten.every((f) => f.status === "concept")).toBe(true);
    expect(feiten.some((f) => f.tekst.includes(`${SJABLONEN.length} post templates`))).toBe(true);
    const teksten = (await haal("/api/teksten")).teksten;
    expect(teksten.map((t: { tekst: string }) => t.tekst).sort()).toEqual(STARTTEKSTEN.map((t) => t.tekst).sort());
    expect((await haal("/api/posts")).posts).toHaveLength(STARTPOSTS.length);
  });

  it("zet drie voorbeeldposts neer, waarvan één over zeven dagen is ingepland met een groene controle", async () => {
    const posts: Post[] = (await haal("/api/posts")).posts;
    expect(posts.map((p) => p.sjabloon).sort()).toEqual(["cijfer", "stelling", "werkroute"]);
    const gepland = posts.filter((p) => p.status === "gepland");
    expect(gepland).toHaveLength(1);
    expect(gepland[0].sjabloon).toBe("werkroute");
    expect(gepland[0].controle).toMatchObject({ fouten: 0 });
    const dagen = (new Date(gepland[0].gepland as string).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(dagen).toBeGreaterThan(6.9);
    expect(dagen).toBeLessThan(7.1);
    // De andere twee zijn concepten, en het cijfer-voorbeeld hangt aan het feit met het aantal sjablonen.
    const cijfer = posts.find((p) => p.sjabloon === "cijfer") as Post;
    expect(cijfer.status).toBe("concept");
    expect(cijfer.inhoud.getal).toBe(String(SJABLONEN.length));
    const feit = (await haal("/api/feiten")).feiten.find((f: Feit) => f.id === cijfer.feiten[0]);
    expect(feit.tekst).toBe(STARTFEITEN[0].tekst);
    // Een voorbeeldpost is een gewone post: op te halen met zijn geschiedenis.
    const een = await haal(`/api/posts/${gepland[0].id}`);
    expect(een.geschiedenis.map((g: { wat: string }) => g.wat)).toEqual([
      "aangemaakt",
      expect.stringMatching(/^gepland op /),
    ]);
  });

  it("voegt bij een nieuwe klik alleen de gewiste voorbeeldpost weer toe", async () => {
    // Idempotent op titel: een klik voegt alleen toe wat ontbreekt.
    const posts: Post[] = (await haal("/api/posts")).posts;
    const weg = posts.find((p) => p.sjabloon === "stelling") as Post;
    await fetch(`${studio.basis}/api/posts/${weg.id}`, { method: "DELETE" });
    expect(await (await post("/api/startvulling")).json()).toEqual({ feiten: 0, teksten: 0, posts: 1 });
    expect((await haal("/api/posts")).posts).toHaveLength(STARTPOSTS.length);
  });
});
