// The studio's routes, static paths and project lookup in one place: `start.ts` and the
// test helper both use it, so that they cannot drift apart.
import type { ServerOptions } from "./http.js";
import { brandFolder, brandRoutes } from "./brand.js";
import { brandApplyRoutes } from "./brand-apply.js";
import { brandGenerateRoutes } from "./brand-generate.js";
import { brandInputRoutes } from "./brand-input.js";
import { brandPromptRoutes } from "./brand-prompt.js";
import { proposalDir, proposalRoutes } from "./brand-proposal.js";
import { createRoutes } from "./routes.js";
import { projectRoutes, resolveProject } from "./projects.js";
import { chooseBrandClient } from "./ai/choose.js";
import type { BrandClient } from "./ai/brand.js";
import type { AiProvider } from "./ai/provider.js";
import { templateRoutes } from "./template-routes.js";
import { templateInputRoutes } from "./template-input.js";
import { templateGenerateRoutes } from "./template-generate.js";
import { templatePromptRoutes } from "./template-prompt.js";

export function createApp(o: {
  dataDir: string;
  provider?: AiProvider;
  /** The client for making a brand kit; `undefined` means: from the environment; `null`: none. */
  brand?: { client: BrandClient; model: string } | null;
}): Pick<ServerOptions, "routes" | "static" | "projects"> {
  const brand = o.brand === undefined ? chooseBrandClient() : o.brand;
  return {
    routes: [
      ...projectRoutes(o),
      ...brandRoutes(),
      ...brandInputRoutes({ dataDir: o.dataDir, generate: { available: brand !== null, model: brand?.model ?? null } }),
      ...proposalRoutes(),
      ...brandApplyRoutes(),
      ...brandPromptRoutes(),
      ...brandGenerateRoutes({ dataDir: o.dataDir, brand }),
      ...templateRoutes(),
      ...templateInputRoutes({ generate: { available: brand !== null, model: brand?.model ?? null } }),
      ...templateGenerateRoutes({ dataDir: o.dataDir, brand }),
      ...templatePromptRoutes(),
      ...createRoutes(o),
    ],
    // The brand's files (logos, fonts) come from `brand/` of the project if a brand is there.
    static: [
      { prefix: "/brand/", dir: async (project) => brandFolder((await project()).dir) },
      { prefix: "/brand-proposal/", dir: async (project) => proposalDir((await project()).dir) },
    ],
    projects: { resolve: (header) => resolveProject(o.dataDir, header) },
  };
}
