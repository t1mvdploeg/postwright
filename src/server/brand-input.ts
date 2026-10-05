// The material for a brand kit, in `brand-input/` of the project: a logo, images, a brand
// guide, fonts, and `input.json` with the website and notes. Every file is checked on its
// content, not on its name or stated type. Nothing in here is ever served as a page.
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { z } from "zod";
import { ApiError, response, route, type Route } from "./http.js";
import { listFolder, path, readJson, reason, remove, serialize, writeBytesAtomic, writeJsonAtomic } from "./files.js";
import { mediaDimensions, mediaKind } from "./store.js";
import { sanitiseSvg } from "./svg.js";

export type InputRole = "logo" | "image" | "guide" | "font";
export interface InputFile {
  name: string;
  kind: InputRole;
  bytes: number;
}
export interface BrandInput {
  files: InputFile[];
  website: string;
  notes: string;
}

const MB = 1024 * 1024;
const ROLES: readonly InputRole[] = ["logo", "image", "guide", "font"];
const MAX_BYTES: Record<InputRole, number> = { logo: 5 * MB, image: 5 * MB, guide: 20 * MB, font: 5 * MB };
const MAX_COUNT: Partial<Record<InputRole, number>> = { image: 8, font: 8 };
/** Logo, images and guide together: base64 adds a third, and a request may be 32 MB. */
export const MAX_INPUT_BYTES = 22 * MB;
export const INPUT_NAME =
  /^(logo\.(svg|png)|image-[0-9a-f]{8}\.(png|jpg|webp)|guide\.pdf|font-[0-9a-f]{8}\.(woff2|woff|ttf|otf))$/;
const FOLDER = "brand-input";

const InputTextSchema = z
  .object({
    website: z
      .string()
      .trim()
      .max(300)
      .refine((v) => {
        if (v === "") return true;
        try {
          return new URL(v).protocol === "https:";
        } catch {
          return false;
        }
      }, "must be empty or an https:// address"),
    notes: z.string().max(2000),
  })
  .strict();

