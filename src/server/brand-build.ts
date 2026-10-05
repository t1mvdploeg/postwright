// From the answer of the model plus the uploaded material to a proposal folder: the colours
// and texts come from the model, everything else is code: contrast, logo variants, the font,
// the version and the check. The result goes through `checkProposal`, the same judge as for a
// proposal that an agent wrote by hand.
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import { ApiError } from "./http.js";
import { path, serialize, writeBytesAtomic, writeJsonAtomic } from "./files.js";
import { BrandSchema } from "./brand.js";
import { readInput } from "./brand-input.js";
import {
  CSS_VARIABLES,
  LOGO_MODES,
  checkProposal,
  proposalDir,
  type Extras,
  type ProposalState,
} from "./brand-proposal.js";
import { silhouettePng } from "./png.js";
import { recolourSvg } from "./svg.js";
import { THRESHOLD, contrastRatio } from "../web/studio/color.js";

const BUILT_IN = fileURLToPath(new URL("../web/brand", import.meta.url));
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const GroundSchema = z.object({ background: HEX, text: HEX });

/** What the model decides. Everything else of the kit is made by code. */
export const BrandProposalSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().max(300),
  colors: z
    .array(z.object({ name: z.string().min(1).max(40), hex: HEX, usage: z.string().max(200) }))
    .min(6)
    .max(14),
  css: z.object(
    Object.fromEntries(CSS_VARIABLES.map((k) => [k, HEX])) as Record<(typeof CSS_VARIABLES)[number], typeof HEX>,
  ),
  grounds: z.object({ light: GroundSchema, ink: GroundSchema, accent: GroundSchema }),
  fontFamily: z.string().max(60),
  tone: z.string().max(1500),
  bannedWords: z.array(z.string().min(1).max(60)).max(30),
  hashtags: z.string().max(300),
});
export type BrandProposalAi = z.infer<typeof BrandProposalSchema>;

export type Logo = { kind: "svg"; text: string } | { kind: "png"; data: Buffer };

const WHITE = "#FFFFFF";
const TRANSPARENCY_NOTE = "a logo with transparency works better on dark grounds";

/**
 * The eight logo modes as files. An SVG is recoloured (white, or the ink colour); a PNG with
 * transparency gets its alpha filled with that colour; a PNG without transparency, or one
 * that cannot be read, stays the original in every mode.
 */
export function logoVariants(
  logo: Logo,
  ink: string,
): { files: Map<string, Buffer>; logos: Record<string, string>; notes: string[] } {
  const notes: string[] = [];
  let make: (colour: string | null) => Buffer;
  if (logo.kind === "svg") {
    make = (colour) => Buffer.from(colour ? recolourSvg(logo.text, colour) : logo.text, "utf8");
  } else {
    const original = logo.data;
    const probe = silhouettePng(original, WHITE);
    if (probe.kind === "opaque")
      notes.push(
        `The logo has no transparent background, so every logo variant is the original; ${TRANSPARENCY_NOTE}.`,
      );
    if (probe.kind === "unreadable")
      notes.push(
        `The PNG logo could not be read (interlaced or an unusual format), so every logo variant is the original; ${TRANSPARENCY_NOTE}.`,
      );
    make = (colour) => {
      if (!colour || probe.kind !== "ok") return original;
      const r = silhouettePng(original, colour);
      return r.kind === "ok" ? r.png : original;
    };
  }
  const original = make(null);
  const white = make(WHITE);
  const inkVersion = make(ink);
  const byMode: Record<(typeof LOGO_MODES)[number], Buffer> = {
    default: original,
    "on-ink": white,
    "on-accent": white,
    ink: inkVersion,
    white,
    mark: original,
    "mark-on-ink": white,
    "mark-on-accent": white,
  };
  const files = new Map<string, Buffer>();
  const logos: Record<string, string> = {};
  for (const mode of LOGO_MODES) {
    logos[mode] = `logo/${mode}.${logo.kind}`;
    files.set(logos[mode], byMode[mode]);
  }
  return { files, logos, notes };
}

/**
 * Checks the text on every ground against 4.5:1. A ground that fails gets ink or white as its
 * text colour, whichever has more contrast; if neither reaches 4.5:1 the proposal is refused.
 */
