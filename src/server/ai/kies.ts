// Welke AI de studio gebruikt: Claude als `ANTHROPIC_API_KEY` is gezet, anders de voorbeeldgever.
// De sleutel komt alleen uit de omgeving en gaat nergens heen behalve naar de Anthropic API.
import { AnthropicProvider, STANDAARD_MODEL } from "./anthropic.js";
import type { AiProvider } from "./provider.js";
import { voorbeeldProvider } from "./voorbeeld.js";

export function kiesProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const sleutel = env.ANTHROPIC_API_KEY?.trim();
  if (!sleutel) return voorbeeldProvider;
  return new AnthropicProvider({ apiKey: sleutel, model: env.POSTWRIGHT_MODEL?.trim() || STANDAARD_MODEL });
}

export function aiStand(p: AiProvider): { stand: "live" | "voorbeeld"; model: string | null } {
  return p.naam === "anthropic" ? { stand: "live", model: p.model ?? null } : { stand: "voorbeeld", model: null };
}