export function fontKind(b: Buffer): "woff2" | "woff" | "ttf" | "otf" | null {
  const magic = b.toString("latin1", 0, 4);
  if (magic === "wOF2") return "woff2";
  if (magic === "wOFF") return "woff";
  if (magic === "OTTO") return "otf";
  if (magic === "true" || (b.length >= 4 && b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return "ttf";
  return null;
}

export const isPdf = (b: Buffer): boolean => b.toString("latin1", 0, 5) === "%PDF-";

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 8);

function kindOf(name: string): InputRole {
  return name.startsWith("logo.")
    ? "logo"
    : name.startsWith("image-")
      ? "image"
      : name === "guide.pdf"
        ? "guide"
        : "font";
}

function checkImage(content: Buffer, kind: "png" | "jpg" | "webp") {
  const size = mediaDimensions(content, kind);
  if (!size || size.width < 1 || size.height < 1) throw new ApiError(400, "This image is unreadable or damaged");
  if (size.width > 8000 || size.height > 8000) throw new ApiError(400, "This image is larger than 8000 pixels");
}

/** What the file is, from its content: the stored name and bytes, or a 400. */
function classify(role: InputRole, content: Buffer): { name: string; stored: Buffer } {
  if (role === "logo") {
    if (mediaKind(content) === "png") {
      checkImage(content, "png");
      return { name: "logo.png", stored: content };
    }
    const svg = sanitiseSvg(content.toString("utf8"));
    if (!svg.ok) throw new ApiError(400, `The logo must be an SVG or a PNG: ${svg.reason}`);
    return { name: "logo.svg", stored: Buffer.from(svg.svg, "utf8") };
  }
  if (role === "image") {
    const kind = mediaKind(content);
    if (!kind) throw new ApiError(400, "Images must be PNG, JPEG or WebP");
    checkImage(content, kind);
    return { name: `image-${hash(content)}.${kind}`, stored: content };
  }
  if (role === "guide") {
    if (!isPdf(content)) throw new ApiError(400, "The brand guide must be a PDF");
    return { name: "guide.pdf", stored: content };
  }
  const kind = fontKind(content);
  if (!kind) throw new ApiError(400, "Fonts must be woff2, woff, ttf or otf");
  return { name: `font-${hash(content)}.${kind}`, stored: content };
}

async function listInput(projectDir: string): Promise<InputFile[]> {
  const s = { dir: projectDir };
  const names = (await listFolder(path(s, FOLDER))).filter((n) => INPUT_NAME.test(n)).sort();
  return Promise.all(
    names.map(async (name) => ({ name, kind: kindOf(name), bytes: (await stat(path(s, FOLDER, name))).size })),
  );
}

export async function readInput(projectDir: string): Promise<BrandInput> {
  const files = await listInput(projectDir);
  let text: z.infer<typeof InputTextSchema> = { website: "", notes: "" };
  try {
    const saved = await readJson<unknown>(path({ dir: projectDir }, FOLDER, "input.json"));
    if (saved !== null) {
      const r = InputTextSchema.safeParse(saved);
      if (!r.success) throw new Error(`${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      text = r.data;
    }
  } catch (e) {
    throw new ApiError(500, `brand-input/input.json cannot be read: ${reason(e)}`);
  }
  return { files, ...text };
}

export async function saveInputText(projectDir: string, text: { website: string; notes: string }): Promise<void> {
  await writeJsonAtomic(path({ dir: projectDir }, FOLDER, "input.json"), text);
}

export async function saveInputFile(projectDir: string, role: InputRole, content: Buffer): Promise<InputFile> {
  if (!content.length) throw new ApiError(400, "No file was sent");
  const { name, stored } = classify(role, content);
  const s = { dir: projectDir };
  return serialize(`brand-input:${projectDir}`, async () => {
    const files = await listInput(projectDir);
    // A new logo or guide replaces the old one; the same image or font twice is the same file.
    const replaced = (f: InputFile) => f.name === name || (f.kind === role && (role === "logo" || role === "guide"));
    const kept = files.filter((f) => !replaced(f));
    const max = MAX_COUNT[role];
    if (max !== undefined && kept.filter((f) => f.kind === role).length >= max) {
      throw new ApiError(409, `At most ${max} ${role === "image" ? "images" : "fonts"}; remove one first`);
    }
    const sent = role === "font" ? 0 : stored.length;
    const total = kept.filter((f) => f.kind !== "font").reduce((sum, f) => sum + f.bytes, 0) + sent;
    if (total > MAX_INPUT_BYTES) {
      throw new ApiError(413, "Logo, images and brand guide together are over 22 MB; remove something first");
    }
    await writeBytesAtomic(path(s, FOLDER, name), stored);
    for (const f of files) if (replaced(f) && f.name !== name) await remove(path(s, FOLDER, f.name));
    return { name, kind: role, bytes: stored.length };
  });
}

export async function removeInputFile(projectDir: string, name: string): Promise<boolean> {
  if (!INPUT_NAME.test(name)) throw new ApiError(400, "Invalid file name");
  return serialize(`brand-input:${projectDir}`, async () => {
    const found = (await listInput(projectDir)).some((f) => f.name === name);
    if (found) await remove(path({ dir: projectDir }, FOLDER, name));
    return found;
  });
}

export function brandInputRoutes(o: {
  dataDir: string;
  generate?: { available: boolean; model: string | null };
}): Route[] {
  const generate = o.generate ?? { available: false, model: null };
  return [
    route("GET", "/api/brand/input", async (c) => ({ ...(await readInput((await c.project()).dir)), generate })),
    route("PUT", "/api/brand/input", async (c) => {
      const r = InputTextSchema.safeParse(await c.readJson());
      if (!r.success)
        throw new ApiError(400, `${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      await saveInputText((await c.project()).dir, r.data);
      return r.data;
    }),
    route(
      "POST",
      "/api/brand/input/:role",
      async (c) => {
        const role = c.params.role as InputRole;
        if (!ROLES.includes(role)) throw new ApiError(400, "Unknown kind of file");
        const content = await c.read(MAX_BYTES[role]);
        return response({ status: 201, body: await saveInputFile((await c.project()).dir, role, content) });
      },
      { rawBody: true },
    ),
    route("DELETE", "/api/brand/input/:name", async (c) => {
      if (!(await removeInputFile((await c.project()).dir, c.params.name))) throw new ApiError(404, "File not found");
      return { ok: true };
    }),
  ];
}
