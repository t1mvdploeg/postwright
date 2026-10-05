// Opslag van de Marketingstudio: gewone bestanden onder `data/marketing/`.
//
//   data/marketing/posts/<id>.json   één recept per post
//   data/marketing/campagnes.json    lijst
//   data/marketing/teksten.json      lijst
//   data/marketing/feiten.json       lijst (de feitenbank)
//   data/marketing/ideeen.json       lijst (de ideeënplanner)
//   data/marketing/instellingen.json
//   data/marketing/media/<hash>.<ext>
import { open, readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { lijstMap, leesJson, pad, schrijfBytesAtomisch, schrijfJsonAtomisch, serialiseer, verwijder, type Opslag } from "./bestanden.js";
import {
  CAMPAGNE_ID, FEIT_ID, IDEE_ID, POST_ID, STANDAARD_MARKETING_INSTELLINGEN, TEKST_ID, MarketingInstellingenSchema,
  type MarketingInstellingen, type Post,
} from "../model/marketing-schema.js";

const MAP = "marketing";

/** Fout die de route één-op-één als HTTP-status teruggeeft (409 bij een oude versie, 404 weg). */
export class MarketingOpslagFout extends Error {
  constructor(public status: 404 | 409 | 500, melding: string) { super(melding); }
}

// ---------------------------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------------------------

function postPad(o: Opslag, id: string): string {
  if (!POST_ID.test(id)) throw new Error(`Ongeldig post-id: ${id}`);
  return pad(o, MAP, "posts", `${id}.json`);
}

export function nieuwPostId(): string { return `p-${randomUUID()}`; }

export async function leesPost(o: Opslag, id: string): Promise<Post | null> {
  if (!POST_ID.test(id)) return null;
  return leesJson<Post>(postPad(o, id));
}

/**
 * Alle posts, nieuwste wijziging eerst. Een onleesbaar bestand wordt overgeslagen in plaats van de
 * hele lijst te laten vallen.
 */
export async function lijstPosts(o: Opslag): Promise<Post[]> {
  const namen = (await lijstMap(pad(o, MAP, "posts"))).filter((n) => n.endsWith(".json"));
  const posts = await Promise.all(namen.map(async (n) => {
    const id = n.slice(0, -5);
    if (!POST_ID.test(id)) return null;
    try {
      const p = await leesJson<Post>(postPad(o, id));
      return p && p.id === id ? p : null;
    } catch { return null; }
  }));
  return posts.filter((p): p is Post => p !== null).sort((a, b) => b.gewijzigd.localeCompare(a.gewijzigd));
}

/** Schrijft een nieuwe post; faalt als het id al bestaat (kan alleen bij een UUID-botsing). */
export async function maakPost(o: Opslag, post: Post): Promise<Post> {
  return serialiseer(`marketing-post:${post.id}`, async () => {
    if (await leesJson(postPad(o, post.id))) throw new MarketingOpslagFout(409, "Deze post bestaat al");
    await schrijfJsonAtomisch(postPad(o, post.id), post);
    return post;
  });
}

/**
 * Leest, past aan en schrijft in één slot per post. `verwachteVersie` is de versie die de browser
 * had: wijkt die af, dan heeft een ander venster intussen opgeslagen en volgt een 409 in plaats
 * van dat het oudere scherm de nieuwere tekst overschrijft. `wijzig` mag gooien (bv. een
 * `ApiFout` voor een ongeldige statusovergang); er is dan niets geschreven.
 */
export async function werkPostBij(o: Opslag, id: string, verwachteVersie: number | null, wijzig: (p: Post) => Post): Promise<Post> {
  return serialiseer(`marketing-post:${id}`, async () => {
    const huidig = await leesPost(o, id);
    if (!huidig) throw new MarketingOpslagFout(404, "Post niet gevonden");
    if (verwachteVersie !== null && huidig.versie !== verwachteVersie) {
      throw new MarketingOpslagFout(409, "Deze post is intussen in een ander venster gewijzigd. Laad hem opnieuw voordat u opslaat.");
    }
    const nieuw = { ...wijzig(structuredClone(huidig)), id, versie: huidig.versie + 1 };
    await schrijfJsonAtomisch(postPad(o, id), nieuw);
    return nieuw;
  });
}

export async function wisPost(o: Opslag, id: string): Promise<boolean> {
  return serialiseer(`marketing-post:${id}`, async () => {
    const p = postPad(o, id);
    if (!(await leesJson(p))) return false;
    await verwijder(p);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Lijsten: campagnes, teksten, feiten. Klein (tientallen regels), dus één bestand per lijst.
// ---------------------------------------------------------------------------------------------

export type LijstNaam = "campagnes" | "teksten" | "feiten" | "ideeen";
const LIJST_ID: Record<LijstNaam, { patroon: RegExp; voorvoegsel: string }> = {
  campagnes: { patroon: CAMPAGNE_ID, voorvoegsel: "c-" },
  teksten: { patroon: TEKST_ID, voorvoegsel: "t-" },
  feiten: { patroon: FEIT_ID, voorvoegsel: "f-" },
  ideeen: { patroon: IDEE_ID, voorvoegsel: "i-" },
};

export function nieuwLijstId(lijst: LijstNaam): string { return `${LIJST_ID[lijst].voorvoegsel}${randomUUID()}`; }
export function geldigLijstId(lijst: LijstNaam, id: string): boolean { return LIJST_ID[lijst].patroon.test(id); }

export async function leesLijst<T extends { id: string }>(o: Opslag, lijst: LijstNaam): Promise<T[]> {
  return (await leesJson<T[]>(pad(o, MAP, `${lijst}.json`))) ?? [];
}

/** Lezen en schrijven van een lijst in één slot, zodat twee gelijktijdige wijzigingen elkaar niet wissen. */
export async function werkLijstBij<T extends { id: string }, U>(o: Opslag, lijst: LijstNaam, wijzig: (regels: T[]) => { regels: T[]; uitkomst: U }): Promise<U> {
  return serialiseer(`marketing-lijst:${lijst}`, async () => {
    const huidig = await leesLijst<T>(o, lijst);
    const { regels, uitkomst } = wijzig(huidig);
    await schrijfJsonAtomisch(pad(o, MAP, `${lijst}.json`), regels);
    return uitkomst;
  });
}

// ---------------------------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------------------------

/**
 * De instellingen, aangevuld met de standaard voor elk veld dat (nog) ontbreekt: per sleutel, en voor
 * `schrijfhulp` per onderdeel, zodat `{"schrijfhulp":{"aan":false}}` de AI uit laat staan met het
 * standaardplafond. Geen bestand geeft de standaard. Een bestand dat er wel is maar niet te lezen of
 * niet geldig is, valt NIET terug op de standaard (die zet de AI aan): dat geeft een 500 die het
 * bestand en het eerste foute veld noemt.
 */
export async function laadMarketingInstellingen(o: Opslag): Promise<MarketingInstellingen> {
  const standaard = structuredClone(STANDAARD_MARKETING_INSTELLINGEN);
  const naam = `${MAP}/instellingen.json`;
  const onleesbaar = (reden: string) => new MarketingOpslagFout(500, `${naam} is niet te lezen: ${reden}`);
  let tekst: string;
  try {
    tekst = await readFile(pad(o, MAP, "instellingen.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return standaard;
    throw onleesbaar(e instanceof Error ? e.message : String(e));
  }
  let bewaard: unknown;
  try {
    bewaard = JSON.parse(tekst);
  } catch (e) {
    throw onleesbaar(e instanceof Error ? e.message : String(e));
  }
  if (typeof bewaard !== "object" || bewaard === null || Array.isArray(bewaard)) throw onleesbaar("verwacht een object");
  const eigen = bewaard as Record<string, unknown>;
  const samen: Record<string, unknown> = { ...standaard, ...eigen };
  if (typeof eigen.schrijfhulp === "object" && eigen.schrijfhulp !== null && !Array.isArray(eigen.schrijfhulp)) {
    samen.schrijfhulp = { ...standaard.schrijfhulp, ...eigen.schrijfhulp };
  }
  const r = MarketingInstellingenSchema.safeParse(samen);
  if (!r.success) {
    const eerste = r.error.issues[0];
    throw onleesbaar(`${eerste.path.join(".") || "invoer"}: ${eerste.message}`);
  }
  return r.data;
}

export async function bewaarMarketingInstellingen(o: Opslag, i: MarketingInstellingen): Promise<void> {
  await schrijfJsonAtomisch(pad(o, MAP, "instellingen.json"), i);
}

// ---------------------------------------------------------------------------------------------
// Media: schermafbeeldingen en foto's. Alleen PNG, JPEG en WebP; nooit SVG (kan script bevatten).
// ---------------------------------------------------------------------------------------------

export type MediaSoort = "png" | "jpg" | "webp";
export const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;
export const MEDIA_CONTENT_TYPES: Record<MediaSoort, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** Het soort uit de eerste bytes, nooit uit de extensie of het opgegeven content-type. */
export function mediaSoort(b: Buffer): MediaSoort | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Breedte en hoogte uit de kop van het bestand; null als die er niet betrouwbaar uit te halen is. */
export function mediaAfmetingen(b: Buffer, soort: MediaSoort): { breedte: number; hoogte: number } | null {
  try {
    if (soort === "png") return { breedte: b.readUInt32BE(16), hoogte: b.readUInt32BE(20) };
    if (soort === "webp") {
      const blok = b.toString("latin1", 12, 16);
      if (blok === "VP8X") return { breedte: b.readUIntLE(24, 3) + 1, hoogte: b.readUIntLE(27, 3) + 1 };
      if (blok === "VP8 ") return { breedte: b.readUInt16LE(26) & 0x3fff, hoogte: b.readUInt16LE(28) & 0x3fff };
      if (blok === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { breedte: (bits & 0x3fff) + 1, hoogte: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: loop de segmenten af tot een SOF-marker (C0–CF behalve C4, C8 en CC).
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { breedte: b.readUInt16BE(i + 7), hoogte: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  } catch { return null; }
}

function mediaPad(o: Opslag, id: string): string {
  if (!MEDIA_ID.test(id)) throw new Error(`Ongeldig media-id: ${id}`);
  return pad(o, MAP, "media", id);
}

/** Bewaart een al gecontroleerd bestand; het id is de hash van de inhoud, dus dubbel uploaden levert hetzelfde id. */
export async function bewaarMedia(o: Opslag, inhoud: Buffer, soort: MediaSoort): Promise<string> {
  const id = `${createHash("sha256").update(inhoud).digest("hex").slice(0, 32)}.${soort}`;
  await schrijfBytesAtomisch(mediaPad(o, id), inhoud);
  return id;
}

export async function leesMedia(o: Opslag, id: string): Promise<Buffer | null> {
  if (!MEDIA_ID.test(id)) return null;
  try { return await readFile(mediaPad(o, id)); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export interface MediaRegel { id: string; bytes: number; breedte: number | null; hoogte: number | null; op: string }

/**
 * De eerste `n` bytes van een bestand. Genoeg voor de afmetingen: die staan in de kop, en een
 * lijst van tientallen schermafbeeldingen van enkele megabytes hoort niet elke keer volledig van
 * schijf te komen (het overzicht vraagt deze lijst op).
 */
async function leesBegin(p: string, n: number): Promise<Buffer> {
  const bestand = await open(p, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await bestand.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally { await bestand.close(); }
}

/** Kop van 512 kB: ruim voor PNG en WebP, en voor een JPEG met een flink EXIF-blok. Daarbuiten alsnog het hele bestand. */
const KOP_BYTES = 512 * 1024;

/** Wist een geüpload beeld. Geeft false als het er niet (meer) is. */
export async function wisMedia(o: Opslag, id: string): Promise<boolean> {
  if (!MEDIA_ID.test(id)) return false;
  return serialiseer(`marketing-media:${id}`, async () => {
    const p = mediaPad(o, id);
    try { await stat(p); } catch { return false; }
    await verwijder(p);
    return true;
  });
}

/** Hoe vaak elk beeld in een post staat (in de velden of een dia), gearchiveerde posts inbegrepen. */
export function mediaGebruik(posts: Post[]): Map<string, number> {
  const tel = new Map<string, number>();
  for (const p of posts) {
    const ids = new Set([p.inhoud, ...p.dias.map((d) => d.inhoud)].flatMap((i) => Object.values(i ?? {})).filter((v) => MEDIA_ID.test(v)));
    for (const id of ids) tel.set(id, (tel.get(id) ?? 0) + 1);
  }
  return tel;
}

export async function lijstMedia(o: Opslag): Promise<MediaRegel[]> {
  const namen = (await lijstMap(pad(o, MAP, "media"))).filter((n) => MEDIA_ID.test(n));
  const regels = await Promise.all(namen.map(async (id) => {
    try {
      const p = mediaPad(o, id);
      const soort = id.slice(id.lastIndexOf(".") + 1) as MediaSoort;
      const s = await stat(p);
      let maat = mediaAfmetingen(await leesBegin(p, KOP_BYTES), soort);
      if (!maat && s.size > KOP_BYTES) maat = mediaAfmetingen(await readFile(p), soort);
      return { id, bytes: s.size, breedte: maat?.breedte ?? null, hoogte: maat?.hoogte ?? null, op: s.mtime.toISOString() };
    } catch { return null; }
  }));
  return regels.filter((r): r is MediaRegel => r !== null).sort((a, b) => b.op.localeCompare(a.op));
}
