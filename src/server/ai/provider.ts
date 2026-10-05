// De AI van de studio: twee taken (schrijfhulp en ideeën) achter één kleine interface. Zonder
// API-sleutel gebruikt de studio de voorbeeldgever (`voorbeeld.ts`), met een sleutel Claude (`anthropic.ts`).
import type { MarketingOpdracht, MarketingVoorstel } from "../../model/marketing-schrijfhulp.js";
import type { IdeeenOpdracht, IdeeenVoorstel } from "../../model/marketing-ideeen.js";

export interface Usage {
  input: number;
  output: number;
  cacheLezen: number;
  cacheSchrijven: number;
}

export interface AiResultaat<T> {
  voorstel: T;
  model: string;
  usage: Usage;
  duurMs: number;
}

export interface AiProvider {
  naam: "anthropic" | "voorbeeld";
  /** Het model dat antwoordt; alleen bij `anthropic`. `aiStand` leest het hier. */
  model?: string;
  marketingTekst(opdracht: MarketingOpdracht): Promise<AiResultaat<MarketingVoorstel>>;
  marketingIdeeen(opdracht: IdeeenOpdracht): Promise<AiResultaat<IdeeenVoorstel>>;
}

/** Een mislukte aanroep. De tokens die al verbruikt zijn, gaan mee, zodat ze toch geboekt worden. */
export class AiFout extends Error {
  constructor(
    bericht: string,
    public usage?: Usage,
  ) {
    super(bericht);
  }
}

export const LEGE_USAGE: Usage = { input: 0, output: 0, cacheLezen: 0, cacheSchrijven: 0 };
