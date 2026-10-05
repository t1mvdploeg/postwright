// Route B: the downloadable prompt for Claude Code or Codex. It holds everything an agent needs to
// write a template proposal into the project folder and check it, without calling the Claude API.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ApiError, response, route, type Route } from "./http.js";
import { guideText, requestText, type GuideContext } from "./template-guide.js";
import { readTemplateInput, splitTexts, type TemplateInput } from "./template-input.js";
import { EMPTY_INPUT, loadContext } from "./template-generate.js";

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export function buildTemplatePrompt(o: {
  slug: string;
  input: TemplateInput;
  context: GuideContext;
  /** Where the logo files are: the project's own brand folder, or the built-in one. */
  brandFolder: string;
}): string {
  const folder = `data/projects/${o.slug}/template-input`;
  const proposal = `${folder}/proposal`;
  const images = o.input.images.length
    ? o.input.images.map((f) => `- \`${folder}/${f.name}\` (${kb(f.bytes)}): a screenshot of an old post`).join("\n")
    : "- (no screenshots)";
  const carousel = o.input.kind === "carousel";
  return `# Make an own template for the project "${o.slug}"

You are working in the Postwright folder (the one with \`package.json\`). Do not run the studio; you only write files.

## Goal

Write a template proposal into \`${proposal}/\`. The studio shows it on the Templates screen the next time the page loads (or after "Check for a proposal"), and the user keeps it or discards it. Stop only when the check in the last section says the proposal is valid.

## Material

Look at every screenshot before you start:

${images}

The logo of the brand is \`${o.brandFolder}/logo/default.svg\` (or \`default.png\`); you do not need it in the template, because the \`logo\` slot places it.

${requestText(o.context)}

## What to write

All paths are inside \`${proposal}/\`.

- \`template.json\`, the template. It has \`"version": 1\`, \`"kind": "${o.input.kind}"\`, \`"formats": ${JSON.stringify(o.input.formats)}\`, \`name\`, \`goal\`, \`css\` and ${carousel ? "`slides` and `defaultSlides`" : "`fields` and `tree`"}. It has no \`id\` and no \`created\`: the studio makes those when the user keeps the template.
- \`extras.json\` (optional): \`{ "notes": ["..."] }\`, up to ten short notes for the user, for example what you took from the old posts or what you could not see.

${guideText(o.context)}

## Check your work

Run:

\`\`\`
npm run template:check -- ${o.slug}
\`\`\`

It checks the proposal with the same code as the studio and names every problem with its place. Fix them and run it again. You are done when it prints "The template proposal is valid."

## Do not

- Do not write outside \`${proposal}/\`.
- Do not touch other projects, \`src/\`, or the files in \`${folder}/\` that are not in \`proposal/\`.
- Do not start the server or call any paid API.
`;
}

/** `GET /api/template-prompt`: the prompt as a markdown download. */
export function templatePromptRoutes(): Route[] {
  return [
    route("GET", "/api/template-prompt", async (c) => {
      const project = await c.project();
      const input = await readTemplateInput(project.dir);
      if (!input.images.length && !splitTexts(input.texts).length && !input.brief) throw new ApiError(400, EMPTY_INPUT);
      const custom = existsSync(join(project.dir, "brand", "brand.json"));
      const text = buildTemplatePrompt({
        slug: project.slug,
        input,
        context: await loadContext(project.dir, input),
        brandFolder: custom ? `data/projects/${project.slug}/brand` : "src/web/brand",
      });
      return response({
        contentType: "text/markdown; charset=utf-8",
        headers: { "content-disposition": `attachment; filename="template-prompt-${project.slug}.md"` },
        body: text,
      });
    }),
  ];
}
