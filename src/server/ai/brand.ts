// The Claude call that makes a brand kit: the logo, images and brand guide as blocks, the
// website through the web fetch server tool (Anthropic fetches the page; this server never
// goes onto the internet itself), and structured output for what the model decides. One
// streamed request that may be continued when the server tool pauses the turn.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BrandProposalSchema, type BrandProposalAi } from "../brand-build.js";
import { AiError, EMPTY_USAGE, type Usage } from "./provider.js";

/** The current Opus, the model the brand kit is made with. */
export const BRAND_MODEL = "claude-opus-5-5";
/** What one generation may cost at most, in dollars: the cap is checked against this beforehand. */
export const BRAND_RESERVE_USD = 2;
const MAX_TOKENS = 32_000;
/** The server tool pauses a long turn; the request is sent again, at most this many times. */
const MAX_CONTINUES = 3;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Content = Anthropic.Beta.Messages.BetaContentBlockParam;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** The part of `client.beta.messages` that is used here; this lets a test pass in a fake client. */
export interface BrandClient {
  stream(params: Params): { finalMessage(): Promise<Message> };
}

export interface BrandMaterial {
  logo: { kind: "svg"; text: string } | { kind: "png"; data: Buffer };
  images: { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: Buffer }[];
  guide: Buffer | null;
  website: string;
  notes: string;
}

export interface BrandResult {
  proposal: BrandProposalAi;
  model: string;
  usage: Usage;
  websiteRead: boolean;
  /** The SVG logo was too large to send, so the model did not see it. */
  logoOmitted: boolean;
}

const SYSTEM = `You make brand kits for Postwright, a tool that turns templates into on-brand social posts. \
You are given a brand's logo, and maybe images, a brand guide and a website. Describe the brand as the fields of the schema: \
its name and website, 6 to 14 named colours with a use for each, the 14 css variables, three grounds (light, ink and accent) \
with a background and a text colour, the name of the brand font, three to five sentences about the tone of voice, \
words the brand should not use, and hashtags. Use only what the material shows; do not invent colours the logo, the images, \
the guide or the website do not support. Every colour is a hex value (#rrggbb).`;

/** Embedded pictures (data: URIs) are cut out of an SVG: they would cost tokens and show the model nothing it can use. */
const BASE64_URI = /data:[^,"'()\s]*;base64,[A-Za-z0-9+/=\s]*/g;
const withoutPictures = (svg: string) => svg.replace(BASE64_URI, (m) => `${m.slice(0, m.indexOf(",") + 1)}[removed]`);

/** An SVG above this size (after cutting pictures) is not sent: one logo must not cost more than the reserve. */
const MAX_SVG_PROMPT = 100_000;
/** The SVG as it goes into the prompt, or `null` when it is too large to send. */
function svgForPrompt(svg: string): string | null {
  const text = withoutPictures(svg);
  return text.length > MAX_SVG_PROMPT ? null : text;
}

const image = (mediaType: string, data: Buffer): Content =>
  ({ type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } }) as Content;

function instructions(m: BrandMaterial, example: string): string {
  const site = m.website
    ? `The website is ${m.website}. Read it with the web fetch tool and look at the colours, the font and the tone.`
    : "There is no website.";
  const notes = m.notes.trim() ? `\n\nNotes from the user:\n${m.notes.trim()}` : "";
  return `Make the brand kit values for this brand.\n\n${site}${notes}\n\nThe built-in brand of Postwright shows what each field looks like (the logos and font are files, which you do not make):\n\n\`\`\`json\n${example.trim()}\n\`\`\`\n\nThe text colour on each ground must have a contrast of at least 4.5:1 with its background.`;
}

export function brandRequest(m: BrandMaterial, model: string, example: string): Params {
  const content: Content[] = [];
  if (m.logo.kind === "png") content.push({ type: "text", text: "The logo (PNG):" }, image("image/png", m.logo.data));
  else {
    const svg = svgForPrompt(m.logo.text);
    content.push({
      type: "text",
      text:
        svg === null
          ? "The logo is an SVG file that is too large to include; work from the other material and the notes."
          : `The logo (SVG source):\n\n\`\`\`svg\n${svg}\n\`\`\``,
    });
  }
  if (m.images.length) {
    content.push({
      type: "text",
      text: `${m.images.length} image${m.images.length === 1 ? "" : "s"} from earlier posts, the website or the style guide:`,
    });
    for (const i of m.images) content.push(image(i.mediaType, i.data));
  }
  if (m.guide) {
    content.push(
      { type: "text", text: "The brand guide (PDF):" },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: m.guide.toString("base64") } },
    );
  }
  content.push({ type: "text", text: instructions(m, example) });
  return {
    model,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(BrandProposalSchema) },
    // Caches the input, so that a continuation after a paused turn does not pay for it in full again.
    cache_control: { type: "ephemeral" },
    system: SYSTEM,
    ...(m.website ? { tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }] } : {}),
    messages: [{ role: "user", content }],
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cut = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);
/** `#abc` becomes `#aabbcc`; anything else is left for the schema to judge. */
const fullHex = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-fA-F]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v;

