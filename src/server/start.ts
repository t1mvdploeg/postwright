import { createApp } from "./app.js";
import { startServer } from "./http.js";
import { prepareData } from "./projects.js";

const portText = process.env.PORT ?? "4173";
const port = Number(portText);
if (!/^\d+$/.test(portText) || port > 65535) {
  console.error(`PORT must be a whole number between 0 and 65535, not "${portText}".`);
  process.exit(1);
}
const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? "./data";

try {
  await prepareData(dataDir);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

try {
  const { url } = await startServer({ dataDir, port, ...createApp({ dataDir }) });
  console.log(`Postwright is running at ${url}`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Start with PORT=<other> npm start.`);
    process.exit(1);
  }
  throw error;
}
