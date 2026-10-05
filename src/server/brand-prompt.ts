// The downloadable prompt for Claude Code or Codex: everything an agent needs to write a brand
// kit proposal into the project folder and check it, without calling the Claude API.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiError, response, route, type Route } from "./http.js";
import { readInput, type BrandInput, type InputRole } from "./brand-input.js";
import { CSS_VARIABLES, LOGO_MODES } from "./brand-proposal.js";

const BUILT_IN_JSON = fileURLToPath(new URL("../web/brand/brand.json", import.meta.url));

const KIND_TEXT: Record<InputRole, string> = {
  logo: "the logo",
  image: "an image from earlier posts, the website or the style guide",
  guide: "the brand guide (PDF)",
  font: "a font file",
};

const MODE_TEXT: Record<(typeof LOGO_MODES)[number], string> = {
  default: "the logo as supplied, for light grounds",
  "on-ink": "the logo for the dark `ink` ground",
  "on-accent": "the logo for the `accent` ground",
  ink: "a single-colour logo in the ink colour (`--ink`), without a background",
  white: "a single-colour white logo, without a background",
  mark: "the mark alone (no wordmark); the same as `default` when there is no separate mark",
  "mark-on-ink": "the mark for the ink ground",
  "mark-on-accent": "the mark for the accent ground",
};

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export function buildPrompt(o: { slug: string; input: BrandInput; example: string }): string {
  const proposal = `data/projects/${o.slug}/brand-input/proposal/`;
  const folder = `data/projects/${o.slug}/brand-input`;
  const files = o.input.files.length
    ? o.input.files.map((f) => `- \`${folder}/${f.name}\`: ${KIND_TEXT[f.kind]} (${kb(f.bytes)})`).join("\n")
    : "- (no files)";
  const website = o.input.website
    ? `Website: ${o.input.website}\n\nOpen it with your own fetch tool and look at the colours, the font and the tone. If you cannot read it, say so in \`extras.json\` under \`notes\` and work from the files.`
    : "Website: none";
  const notes = o.input.notes.trim()
    ? `\n\nNotes from the user:\n\n> ${o.input.notes.trim().replace(/\n/g, "\n> ")}`
    : "";
  const modes = LOGO_MODES.map((m) => `| \`${m}\` | ${MODE_TEXT[m]} |`).join("\n");

  return `# Make a brand kit for the project "${o.slug}"

You are working in the Postwright folder (the one with \`package.json\`). Do not run the studio; you only write files.

## Goal

Write a complete brand kit proposal into \`${proposal}\`. The studio shows it under "Create a brand kit" the next time the page loads, and the user applies it with "Use this brand kit". Stop only when the check in the last section says the proposal is valid.

## Material

Files in \`${folder}/\`:

${files}

${website}${notes}

## What to write

All paths below are inside \`${proposal}\`.

- \`brand.json\`, the brand, in the schema below.
- \`logo/<mode>.svg\` or \`logo/<mode>.png\` for each of the eight logo modes.
- \`fonts/\`, the font files that \`brand.json\` names.
- \`extras.json\`, with what does not belong in the brand: \`{ "tone": "", "bannedWords": [], "hashtags": "", "notes": [] }\`. \`tone\` is three to five sentences about how the brand sounds. \`bannedWords\` are words the brand should not use, \`hashtags\` is a line like \`#acme #launch\`, and \`notes\` lists anything the user should know (for example "The website could not be read" or "The real font is missing").

### brand.json

| Field | What it is |
| --- | --- |
| \`version\` | \`${o.slug.slice(0, 24)}-<YYYY-MM-DD>-<n>\`, at most 40 characters (the check refuses a longer one). Use today's date and \`1\`. |
| \`name\` | The brand's name. |
| \`url\` | The website, with \`https://\`. |
| \`font\` | \`{ "family": "<name of the brand font>", "files": ["fonts/<file>"] }\`. Use the uploaded font files if there are any. Otherwise copy \`src/web/brand/fonts/inter-latin.woff2\` and \`OFL.txt\` to \`fonts/\`, keep the real font's name as \`family\`, and add a note that the real font is missing. |
| \`css\` | Exactly these 14 variables, all hex colours (\`#rrggbb\`): ${CSS_VARIABLES.map((v) => `\`${v}\``).join(", ")}. |
| \`colors\` | 6 to 14 colours, each \`{ "name", "hex", "usage" }\`, like the example. |
| \`grounds\` | \`light\`, \`ink\` and \`accent\`, each \`{ "background", "text" }\` in hex. |
| \`logos\` | The eight logo modes below, each a path like \`logo/default.svg\`. |

The built-in brand of Postwright is the example. Follow its shape:

\`\`\`json
${o.example.trim()}
\`\`\`

### Rules

- **Contrast.** The text colour on every ground has a contrast of at least 4.5:1 (WCAG). If a colour from the brand does not reach that, use the ink colour or white for the text.
- **Logo modes.** Each of the eight is a file in \`logo/\`:

| Mode | What it is |
| --- | --- |
${modes}

- **SVG logo.** \`default\` is the original. For the single-colour modes replace every \`fill\`, \`stroke\` and \`stop-color\` by white (or by the ink colour for \`ink\`), keep \`none\`, and put \`fill\` on the root \`<svg>\` too. Remove scripts, \`foreignObject\` and links to anything outside the file.
- **PNG logo with transparency.** \`default\` is the original. The single-colour modes keep the alpha channel and fill every pixel with white (or the ink colour).
- **PNG logo without transparency.** Every mode is the original. Add a note that a logo with transparency works better on dark grounds.
- **Mark.** Without a separate mark, \`mark\`, \`mark-on-ink\` and \`mark-on-accent\` equal \`default\`, \`on-ink\` and \`on-accent\`.
- **Fonts.** woff2, woff, ttf or otf, and the extension must match the file.

## Check your work

Run:

\`\`\`
npm run brand:check -- ${o.slug}
\`\`\`

It checks the proposal with the same code as the studio and names every problem with its field. Fix them and run it again. You are done when it prints "The brand kit proposal is valid."

## Do not

- Do not write outside \`${proposal}\`.
- Do not touch other projects, \`src/\`, or the files in \`${folder}/\` that are not in \`proposal/\`.
- Do not start the server or call any paid API.
`;
}

/** `GET /api/brand/prompt`: the prompt as a markdown download. */
export function brandPromptRoutes(o: { builtIn?: string } = {}): Route[] {
  return [
    route("GET", "/api/brand/prompt", async (c) => {
      const project = await c.project();
      const input = await readInput(project.dir);
      if (!input.files.some((f) => f.kind === "logo")) throw new ApiError(400, "Add a logo first");
      const text = buildPrompt({
        slug: project.slug,
        input,
        example: readFileSync(o.builtIn ?? BUILT_IN_JSON, "utf8"),
      });
      return response({
        contentType: "text/markdown; charset=utf-8",
        headers: { "content-disposition": `attachment; filename="brand-kit-prompt-${project.slug}.md"` },
        body: text,
      });
    }),
  ];
}
