// The material for an own template, in `template-input/` of the project: up to six
// screenshots of old posts, pasted post texts, a short brief, and the kind and formats that are
// wanted. Images are checked on their content like those of the brand kit (`classify` of
// `brand-input.ts`). Nothing in here is ever served as a page.
import { stat } from "node:fs/promises";
import { z } from "zod";
import { ApiError, response, route, type Route } from "./http.js";
import { listFolder, path, readJson, reason, remove, serialize, writeBytesAtomic, writeJsonAtomic } from "./files.js";
import { classify } from "./brand-input.js";
import { IMAGE_FORMATS } from "../web/studio/own-template.js";
import type { FormatKey } from "../web/studio/formats.js";

export interface InputImage {
  name: string;
  bytes: number;
}
export interface TemplateInput {
  images: InputImage[];
  texts: string;
  brief: string;
  kind: "image" | "carousel";
  formats: FormatKey[];
}

const FOLDER = "template-input";
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_TEXTS = 8000;
export const MAX_BRIEF = 600;
export const IMAGE_NAME = /^image-[0-9a-f]{8}\.(png|jpg|webp)$/;

const DEFAULT_TEXT = { texts: "", brief: "", kind: "image" as const, formats: ["li-square"] as FormatKey[] };

export const InputTextSchema = z
  .object({
    texts: z.string().max(MAX_TEXTS),
    brief: z.string().trim().max(MAX_BRIEF),
    kind: z.enum(["image", "carousel"]),
    formats: z
      .array(z.enum([...IMAGE_FORMATS, "li-carousel"] as unknown as [FormatKey, ...FormatKey[]]))
      .min(1)
      .max(IMAGE_FORMATS.length),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "carousel" && !(v.formats.length === 1 && v.formats[0] === "li-carousel")) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: 'a carousel uses exactly "li-carousel"' });
    }
    if (v.kind === "image" && v.formats.includes("li-carousel")) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: "a single image cannot use li-carousel" });
    }
    if (new Set(v.formats).size !== v.formats.length) {
      ctx.addIssue({ code: "custom", path: ["formats"], message: "a format appears twice" });
    }
  });

/** The pasted texts as separate posts: they are separated by a line with only `---`. */
export function splitTexts(texts: string): string[] {
  return texts
    .split(/^[ \t]*---[ \t]*$/m)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function listImages(projectDir: string): Promise<InputImage[]> {
  const s = { dir: projectDir };
  const names = (await listFolder(path(s, FOLDER))).filter((n) => IMAGE_NAME.test(n)).sort();
  return Promise.all(names.map(async (name) => ({ name, bytes: (await stat(path(s, FOLDER, name))).size })));
}

export async function readTemplateInput(projectDir: string): Promise<TemplateInput> {
  const images = await listImages(projectDir);
  let text: z.infer<typeof InputTextSchema> = DEFAULT_TEXT;
  try {
    const saved = await readJson<unknown>(path({ dir: projectDir }, FOLDER, "input.json"));
    if (saved !== null) {
      const r = InputTextSchema.safeParse(saved);
      if (!r.success) throw new Error(`${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      text = r.data;
    }
  } catch (e) {
    throw new ApiError(500, `template-input/input.json cannot be read: ${reason(e)}`);
  }
  return { images, ...text };
}

export async function saveTemplateText(projectDir: string, text: z.infer<typeof InputTextSchema>): Promise<void> {
  await writeJsonAtomic(path({ dir: projectDir }, FOLDER, "input.json"), text);
}

export async function saveTemplateImage(projectDir: string, content: Buffer): Promise<InputImage> {
  if (!content.length) throw new ApiError(400, "No file was sent");
  const { name, stored } = classify("image", content);
  return serialize(`template-input:${projectDir}`, async () => {
    const images = await listImages(projectDir);
    // The same image twice is the same file.
    if (!images.some((i) => i.name === name) && images.length >= MAX_IMAGES) {
      throw new ApiError(409, `At most ${MAX_IMAGES} screenshots; remove one first`);
    }
    await writeBytesAtomic(path({ dir: projectDir }, FOLDER, name), stored);
    return { name, bytes: stored.length };
  });
}

export async function removeTemplateImage(projectDir: string, name: string): Promise<boolean> {
  if (!IMAGE_NAME.test(name)) throw new ApiError(400, "Invalid file name");
  return serialize(`template-input:${projectDir}`, async () => {
    const found = (await listImages(projectDir)).some((i) => i.name === name);
    if (found) await remove(path({ dir: projectDir }, FOLDER, name));
    return found;
  });
}

export function templateInputRoutes(o: { generate: { available: boolean; model: string | null } }): Route[] {
  return [
    route("GET", "/api/template-input", async (c) => ({
      ...(await readTemplateInput((await c.project()).dir)),
      generate: o.generate,
    })),
    route("PUT", "/api/template-input", async (c) => {
      const r = InputTextSchema.safeParse(await c.readJson());
      if (!r.success) {
        throw new ApiError(400, `${r.error.issues[0].path.join(".") || "input"}: ${r.error.issues[0].message}`);
      }
      await saveTemplateText((await c.project()).dir, r.data);
      return r.data;
    }),
    route(
      "POST",
      "/api/template-input/image",
      async (c) => {
        const content = await c.read(MAX_IMAGE_BYTES);
        return response({ status: 201, body: await saveTemplateImage((await c.project()).dir, content) });
      },
      { rawBody: true },
    ),
    route("DELETE", "/api/template-input/:name", async (c) => {
      if (!(await removeTemplateImage((await c.project()).dir, c.params.name)))
        throw new ApiError(404, "File not found");
      return { ok: true };
    }),
  ];
}
