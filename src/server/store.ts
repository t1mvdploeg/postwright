// Storage for the marketing studio: plain files under `data/marketing/`.
//
//   data/marketing/posts/<id>.json   one recipe per post
//   data/marketing/campaigns.json    list
//   data/marketing/snippets.json     list
//   data/marketing/facts.json        list (the fact bank)
//   data/marketing/ideas.json        list (the idea planner)
//   data/marketing/settings.json
//   data/marketing/media/<hash>.<ext>
import { open, readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  listFolder,
  readJson,
  path,
  writeBytesAtomic,
  writeJsonAtomic,
  serialize,
  remove,
  type Storage,
} from "./files.js";
import {
  CAMPAIGN_ID,
  FACT_ID,
  IDEA_ID,
  POST_ID,
  DEFAULT_SETTINGS,
  SNIPPET_ID,
  SettingsSchema,
  type Settings,
  type Post,
} from "./schema.js";

const FOLDER = "marketing";

/**
 * Error that the route passes straight through as an HTTP status (409 for an outdated
 * version, 404 for missing).
 */
export class StorageError extends Error {
  constructor(
    public status: 404 | 409 | 500,
    notice: string,
  ) {
    super(notice);
  }
}

// ---------------------------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------------------------

function postPath(o: Storage, id: string): string {
  if (!POST_ID.test(id)) throw new Error(`Invalid post id: ${id}`);
  return path(o, FOLDER, "posts", `${id}.json`);
}

export function newPostId(): string {
  return `p-${randomUUID()}`;
}

/**
 * Reads a JSON file of the studio. If it holds something that is not JSON or does not have
 * the expected shape, a 500 follows that names the file, so the user knows what to check.
 */
