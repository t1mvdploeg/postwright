import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ApiError, route, type Route } from "./http.js";

const GROUND = z.object({ background: z.string(), text: z.string() });

export const BrandSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  font: z.object({ family: z.string().min(1), files: z.array(z.string()).min(1) }),
  css: z.record(z.string().regex(/^--[a-z-]+$/), z.string()),
  colors: z.array(z.object({ name: z.string(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), usage: z.string() })).min(3),
  grounds: z.object({ light: GROUND, ink: GROUND, accent: GROUND }),
  logos: z.record(z.string(), z.string()),
});
export type Brand = z.infer<typeof BrandSchema>;

const BUILT_IN = fileURLToPath(new URL("../web/brand", import.meta.url));

/**
 * The folder of the brand of a project: `data/projects/<slug>/brand/` if it contains a
 * `brand.json`, otherwise the built-in folder.
 */
export function brandFolder(projectDir: string, builtIn: string = BUILT_IN): string {
  const custom = join(projectDir, "brand");
  return existsSync(join(custom, "brand.json")) ? custom : builtIn;
}

/**
 * The brand of a project, validated. An error names the file and the field, without the path on
 * disk.
 */
export async function loadBrand(projectDir: string, builtIn: string = BUILT_IN): Promise<Brand> {
  const folder = brandFolder(projectDir, builtIn);
  const label = folder === builtIn ? "brand/brand.json" : `data/projects/${basename(projectDir)}/brand/brand.json`;
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(folder, "brand.json"), "utf8"));
  } catch {
    throw new ApiError(500, `${label}: not valid JSON`);
  }
  const r = BrandSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ApiError(500, `${label}: ${i.path.join(".") || "(file)"}: ${i.message}`);
  }
  return r.data;
}

/** `GET /api/brand`: the brand of the project. Its files are under `/brand/`, see `brandFolder`. */
export function brandRoutes(): Route[] {
  return [route("GET", "/api/brand", async (c) => loadBrand((await c.project()).dir))];
}