/**
 * The structured-output format only states min, max and pattern in the field descriptions, so
 * the model may break them. Code repairs what it can (too many items, too long a text, a short
 * hex colour); what it cannot repair (too few colours, a missing field) is left to the schema.
 */
export function repairAnswer(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const mapRecord = (v: unknown, f: (x: unknown) => unknown) =>
    isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, f(x)])) : v;
  return {
    ...raw,
    name: cut(raw.name, 60),
    url: cut(raw.url, 300),
    colors: Array.isArray(raw.colors)
      ? raw.colors
          .slice(0, 14)
          .map((c) =>
            isRecord(c) ? { ...c, name: cut(c.name, 40), hex: fullHex(c.hex), usage: cut(c.usage, 200) } : c,
          )
      : raw.colors,
    css: mapRecord(raw.css, fullHex),
    grounds: mapRecord(raw.grounds, (g) => mapRecord(g, fullHex)),
    fontFamily: cut(raw.fontFamily, 60),
    tone: cut(raw.tone, 1500),
    bannedWords: Array.isArray(raw.bannedWords)
      ? raw.bannedWords
          .slice(0, 30)
          .map((w) => cut(w, 60))
          .filter((w) => w !== "")
      : raw.bannedWords,
    hashtags: cut(raw.hashtags, 300),
  };
}

function parseAnswer(texts: string[]): unknown {
  try {
    return JSON.parse(texts[texts.length - 1] ?? "");
  } catch {
    return JSON.parse(texts.join(""));
  }
}

function add(total: Usage, u: Message["usage"]) {
  total.input += u.input_tokens;
  total.output += u.output_tokens;
  total.cacheRead += u.cache_read_input_tokens ?? 0;
  total.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

/**
 * Sends the request, continues it while the turn is paused (at most three times), and checks
 * the answer against the schema. Every error carries the tokens already spent, so that the
 * caller still books them.
 */
export async function generateBrand(
  client: BrandClient,
  model: string,
  m: BrandMaterial,
  example: string,
): Promise<BrandResult> {
  const params = brandRequest(m, model, example);
  const messages = [...params.messages];
  const usage: Usage = { ...EMPTY_USAGE };
  const spent = () => (usage.input || usage.output || usage.cacheRead || usage.cacheWrite ? { ...usage } : undefined);
  let websiteRead = false;
  const logoOmitted = m.logo.kind === "svg" && svgForPrompt(m.logo.text) === null;
  for (let turn = 0; turn <= MAX_CONTINUES; turn++) {
    let reply: Message;
    try {
      reply = await client.stream({ ...params, messages: [...messages] }).finalMessage();
    } catch (error) {
      throw new AiError(error instanceof Error ? error.message : String(error), spent());
    }
    add(usage, reply.usage);
    for (const block of reply.content) {
      if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") websiteRead = true;
    }
    if (reply.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: reply.content } as Anthropic.Beta.Messages.BetaMessageParam);
      continue;
    }
    if (reply.stop_reason === "refusal")
      throw new AiError("The model declined to make a brand kit from this material", { ...usage });
    if (reply.stop_reason === "max_tokens")
      throw new AiError("The answer was cut off (too long); try again with less material", { ...usage });
    // The answer is the last text block (a remark before a tool call is another block); the
    // joined text is the fallback for an answer that came in pieces.
    const texts = reply.content.flatMap((b) => (b.type === "text" && b.text.trim() ? [b.text.trim()] : []));
    let raw: unknown;
    try {
      raw = parseAnswer(texts);
    } catch {
      throw new AiError("The model did not return valid JSON; try again", { ...usage });
    }
    const r = BrandProposalSchema.safeParse(repairAnswer(raw));
    if (!r.success) {
      const first = r.error.issues[0];
      throw new AiError(
        `The answer does not fit the schema (${first?.path.join(".") || "unknown field"}: ${first?.message})`,
        { ...usage },
      );
    }
    return { proposal: r.data, model: reply.model, usage, websiteRead, logoOmitted };
  }
  throw new AiError("The website lookup did not finish; try again, or leave the website out", { ...usage });
}
