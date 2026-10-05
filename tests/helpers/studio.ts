// A real server with the studio routes on its own, temporary data folder. `close` stops
// the server and cleans up exactly that folder.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoutes } from "../../src/server/routes.js";
import { startServer } from "../../src/server/http.js";
import { brandFolder, brandRoutes } from "../../src/server/brand.js";
import type { AiProvider } from "../../src/server/ai/provider.js";

export async function startStudio(options: { provider?: AiProvider } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "pw-studio-"));
  const s = await startServer({
    dataDir,
    port: 0,
    routes: [...brandRoutes({ dataDir }), ...createRoutes({ dataDir, provider: options.provider })],
    static: [{ prefix: "/brand/", map: () => brandFolder(dataDir) }],
  });
  return {
    dataDir,
    base: s.url,
    close: async () => {
      await s.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
