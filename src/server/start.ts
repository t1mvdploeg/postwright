import { maakMarketingRoutes } from "./api-marketing.js";
import { startServer } from "./http.js";

const poort = Number(process.env.PORT ?? 4173);
const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? "./data";

try {
  const { url } = await startServer({ dataDir, poort, routes: maakMarketingRoutes({ dataDir }) });
  console.log(`Postwright is running at ${url}`);
} catch (fout) {
  if ((fout as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${poort} is in use. Start with PORT=<other> npm start.`);
    process.exit(1);
  }
  throw fout;
}
