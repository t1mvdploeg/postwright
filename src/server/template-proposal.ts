// A template proposal: `template.json` (and optionally `extras.json`) in
// `template-input/proposal/`, made by the server (route A) or by an agent from the downloaded
// prompt (route B). `checkProposal` judges both the same way, with `checkTemplate`, and names
// every problem with its place.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { path as inside, reason, serialize, writeJsonAtomic } from "./files.js";
import { checkTemplate, type TemplateProposal } from "../web/studio/own-template.js";

export const proposalDir = (projectDir: string) => join(projectDir, "template-input", "proposal");

const ExtrasSchema = z
  .object({
    notes: z.array(z.string().max(300)).max(10).default([]),
    /** The proposal is the fixed sample, made without a model. */
    sample: z.boolean().default(false),
  })
  .strict();
export type ProposalExtras = z.infer<typeof ExtrasSchema>;

export type ProposalState =
  | { state: "none" }
  | { state: "invalid"; problems: string[] }
  | { state: "ready"; template: TemplateProposal; notes: string[]; sample: boolean };

const invalid = (problems: string[]): ProposalState => ({ state: "invalid", problems });

export async function checkProposal(projectDir: string): Promise<ProposalState> {
  const dir = proposalDir(projectDir);
  let text: string;
  try {
    text = await readFile(inside({ dir }, "template.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { state: "none" };
    return invalid([`template.json: cannot be read (${reason(e)})`]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return invalid(["template.json: not valid JSON"]);
  }
  const checked = checkTemplate(raw, { mode: "proposal" });
  const problems = checked.ok ? [] : [...checked.problems];
  let extras: ProposalExtras = ExtrasSchema.parse({});
  try {
    const r = ExtrasSchema.safeParse(JSON.parse(await readFile(inside({ dir }, "extras.json"), "utf8")));
    if (r.success) extras = r.data;
    else problems.push(`extras.json: ${r.error.issues[0].path.join(".") || "(file)"}: ${r.error.issues[0].message}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") problems.push("extras.json: not valid JSON");
  }
  if (problems.length || !checked.ok) return invalid(problems);
  return { state: "ready", template: checked.template as TemplateProposal, notes: extras.notes, sample: extras.sample };
}

/** Writes a proposal; a pending one is replaced. */
export async function writeProposal(
  projectDir: string,
  template: unknown,
  extras: { notes: string[]; sample: boolean },
): Promise<void> {
  await serialize(`template-proposal:${projectDir}`, async () => {
    const dir = proposalDir(projectDir);
    await rm(dir, { recursive: true, force: true });
    await writeJsonAtomic(join(dir, "template.json"), template);
    await writeJsonAtomic(join(dir, "extras.json"), extras);
  });
}

export async function discardProposal(projectDir: string): Promise<void> {
  await serialize(`template-proposal:${projectDir}`, () =>
    rm(proposalDir(projectDir), { recursive: true, force: true }),
  );
}
