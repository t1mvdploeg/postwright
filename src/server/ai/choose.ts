// Which AI the studio uses: Claude if `ANTHROPIC_API_KEY` is set, otherwise the sample
// provider. The key comes only from the environment and goes nowhere except to the
// Anthropic API.
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
