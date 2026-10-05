// A complete, valid brand kit proposal (a copy of the built-in brand) that a test can break.
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BUILT_IN = "src/web/brand";

/** `change` may edit `brand` (written back afterwards) and the files in `dir`. */
export function writeProposal(projectDir: string, change?: (brand: any, dir: string) => void): string {
  const dir = join(projectDir, "brand-input", "proposal");
  cpSync(BUILT_IN, dir, { recursive: true });
  const brand = JSON.parse(readFileSync(join(dir, "brand.json"), "utf8"));
  change?.(brand, dir);
  writeFileSync(join(dir, "brand.json"), JSON.stringify(brand, null, 2));
  return dir;
}
