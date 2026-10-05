import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

/** Where the data lives: `dir` is the data folder (determined by `start.ts`). */
export interface Storage {
  dir: string;
}

/**
 * Path inside the data folder, for example `path(o, "marketing", "posts", "123.json")`. A
 * result that ends up outside the data folder (for example through `..` in an id) is
 * rejected, so that a single forgotten validation in a route gives an error instead of a
 * file elsewhere.
 */
export function path(o: Storage, ...parts: string[]): string {
  const root = o.dir;
  const p = join(root, ...parts);
  const rel = relative(root, p);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Path is outside the data folder");
  return p;
}

function isMissing(e: unknown): boolean {
  return (e as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Why a read failed, for a message to the user: the error code (`EACCES`) for a file system
 * error, so that no absolute path is shown; the message for anything else (JSON, schema).
 */
export function reason(e: unknown): string {
  const code = (e as NodeJS.ErrnoException)?.code;
  return typeof code === "string" ? code : e instanceof Error ? e.message : String(e);
}

/** Reads a JSON file; null if it does not exist. Unreadable JSON does throw an error. */
export async function readJson<T>(p: string): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(p, "utf8");
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
  return JSON.parse(text) as T;
}

// In-process queue per key: the server runs as a single process.
const queues = new Map<string, Promise<unknown>>();

/**
 * Runs actions with the same key strictly one after another; different keys run in
 * parallel. A failure in one action does not block the following actions
 * (`previous.then(action, action)`) and goes only to the caller of that action. The
 * clean-up in `finally` compares the stored promise with what is in the map, so that a
 * next action scheduled in the meantime is not thrown away.
 *
 * Never call it nested with the same key from an action that is itself already running
 * inside `serialize` for that key: that blocks permanently.
 */
export async function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const custom = previous.then(action, action);
  const wait = custom.catch(() => undefined);
  queues.set(key, wait);
  try {
    return await custom;
  } finally {
    if (queues.get(key) === wait) queues.delete(key);
  }
}

/**
 * Writes to a unique temporary file, forces it to disk (fsync) and then renames it
 * (atomic on the same file system). Serialised per path, so that the last call is also the
 * last to rename.
 */
export async function writeBytesAtomic(p: string, data: Buffer | string): Promise<void> {
  await serialize(`path:${p}`, async () => {
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

export async function writeJsonAtomic(p: string, data: unknown): Promise<void> {
  await writeBytesAtomic(p, JSON.stringify(data, null, 2) + "\n");
}

/** File names in a folder; an empty list if the folder does not exist yet. */
export async function listFolder(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}

/** Removes a file; does nothing if it is already gone. */
export async function remove(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
}
