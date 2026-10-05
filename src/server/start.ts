import { maakMarketingRoutes } from "./api-marketing.js";
import { startServer } from "./http.js";
import { merkMap, merkRoutes } from "./merk.js";

const poortTekst = process.env.PORT ?? "4173";
const poort = Number(poortTekst);
if (!/^\d+$/.test(poortTekst) || poort > 65535) {
  console.error(`PORT must be a whole number between 0 and 65535, not "${poortTekst}".`);
  process.exit(1);
}
const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? "./data";

try {
  const { url } = await startServer({
    dataDir,
    poort,
    routes: [...merkRoutes({ dataDir }), ...maakMarketingRoutes({ dataDir })],
    // De bestanden van het merk (logo's, lettertypen) komen uit `data/brand` als daar een merk staat.
    statisch: [{ prefix: "/marketing/merk/", map: () => merkMap(dataDir) }],
  });
  console.log(`Postwright is running at ${url}`);
} catch (fout) {
  if ((fout as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${poort} is in use. Start with PORT=<other> npm start.`);
    process.exit(1);
  }
  throw fout;
}
