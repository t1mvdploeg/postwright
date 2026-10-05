// De routes van de studio, allemaal onder `/api/`. De server bewaart recepten, lijsten,
// instellingen en geüploade beelden in de datamap; de studio rendert, exporteert (PNG, PDF, ZIP) en
// maakt de agenda-export zelf in de browser.
import { ApiFout, antwoord, route, type Ctx, type Route } from "./http.js";
import { leesJson, pad, serialiseer, type Opslag } from "../data/bestanden.js";
import {
  MarketingOpslagFout,
  bewaarMarketingInstellingen,
  bewaarMedia,
  geldigLijstId,
  laadMarketingInstellingen,
  leesLijst,
  leesMedia,
  leesPost,
  lijstMedia,
  lijstPosts,
  maakPost,
  mediaAfmetingen,
  mediaGebruik,
  mediaSoort,
  MEDIA_CONTENT_TYPES,
  MEDIA_ID,
  nieuwLijstId,
  nieuwPostId,
  werkLijstBij,
  werkPostBij,
  wisMedia,
  wisPost,
  type LijstNaam,
  type MediaSoort,
} from "../data/marketing.js";
import {
  CampagneInvoerSchema,
  FeitInvoerSchema,
  IdeeInvoerSchema,
  MarketingInstellingenSchema,
  MOMENT_SLEUTEL,
  POST_ID,
  PostInvoerSchema,
  ResultaatInvoerSchema,
  StatusOvergangSchema,
  TekstInvoerSchema,
  type Campagne,
  type Feit,
  type Geschiedenisregel,
  type Idee,
  type Post,
  type PostInvoer,
  type PostSamenvatting,
  type Tekst,
  type TekstInvoer,
} from "../model/marketing-schema.js";
import { STARTFEITEN, STARTPOSTS, STARTTEKSTEN, type Startfeit } from "../model/marketing-startvulling.js";
import { SchrijfhulpVerzoekSchema, type MarketingOpdracht } from "../model/marketing-schrijfhulp.js";
import { IdeeenVerzoekSchema, ruimIdeeenOp, type IdeeenOpdracht } from "../model/marketing-ideeen.js";
import { alleMomenten, type Moment } from "../model/marketing-momenten.js";
import { resultatenPerSjabloon } from "../model/marketing-resultaten.js";
// Elke studio-link in de posttekst wijst naar zijn eigen post; dezelfde functie als de editor
// gebruikt bij "Link invoegen", zodat een link die daarvóór is geplakt of gedupliceerd is, ook klopt.
import { zetUtmInhoud } from "../web/marketing/posttekst.js";
// Voor de controle dat een idee naar een bestaand sjabloon wijst: dezelfde sjabloonlijst als de editor.
import { SJABLONEN, sjabloon as sjabloonVan } from "../web/marketing/sjablonen.js";
// De merkcontrole van de browser, ook hier gebruikt voor de voorbeeldpost die ingepland wordt.
import { controleer } from "../web/marketing/merkcontrole.js";
// Datumhelpers: één versie voor server en browser (echteDatum laat 2026-13-01 en 2026-02-30 niet door).
import { echteDatum, komendeWeken, plusDagen } from "../web/marketing/kalender.js";
import { ongedekteGetallen } from "../web/marketing/getallen.js";
import { AiFout, type AiProvider, type AiResultaat } from "./ai/provider.js";
import { aiStand, kiesProvider } from "./ai/kies.js";
import { laadMerk } from "./merk.js";
import { boek, kostenUsd, maandtotaalUsd } from "./ai/verbruik.js";
import { z } from "zod";

/** Grootste upload: een schermafbeelding of foto. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
/** Hoeveel regels `geschiedenis` bijhoudt; de oudste vallen eraf. */
const MAX_GESCHIEDENIS = 100;

const AMSTERDAM_DATUM = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });
/** De kalenderdatum (JJJJ-MM-DD) in Nederland; zelfde aanpak als `kalenderdatumAmsterdam` in api.ts
 *  (niet geïmporteerd: api.ts importeert deze module, dat zou een kringetje worden). */
function vandaagAmsterdam(nu: Date): string {
  return AMSTERDAM_DATUM.format(nu);
}

/** Of een feit niet (meer) mag worden gebruikt: ingetrokken, nog concept, of voorbij `geldigTot`. */
export function feitOnbruikbaar(f: Pick<Feit, "status" | "geldigTot">, vandaag: string): boolean {
  return f.status !== "actief" || (f.geldigTot !== null && f.geldigTot < vandaag);
}

function eersteZodFout(fout: z.ZodError): string {
  const issue = fout.issues[0];
  const pad = issue.path.join(".") || "invoer";
  return `${pad}: ${issue.message}`;
}

function valideer<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiFout(400, eersteZodFout(r.error));
  return r.data;
}

function metGeschiedenis(p: Post, regel: Geschiedenisregel): Geschiedenisregel[] {
  return [...p.geschiedenis, regel].slice(-MAX_GESCHIEDENIS);
}

function samenvatting(p: Post): PostSamenvatting {
  const { geschiedenis: _weg, ...rest } = p;
  return rest;
}

/** De velden die het beeld of de tekst bepalen. Verandert er één, dan hoort er een nieuwe controle bij. */
function inhoudVerschilt(
  a: Pick<Post, "sjabloon" | "inhoud" | "dias" | "formaten" | "posttekst" | "altTekst" | "link" | "feiten">,
  b: typeof a,
): boolean {
  const sleutel = (x: typeof a) =>
    JSON.stringify([x.sjabloon, x.inhoud, x.dias, x.formaten, x.posttekst, x.altTekst, x.link, x.feiten]);
  return sleutel(a) !== sleutel(b);
}

