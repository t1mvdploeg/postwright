// Route A: "Generate with Claude". Reads the material of the project, makes one paid call
// behind the guard (cap with a reserve of $2, one call at a time, booking), and turns the answer
// into a proposal. Nothing is applied here.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ApiError, route, type Route } from "./http.js";
import { path } from "./files.js";
import { loadBrand } from "./brand.js";
import { readInput } from "./brand-input.js";
import { buildProposal } from "./brand-build.js";
import { StorageError, readGlobalCap } from "./store.js";
import { runPaid } from "./ai/guard.js";
import { BRAND_RESERVE_USD, generateBrand, type BrandClient, type BrandMaterial } from "./ai/brand.js";

const BUILT_IN = fileURLToPath(new URL("../web", import.meta.url));
const IMAGE_TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

async function loadMaterial(projectDir: string): Promise<BrandMaterial> {
  const input = await readInput(projectDir);
  const s = { dir: projectDir };
  const read = (name: string) => readFile(path(s, "brand-input", name));
  const logo = input.files.find((f) => f.kind === "logo");
  if (!logo) throw new ApiError(400, "Add a logo first");
  const logoBytes = await read(logo.name);
  const guide = input.files.find((f) => f.kind === "guide");
  return {
    logo: logo.name.endsWith(".svg")
      ? { kind: "svg", text: logoBytes.toString("utf8") }
      : { kind: "png", data: logoBytes },
    images: await Promise.all(
      input.files
        .filter((f) => f.kind === "image")
        .map(async (f) => ({
          mediaType: IMAGE_TYPE[f.name.slice(f.name.lastIndexOf(".") + 1) as keyof typeof IMAGE_TYPE],
          data: await read(f.name),
        })),
    ),
    guide: guide ? await read(guide.name) : null,
    website: input.website,
    notes: input.notes,
  };
}

export function brandGenerateRoutes(o: {
  dataDir: string;
  brand: { client: BrandClient; model: string } | null;
  builtIn?: string;
  now?: () => Date;
}): Route[] {
  return [
    route("POST", "/api/brand/generate", async (c) => {
      const project = await c.project();
      // No logo is the first thing to say; a missing key comes second.
      const material = await loadMaterial(project.dir);
      if (!o.brand) {
        throw new ApiError(409, "Generating needs ANTHROPIC_API_KEY in the environment; download the prompt instead");
      }
      const { client, model } = o.brand;
      const builtIn = o.builtIn ?? BUILT_IN;
      const example = readFileSync(`${builtIn}/brand/brand.json`, "utf8");
      const paid = await runPaid(
        {
          dataDir: o.dataDir,
          cap: () =>
            readGlobalCap(o.dataDir).catch((e) => {
              if (e instanceof StorageError) throw new ApiError(e.status, e.message);
              throw e;
            }),
          label: "Brand kit generation",
          task: `brandKit:${project.slug}`,
          model,
          capped: true,
          reserveUsd: BRAND_RESERVE_USD,
        },
        async () => {
          const r = await generateBrand(client, model, material, example);
          return { value: r, model: r.model, usage: r.usage };
        },
      );
      const today = (o.now ?? (() => new Date()))().toISOString().slice(0, 10);
      const currentVersion = await loadBrand(project.dir).then(
        (b) => b.version,
        () => null,
      );
      return buildProposal({
        projectDir: project.dir,
        slug: project.slug,
        ai: paid.value.proposal,
        websiteRead: paid.value.websiteRead,
        notes: paid.value.logoOmitted
          ? [
              "The SVG logo was too large to send to the model, so the proposal is based on the other material only; try a PNG version of the logo.",
            ]
          : [],
        today,
        currentVersion,
      });
    }),
  ];
}
