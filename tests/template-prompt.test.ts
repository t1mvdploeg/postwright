// Route B: the downloadable prompt, and `npm run template:check` that the agent runs on its work.
// An agent that follows the prompt needs only this file and the project folder.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareData } from "../src/server/projects.js";
import { buildTemplatePrompt } from "../src/server/template-prompt.js";
import { ALLOWED_VARIABLES, CSS_FUNCTIONS, TAGS } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { webpHeader } from "./helpers/brand-files.js";
import { carouselExample, exampleTemplate, saved, writeTemplateProposal } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const studios: Array<{ close: () => Promise<void> }> = [];
const dirs: string[] = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function start() {
  const s = await startTemplates({ withClient: false });
  studios.push(s);
  return s;
}

const context = {
  kind: "image" as const,
  formats: ["li-square" as const, "story" as const],
  texts: ["A post about a launch."],
  brief: "Bold statements",
  brand: brandFromDisk() as any,
  profile: { sector: "Staffing" },
  tone: "Warm.",
  bannedWords: ["cheap"],
};
const input = {
  images: [{ name: "image-0a1b2c3d.png", bytes: 2048 }],
  texts: "A post about a launch.",
  brief: "Bold statements",
  kind: "image" as const,
  formats: context.formats,
};

describe("buildTemplatePrompt", () => {
  const text = buildTemplatePrompt({ slug: "acme", input, context, brandFolder: "data/projects/acme/brand" });

  it("says where the proposal goes, which project it is for, and what the file holds", () => {
    expect(text).toContain('# Make an own template for the project "acme"');
    expect(text).toContain("data/projects/acme/template-input/proposal/");
    expect(text).toContain('"kind": "image"');
    expect(text).toContain('"formats": ["li-square","story"]');
    expect(text).toContain("`fields` and `tree`");
    expect(text).toContain("no `id` and no `created`");
    expect(text).toContain("data/projects/acme/brand/logo/default.svg");
  });

  it("lists the screenshots by name, and the texts and the brief", () => {
    expect(text).toContain("data/projects/acme/template-input/image-0a1b2c3d.png");
    expect(text).toContain("A post about a launch.");
    expect(text).toContain("Bold statements");
  });

  it("has the same rules as the validator: every tag, variable and function, and the example", () => {
    for (const t of TAGS) expect(text).toContain(`\`${t}\``);
    for (const v of ALLOWED_VARIABLES) expect(text).toContain(`\`${v}\``);
    for (const f of CSS_FUNCTIONS) expect(text).toContain(`\`${f}\``);
    expect(text).toContain('"label": "Headline"');
    expect(text).toContain("Warm.");
  });

  it("tells the agent to run the check, and what not to touch or call", () => {
    expect(text).toContain("npm run template:check -- acme");
    expect(text).toContain('prints "The template proposal is valid."');
    expect(text).toContain("Do not write outside");
    expect(text).toContain("call any paid API");
  });

  it("asks for slides in a carousel", () => {
    const carousel = buildTemplatePrompt({
      slug: "acme",
      input: { ...input, kind: "carousel", formats: ["li-carousel"] },
      context: { ...context, kind: "carousel", formats: ["li-carousel"] },
      brandFolder: "src/web/brand",
    });
    expect(carousel).toContain("`slides` and `defaultSlides`");
    expect(carousel).toContain("src/web/brand/logo/default.svg");
  });
});

describe("GET /api/template-prompt", () => {
  it("needs some material", async () => {
    const { call } = await start();
    expect(await call("/api/template-prompt")).toMatchObject({ status: 400 });
  });

  it("is a markdown download about the material of this project, without a path of this computer or a key", async () => {
    const { call, upload, base, dataDir } = await start();
    await upload(webpHeader(5, 5));
    await call("/api/template-input", "PUT", { texts: "Hello", brief: "Short", kind: "image", formats: ["story"] });
    const r = await fetch(`${base}/api/template-prompt`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="template-prompt-postwright.md"');
    const body = await r.text();
    expect(body).toMatch(/data\/projects\/postwright\/template-input\/image-[0-9a-f]{8}\.webp/);
    expect(body).toContain("Hello");
    expect(body).toContain("src/web/brand/logo/default.svg");
    expect(body).not.toContain(dataDir);
    expect(body).not.toMatch(/sk-ant|ANTHROPIC_API_KEY/);
  });

  it("is about the project in the header", async () => {
    const { call, base } = await start();
    await call("/api/projects", "POST", { name: "Beta Studio" });
    await call(
      "/api/template-input",
      "PUT",
      { texts: "", brief: "For beta", kind: "image", formats: ["story"] },
      "beta-studio",
    );
    const r = await fetch(`${base}/api/template-prompt`, { headers: { "x-postwright-project": "beta-studio" } });
    expect(r.headers.get("content-disposition")).toContain("template-prompt-beta-studio.md");
    expect(await r.text()).toContain("npm run template:check -- beta-studio");
    expect((await fetch(`${base}/api/template-prompt`)).status).toBe(400);
  });
});

describe("npm run template:check", () => {
  const run = (dataDir: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "src/server/template-check-cli.ts", ...args], {
      env: { ...process.env, POSTWRIGHT_DATA_DIR: dataDir },
      encoding: "utf8",
    });
  async function data() {
    const dataDir = join(mkdtempSync(join(tmpdir(), "pw-check-")), "data");
    dirs.push(join(dataDir, ".."));
    await prepareData(dataDir);
    return { dataDir, project: join(dataDir, "projects", "postwright") };
  }

  it("approves a valid proposal, with and without extras, with exit code 0", async () => {
    const { dataDir, project } = await data();
    writeTemplateProposal(project);
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("The template proposal is valid.");
    writeTemplateProposal(project, carouselExample(), { notes: ["A note."] });
    expect(run(dataDir, "postwright").status).toBe(0);
  });

  it("names every problem with its place and exits with 1", async () => {
    const { dataDir, project } = await data();
    const bad = { ...exampleTemplate(), css: ".a { color: red; }", tree: [{ tag: "script" }] };
    writeTemplateProposal(project, bad);
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("The proposal has 2 problems:");
    expect(r.stdout).toContain('css rule 1 (.a) (color): the colour "red" is not allowed');
    expect(r.stdout).toContain('tree[0].tag: "script" is not an allowed tag');
  });

  it("says what is wrong with an id of its own and with a broken extras file", async () => {
    const { dataDir, project } = await data();
    writeTemplateProposal(project, saved(exampleTemplate()));
    expect(run(dataDir, "postwright").stdout).toContain("must not have them");
    writeTemplateProposal(project, exampleTemplate(), { notes: "not a list" });
    expect(run(dataDir, "postwright").stdout).toContain("extras.json: notes");
  });

  it("says what is wrong when there is no proposal, no argument, or no such project", async () => {
    const { dataDir } = await data();
    const none = run(dataDir, "postwright");
    expect(none.status).toBe(1);
    expect(none.stdout).toContain("No proposal found");
    expect(run(dataDir).status).toBe(2);
    expect(run(dataDir, "../x").status).toBe(2);
    const unknown = run(dataDir, "nope");
    expect(unknown.status).toBe(1);
    expect(unknown.stdout).toContain("Unknown project");
  });
});
