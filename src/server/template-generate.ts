// Route A: "Generate with Claude". Reads the material of the project, makes one paid call behind
// the guard (cap with a reserve of $1, one call at a time, booking) and writes the answer as a
// proposal. Without an API key it writes the fixed sample template instead, which costs
// nothing and books nothing. Nothing is applied here.
import { readFile } from "node:fs/promises";
import { ApiError, route, type Route } from "./http.js";
import { path } from "./files.js";
import { brandFolder, loadBrand } from "./brand.js";
import { StorageError, loadSettingsFile, readGlobalCap } from "./store.js";
import { profileForPrompt } from "./schema.js";
import { runPaid } from "./ai/guard.js";
import { sampleTemplate } from "./ai/sample.js";
import { TEMPLATE_RESERVE_USD, generateTemplate, type TemplateMaterial } from "./ai/template.js";
import type { BrandClient } from "./ai/brand.js";
import type { GuideContext } from "./template-guide.js";
import { readTemplateInput, splitTexts, type TemplateInput } from "./template-input.js";
import { checkProposal, writeProposal } from "./template-proposal.js";

const IMAGE_TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

/** The same text as an `ApiError` with its status, for a failure of the storage layer. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof StorageError) throw new ApiError(e.status, e.message);
    throw e;
  }
}

/** What both routes know about the project: the brand, the profile, the tone and the user's material. */
export async function loadContext(projectDir: string, input: TemplateInput): Promise<GuideContext> {
  const brand = await loadBrand(projectDir);
  const settings = await guarded(() => loadSettingsFile({ dir: projectDir }));
  return {
    kind: input.kind,
    formats: input.formats,
    texts: splitTexts(input.texts),
    brief: input.brief,
    brand,
    profile: profileForPrompt(settings.profile),
    tone: settings.tone,
    bannedWords: settings.bannedWords,
  };
}

/** The context plus what only the model call needs: the screenshots and the logo. */
export async function loadMaterial(projectDir: string, input: TemplateInput): Promise<TemplateMaterial> {
  const context = await loadContext(projectDir, input);
  const logoRel = context.brand.logos.default;
  let logo: TemplateMaterial["logo"] = null;
  if (logoRel) {
    try {
      const bytes = await readFile(path({ dir: brandFolder(projectDir) }, logoRel));
      logo = logoRel.endsWith(".svg") ? { kind: "svg", text: bytes.toString("utf8") } : { kind: "png", data: bytes };
    } catch {
      logo = null; // a logo that cannot be read only makes the prompt shorter
    }
  }
  return {
    ...context,
    logo,
    images: await Promise.all(
      input.images.map(async (i) => ({
        mediaType: IMAGE_TYPE[i.name.slice(i.name.lastIndexOf(".") + 1) as keyof typeof IMAGE_TYPE],
        data: await readFile(path({ dir: projectDir }, "template-input", i.name)),
      })),
    ),
  };
}

export const EMPTY_INPUT = "Add a screenshot, the text of an old post or a short brief first";

export function templateGenerateRoutes(o: {
  dataDir: string;
  brand: { client: BrandClient; model: string } | null;
}): Route[] {
  return [
    route("POST", "/api/template-generate", async (c) => {
      const project = await c.project();
      const input = await readTemplateInput(project.dir);
      if (!input.images.length && !splitTexts(input.texts).length && !input.brief) throw new ApiError(400, EMPTY_INPUT);
      if (!o.brand) {
        const sample = sampleTemplate(input.kind, input.formats);
        await writeProposal(project.dir, sample.template, { notes: sample.notes, sample: true });
        return checkProposal(project.dir);
      }
      const { client, model } = o.brand;
      const material = await loadMaterial(project.dir, input);
      const paid = await runPaid(
        {
          dataDir: o.dataDir,
          cap: () => guarded(() => readGlobalCap(o.dataDir)),
          label: "Template generation",
          task: `template:${project.slug}`,
          model,
          capped: true,
          reserveUsd: TEMPLATE_RESERVE_USD,
        },
        async () => {
          const r = await generateTemplate(client, model, material);
          return { value: r, model: r.model, usage: r.usage };
        },
      );
      await writeProposal(project.dir, paid.value.proposal, { notes: paid.value.notes, sample: false });
      return checkProposal(project.dir);
    }),
  ];
}
