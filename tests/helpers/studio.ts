// A real server with the studio routes on its own, temporary data folder. `close` stops
// the server and cleans up exactly that folder.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/server/app.js";
import { startServer } from "../../src/server/http.js";
import { prepareData } from "../../src/server/projects.js";
import type { AiProvider } from "../../src/server/ai/provider.js";

export async function startStudio(options: { provider?: AiProvider } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "pw-studio-"));
  await prepareData(dataDir);
  const s = await startServer({ dataDir, port: 0, ...createApp({ dataDir, provider: options.provider }) });
  return {
    dataDir,
    /** The folder of the project `postwright`, where the studio data and the brand live. */
    projectDir: join(dataDir, "projects", "postwright"),
    base: s.url,
    close: async () => {
      await s.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
