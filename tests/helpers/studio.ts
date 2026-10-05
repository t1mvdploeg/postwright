// Een echte server met de studio-routes op een eigen, tijdelijke datamap. `sluit` stopt de server en
// ruimt precies die map op.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maakMarketingRoutes } from "../../src/server/api-marketing.js";
import { startServer } from "../../src/server/http.js";
import type { AiProvider } from "../../src/server/ai/provider.js";

export async function startStudio(opties: { provider?: AiProvider } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "pw-studio-"));
  const s = await startServer({
    dataDir,
    poort: 0,
    routes: maakMarketingRoutes({ dataDir, provider: opties.provider }),
  });
  return {
    dataDir,
    basis: s.url,
    sluit: async () => {
      await s.sluit();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
