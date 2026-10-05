// The own templates of a project, one JSON file each in `templates/<id>.json`. Every file is
// checked with `checkTemplate` when it is read: a broken file is skipped with a warning and
// listed, and never fails a request.
import { randomBytes } from "node:crypto";
import { ApiError } from "./http.js";
import { listFolder, path, readJson, reason, remove, serialize, writeJsonAtomic } from "./files.js";
import { listPosts } from "./store.js";
import { LIMITS, checkTemplate, type TemplateFile } from "../web/studio/own-template.js";

const FOLDER = "templates";
export const TEMPLATE_ID = /^own-[0-9a-f]{8}$/;
const TEMPLATE_FILE = /^own-[0-9a-f]{8}\.json$/;

export interface SkippedTemplate {
  file: string;
  problem: string;
}

const key = (projectDir: string) => `templates:${projectDir}`;

/** All own templates of a project, oldest first, and the files that were skipped. */
export async function readOwnTemplates(
  projectDir: string,
): Promise<{ templates: TemplateFile[]; skipped: SkippedTemplate[] }> {
  const s = { dir: projectDir };
  const files = (await listFolder(path(s, FOLDER))).filter((n) => TEMPLATE_FILE.test(n)).sort();
  const templates: TemplateFile[] = [];
  const skipped: SkippedTemplate[] = [];
  for (const file of files) {
    try {
      const checked = checkTemplate(await readJson<unknown>(path(s, FOLDER, file)), { mode: "saved" });
      if (!checked.ok) throw new Error(checked.problems[0]);
      const template = checked.template as TemplateFile;
      if (`${template.id}.json` !== file) throw new Error("id: does not match the file name");
      templates.push(template);
    } catch (e) {
      const problem = reason(e);
      console.warn(`${FOLDER}/${file} skipped: ${problem}`);
      skipped.push({ file, problem });
    }
  }
  return { templates: templates.sort((a, b) => a.created.localeCompare(b.created)), skipped };
}

/** The valid own templates of a project. */
export async function loadOwnTemplates(projectDir: string): Promise<TemplateFile[]> {
  return (await readOwnTemplates(projectDir)).templates;
}

/**
 * Checks a proposal once more, gives it an id (made here, never by the model) and the time, and
 * saves it. At most 30 per project.
 */
export async function saveOwnTemplate(projectDir: string, proposal: unknown): Promise<TemplateFile> {
  const checked = checkTemplate(proposal, { mode: "proposal" });
  if (!checked.ok) throw new ApiError(409, `The template is not valid: ${checked.problems[0]}`);
  const s = { dir: projectDir };
  return serialize(key(projectDir), async () => {
    const files = (await listFolder(path(s, FOLDER))).filter((n) => TEMPLATE_FILE.test(n));
    if (files.length >= LIMITS.templates) {
      throw new ApiError(409, `A project can have at most ${LIMITS.templates} own templates; delete one first`);
    }
    let id: string;
    do id = `own-${randomBytes(4).toString("hex")}`;
    while (files.includes(`${id}.json`));
    const file = { ...checked.template, id, created: new Date().toISOString() } as TemplateFile;
    await writeJsonAtomic(path(s, FOLDER, `${id}.json`), file);
    return file;
  });
}

/** Renames a template; the rest of the file stays as it is. */
export async function renameOwnTemplate(projectDir: string, id: string, name: string): Promise<TemplateFile> {
  if (!TEMPLATE_ID.test(id)) throw new ApiError(400, "Invalid template id");
  const p = path({ dir: projectDir }, FOLDER, `${id}.json`);
  return serialize(key(projectDir), async () => {
    const raw = await readJson<unknown>(p).catch(() => undefined);
    if (raw === null) throw new ApiError(404, "Template not found");
    const checked = checkTemplate(raw, { mode: "saved" });
    if (!checked.ok) throw new ApiError(409, `This template file is broken: ${checked.problems[0]}`);
    const file = { ...(checked.template as TemplateFile), name };
    const again = checkTemplate(file, { mode: "saved" });
    if (!again.ok) throw new ApiError(400, again.problems[0]);
    await writeJsonAtomic(p, file);
    return file;
  });
}

/** How many posts use a template. */
export async function postsUsing(projectDir: string, id: string): Promise<number> {
  return (await listPosts({ dir: projectDir })).filter((p) => p.template === id).length;
}

/** Deletes a template (also a broken file, so that it can be cleaned up); refuses while posts use it. */
export async function deleteOwnTemplate(projectDir: string, id: string): Promise<void> {
  if (!TEMPLATE_ID.test(id)) throw new ApiError(400, "Invalid template id");
  const s = { dir: projectDir };
  return serialize(key(projectDir), async () => {
    if (!(await listFolder(path(s, FOLDER))).includes(`${id}.json`)) throw new ApiError(404, "Template not found");
    const n = await postsUsing(projectDir, id);
    if (n) {
      throw new ApiError(
        409,
        `This template is used by ${n} post${n === 1 ? "" : "s"}; change or delete ${n === 1 ? "it" : "them"} first`,
      );
    }
    await remove(path(s, FOLDER, `${id}.json`));
  });
}
