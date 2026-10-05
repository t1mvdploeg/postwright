// A brand kit proposal: a complete brand folder in `brand-input/proposal/`, made by the server
// (route A) or by an agent from the downloaded prompt (route B). `checkProposal` judges both
// the same way and names every problem with its field.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { route, type Route } from "./http.js";
import { path as inside, reason } from "./files.js";
import { BrandSchema, type Brand } from "./brand.js";
import { fontKind } from "./brand-input.js";
import { mediaKind } from "./store.js";
import { sanitiseSvg } from "./svg.js";
import { THRESHOLD, contrastRatio } from "../web/studio/color.js";

export const LOGO_MODES = [
  "default",
  "on-ink",
  "on-accent",
  "ink",
  "white",
  "mark",
  "mark-on-ink",
  "mark-on-accent",
] as const;
export const CSS_VARIABLES = [
  "--ink",
  "--accent",
  "--accent-hover",
  "--accent-light",
  "--accent-soft",
  "--accent-pale",
  "--background",
  "--white",
  "--muted",
  "--stroke",
  "--success",
  "--warning",
  "--soft-warning",
  "--error",
] as const;

export const ExtrasSchema = z
  .object({
    tone: z.string().max(1500).default(""),
    bannedWords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    hashtags: z.string().max(300).default(""),
    notes: z.array(z.string().max(400)).max(30).default([]),
  })
  .strict();
export type Extras = z.infer<typeof ExtrasSchema>;

export const proposalDir = (projectDir: string) => join(projectDir, "brand-input", "proposal");

export type ProposalState =
  { state: "none" } | { state: "invalid"; problems: string[] } | { state: "ready"; brand: Brand; extras: Extras };

const HEX = /^#[0-9a-fA-F]{6}$/;
const invalid = (problems: string[]): ProposalState => ({ state: "invalid", problems });

/** The problem with one file of the proposal, or null. `rel` is the path in brand.json. */
async function fileProblem(dir: string, field: string, rel: string, role: "logo" | "font"): Promise<string | null> {
  let content: Buffer;
  try {
    content = await readFile(inside({ dir }, rel));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return `${field}: file ${rel} not found`;
    if (e instanceof Error && e.message.includes("outside")) return `${field}: the path leaves the brand folder`;
    return `${field}: file ${rel} cannot be read (${reason(e)})`;
  }
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  if (role === "logo") {
    if (ext === "svg") {
      const svg = sanitiseSvg(content.toString("utf8"));
      return svg.ok ? null : `${field}: ${rel}: ${svg.reason}`;
    }
    if (ext === "png") return mediaKind(content) === "png" ? null : `${field}: ${rel} is not a PNG file`;
    return `${field}: ${rel} must be an .svg or .png file`;
  }
  const kind = fontKind(content);
  if (!kind) return `${field}: ${rel} is not a font file`;
  return kind === ext ? null : `${field}: ${rel} has the extension .${ext} but is a ${kind} font`;
}

export async function checkProposal(projectDir: string): Promise<ProposalState> {
  const dir = proposalDir(projectDir);
  let text: string;
  try {
    text = await readFile(join(dir, "brand.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { state: "none" };
    return invalid([`brand.json: cannot be read (${reason(e)})`]);
  }
  let rawBrand: unknown;
  try {
    rawBrand = JSON.parse(text);
  } catch {
    return invalid(["brand.json: not valid JSON"]);
  }
  const parsed = BrandSchema.safeParse(rawBrand);
  if (!parsed.success) {
    return invalid(parsed.error.issues.map((i) => `brand.json: ${i.path.join(".") || "(file)"}: ${i.message}`));
  }
  const brand = parsed.data;
  const problems: string[] = [];

  // A post stores the version of the brand it was made with, at most 40 characters (`brandVersion`).
  // It is trimmed in a post, so a version with spaces around it would never match the brand's.
  if (brand.version.length > 40) problems.push("brand.json: version: longer than 40 characters");
  if (brand.version.trim() === "" || brand.version !== brand.version.trim())
    problems.push("brand.json: version: empty, or with spaces around it");
  for (const k of CSS_VARIABLES) {
    const v = brand.css[k];
    if (v === undefined) problems.push(`brand.json: css.${k}: missing`);
    else if (!HEX.test(v)) problems.push(`brand.json: css.${k}: not a hex colour (#rrggbb)`);
  }
  for (const [name, g] of Object.entries(brand.grounds)) {
    if (!HEX.test(g.background) || !HEX.test(g.text)) {
      problems.push(`brand.json: grounds.${name}: background and text must be hex colours (#rrggbb)`);
      continue;
    }
    const ratio = contrastRatio(g.text, g.background);
    if (ratio < THRESHOLD) problems.push(`brand.json: grounds.${name}: contrast ${ratio}:1 is below ${THRESHOLD}:1`);
  }
  for (const mode of LOGO_MODES) if (!(mode in brand.logos)) problems.push(`brand.json: logos.${mode}: missing`);
  const checks: Promise<string | null>[] = [];
  for (const [mode, rel] of Object.entries(brand.logos)) checks.push(fileProblem(dir, `logos.${mode}`, rel, "logo"));
  brand.font.files.forEach((rel, i) => checks.push(fileProblem(dir, `font.files.${i}`, rel, "font")));
  for (const p of await Promise.all(checks)) if (p) problems.push(`brand.json: ${p}`);

  let extras: Extras = ExtrasSchema.parse({});
  try {
    const saved = JSON.parse(await readFile(join(dir, "extras.json"), "utf8"));
    const r = ExtrasSchema.safeParse(saved);
    if (r.success) extras = r.data;
    else problems.push(`extras.json: ${r.error.issues[0].path.join(".") || "(file)"}: ${r.error.issues[0].message}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") problems.push("extras.json: not valid JSON");
  }

  return problems.length ? invalid(problems) : { state: "ready", brand, extras };
}

/** `GET /api/brand/proposal`: the state of the proposal of this project. */
export function proposalRoutes(): Route[] {
  return [route("GET", "/api/brand/proposal", async (c) => checkProposal((await c.project()).dir))];
}