/** Elke studio-link in de postteksten wijst naar deze post (utm_content = post-id). */
function metEigenUtm<T extends { posttekst: PostInvoer["posttekst"] }>(p: T, id: string): T {
  return {
    ...p,
    posttekst: Object.fromEntries(
      Object.entries(p.posttekst).map(([k, t]) => [k, zetUtmInhoud(t, id)]),
    ) as T["posttekst"],
  };
}

function naarApiFout(e: unknown): never {
  if (e instanceof MarketingOpslagFout) throw new ApiFout(e.status, e.message);
  throw e;
}

const EigenMomentenSchema = z
  .array(
    z
      .object({
        sleutel: z.string().regex(MOMENT_SLEUTEL, "alleen kleine letters, cijfers en streepjes"),
        datum: z.string().refine(echteDatum, "geen echte datum (JJJJ-MM-DD)"),
        titel: z.string().trim().min(1).max(80),
        zin: z.string().trim().max(300).default(""),
      })
      .strict(),
  )
  .max(500);

/**
 * De eigen momenten uit `<datamap>/marketing/momenten.json`: een lijst met `sleutel`, `datum`, `titel`
 * en `zin`. Het bestand is optioneel; een kapot bestand geeft een 500 met zijn naam, zodat de gebruiker
 * weet wat hij moet nakijken.
 */
