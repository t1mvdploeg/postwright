// Which AI the studio uses: Claude if `ANTHROPIC_API_KEY` is set, otherwise the sample
// provider. The key comes only from the environment and goes nowhere except to the
// Anthropic API.
import Anthropic from "@anthropic-ai/sdk";
import { BRAND_MODEL, type BrandClient } from "./brand.js";
import { AnthropicProvider, DEFAULT_MODEL } from "./anthropic.js";
import type { AiProvider } from "./provider.js";
import { sampleProvider } from "./sample.js";

export function chooseProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return sampleProvider;
  return new AnthropicProvider({ apiKey: key, model: env.POSTWRIGHT_MODEL?.trim() || DEFAULT_MODEL });
}

export function aiMode(p: AiProvider): { mode: "live" | "sample"; model: string | null } {
  return p.name === "anthropic" ? { mode: "live", model: p.model ?? null } : { mode: "sample", model: null };
}

/**
 * The client for making a brand kit, or `null` without `ANTHROPIC_API_KEY` (there is no sample
 * answer for this: an invented brand kit is worth nothing). `POSTWRIGHT_BRAND_MODEL` changes the model.
 */
export function chooseBrandClient(env: NodeJS.ProcessEnv = process.env): { client: BrandClient; model: string } | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  // A brand kit with a website and a PDF can take minutes; the SDK needs a long timeout.
  const messages = new Anthropic({ apiKey: key, timeout: 10 * 60_000, maxRetries: 1 }).beta.messages;
  return {
    client: { stream: (params) => messages.stream(params) },
    model: env.POSTWRIGHT_BRAND_MODEL?.trim() || BRAND_MODEL,
  };
}
