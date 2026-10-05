// The studio's AI: two tasks (writing help and ideas) behind one small interface. Without
// an API key the studio uses the sample provider (`sample.ts`), with a key Claude
// (`anthropic.ts`).
import type { WritingTask, WritingSuggestion } from "../writing-help.js";
import type { IdeasPrompt, IdeasSuggestion } from "../ideas.js";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AiResult<T> {
  suggestion: T;
  model: string;
  usage: Usage;
  durationMs: number;
}

export interface AiProvider {
  name: "anthropic" | "sample";
  /** The model that answers; only for `anthropic`. `aiMode` reads it here. */
  model?: string;
  writeText(prompt: WritingTask): Promise<AiResult<WritingSuggestion>>;
  suggestIdeas(prompt: IdeasPrompt): Promise<AiResult<IdeasSuggestion>>;
}

/** A failed call. The tokens already spent come along, so they are still booked. */
export class AiError extends Error {
  constructor(
    message: string,
    public usage?: Usage,
  ) {
    super(message);
  }
}

export const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