async function readChecked<T>(
  p: string,
  name: string,
  expected: string,
  matches: (x: unknown) => boolean,
): Promise<T | null> {
  let x: unknown;
  try {
    x = await readJson<unknown>(p);
  } catch (e) {
    throw new StorageError(500, `${name} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (x !== null && !matches(x)) throw new StorageError(500, `${name} cannot be read: expected ${expected}`);
  return x as T | null;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export async function readPost(o: Storage, id: string): Promise<Post | null> {
  if (!POST_ID.test(id)) return null;
  return readChecked<Post>(
    postPath(o, id),
    `${FOLDER}/posts/${id}.json`,
    "a post with this id",
    (x) => isObject(x) && x.id === id && typeof x.version === "number" && typeof x.updated === "string",
  );
}

/**
 * All posts, most recently changed first. An unreadable post file makes the list fail with
 * its name: a post must not silently disappear.
 */
export async function listPosts(o: Storage): Promise<Post[]> {
  const names = (await listFolder(path(o, FOLDER, "posts"))).filter(
    (n) => n.endsWith(".json") && POST_ID.test(n.slice(0, -5)),
  );
  const posts = await Promise.all(names.map((n) => readPost(o, n.slice(0, -5))));
  return posts.filter((p): p is Post => p !== null).sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Writes a new post; fails if the id already exists (only possible on a UUID collision). */
export async function createPost(o: Storage, post: Post): Promise<Post> {
  return serialize(`marketing-post:${post.id}`, async () => {
    if (await readPost(o, post.id)) throw new StorageError(409, "This post already exists");
    await writeJsonAtomic(postPath(o, post.id), post);
    return post;
  });
}

/**
 * Reads, changes and writes under one lock per post. `expectedVersion` is the version the
 * browser had: if it differs, another window has saved in the meantime and a 409 follows,
 * instead of the older screen overwriting the newer text. `change` may throw (e.g. an
 * `ApiError` for an invalid status transition); nothing has been written in that case.
 */
export async function updatePost(
  o: Storage,
  id: string,
  expectedVersion: number | null,
  change: (p: Post) => Post,
): Promise<Post> {
  return serialize(`marketing-post:${id}`, async () => {
    const current = await readPost(o, id);
    if (!current) throw new StorageError(404, "Post not found");
    if (expectedVersion !== null && current.version !== expectedVersion) {
      throw new StorageError(
        409,
        "This post was changed in another window in the meantime. Reload it before you save.",
      );
    }
    const next = { ...change(structuredClone(current)), id, version: current.version + 1 };
    await writeJsonAtomic(postPath(o, id), next);
    return next;
  });
}

export async function deletePost(o: Storage, id: string): Promise<boolean> {
  return serialize(`marketing-post:${id}`, async () => {
    if (!(await readPost(o, id))) return false;
    await remove(postPath(o, id));
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Lists: campaigns, snippets, facts. Small (dozens of rows), so one file per list.
// ---------------------------------------------------------------------------------------------

export type ListName = "campaigns" | "snippets" | "facts" | "ideas";
const LIST_ID: Record<ListName, { pattern: RegExp; prefix: string }> = {
  campaigns: { pattern: CAMPAIGN_ID, prefix: "c-" },
  snippets: { pattern: SNIPPET_ID, prefix: "t-" },
  facts: { pattern: FACT_ID, prefix: "f-" },
  ideas: { pattern: IDEA_ID, prefix: "i-" },
};

export function newListId(list: ListName): string {
  return `${LIST_ID[list].prefix}${randomUUID()}`;
}
export function validListId(list: ListName, id: string): boolean {
  return LIST_ID[list].pattern.test(id);
}

export async function readList<T extends { id: string }>(o: Storage, list: ListName): Promise<T[]> {
  const lines = await readChecked<T[]>(
    path(o, FOLDER, `${list}.json`),
    `${FOLDER}/${list}.json`,
    "a list of objects with an id",
    (x) => Array.isArray(x) && x.every((r) => isObject(r) && typeof r.id === "string"),
  );
  return lines ?? [];
}

/**
 * Reads and writes a list under one lock, so that two simultaneous changes do not wipe
 * each other out.
 */
export async function updateList<T extends { id: string }, U>(
  o: Storage,
  list: ListName,
  change: (lines: T[]) => { lines: T[]; outcome: U },
): Promise<U> {
  return serialize(`marketing-list:${list}`, async () => {
    const current = await readList<T>(o, list);
    const { lines, outcome } = change(current);
    await writeJsonAtomic(path(o, FOLDER, `${list}.json`), lines);
    return outcome;
  });
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/**
 * The settings, topped up with the default for every field that is (still) missing: per
 * key, and for `writingHelp` per part, so that `{"writingHelp":{"enabled":false}}` leaves
 * the AI off with the default cap. No file gives the default. A file that exists but
 * cannot be read or is not valid does NOT fall back to the default (which turns the AI
 * on): that gives a 500 naming the file and the first invalid field.
 */
export async function loadSettingsFile(o: Storage): Promise<Settings> {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  const name = `${FOLDER}/settings.json`;
  const unreadable = (reason: string) => new StorageError(500, `${name} cannot be read: ${reason}`);
  let text: string;
  try {
    text = await readFile(path(o, FOLDER, "settings.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return defaults;
    throw unreadable(e instanceof Error ? e.message : String(e));
  }
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch (e) {
    throw unreadable(e instanceof Error ? e.message : String(e));
  }
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) throw unreadable("expected an object");
  const custom = saved as Record<string, unknown>;
  const together: Record<string, unknown> = { ...defaults, ...custom };
  if (typeof custom.writingHelp === "object" && custom.writingHelp !== null && !Array.isArray(custom.writingHelp)) {
    together.writingHelp = { ...defaults.writingHelp, ...custom.writingHelp };
  }
  const r = SettingsSchema.safeParse(together);
  if (!r.success) {
    const first = r.error.issues[0];
    throw unreadable(`${first.path.join(".") || "input"}: ${first.message}`);
  }
  return r.data;
}

export async function saveSettingsFile(o: Storage, i: Settings): Promise<void> {
  await writeJsonAtomic(path(o, FOLDER, "settings.json"), i);
}

// ---------------------------------------------------------------------------------------------
// Media: screenshots and photos. PNG, JPEG and WebP only; never SVG (can contain script).
// ---------------------------------------------------------------------------------------------

export type MediaKind = "png" | "jpg" | "webp";
export const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;
export const MEDIA_CONTENT_TYPES: Record<MediaKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/**
 * The kind, taken from the first bytes, never from the extension or the stated content
 * type.
 */
export function mediaKind(b: Buffer): MediaKind | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Width and height from the file header; null if they cannot be reliably extracted. */
export function mediaDimensions(b: Buffer, kind: MediaKind): { width: number; height: number } | null {
  try {
    if (kind === "png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (kind === "webp") {
      const block = b.toString("latin1", 12, 16);
      if (block === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
      if (block === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (block === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: walk the segments until an SOF marker (C0–CF except C4, C8 and CC).
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  } catch {
    return null;
  }
}

function mediaPath(o: Storage, id: string): string {
  if (!MEDIA_ID.test(id)) throw new Error(`Invalid media id: ${id}`);
  return path(o, FOLDER, "media", id);
}

/**
 * Stores a file that has already been checked; the id is the hash of the content, so
 * uploading the same file twice gives the same id.
 */
export async function saveMedia(o: Storage, content: Buffer, kind: MediaKind): Promise<string> {
  const id = `${createHash("sha256").update(content).digest("hex").slice(0, 32)}.${kind}`;
  await writeBytesAtomic(mediaPath(o, id), content);
  return id;
}

export async function readMedia(o: Storage, id: string): Promise<Buffer | null> {
  if (!MEDIA_ID.test(id)) return null;
  try {
    return await readFile(mediaPath(o, id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export interface MediaEntry {
  id: string;
  bytes: number;
  width: number | null;
  height: number | null;
  on: string;
}

/**
 * The first `n` bytes of a file. Enough for the dimensions: they are in the header, and a
 * list of dozens of screenshots of several megabytes should not be read from disk in full
 * every time (the overview requests this list).
 */
async function readBegin(p: string, n: number): Promise<Buffer> {
  const file = await open(p, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await file.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

/**
 * Header of 512 kB: ample for PNG and WebP, and for a JPEG with a sizeable EXIF block.
 * Beyond that, the whole file is read after all.
 */
const HEAD_BYTES = 512 * 1024;

/** Deletes an uploaded image. Returns false if it is not (or no longer) there. */
export async function deleteMedia(o: Storage, id: string): Promise<boolean> {
  if (!MEDIA_ID.test(id)) return false;
  return serialize(`marketing-media:${id}`, async () => {
    const p = mediaPath(o, id);
    try {
      await stat(p);
    } catch {
      return false;
    }
    await remove(p);
    return true;
  });
}

/**
 * How often each image appears in a post (in the fields or a slide), archived posts
 * included.
 */
export function mediaUsage(posts: Post[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const p of posts) {
    const ids = new Set(
      [p.content, ...p.slides.map((d) => d.content)]
        .flatMap((i) => Object.values(i ?? {}))
        .filter((v) => MEDIA_ID.test(v)),
    );
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return count;
}

export async function listMedia(o: Storage): Promise<MediaEntry[]> {
  const names = (await listFolder(path(o, FOLDER, "media"))).filter((n) => MEDIA_ID.test(n));
  const lines = await Promise.all(
    names.map(async (id) => {
      try {
        const p = mediaPath(o, id);
        const kind = id.slice(id.lastIndexOf(".") + 1) as MediaKind;
        const s = await stat(p);
        let size = mediaDimensions(await readBegin(p, HEAD_BYTES), kind);
        if (!size && s.size > HEAD_BYTES) size = mediaDimensions(await readFile(p), kind);
        return {
          id,
          bytes: s.size,
          width: size?.width ?? null,
          height: size?.height ?? null,
          on: s.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    }),
  );
  return lines.filter((r): r is MediaEntry => r !== null).sort((a, b) => b.on.localeCompare(a.on));
}
