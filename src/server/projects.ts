// Projects: one folder per brand under `data/projects/<slug>/`. Each has its own
// `project.json`, studio data (`marketing/`) and brand kit (`brand/`); the AI usage file and
// the monthly cap stay in `data/` because there is one key.
import { access, mkdir, readdir, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ApiError, response, route, type Project, type Route } from "./http.js";
import { readJson, reason, serialize, writeJsonAtomic } from "./files.js";

export const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_SLUG = 41;

const ProjectFileSchema = z.object({ name: z.string().min(1).max(60), created: z.string() });
const NameSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();

export const projectDir = (dataDir: string, slug: string) => join(dataDir, "projects", slug);

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

/** A valid folder name for a shown name; `project` if the name has no letters or digits. */
export function slugOf(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
  return slug || "project";
}

async function readProject(dataDir: string, slug: string): Promise<{ project: Project; created: string } | null> {
  try {
    const file = ProjectFileSchema.safeParse(await readJson<unknown>(join(projectDir(dataDir, slug), "project.json")));
    if (!file.success) return null;
    return { project: { slug, name: file.data.name, dir: projectDir(dataDir, slug) }, created: file.data.created };
  } catch {
    return null;
  }
}

/** All projects, oldest first. A folder without a valid `project.json` is not a project. */
export async function listProjects(dataDir: string): Promise<Project[]> {
  const names = (await readdir(join(dataDir, "projects")).catch(() => [] as string[])).filter((n) =>
    PROJECT_SLUG.test(n),
  );
  const found = (await Promise.all(names.map((slug) => readProject(dataDir, slug)))).filter(
    (f): f is NonNullable<typeof f> => f !== null,
  );
  return found
    .sort((a, b) => a.created.localeCompare(b.created) || a.project.slug.localeCompare(b.project.slug))
    .map((f) => f.project);
}

/** Makes an empty project. A slug that is taken gets `-2`, `-3`, and so on. */
export async function createProject(dataDir: string, name: string): Promise<Project> {
  const shown = name.trim();
  return serialize(`projects:${dataDir}`, async () => {
    const taken = new Set(await readdir(join(dataDir, "projects")).catch(() => [] as string[]));
    const base = slugOf(shown);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, MAX_SLUG - String(n).length - 1)}-${n}`;
    const dir = projectDir(dataDir, slug);
    await writeJsonAtomic(join(dir, "project.json"), { name: shown, created: new Date().toISOString() });
    return { slug, name: shown, dir };
  });
}

/**
 * The project a request is about. No header: the first project. A header that is not a slug,
 * or names a project that does not exist: 404. The slug is checked before it touches a path.
 */
export async function resolveProject(dataDir: string, header: string | undefined): Promise<Project> {
  if (header === undefined || header === "") {
    const first = (await listProjects(dataDir))[0];
    if (!first) throw new ApiError(500, "No project found; restart the server to create one");
    return first;
  }
  if (!PROJECT_SLUG.test(header)) throw new ApiError(404, "Unknown project");
  const found = await readProject(dataDir, header);
  if (!found) throw new ApiError(404, "Unknown project");
  return found.project;
}

/**
 * Runs once at start. If `data/projects/` does not exist: an old `data/marketing/` and
 * `data/brand/` move into the project `postwright`, or an empty project `postwright` is made.
 * If a move fails, what already moved goes back and the error says what could not be moved,
 * so that nothing has changed. `move` is a parameter so that a test can make a move fail.
 */
export async function prepareData(
  dataDir: string,
  move: (from: string, to: string) => Promise<void> = rename,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const projects = join(dataDir, "projects");
  if (await exists(projects)) return;
  const dir = projectDir(dataDir, "postwright");
  const names: string[] = [];
  for (const name of ["marketing", "brand"]) if (await exists(join(dataDir, name))) names.push(name);
  const moved: string[] = [];
  let current = "";
  try {
    await mkdir(dir, { recursive: true });
    for (const name of names) {
      current = name;
      await move(join(dataDir, name), join(dir, name));
      moved.push(name);
    }
  } catch (e) {
    for (const name of moved.reverse()) await move(join(dir, name), join(dataDir, name)).catch(() => undefined);
    await rmdir(dir).catch(() => undefined);
    await rmdir(projects).catch(() => undefined);
    throw new Error(
      `Could not move data/${current} into data/projects/postwright (${reason(e)}). Nothing was changed. ` +
        "Move the folder by hand or fix the cause, then start again.",
    );
  }
  await writeJsonAtomic(join(dir, "project.json"), { name: "Postwright", created: new Date().toISOString() });
  // The cap is one setting for all projects now: take the one of the old settings file along.
  const oldSettings = await readJson<{ writingHelp?: { capUsdPerMonth?: unknown } }>(
    join(dir, "marketing", "settings.json"),
  ).catch(() => null);
  const cap = oldSettings?.writingHelp?.capUsdPerMonth;
  if (typeof cap === "number" && Number.isFinite(cap) && cap >= 0 && cap <= 1000) {
    await writeJsonAtomic(join(dataDir, "settings.json"), { capUsdPerMonth: cap });
  }
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "input"}: ${issue.message}`;
}

/** `GET /api/projects` (slug and name) and `POST /api/projects` (a new empty project). */
export function projectRoutes(o: { dataDir: string }): Route[] {
  return [
    route("GET", "/api/projects", async () => ({
      projects: (await listProjects(o.dataDir)).map(({ slug, name }) => ({ slug, name })),
    })),
    route("POST", "/api/projects", async (c) => {
      const r = NameSchema.safeParse(await c.readJson());
      if (!r.success) throw new ApiError(400, firstIssue(r.error));
      const { slug, name } = await createProject(o.dataDir, r.data.name);
      return response({ status: 201, body: { slug, name } });
    }),
  ];
}
