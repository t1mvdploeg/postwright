// The Claude call for the two marketing tasks: one message with structured output (zod
// schema), then validated separately afterwards, so that a failure still comes back with
// its tokens (`AiError.usage`).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { WritingSuggestionSchema, writingInstruction, writingPrompt } from "../writing-help.js";
import { IdeasSuggestionSchema, ideasInstruction, ideasPrompt } from "../ideas.js";
import { AiError, type AiProvider, type AiResult, type Usage } from "./provider.js";

/** The current Sonnet, from Anthropic's model table (as of 2026-09-25). */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Generous: with adaptive thinking the thinking tokens count towards max_tokens, and a
// truncated response is unusable.
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 90_000;

/** The part of `client.messages` that is used here; this lets a test pass in a fake client. */
export type ClientFactory = Pick<Anthropic["messages"], "create">;

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private readonly client: ClientFactory;

  constructor(o: { apiKey: string; model: string; client?: ClientFactory }) {
    this.model = o.model;
    this.client = o.client ?? new Anthropic({ apiKey: o.apiKey, timeout: TIMEOUT_MS, maxRetries: 1 }).messages;
  }

  private async ask<S extends z.ZodType>(system: string, prompt: string, schema: S): Promise<AiResult<z.infer<S>>> {
    const begin = Date.now();
    let response: Anthropic.Message;
    try {
      response = await this.client.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        output_config: { format: zodOutputFormat(schema), effort: "medium" },
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      throw new AiError(error instanceof Error ? error.message : String(error));
    }
    // Record the usage first: everything after this can throw, but the tokens are already spent.
    const usage: Usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") throw new AiError("The model declined the request", usage);
    if (response.stop_reason === "max_tokens") throw new AiError("The answer was cut off (too long); try again", usage);
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AiError("The model did not return valid JSON; try again", usage);
    }
    const r = schema.safeParse(raw);
    if (!r.success) {
      const first = r.error.issues[0];
      throw new AiError(
        `The answer does not fit the schema (${first?.path.join(".") || "unknown field"}: ${first?.message})`,
        usage,
      );
    }
    return { suggestion: r.data, model: this.model, usage, durationMs: Date.now() - begin };
  }

  writeText(o: Parameters<AiProvider["writeText"]>[0]) {
    return this.ask(writingInstruction(o.brand), writingPrompt(o), WritingSuggestionSchema);
  }

  suggestIdeas(o: Parameters<AiProvider["suggestIdeas"]>[0]) {
    return this.ask(ideasInstruction(o.brand), ideasPrompt(o), IdeasSuggestionSchema);
  }
}
