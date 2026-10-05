// The Claude call that makes an own template: the screenshots of old posts as image blocks,
// the rules and the brand as text, and structured output for what the model decides. One
// streamed request, no tools. The answer is parsed and judged by `checkTemplate` inside this
// call, so that a refused answer is still booked with the tokens it cost.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { checkTemplate, type TemplateProposal } from "../../web/studio/own-template.js";
import { answerSchema, answerToFile } from "../template-schema.js";
import { guideText, requestText, type GuideContext } from "../template-guide.js";
import { AiError, EMPTY_USAGE, type Usage } from "./provider.js";
import { addUsage, image, parseAnswer, svgForPrompt, type BrandClient } from "./brand.js";

/** What one generation may cost at most, in dollars: the cap is checked against this beforehand. */
export const TEMPLATE_RESERVE_USD = 1;
const MAX_TOKENS = 24_000;

type Params = Parameters<BrandClient["stream"]>[0];
type Content = Anthropic.Beta.Messages.BetaContentBlockParam;

export interface TemplateMaterial extends GuideContext {
  images: { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: Buffer }[];
  logo: { kind: "svg"; text: string } | { kind: "png"; data: Buffer } | null;
}

export interface TemplateResult {
  proposal: TemplateProposal;
  notes: string[];
  model: string;
  usage: Usage;
}

const SYSTEM = `You design post templates for Postwright, a tool that turns templates into on-brand social posts. \
You are given screenshots and texts of a company's old posts, a brief and the company's brand. Propose one template as \
the fields of the schema: a name, a goal, the fields the user fills in, a tree of nodes and some CSS (a carousel has \
three slide kinds and default slides instead). The rules in the instructions are checked by code, and a template that \
breaks one is thrown away, so follow them exactly. Put what you want the user to know in \`notes\` (for example what you \
took from the old posts, or what you could not see).`;

export function templateRequest(m: TemplateMaterial, model: string): Params {
  const content: Content[] = [];
  m.images.forEach((img, i) =>
    content.push({ type: "text", text: `Old post ${i + 1}:` }, image(img.mediaType, img.data)),
  );
  if (m.logo?.kind === "png")
    content.push({ type: "text", text: "The logo of the brand (PNG):" }, image("image/png", m.logo.data));
  const logo =
    m.logo?.kind === "svg"
      ? (() => {
          const svg = svgForPrompt(m.logo.text);
          return svg === null
            ? "The logo is an SVG file that is too large to include."
            : `The logo of the brand (SVG source):\n\n\`\`\`svg\n${svg}\n\`\`\``;
        })()
      : "";
  content.push({ type: "text", text: [requestText(m), logo, guideText(m)].filter(Boolean).join("\n\n") });
  return {
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(answerSchema(m.kind)) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  };
}

/**
 * Sends the request and judges the answer: the schema first, then `checkTemplate`. Nothing is
 * repaired and nothing is retried. Every error carries the tokens already spent, so that the
 * caller still books them.
 */
export async function generateTemplate(
  client: BrandClient,
  model: string,
  m: TemplateMaterial,
): Promise<TemplateResult> {
  const usage: Usage = { ...EMPTY_USAGE };
  let reply;
  try {
    reply = await client.stream(templateRequest(m, model)).finalMessage();
  } catch (error) {
    throw new AiError(error instanceof Error ? error.message : String(error));
  }
  addUsage(usage, reply.usage);
  if (reply.stop_reason === "refusal") {
    throw new AiError("The model declined to make a template from this material", { ...usage });
  }
  if (reply.stop_reason === "max_tokens") {
    throw new AiError("The answer was cut off (too long); try again with fewer screenshots or a shorter brief", {
      ...usage,
    });
  }
  const texts = reply.content.flatMap((b) => (b.type === "text" && b.text.trim() ? [b.text.trim()] : []));
  let raw: unknown;
  try {
    raw = parseAnswer(texts);
  } catch {
    throw new AiError("The model did not return valid JSON; try again", { ...usage });
  }
  const parsed = answerSchema(m.kind).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AiError(
      `The answer does not fit the schema (${first?.path.join(".") || "unknown field"}: ${first?.message})`,
      {
        ...usage,
      },
    );
  }
  const checked = checkTemplate(answerToFile(parsed.data, m.kind, m.formats), { mode: "proposal" });
  if (!checked.ok) {
    const n = checked.problems.length;
    const shown = checked.problems.slice(0, 5).join("; ");
    throw new AiError(`The template was refused (${n} problem${n === 1 ? "" : "s"}): ${shown}${n > 5 ? "; …" : ""}`, {
      ...usage,
    });
  }
  return { proposal: checked.template as TemplateProposal, notes: parsed.data.notes, model: reply.model, usage };
}