export function fixGrounds(
  grounds: BrandProposalAi["grounds"],
  ink: string,
): { grounds: BrandProposalAi["grounds"]; notes: string[] } | { error: string } {
  const next = structuredClone(grounds);
  const notes: string[] = [];
  for (const name of ["light", "ink", "accent"] as const) {
    const g = grounds[name];
    const ratio = contrastRatio(g.text, g.background);
    if (ratio >= THRESHOLD) continue;
    const best = [ink, WHITE]
      .map((colour) => ({ colour, ratio: contrastRatio(colour, g.background) }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    if (best.ratio < THRESHOLD) {
      return {
        error: `the ${name} ground cannot reach ${THRESHOLD}:1 contrast (the best is ${best.ratio}:1 with ${best.colour} on ${g.background})`,
      };
    }
    next[name] = { background: g.background, text: best.colour };
    notes.push(
      `Text on the ${name} ground changed from ${g.text} to ${best.colour}: the proposed colour had a contrast of ${ratio}:1.`,
    );
  }
  return { grounds: next, notes };
}

/**
 * `<slug>-<date>-<n>`. The slug part is cut to 24 characters so that the version fits in the
 * 40 characters of a post's `brandVersion`. `n` counts up when the current brand has the same
 * start, otherwise it is 1.
 */
export function nextVersion(slug: string, today: string, current: string | null): string {
  const prefix = `${slug.slice(0, 24)}-${today}-`;
  const n = current?.startsWith(prefix) ? Number(current.slice(prefix.length)) : 0;
  return `${prefix}${(Number.isInteger(n) && n > 0 ? n : 0) + 1}`;
}

function httpsOrNull(v: string): string | null {
  try {
    return new URL(v).protocol === "https:" ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function buildProposal(o: {
  projectDir: string;
  slug: string;
  ai: BrandProposalAi;
  websiteRead: boolean;
  /** Extra notices for the proposal, for things the caller knows and this function does not. */
  notes?: string[];
  today: string;
  currentVersion: string | null;
  builtIn?: string;
}): Promise<ProposalState> {
  const input = await readInput(o.projectDir);
  const logoFile = input.files.find((f) => f.kind === "logo");
  if (!logoFile) throw new ApiError(400, "Add a logo first");
  const s = { dir: o.projectDir };
  const bytes = await readFile(path(s, "brand-input", logoFile.name));
  const logo: Logo = logoFile.name.endsWith(".svg")
    ? { kind: "svg", text: bytes.toString("utf8") }
    : { kind: "png", data: bytes };
  const refuse = (why: string): never => {
    throw new ApiError(422, `The proposal was refused: ${why}`);
  };

  const ink = o.ai.css["--ink"];
  const fixed = fixGrounds(o.ai.grounds, ink);
  if ("error" in fixed) return refuse(fixed.error);
  const notes = [...fixed.notes];
  const variants = logoVariants(logo, ink);
  notes.push(...variants.notes);
  const files = new Map(variants.files);

  const uploaded = input.files.filter((f) => f.kind === "font");
  const family = o.ai.fontFamily.trim() || "Inter";
  let fontFiles: string[];
  if (uploaded.length) {
    for (const f of uploaded) files.set(`fonts/${f.name}`, await readFile(path(s, "brand-input", f.name)));
    fontFiles = uploaded.map((f) => `fonts/${f.name}`);
  } else {
    const dir = o.builtIn ?? BUILT_IN;
    files.set("fonts/inter-latin.woff2", await readFile(join(dir, "fonts", "inter-latin.woff2")));
    files.set("fonts/OFL.txt", await readFile(join(dir, "fonts", "OFL.txt")));
    fontFiles = ["fonts/inter-latin.woff2"];
    if (family !== "Inter")
      notes.push(
        `The font ${family} is not in the material, so Inter is used instead; upload its font files to use the real one.`,
      );
  }

  const site = httpsOrNull(input.website) ?? httpsOrNull(o.ai.url);
  if (!site)
    notes.push(
      "No website was given or found, so the url in brand.json is a placeholder (https://example.com); set the real one.",
    );
  notes.push(...(o.notes ?? []));
  if (input.website && !o.websiteRead)
    notes.push("The website could not be read, so the proposal is based on the files only.");

  const brand = {
    version: nextVersion(o.slug, o.today, o.currentVersion),
    name: o.ai.name,
    url: site ?? "https://example.com",
    font: { family, files: fontFiles },
    css: o.ai.css,
    colors: o.ai.colors,
    grounds: fixed.grounds,
    logos: variants.logos,
  };
  const parsed = BrandSchema.safeParse(brand);
  if (!parsed.success)
    return refuse(`${parsed.error.issues[0].path.join(".") || "(file)"}: ${parsed.error.issues[0].message}`);

  // Same key as applyProposal: apply never moves a half-written proposal folder.
  return serialize(`brand-apply:${o.projectDir}`, async () => {
    const dir = proposalDir(o.projectDir);
    await rm(dir, { recursive: true, force: true });
    for (const [name, content] of files) await writeBytesAtomic(path({ dir }, name), content);
    await writeJsonAtomic(path({ dir }, "brand.json"), parsed.data);
    const extras: Extras = { tone: o.ai.tone, bannedWords: o.ai.bannedWords, hashtags: o.ai.hashtags, notes };
    await writeJsonAtomic(path({ dir }, "extras.json"), extras);

    const result = await checkProposal(o.projectDir);
    if (result.state !== "ready") {
      await rm(dir, { recursive: true, force: true });
      return refuse(result.state === "invalid" ? result.problems[0] : "the proposal could not be written");
    }
    return result;
  });
}
