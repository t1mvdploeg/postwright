// The studio's routes, static paths and project lookup in one place: `start.ts` and the
// test helper both use it, so that they cannot drift apart.
import type { ServerOptions } from "./http.js";
import { brandFolder, brandRoutes } from "./brand.js";
import { brandInputRoutes } from "./brand-input.js";
import { createRoutes } from "./routes.js";
import { projectRoutes, resolveProject } from "./projects.js";
import type { AiProvider } from "./ai/provider.js";

export function createApp(o: {
  dataDir: string;
  provider?: AiProvider;
}): Pick<ServerOptions, "routes" | "static" | "projects"> {
  return {
    routes: [...projectRoutes(o), ...brandRoutes(), ...brandInputRoutes(o), ...createRoutes(o)],
    // The brand's files (logos, fonts) come from `brand/` of the project if a brand is there.
    static: [{ prefix: "/brand/", dir: async (project) => brandFolder((await project()).dir) }],
    projects: { resolve: (header) => resolveProject(o.dataDir, header) },
  };
}