export async function leesEigenMomenten(o: Opslag): Promise<Moment[]> {
  try {
    const lijst = await leesJson<unknown>(pad(o, "marketing", "momenten.json"));
    if (lijst === null) return [];
    const r = EigenMomentenSchema.safeParse(lijst);
    if (!r.success) throw new Error(eersteZodFout(r.error));
    return r.data.map((m) => ({ ...m, soort: "eigen" as const }));
  } catch (e) {
    throw new ApiFout(500, `marketing/momenten.json is niet te lezen: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** `provider`: de AI die de routes gebruiken; zonder gebruiken ze `kiesProvider()` (sleutel uit de omgeving). */
export function maakMarketingRoutes(o: { dataDir: string; provider?: AiProvider }): Route[] {
  const gedeeld: Opslag = { dir: o.dataDir };
  const provider = o.provider ?? kiesProvider();
  /** De instellingen; een onleesbaar bestand wordt een 500 met zijn naam (nooit stilletjes de standaard). */
  const laadInstellingen = () => laadMarketingInstellingen(gedeeld).catch(naarApiFout);

  function postId(c: Ctx): string {
    const id = c.params.id;
    if (!POST_ID.test(id)) throw new ApiFout(400, "Ongeldig post-id");
    return id;
  }

  /** Een campagne die bij een post staat, moet bestaan; anders wijst de post naar niets. */
  async function controleerCampagne(invoer: PostInvoer): Promise<void> {
    if (!invoer.campagne) return;
    const campagnes = await leesLijst<Campagne>(gedeeld, "campagnes");
    if (!campagnes.some((k) => k.id === invoer.campagne))
      throw new ApiFout(400, "De gekozen campagne bestaat niet (meer)");
  }

  /** Generieke routes voor een kleine lijst (campagnes, teksten): lijst, nieuw, wijzigen, wissen. */
  function lijstRoutes<T extends { id: string; aangemaakt: string; gewijzigd: string }>(
    lijst: LijstNaam,
    pad: string,
    schema: z.ZodType,
    opties: {
      naam: string;
      /** Extra controle vóór opslaan (uniciteit); gooit een ApiFout. */
      controleer?: (invoer: Record<string, unknown>, regels: T[], id: string | null) => void;
      /** Waarom deze regel niet weg mag, of null. */
      magNietWeg?: (id: string) => Promise<string | null>;
    },
  ): Route[] {
    const idUit = (c: Ctx) => {
      if (!geldigLijstId(lijst, c.params.id)) throw new ApiFout(400, `Ongeldig ${opties.naam}-id`);
      return c.params.id;
    };
    return [
      route("GET", pad, async () => ({ [lijst]: await leesLijst<T>(gedeeld, lijst) })),
      route("POST", pad, async (c) => {
        const invoer = valideer(schema, await c.leesJson()) as Record<string, unknown>;
        const nu = new Date().toISOString();
        const regel = await werkLijstBij<T, T>(gedeeld, lijst, (regels) => {
          opties.controleer?.(invoer, regels, null);
          if (regels.length >= 500) throw new ApiFout(409, `Er staan al 500 ${lijst}; ruim eerst op`);
          const nieuw = { ...invoer, id: nieuwLijstId(lijst), aangemaakt: nu, gewijzigd: nu } as unknown as T;
          return { regels: [...regels, nieuw], uitkomst: nieuw };
        });
        return antwoord({ status: 201, body: regel });
      }),
      route("PUT", `${pad}/:id`, async (c) => {
        const id = idUit(c);
        const invoer = valideer(schema, await c.leesJson()) as Record<string, unknown>;
        const regel = await werkLijstBij<T, T>(gedeeld, lijst, (regels) => {
          const i = regels.findIndex((r) => r.id === id);
          if (i < 0) throw new ApiFout(404, `${opties.naam[0].toUpperCase()}${opties.naam.slice(1)} niet gevonden`);
          opties.controleer?.(invoer, regels, id);
          const nieuw = { ...regels[i], ...invoer, id, gewijzigd: new Date().toISOString() } as T;
          const kopie = [...regels];
          kopie[i] = nieuw;
          return { regels: kopie, uitkomst: nieuw };
        });
        return regel;
      }),
      route("DELETE", `${pad}/:id`, async (c) => {
        const id = idUit(c);
        const reden = await opties.magNietWeg?.(id);
        if (reden) throw new ApiFout(409, reden);
        const weg = await werkLijstBij<T, boolean>(gedeeld, lijst, (regels) => {
          const over = regels.filter((r) => r.id !== id);
          return { regels: over, uitkomst: over.length !== regels.length };
        });
        if (!weg) throw new ApiFout(404, `${opties.naam[0].toUpperCase()}${opties.naam.slice(1)} niet gevonden`);
        return { ok: true };
      }),
    ];
  }

  /** De eigen momenten van de gebruiker, of een lege lijst als het bestand er niet is. */
  const eigenMomenten = () => leesEigenMomenten(gedeeld);

  /** Een moment zoeken op sleutel: een jaarlijkse dag (de sleutel is zijn datum) of een eigen moment. */
  async function vindMoment(sleutel: string): Promise<Moment | undefined> {
    const eigen = await eigenMomenten();
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(sleutel) ? sleutel : null;
    return (datum ? alleMomenten(datum, datum, eigen) : eigen).find((m) => m.sleutel === sleutel);
  }

  /**
   * De voorbeeldposts van de startvulling, elk met een eigen titel. Een post die al bestaat, wordt
   * overgeslagen. De ingeplande post krijgt een echte controle (dezelfde als in de browser, zonder de
   * overloopmeting); de concepten staan er zonder: de editor controleert ze bij het openen.
   */
  async function vulPosts(): Promise<number> {
    const [bestaand, feiten, instellingen, merk] = await Promise.all([
      lijstPosts(gedeeld),
      leesLijst<Feit>(gedeeld, "feiten"),
      laadInstellingen(),
      laadMerk(o.dataDir),
    ]);
    let nieuw = 0;
    for (const s of STARTPOSTS) {
      const sj = sjabloonVan(s.sjabloon);
      if (!sj || bestaand.some((p) => p.titel === s.titel)) continue;
      const id = nieuwPostId();
      const nu = new Date();
      const feitId = s.feit ? feiten.find((f) => f.tekst === s.feit)?.id : undefined;
      const post: Post = {
        id,
        versie: 1,
        titel: s.titel,
        soort: "beeld",
        sjabloon: s.sjabloon,
        formaten: [sj.formaten[0]],
        inhoud: s.inhoud,
        dias: [],
        posttekst: { linkedin: s.posttekst },
        altTekst: s.altTekst,
        link: "",
        feiten: feitId ? [feitId] : [],
        campagne: null,
        merkVersie: merk.versie,
        status: "concept",
        gepland: null,
        gepubliceerd: null,
        controle: null,
        resultaat: null,
        geschiedenis: [{ op: nu.toISOString(), wie: "", wat: "aangemaakt" }],
        aangemaakt: nu.toISOString(),
        gewijzigd: nu.toISOString(),
      };
      if (s.inDagen !== undefined) {
        const c = controleer({
          post,
          sjabloon: sj,
          instellingen,
          feiten,
          vandaag: vandaagAmsterdam(nu),
          merkVersie: merk.versie,
          merk,
        });
        post.controle = { fouten: c.fouten, letOp: c.letOp, op: nu.toISOString() };
        if (c.fouten === 0) {
          post.status = "gepland";
          post.gepland = new Date(nu.getTime() + s.inDagen * 24 * 3600 * 1000).toISOString();
          post.geschiedenis = metGeschiedenis(post, {
            op: nu.toISOString(),
            wie: "",
            wat: `gepland op ${post.gepland}`,
          });
        }
      }
      try {
        await maakPost(gedeeld, post);
      } catch (e) {
        naarApiFout(e);
      }
      nieuw++;
    }
    return nieuw;
  }

  /**
   * Eén AI-aanroep van de studio (schrijfhulp of ideeën): schakelaar, maandplafond, provider en boeking.
   * Eén aanroep tegelijk voor beide, anders lezen snelle klikken hetzelfde bedrag en komen ze samen over
   * het plafond. Het plafond geldt alleen voor de live-provider; de voorbeeldgever kost niets. Elke
   * aanroep wordt geboekt, ook een mislukte (met de tokens die al verbruikt zijn). Een ApiFout uit
   * `roep` gaat ongeboekt door.
   */
  async function aiHulp<T>(naam: string, taak: string, roep: () => Promise<AiResultaat<T>>): Promise<AiResultaat<T>> {
    return serialiseer("marketing-ai", async () => {
      const marketing = await laadInstellingen();
      if (!marketing.schrijfhulp.aan)
        throw new ApiFout(409, `${naam} staat uit; zet de AI-hulp aan onder Instellingen`);
      const plafond = marketing.schrijfhulp.plafondUsdPerMaand;
      if (provider.naam === "anthropic" && (await maandtotaalUsd(o.dataDir, new Date())) >= plafond) {
        throw new ApiFout(429, `Het maandplafond van de AI-hulp ($ ${plafond}) is bereikt`);
      }
      const modelNaam = aiStand(provider).model ?? "voorbeeld";
      let resultaat: AiResultaat<T>;
      try {
        resultaat = await roep();
      } catch (fout) {
        if (fout instanceof ApiFout) throw fout;
        const usd = fout instanceof AiFout && fout.usage ? kostenUsd(modelNaam, fout.usage) : 0;
        await boek(o.dataDir, { tijdstip: new Date().toISOString(), model: modelNaam, taak, usd, ok: false });
        throw new ApiFout(
          502,
          `${naam} gaf geen bruikbaar antwoord: ${fout instanceof Error ? fout.message : String(fout)}`,
        );
      }
      await boek(o.dataDir, {
        tijdstip: new Date().toISOString(),
        model: resultaat.model,
        taak,
        usd: kostenUsd(resultaat.model, resultaat.usage),
        ok: true,
      });
      return resultaat;
    });
  }

  async function schrijfhulp(verzoek: z.infer<typeof SchrijfhulpVerzoekSchema>) {
    const vandaag = vandaagAmsterdam(new Date());
    const alleFeiten = await leesLijst<Feit>(gedeeld, "feiten");
    const feiten = verzoek.feiten.map((id) => alleFeiten.find((f) => f.id === id));
    if (feiten.some((f) => !f || feitOnbruikbaar(f, vandaag))) {
      throw new ApiFout(
        400,
        "Een gekoppeld feit bestaat niet of is niet actief; de schrijfhulp werkt alleen met actieve feiten",
      );
    }
    const bruikbaar = feiten as Feit[];

    const merk = await laadMerk(o.dataDir);
    const opdracht: MarketingOpdracht = {
      taak: verzoek.taak,
      sjabloon: verzoek.sjabloon,
      velden: verzoek.velden,
      kanaal: verzoek.kanaal,
      toelichting: verzoek.toelichting,
      huidig: verzoek.huidig,
      feiten: bruikbaar.map((f) => ({ id: f.id, tekst: f.tekst, bron: f.bron.verwijzing })),
      merk: { merknaam: merk.naam },
    };
    const resultaat = await aiHulp("De schrijfhulp", `schrijfhulp:${verzoek.taak}`, () =>
      provider.marketingTekst(opdracht),
    );

    const veldIds = new Set(verzoek.velden.map((v) => v.id));
    const varianten = resultaat.voorstel.varianten.slice(0, 3).map((v) => {
      const velden = Object.fromEntries(v.velden.filter((x) => veldIds.has(x.id)).map((x) => [x.id, x.tekst]));
      const posttekst = verzoek.taak === "posttekst" ? v.posttekst : "";
      const altTekst = verzoek.taak === "alt-tekst" ? v.altTekst : "";
      const tekst = [...Object.values(velden), posttekst, altTekst].join("\n");
      return {
        velden,
        posttekst,
        altTekst,
        gebruikteFeiten: v.gebruikteFeiten.filter((id) => verzoek.feiten.includes(id)),
        ongedekt: [...new Set(ongedekteGetallen(tekst, bruikbaar).map((g) => g.tekst))],
      };
    });
    return { varianten, model: resultaat.model, voorbeeld: provider.naam === "voorbeeld" };
  }

  const gebruiktIn = async (veld: "campagne" | "feiten", id: string) =>
    (await lijstPosts(gedeeld)).filter((p) => (veld === "campagne" ? p.campagne === id : p.feiten.includes(id))).length;

  return [
    // -----------------------------------------------------------------------------------------
    // Posts
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/posts", async (c) => {
      const status = c.url.searchParams.get("status");
      const campagne = c.url.searchParams.get("campagne");
      const posts = (await lijstPosts(gedeeld))
        .filter((p) => !status || p.status === status)
        .filter((p) => !campagne || p.campagne === campagne);
      return { posts: posts.map(samenvatting) };
    }),

    route("POST", "/api/posts", async (c) => {
      const invoer = valideer(PostInvoerSchema, await c.leesJson());
      await controleerCampagne(invoer);
      const nu = new Date().toISOString();
      const { controle, ...rest } = invoer;
      const id = nieuwPostId();
      const post: Post = {
        ...metEigenUtm(rest, id),
        id,
        versie: 1,
        status: "concept",
        gepland: null,
        gepubliceerd: null,
        controle: controle ?? null,
        geschiedenis: [{ op: nu, wie: "", wat: "aangemaakt" }],
        aangemaakt: nu,
        gewijzigd: nu,
      };
      try {
        await maakPost(gedeeld, post);
      } catch (e) {
        naarApiFout(e);
      }
      return antwoord({ status: 201, body: post });
    }),

    route("GET", "/api/posts/:id", async (c) => {
      const post = await leesPost(gedeeld, postId(c));
      if (!post) throw new ApiFout(404, "Post niet gevonden");
      return post;
    }),

    route("PUT", "/api/posts/:id", async (c) => {
      const id = postId(c);
      const body = await c.leesJson<Record<string, unknown>>();
      const versie = body.versie;
      if (typeof versie !== "number" || !Number.isInteger(versie)) throw new ApiFout(400, "versie: ontbreekt");
      const { versie: _v, ...rest } = body;
      const invoer = valideer(PostInvoerSchema, rest);
      await controleerCampagne(invoer);
      try {
        return await werkPostBij(gedeeld, id, versie, (p) => {
          const nu = new Date().toISOString();
          const { controle, ...ruw } = invoer;
          const velden = metEigenUtm(ruw, id);
          // De controle hoort bij precies deze inhoud. Komt er gewijzigde inhoud zonder nieuwe
          // controle, dan is de oude niets meer waard.
          const nieuweControle = controle !== undefined ? controle : inhoudVerschilt(p, velden) ? null : p.controle;
          const bijgewerkt: Post = { ...p, ...velden, controle: nieuweControle, gewijzigd: nu };
          // Een geplande post die niet meer door de controle komt, gaat terug naar concept: hij zou
          // anders met een fout erin op de kalender blijven staan.
          if (p.status === "gepland" && (!nieuweControle || nieuweControle.fouten > 0)) {
            bijgewerkt.status = "concept";
            bijgewerkt.geschiedenis = metGeschiedenis(p, {
              op: nu,
              wie: "",
              wat: "terug naar concept: de controle is niet meer zonder fouten",
            });
          }
          return bijgewerkt;
        });
      } catch (e) {
        naarApiFout(e);
      }
    }),

    route("DELETE", "/api/posts/:id", async (c) => {
      const id = postId(c);
      if (!(await wisPost(gedeeld, id))) throw new ApiFout(404, "Post niet gevonden");
      return { ok: true };
    }),

    route("POST", "/api/posts/:id/dupliceer", async (c) => {
      const bron = await leesPost(gedeeld, postId(c));
      if (!bron) throw new ApiFout(404, "Post niet gevonden");
      const nu = new Date().toISOString();
      const titel = `Kopie van ${bron.titel}`.slice(0, 120);
      const id = nieuwPostId();
      const kopie: Post = {
        ...metEigenUtm(structuredClone(bron), id),
        id,
        versie: 1,
        titel,
        status: "concept",
        gepland: null,
        gepubliceerd: null,
        resultaat: null,
        geschiedenis: [{ op: nu, wie: "", wat: `gedupliceerd van ${bron.id}` }],
        aangemaakt: nu,
        gewijzigd: nu,
      };
      try {
        await maakPost(gedeeld, kopie);
      } catch (e) {
        naarApiFout(e);
      }
      return antwoord({ status: 201, body: kopie });
    }),

    /**
     * Statusovergangen. Naar "gepland" of "gepubliceerd" kan alleen met een controle zonder fouten
     * (de controle is de poort, er is geen aparte goedkeuring). Terug naar concept
     * en archiveren kan altijd; een gearchiveerde post komt alleen via concept terug.
     */
    route("POST", "/api/posts/:id/status", async (c) => {
      const id = postId(c);
      const overgang = valideer(StatusOvergangSchema, await c.leesJson());
      // De controle in de post rekende de browser uit bij het bewaren; een feit kan daarna nog
      // zijn ingetrokken, verlopen of gewist. Dat rekent de server hier zelf na.
      const vandaag = vandaagAmsterdam(new Date());
      const feitenNu = new Map((await leesLijst<Feit>(gedeeld, "feiten")).map((f) => [f.id, f]));
      try {
        return await werkPostBij(gedeeld, id, null, (p) => {
          const nu = new Date();
          const naar = overgang.naar;
          if (naar === p.status && naar !== "gepland") throw new ApiFout(409, `Deze post staat al op ${naar}`);
          if (p.status === "gearchiveerd" && naar !== "concept")
            throw new ApiFout(409, "Een gearchiveerde post gaat eerst terug naar concept");
          if (p.status === "gepubliceerd" && naar === "gepland")
            throw new ApiFout(409, "Een gepubliceerde post kan niet opnieuw worden gepland; dupliceer hem");
          if ((naar === "gepland" || naar === "gepubliceerd") && (!p.controle || p.controle.fouten > 0)) {
            throw new ApiFout(
              409,
              p.controle
                ? `De merkcontrole vond nog ${p.controle.fouten} fout${p.controle.fouten === 1 ? "" : "en"}; los die eerst op`
                : "Deze post heeft nog geen merkcontrole bij de huidige inhoud; open en bewaar hem eerst",
            );
          }
          if (naar === "gepland" || naar === "gepubliceerd") {
            const onbruikbaar = p.feiten.filter((id) => {
              const f = feitenNu.get(id);
              return !f || feitOnbruikbaar(f, vandaag);
            });
            if (onbruikbaar.length) {
              throw new ApiFout(
                409,
                `Deze post leunt op ${onbruikbaar.length === 1 ? "een feit dat" : `${onbruikbaar.length} feiten die`} verlopen, ingetrokken of gewist ${onbruikbaar.length === 1 ? "is" : "zijn"}; vervang ${onbruikbaar.length === 1 ? "het" : "ze"} eerst`,
              );
            }
          }
          const wat = (tekst: string) => ({ op: nu.toISOString(), wie: "", wat: tekst });
          if (naar === "gepland") {
            if (!overgang.gepland) throw new ApiFout(400, "gepland: kies een datum en tijd");
            if (new Date(overgang.gepland).getTime() <= nu.getTime())
              throw new ApiFout(400, "gepland: kies een moment in de toekomst");
            const opnieuw = p.status === "gepland";
            return {
              ...p,
              status: "gepland",
              gepland: overgang.gepland,
              gewijzigd: nu.toISOString(),
              geschiedenis: metGeschiedenis(p, wat(`${opnieuw ? "verzet naar" : "gepland op"} ${overgang.gepland}`)),
            };
          }
          if (naar === "gepubliceerd") {
            return {
              ...p,
              status: "gepubliceerd",
              gepubliceerd: { op: nu.toISOString(), url: overgang.url ?? "" },
              gewijzigd: nu.toISOString(),
              geschiedenis: metGeschiedenis(p, wat("gepubliceerd")),
            };
          }
          if (naar === "concept") {
            // Uit het archief terughalen laat publicatie en resultaat staan; alleen een echte terugtrekking wist ze.
            const behoud = p.status === "gearchiveerd";
            return {
              ...p,
              status: "concept",
              gepubliceerd: behoud ? p.gepubliceerd : null,
              resultaat: behoud ? p.resultaat : null,
              gewijzigd: nu.toISOString(),
              geschiedenis: metGeschiedenis(p, wat("terug naar concept")),
            };
          }
          return {
            ...p,
            status: "gearchiveerd",
            gewijzigd: nu.toISOString(),
            geschiedenis: metGeschiedenis(p, wat("gearchiveerd")),
          };
        });
      } catch (e) {
        naarApiFout(e);
      }
    }),

    /**
     * Handmatige resultaten: alleen bij een gepubliceerde post. Alle velden `null`
     * wist het resultaat weer (bijvoorbeeld na een verkeerde invoer).
     */
    route("PUT", "/api/posts/:id/resultaat", async (c) => {
      const id = postId(c);
      const r = valideer(ResultaatInvoerSchema, await c.leesJson());
      try {
        return await werkPostBij(gedeeld, id, null, (p) => {
          if (p.status !== "gepubliceerd") throw new ApiFout(409, "Alleen een gepubliceerde post heeft resultaten");
          const nu = new Date().toISOString();
          const leeg = r.vertoningen === null && r.reacties === null && r.klikken === null;
          return {
            ...p,
            resultaat: leeg ? null : { ...r, op: nu },
            gewijzigd: nu,
            geschiedenis: metGeschiedenis(p, { op: nu, wie: "", wat: "resultaat bijgewerkt" }),
          };
        });
      } catch (e) {
        naarApiFout(e);
      }
    }),

    // -----------------------------------------------------------------------------------------
    // Campagnes, teksten en feiten
    // -----------------------------------------------------------------------------------------
    ...lijstRoutes<Campagne>("campagnes", "/api/campagnes", CampagneInvoerSchema, {
      naam: "campagne",
      controleer: (invoer, regels, id) => {
        if (regels.some((r) => r.id !== id && r.utmCampagne === invoer.utmCampagne)) {
          throw new ApiFout(
            409,
            `De UTM-naam "${String(invoer.utmCampagne)}" is al in gebruik bij een andere campagne`,
          );
        }
      },
      magNietWeg: async (id) => {
        const n = await gebruiktIn("campagne", id);
        return n ? `Deze campagne hoort bij ${n} post${n === 1 ? "" : "s"}; archiveer hem in plaats van wissen` : null;
      },
    }),
    ...lijstRoutes<Tekst>("teksten", "/api/teksten", TekstInvoerSchema, { naam: "tekst" }),
    ...lijstRoutes<Feit>("feiten", "/api/feiten", FeitInvoerSchema, {
      naam: "feit",
      magNietWeg: async (id) => {
        const n = await gebruiktIn("feiten", id);
        return n
          ? `Dit feit staat in ${n} post${n === 1 ? "" : "s"}; zet het op "ingetrokken" in plaats van wissen`
          : null;
      },
    }),

    // -----------------------------------------------------------------------------------------
    // Ideeën: lichter dan een post, geen versiecontrole, een PUT vervangt het hele idee.
    // -----------------------------------------------------------------------------------------
    ...lijstRoutes<Idee>("ideeen", "/api/ideeen", IdeeInvoerSchema, {
      naam: "idee",
      controleer: (invoer) => {
        if (invoer.sjabloon && !sjabloonVan(String(invoer.sjabloon))) throw new ApiFout(400, "Onbekend sjabloon");
      },
    }),

    // Startvulling: voorbeeldfeiten, -teksten en -posts over Postwright zelf. Alleen aanvullen: wat er
    // met precies dezelfde tekst (of dezelfde titel) al staat, blijft zoals het is, ook een feit dat de
    // gebruiker heeft ingetrokken. Twee keer klikken voegt dus niets dubbel toe.
    route("POST", "/api/startvulling", async () => {
      const nu = new Date().toISOString();
      const vul = <B extends { tekst: string }, T extends { id: string; tekst: string }>(
        lijst: "feiten" | "teksten",
        bron: readonly B[],
        maak: (b: B) => T,
      ) =>
        werkLijstBij<T, number>(gedeeld, lijst, (regels) => {
          const bestaand = new Set(regels.map((r) => r.tekst));
          const nieuw = bron.filter((b) => !bestaand.has(b.tekst)).map(maak);
          if (regels.length + nieuw.length > 500)
            throw new ApiFout(409, `Er passen niet meer dan 500 ${lijst} in de studio; ruim eerst op`);
          return { regels: [...regels, ...nieuw], uitkomst: nieuw.length };
        });
      const feiten = await vul<Startfeit, Feit>("feiten", STARTFEITEN, (f) => ({
        ...f,
        geldigVan: null,
        geldigTot: null,
        status: "concept",
        id: nieuwLijstId("feiten"),
        aangemaakt: nu,
        gewijzigd: nu,
      }));
      const teksten = await vul<TekstInvoer, Tekst>("teksten", STARTTEKSTEN, (t) => ({
        ...t,
        id: nieuwLijstId("teksten"),
        aangemaakt: nu,
        gewijzigd: nu,
      }));
      const posts = await vulPosts();
      return { feiten, teksten, posts };
    }),

    // -----------------------------------------------------------------------------------------
    // Instellingen en overzicht
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/instellingen", async () => laadInstellingen()),
    route("PUT", "/api/instellingen", async (c) => {
      const i = valideer(MarketingInstellingenSchema, await c.leesJson());
      await bewaarMarketingInstellingen(gedeeld, i);
      return i;
    }),

    /** Tellingen voor het overzicht van de studio voor de overzichtspagina. */
    route("GET", "/api/overzicht", async () => {
      const nu = new Date();
      const vandaag = vandaagAmsterdam(nu);
      const week = nu.getTime() + 7 * 24 * 3600 * 1000;
      const maandTerug = nu.getTime() - 30 * 24 * 3600 * 1000;
      const [posts, feiten, media, ideeen, eigen] = await Promise.all([
        lijstPosts(gedeeld),
        leesLijst<Feit>(gedeeld, "feiten"),
        lijstMedia(gedeeld),
        leesLijst<Idee>(gedeeld, "ideeen"),
        eigenMomenten(),
      ]);
      const onbruikbaar = new Set(feiten.filter((f) => feitOnbruikbaar(f, vandaag)).map((f) => f.id));
      const bekend = new Set(feiten.map((f) => f.id));
      const tijd = (p: Post) => (p.gepland ? new Date(p.gepland).getTime() : Number.NaN);
      const gepland = posts.filter((p) => p.status === "gepland");
      const lopend = posts.filter((p) => p.status === "concept" || p.status === "gepland");
      const postIds = new Set(posts.map((p) => p.id));
      const geplandeDagen = gepland
        .filter((p) => p.gepland)
        .map((p) => vandaagAmsterdam(new Date(p.gepland as string)));
      return {
        geplandDezeWeek: gepland.filter((p) => tijd(p) >= nu.getTime() && tijd(p) <= week).length,
        overDatum: gepland.filter((p) => tijd(p) < nu.getTime()).length,
        concepten: posts.filter((p) => p.status === "concept").length,
        gepubliceerd30: posts.filter(
          (p) => p.status === "gepubliceerd" && p.gepubliceerd && new Date(p.gepubliceerd.op).getTime() >= maandTerug,
        ).length,
        // Een feit dat is gewist of niet (meer) bruikbaar is, telt als probleem voor elke post die er nog op leunt.
        metOnbruikbaarFeit: lopend.filter((p) => p.feiten.some((id) => onbruikbaar.has(id) || !bekend.has(id))).length,
        volgende: gepland
          .filter((p) => tijd(p) >= nu.getTime())
          .sort((a, b) => tijd(a) - tijd(b))
          .slice(0, 3)
          .map(samenvatting),
        media: { aantal: media.length, bytes: media.reduce((s, m) => s + m.bytes, 0) },
        // Ritme, momenten en resultaten.
        // Een gearchiveerde post houdt zijn publicatie: hij is wél verschenen.
        laatstGepubliceerd:
          posts
            .filter((p) => (p.status === "gepubliceerd" || p.status === "gearchiveerd") && p.gepubliceerd)
            .map((p) => p.gepubliceerd!.op)
            .sort()
            .at(-1) ?? null,
        legeWeken: komendeWeken(vandaag, 4).filter((w) => !geplandeDagen.some((d) => d >= w.maandag && d <= w.zondag)),
        // Ook een open idee met een datum in het verleden telt: het is nog niet opgepakt, en de
        // planner toont het bovenaan als "Open ideeën van eerder".
        openIdeeen: ideeen.filter((i) => !(i.post && postIds.has(i.post))).length,
        momenten: alleMomenten(vandaag, plusDagen(vandaag, 60), eigen).slice(0, 5),
        resultaten: resultatenPerSjabloon(posts, plusDagen(vandaag, -182)),
      };
    }),

    // -----------------------------------------------------------------------------------------
    // AI: de stand (live of voorbeeld), de schrijfhulp en ideeën voorstellen. De sleutel komt in geen
    // enkel antwoord. De feiten komen bij de schrijfhulp alleen als id's binnen: de server laadt ze
    // zelf, zodat er via de browser geen onbewezen claim de opdracht in kan. Elk voorstel gaat terug
    // met de getallen die in geen van die feiten staan; de editor laat zo'n voorstel niet overnemen.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/ai", () => aiStand(provider)),

    route("POST", "/api/schrijfhulp", async (c) => schrijfhulp(valideer(SchrijfhulpVerzoekSchema, await c.leesJson()))),

    // Ideeën voorstellen. De browser stuurt alleen periode, aantal, kanaal, campagne-id en wens; wat het
    // model ziet, stelt de server zelf samen. Het antwoord gaat nagerekend terug en wordt niet bewaard:
    // pas "Zet in de planner" maakt er ideeën van.
    route("POST", "/api/ideeen/voorstellen", async (c) => {
      const v = valideer(IdeeenVerzoekSchema, await c.leesJson());
      const vandaag = vandaagAmsterdam(new Date());
      if (v.tot < vandaag) throw new ApiFout(400, "Deze periode ligt helemaal in het verleden");
      const van = v.van < vandaag ? vandaag : v.van;
      // Hooguit 92 dagen, van en tot meegeteld: tot ligt uiterlijk 91 dagen na van.
      if (plusDagen(van, 91) < v.tot) throw new ApiFout(400, "Kies een periode van hooguit drie maanden");
      const [feiten, posts, ideeen, campagnes, eigen] = await Promise.all([
        leesLijst<Feit>(gedeeld, "feiten"),
        lijstPosts(gedeeld),
        leesLijst<Idee>(gedeeld, "ideeen"),
        leesLijst<Campagne>(gedeeld, "campagnes"),
        eigenMomenten(),
      ]);
      const campagne = v.campagne ? (campagnes.find((k) => k.id === v.campagne) ?? null) : null;
      if (v.campagne && !campagne) throw new ApiFout(400, "De gekozen campagne bestaat niet (meer)");
      const dagVan = (p: Post) =>
        p.status === "gepland" && p.gepland
          ? vandaagAmsterdam(new Date(p.gepland))
          : p.status === "gepubliceerd" && p.gepubliceerd
            ? vandaagAmsterdam(new Date(p.gepubliceerd.op))
            : null;
      const inPeriode = (d: string | null) => d !== null && d >= van && d <= v.tot;
      const opdracht: IdeeenOpdracht = {
        van,
        tot: v.tot,
        aantal: v.aantal,
        kanaal: v.kanaal,
        toelichting: v.toelichting,
        sjablonen: SJABLONEN.map((s) => ({ id: s.id, naam: s.naam, doel: s.doel })),
        feiten: feiten
          .filter((f) => !feitOnbruikbaar(f, vandaag))
          .slice(0, 60)
          .map((f) => ({ id: f.id, tekst: f.tekst, soort: f.soort })),
        // Ook momenten net na de periode: een post vlak ervoor kan erop vooruitlopen.
        momenten: alleMomenten(van, plusDagen(v.tot, 21), eigen).map(({ sleutel, datum, titel, zin }) => ({
          sleutel,
          datum,
          titel,
          zin,
        })),
        bestaand: [
          ...posts
            .filter((p) => inPeriode(dagVan(p)))
            .map((p) => ({ datum: dagVan(p) as string, titel: p.titel, soort: "post" as const })),
          ...ideeen
            .filter((i) => inPeriode(i.datum))
            .map((i) => ({ datum: i.datum, titel: i.titel, soort: "idee" as const })),
        ],
        campagne: campagne ? { naam: campagne.naam, doel: campagne.doel } : null,
        resultaten: resultatenPerSjabloon(posts, plusDagen(vandaag, -182)),
        merk: { merknaam: (await laadMerk(o.dataDir)).naam },
      };
      const r = await aiHulp("De ideeënhulp", `ideeen:${van}..${v.tot}`, () => provider.marketingIdeeen(opdracht));
      return {
        voorstellen: ruimIdeeenOp(r.voorstel, opdracht),
        model: r.model,
        van,
        voorbeeld: provider.naam === "voorbeeld",
      };
    }),

    // -----------------------------------------------------------------------------------------
    // Kalender: de jaarlijkse dagen plus de eigen momenten. Standaard de komende 120 dagen.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/momenten", async (c) => {
      const fout = new ApiFout(400, "van en tot zijn datums (JJJJ-MM-DD), van niet na tot");
      const van = c.url.searchParams.get("van") ?? vandaagAmsterdam(new Date());
      // Eerst `van` toetsen: daar rekent de standaard voor `tot` mee.
      if (!echteDatum(van)) throw fout;
      const tot = c.url.searchParams.get("tot") ?? plusDagen(van, 120);
      if (!echteDatum(tot) || van > tot) throw fout;
      return { momenten: alleMomenten(van, tot, await eigenMomenten()) };
    }),

    // Van een moment een concept-feit maken. Bestaat er al een feit met precies dezelfde tekst, dan
    // komt dat terug: twee keer klikken maakt geen dubbel feit. Is dat feit ingetrokken, dan 409:
    // "Maak post" zou het anders stil aan een nieuwe post koppelen, en een tweede feit met dezelfde
    // tekst maken zou de intrekking omzeilen.
    // De 404-tekst "Onbekend moment" herkent de planner (ideeen-ui.js); niet zomaar wijzigen.
    route("POST", "/api/momenten/:sleutel/feit", async (c) => {
      const m = await vindMoment(c.params.sleutel);
      if (!m) throw new ApiFout(404, "Onbekend moment");
      const tekst = `${m.titel}: ${m.zin}`;
      const nu = new Date().toISOString();
      const { feit, nieuw } = await werkLijstBij<Feit, { feit: Feit; nieuw: boolean }>(gedeeld, "feiten", (regels) => {
        const al = regels.find((f) => f.tekst === tekst);
        if (al?.status === "ingetrokken") {
          throw new ApiFout(
            409,
            "Het feit bij dit moment is ingetrokken; zet het in de Feitenbank terug op concept als u het weer wilt gebruiken",
          );
        }
        if (al) return { regels, uitkomst: { feit: al, nieuw: false } };
        if (regels.length >= 500) throw new ApiFout(409, "Er staan al 500 feiten; ruim eerst op");
        const f: Feit = {
          id: nieuwLijstId("feiten"),
          tekst,
          soort: "extern",
          bron: { soort: "site", verwijzing: `moment ${m.sleutel}` },
          geldigVan: null,
          geldigTot: null,
          status: "concept",
          aangemaakt: nu,
          gewijzigd: nu,
        };
        return { regels: [...regels, f], uitkomst: { feit: f, nieuw: true } };
      });
      return antwoord({ status: nieuw ? 201 : 200, body: feit });
    }),

    // -----------------------------------------------------------------------------------------
    // Media
    // -----------------------------------------------------------------------------------------
    route(
      "POST",
      "/api/media",
      async (c) => {
        const inhoud = await c.lees(MAX_MEDIA_BYTES);
        if (!inhoud.length) throw new ApiFout(400, "Er is geen bestand meegestuurd");
        const soort = mediaSoort(inhoud);
        if (!soort) throw new ApiFout(400, "Alleen PNG, JPEG of WebP; een SVG of ander bestand kan hier niet");
        const maat = mediaAfmetingen(inhoud, soort);
        if (!maat || maat.breedte < 1 || maat.hoogte < 1)
          throw new ApiFout(400, "Dit beeld is onleesbaar of beschadigd");
        if (maat.breedte > 8000 || maat.hoogte > 8000)
          throw new ApiFout(400, "Dit beeld is groter dan 8000 pixels; verklein het eerst");
        const id = await bewaarMedia(gedeeld, inhoud, soort);
        return antwoord({ status: 201, body: { id, bytes: inhoud.length, ...maat } });
      },
      { ruweBody: true },
    ),

    route("GET", "/api/media", async () => {
      const [media, posts] = await Promise.all([lijstMedia(gedeeld), lijstPosts(gedeeld)]);
      const gebruik = mediaGebruik(posts);
      return { media: media.map((m) => ({ ...m, gebruikt: gebruik.get(m.id) ?? 0 })) };
    }),

    route("DELETE", "/api/media/:id", async (c) => {
      const id = c.params.id;
      if (!MEDIA_ID.test(id)) throw new ApiFout(400, "Ongeldig media-id");
      // Bewuste beperking: controle en wissen zijn twee stappen; met één beheerder is een post die precies
      // daartussen het beeld kiest geen reëel scenario. Een slot over posts heen als er meer gebruikers komen.
      const n = mediaGebruik(await lijstPosts(gedeeld)).get(id) ?? 0;
      if (n)
        throw new ApiFout(
          409,
          `Dit beeld staat in ${n} post${n === 1 ? "" : "s"} (gearchiveerde tellen mee); haal het daar eerst weg`,
        );
      if (!(await wisMedia(gedeeld, id))) throw new ApiFout(404, "Beeld niet gevonden");
      return { ok: true };
    }),

    route("GET", "/api/media/:id", async (c) => {
      const id = c.params.id;
      if (!MEDIA_ID.test(id)) throw new ApiFout(400, "Ongeldig media-id");
      const inhoud = await leesMedia(gedeeld, id);
      if (!inhoud) throw new ApiFout(404, "Beeld niet gevonden");
      return antwoord({
        contentType: MEDIA_CONTENT_TYPES[id.slice(id.lastIndexOf(".") + 1) as MediaSoort],
        headers: {
          "content-security-policy": "default-src 'none'; sandbox",
          // Inhoudsgeadresseerd: hetzelfde id is altijd hetzelfde bestand.
          "cache-control": "private, max-age=86400, immutable",
        },
        body: inhoud,
      });
    }),
  ];
}
