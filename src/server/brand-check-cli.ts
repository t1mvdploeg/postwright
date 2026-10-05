// `npm run brand:check -- <project>`: checks the brand kit proposal of a project with the same
// code as the server and names every problem. For an agent that makes a proposal by hand.
import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkProposal } from "./brand-proposal.js";
import { PROJECT_SLUG, projectDir } from "./projects.js";

export async function brandCheck(dataDir: string, slug: string | undefined): Promise<{ code: number; out: string[] }> {
  if (!slug || !PROJECT_SLUG.test(slug)) return { code: 2, out: ["Usage: npm run brand:check -- <project>"] };
  const dir = projectDir(dataDir, slug);
  const known = await access(join(dir, "project.json")).then(
    () => true,
    () => false,
  );
  if (!known) return { code: 1, out: [`Unknown project: ${slug}`] };
  const result = await checkProposal(dir);
  if (result.state === "none") {
    return { code: 1, out: [`No proposal found: data/projects/${slug}/brand-input/proposal/brand.json is missing.`] };
  }
  if (result.state === "invalid") {
    const n = result.problems.length;
    return {
      code: 1,
      out: [`The proposal has ${n} problem${n === 1 ? "" : "s"}:`, ...result.problems.map((p) => `- ${p}`)],
    };
  }
  return { code: 0, out: ["The brand kit proposal is valid."] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, out } = await brandCheck(process.env.POSTWRIGHT_DATA_DIR ?? "./data", process.argv[2]);
  console.log(out.join("\n"));
  process.exitCode = code;
}
