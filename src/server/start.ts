import { createRoutes } from "./routes.js";
import { startServer } from "./http.js";
import { brandFolder, brandRoutes } from "./brand.js";

const portText = process.env.PORT ?? "4173";
const port = Number(portText);
if (!/^\d+$/.test(portText) || port > 65535) {
  console.error(`PORT must be a whole number between 0 and 65535, not "${portText}".`);
  process.exit(1);
}
const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? "./data";

try {
  const { url } = await startServer({
    dataDir,
    port,
    routes: [...brandRoutes({ dataDir }), ...createRoutes({ dataDir })],
    // The brand's files (logos, fonts) come from `data/brand` if a brand is there.
    static: [{ prefix: "/brand/", dir: () => brandFolder(dataDir) }],
  });
  console.log(`Postwright is running at ${url}`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Start with PORT=<other> npm start.`);
    process.exit(1);
  }
  throw error;
}
