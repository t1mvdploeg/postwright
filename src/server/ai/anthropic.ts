// De Claude-aanroep voor de twee marketingtaken: één bericht met gestructureerde uitvoer (zod-schema),
// daarna zelf nagelezen, zodat een mislukking toch met haar tokens terugkomt (`AiFout.usage`).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { MarketingVoorstelSchema, marketingInstructie, marketingOpdracht } from "../../model/marketing-schrijfhulp.js";
import { IdeeenVoorstelSchema, ideeenInstructie, ideeenOpdracht } from "../../model/marketing-ideeen.js";
import { AiFout, type AiProvider, type AiResultaat, type Usage } from "./provider.js";

/** Het huidige Sonnet, uit de modellentabel van Anthropic (per 2026-09-25). */
export const STANDAARD_MODEL = "claude-sonnet-5-5";

// Ruim: bij adaptief denken tellen de denktokens mee in max_tokens, en een afgebroken antwoord is onbruikbaar.
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 240_000;

/** Het deel van `client.messages` dat we gebruiken; zo kan een test een nepclient meegeven. */
export type MaakClient = Pick<Anthropic["messages"], "create">;

export class AnthropicProvider implements AiProvider {
  readonly naam = "anthropic" as const;
  readonly model: string;
  private readonly client: MaakClient;

  constructor(o: { apiKey: string; model: string; client?: MaakClient }) {
    this.model = o.model;
    this.client = o.client ?? new Anthropic({ apiKey: o.apiKey, timeout: TIMEOUT_MS, maxRetries: 1 }).messages;
  }

  private async vraag<S extends z.ZodType>(
    system: string,
    opdracht: string,
    schema: S,
  ): Promise<AiResultaat<z.infer<S>>> {
    const begin = Date.now();
    let antwoord: Anthropic.Message;
    try {
      antwoord = await this.client.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        output_config: { format: zodOutputFormat(schema), effort: "medium" },
        messages: [{ role: "user", content: opdracht }],
      });
    } catch (fout) {
      throw new AiFout(fout instanceof Error ? fout.message : String(fout));
    }
    // Eerst de usage vastleggen: alles hierna kan gooien, maar de tokens zijn dan al verbruikt.
    const usage: Usage = {
      input: antwoord.usage.input_tokens,
      output: antwoord.usage.output_tokens,
      cacheLezen: antwoord.usage.cache_read_input_tokens ?? 0,
      cacheSchrijven: antwoord.usage.cache_creation_input_tokens ?? 0,
    };
    if (antwoord.stop_reason === "refusal") throw new AiFout("The model declined the request", usage);
    if (antwoord.stop_reason === "max_tokens") throw new AiFout("The answer was cut off (too long); try again", usage);
    const tekst = antwoord.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    let ruw: unknown;
    try {
      ruw = JSON.parse(tekst);
    } catch {
      throw new AiFout("The model did not return valid JSON; try again", usage);
    }
    const r = schema.safeParse(ruw);
    if (!r.success) {
      const eerste = r.error.issues[0];
      throw new AiFout(
        `The answer does not fit the schema (${eerste?.path.join(".") || "unknown field"}: ${eerste?.message})`,
        usage,
      );
    }
    return { voorstel: r.data, model: this.model, usage, duurMs: Date.now() - begin };
  }

  marketingTekst(o: Parameters<AiProvider["marketingTekst"]>[0]) {
    return this.vraag(marketingInstructie(o.merk), marketingOpdracht(o), MarketingVoorstelSchema);
  }

  marketingIdeeen(o: Parameters<AiProvider["marketingIdeeen"]>[0]) {
    return this.vraag(ideeenInstructie(o.merk), ideeenOpdracht(o), IdeeenVoorstelSchema);
  }
}
