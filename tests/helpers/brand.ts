// The studio's built-in brand as the browser loads it (`src/web/studio/brand.js`), but from
// disk: logos as data URIs, without the font (that makes the tests neither slower nor
// larger and does not change the markup; the family name is in the brand though).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Brand } from "../../src/web/studio/templates.js";

const FOLDER = "src/web/brand";

export function brandFromDisk(): Brand {
  const m = JSON.parse(readFileSync(join(FOLDER, "brand.json"), "utf8"));
  const logos = Object.fromEntries(
    Object.entries(m.logos as Record<string, string>).map(([mode, path]) => [
      mode,
      `data:image/svg+xml;base64,${readFileSync(join(FOLDER, path)).toString("base64")}`,
    ]),
  );
  return { ...m, logos, fontCss: "" };
}
