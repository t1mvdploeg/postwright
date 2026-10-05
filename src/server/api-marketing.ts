// Marketingstudio — de routes achter `/beheer/marketing` (docs/ontwerpen/2026-09-24-marketingstudio.md).
//
// Alles hier is platformdata en staat op toegang "admin" (de standaard van `route()`): een
// tenantsessie komt er nooit bij, ook een bedrijfsbeheerder niet. Net als `api-huisstijl.ts` raakt
// deze module nooit `c.opslag` — dat zou marketing onder een bedrijf laten landen — maar altijd de
// gedeelde rootmap.
//
// De studio rendert, exporteert (PNG, PDF, ZIP) en maakt de agenda-export zelf in de browser. De
// server bewaart alleen recepten, lijsten, instellingen en geüploade beelden.
import { ApiFout } from "./http.js";
import { antwoord, route, type Ctx, type Route, type ApiOpties } from "./route.js";
import { eersteZodFout } from "./invoer-schema.js";
import { serialiseer, type Opslag } from "../data/bestanden.js";
import {
  MarketingOpslagFout, bewaarMarketingInstellingen, bewaarMedia, geldigLijstId, laadMarketingInstellingen,
  leesLijst, leesMedia, leesPost, lijstMedia, lijstPosts, maakPost, mediaAfmetingen, mediaGebruik, mediaSoort,
  MEDIA_CONTENT_TYPES, MEDIA_ID, nieuwLijstId, nieuwPostId, werkLijstBij, werkPostBij, wisMedia, wisPost,
  type LijstNaam, type MediaSoort,
} from "../data/marketing.js";
import {
  CampagneInvoerSchema, FeitInvoerSchema, IdeeInvoerSchema, MarketingInstellingenSchema, POST_ID, PostInvoerSchema,
  ResultaatInvoerSchema, StatusOvergangSchema, TekstInvoerSchema,
  type Campagne, type Feit, type Geschiedenisregel, type Idee, type Post, type PostInvoer, type PostSamenvatting, type Tekst, type TekstInvoer,
} from "../model/marketing-schema.js";
import { STARTFEITEN, STARTTEKSTEN, type Startfeit } from "../model/marketing-startvulling.js";
import { logAudit, type AuditActie, type AuditUitkomst } from "../model/audit.js";
import { SchrijfhulpVerzoekSchema, type MarketingOpdracht } from "../model/marketing-schrijfhulp.js";
import { IdeeenVerzoekSchema, ruimIdeeenOp, type IdeeenOpdracht } from "../model/marketing-ideeen.js";
import { parameterFeiten } from "../model/marketing-parameters.js";
import { alleMomenten, momentenIn, type Moment } from "../model/marketing-momenten.js";
import { resultatenPerSjabloon } from "../model/marketing-resultaten.js";
import { laadInstellingen } from "../data/instellingen.js";
import { laadParameters } from "../core/parameters.js";
import { rekenJaarVandaag } from "./rekenjaar.js";
import { krijgProvider, analyseOpties, actiefModel } from "../model/kies-provider.js";
import { AnalyseFout, type AnalyseOpties, type AnalyseProvider } from "../model/provider.js";
import { bepaalKosten, leesKosten, logKosten, PLATFORM_BEDRIJF, telMee, type Usage } from "../model/kosten.js";
import { laadWisselkoers } from "../data/wisselkoers.js";
// Dezelfde pure getallenherkenning als de editor in de browser: één regel, geen twee die uit elkaar
// kunnen lopen. Het module heeft geen DOM nodig (tests/marketing-controle.test.ts draait het in Node).
import { ongedekteGetallen } from "../web/marketing/getallen.js";
// Elke studio-link in de posttekst wijst naar zijn eigen post; dezelfde functie als de editor
// gebruikt bij "Link invoegen", zodat een link die daarvóór is geplakt of gedupliceerd is, ook klopt.
import { zetUtmInhoud } from "../web/marketing/posttekst.js";
// Voor de controle dat een idee naar een bestaand sjabloon wijst, en voor de sjablonen die de
// ideeënhulp mag kiezen: dezelfde sjabloonlijst als de editor, in plaats van die hier te herhalen.
import { SJABLONEN, sjabloon as sjabloonVan } from "../web/marketing/sjablonen.js";
// Datumhelpers: één versie voor server en browser (echteDatum laat 2026-13-01 en 2026-02-30 niet door).
import { echteDatum, komendeWeken, plusDagen } from "../web/marketing/kalender.js";
import type { z } from "zod";

const LEGE_USAGE: Usage = { input: 0, output: 0, cacheLezen: 0, cacheSchrijven: 0 };

/** Grootste upload: een schermafbeelding of foto. De map gaat mee in git, dus niet ruimer. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
/** Hoeveel regels `geschiedenis` bijhoudt; de oudste vallen eraf. */
const MAX_GESCHIEDENIS = 100;

const AMSTERDAM_DATUM = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });
/** De kalenderdatum (JJJJ-MM-DD) in Nederland; zelfde aanpak als `kalenderdatumAmsterdam` in api.ts
 *  (niet geïmporteerd: api.ts importeert deze module, dat zou een kringetje worden). */
function vandaagAmsterdam(nu: Date): string { return AMSTERDAM_DATUM.format(nu); }

/** Of een feit niet (meer) mag worden gebruikt: ingetrokken, nog concept, of voorbij `geldigTot`. */
export function feitOnbruikbaar(f: Pick<Feit, "status" | "geldigTot">, vandaag: string): boolean {
  return f.status !== "actief" || (f.geldigTot !== null && f.geldigTot < vandaag);
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
function inhoudVerschilt(a: Pick<Post, "sjabloon" | "inhoud" | "dias" | "formaten" | "posttekst" | "altTekst" | "link" | "feiten">, b: typeof a): boolean {
  const sleutel = (x: typeof a) => JSON.stringify([x.sjabloon, x.inhoud, x.dias, x.formaten, x.posttekst, x.altTekst, x.link, x.feiten]);
  return sleutel(a) !== sleutel(b);
}

/** Elke studio-link in de postteksten wijst naar deze post (utm_content = post-id). */
function metEigenUtm<T extends { posttekst: PostInvoer["posttekst"] }>(p: T, id: string): T {
  return { ...p, posttekst: Object.fromEntries(Object.entries(p.posttekst).map(([k, t]) => [k, zetUtmInhoud(t, id)])) as T["posttekst"] };
}

function naarApiFout(e: unknown): never {
  if (e instanceof MarketingOpslagFout) throw new ApiFout(e.status, e.message);
  throw e;
}

export function maakMarketingRoutes(o: ApiOpties): Route[] {
  const gedeeld: Opslag = { dir: o.dataDir };
  const wie = (c: Ctx) => c.sessie?.email ?? "";

  async function audit(c: Ctx, actie: AuditActie, doelwit: string, uitkomst: AuditUitkomst = "ok"): Promise<void> {
    await logAudit({ tijdstip: new Date().toISOString(), bedrijf: null, wie: wie(c), actie, doelwit, uitkomst }, gedeeld);
  }

  /** De actualiteitenkalender: de vaste momenten plus het minimumloon uit de parameters van het ingestelde jaar. */
  async function momentenNu(): Promise<Moment[]> {
    const instellingen = await laadInstellingen(gedeeld);
    return alleMomenten(laadParameters(rekenJaarVandaag(o.dataDir, instellingen.parameterJaar), o.dataDir));
  }

  function postId(c: Ctx): string {
    const id = c.params.id;
    if (!POST_ID.test(id)) throw new ApiFout(400, "Ongeldig post-id");
    return id;
  }

  /** Een campagne die bij een post staat, moet bestaan; anders wijst de post naar niets. */
  async function controleerCampagne(invoer: PostInvoer): Promise<void> {
    if (!invoer.campagne) return;
    const campagnes = await leesLijst<Campagne>(gedeeld, "campagnes");
    if (!campagnes.some((k) => k.id === invoer.campagne)) throw new ApiFout(400, "De gekozen campagne bestaat niet (meer)");
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
      auditActie?: AuditActie;
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
          const nieuw = { ...invoer, id: nieuwLijstId(lijst), aangemaakt: nu, gewijzigd: nu, ...(lijst === "feiten" ? { door: wie(c) } : {}) } as unknown as T;
          return { regels: [...regels, nieuw], uitkomst: nieuw };
        });
        if (opties.auditActie) await audit(c, opties.auditActie, regel.id);
        return antwoord({ status: 201, body: regel });
      }),
      route("PUT", `${pad}/:id`, async (c) => {
        const id = idUit(c);
        const invoer = valideer(schema, await c.leesJson()) as Record<string, unknown>;
        const regel = await werkLijstBij<T, T>(gedeeld, lijst, (regels) => {
          const i = regels.findIndex((r) => r.id === id);
          if (i < 0) throw new ApiFout(404, `${opties.naam[0].toUpperCase()}${opties.naam.slice(1)} niet gevonden`);
          opties.controleer?.(invoer, regels, id);
          const nieuw = { ...regels[i], ...invoer, id, gewijzigd: new Date().toISOString(), ...(lijst === "feiten" ? { door: wie(c) } : {}) } as T;
          const kopie = [...regels];
          kopie[i] = nieuw;
          return { regels: kopie, uitkomst: nieuw };
        });
        if (opties.auditActie) await audit(c, opties.auditActie, id);
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
        if (opties.auditActie) await audit(c, opties.auditActie, id);
        return { ok: true };
      }),
    ];
  }

  /**
   * Eén AI-aanroep van de studio (schrijfhulp of ideeën): schakelaar, maandplafond, provider en
   * kosten als platformtaak "marketing". Eén aanroep tegelijk voor beide, anders lezen snelle klikken
   * hetzelfde bedrag en komen ze samen over het plafond (reviewbevinding 6 van golf M4). Een ApiFout
   * uit `roep` (bijvoorbeeld 501: de provider kent de taak niet) gaat ongeboekt door.
   */
  async function aiHulp<R extends { usage: Usage; model: string; duurMs: number; usdWerkelijk?: number }>(
    naam: string, onderwerp: string, roep: (provider: AnalyseProvider, opties: AnalyseOpties) => Promise<R>,
  ): Promise<R> {
    return serialiseer("marketing-ai", async () => {
      const marketing = await laadMarketingInstellingen(gedeeld);
      if (!marketing.schrijfhulp.aan) throw new ApiFout(409, `${naam} staat uit; zet de AI-hulp aan onder Instellingen van de Marketingstudio`);
      // De maand in UTC, net als de rest van het kostenstelsel (`somDezeMaand` in api-werknemers.ts,
      // het scherm Kosten): het plafond telt dezelfde regels als die de beheerder daar ziet.
      const maand = new Date().toISOString().slice(0, 7);
      const besteed = (await leesKosten(gedeeld))
        .filter((r) => r.soort === "marketing" && r.tijdstip.slice(0, 7) === maand && telMee(r))
        .reduce((som, r) => som + r.eur, 0);
      if (besteed >= marketing.schrijfhulp.plafondEurPerMaand) {
        throw new ApiFout(429, `Het maandplafond van de AI-hulp (€ ${marketing.schrijfhulp.plafondEurPerMaand}) is bereikt`);
      }
      const instellingen = await laadInstellingen(gedeeld);
      let provider;
      try { provider = await krijgProvider(o.dataDir, gedeeld, o.provider); } catch (fout) {
        throw new ApiFout(503, `${naam} is niet beschikbaar: ${fout instanceof Error ? fout.message : String(fout)}`);
      }
      const model = actiefModel(instellingen);
      const begin = Date.now();
      const boek = async (usage: Usage, uitkomst: "ok" | "geweigerd" | "fout", modelNaam: string, duurMs: number, usdWerkelijk?: number, fout?: string) => {
        const kosten = bepaalKosten(usage, modelNaam, instellingen, await laadWisselkoers(gedeeld), usdWerkelijk);
        await logKosten({
          tijdstip: new Date().toISOString(), bedrijf: PLATFORM_BEDRIJF, soort: "marketing",
          onderwerp, analyseId: null, opdrachtgever: "", bestand: null,
          model: modelNaam, usage, usd: kosten.usd, eur: kosten.eur, koers: kosten.koers, koersDatum: kosten.koersDatum,
          duurMs, uitkomst, ...(fout ? { fout } : {}), opmerking: kosten.opmerking,
        }, gedeeld);
      };
      let resultaat: R;
      try {
        resultaat = await roep(provider, analyseOpties(instellingen));
      } catch (fout) {
        if (fout instanceof ApiFout) throw fout;
        const melding = fout instanceof Error ? fout.message : String(fout);
        await boek(fout instanceof AnalyseFout && fout.usage ? fout.usage : LEGE_USAGE, fout instanceof AnalyseFout ? fout.soort : "fout", model, Date.now() - begin, fout instanceof AnalyseFout ? fout.usdWerkelijk : undefined, melding);
        throw new ApiFout(502, `${naam} gaf geen bruikbaar antwoord: ${melding}`);
      }
      await boek(resultaat.usage, "ok", resultaat.model, resultaat.duurMs, resultaat.usdWerkelijk);
      return resultaat;
    });
  }

  async function schrijfhulp(verzoek: z.infer<typeof SchrijfhulpVerzoekSchema>) {
    const vandaag = vandaagAmsterdam(new Date());
    const alleFeiten = await leesLijst<Feit>(gedeeld, "feiten");
    const feiten = verzoek.feiten.map((id) => alleFeiten.find((f) => f.id === id));
    if (feiten.some((f) => !f || feitOnbruikbaar(f, vandaag))) {
      throw new ApiFout(400, "Een gekoppeld feit bestaat niet of is niet actief; de schrijfhulp werkt alleen met actieve feiten");
    }
    const bruikbaar = feiten as Feit[];

    const opdracht: MarketingOpdracht = {
      taak: verzoek.taak, sjabloon: verzoek.sjabloon, velden: verzoek.velden, kanaal: verzoek.kanaal,
      toelichting: verzoek.toelichting, huidig: verzoek.huidig, feiten: bruikbaar.map((f) => ({ id: f.id, tekst: f.tekst, bron: f.bron.verwijzing })),
    };
    const resultaat = await aiHulp("De schrijfhulp", `schrijfhulp:${verzoek.taak}`, (p, opties) => {
      if (!p.marketingTekst) throw new ApiFout(501, "De ingestelde AI-provider kent de schrijfhulp niet; schrijf de tekst zelf");
      return p.marketingTekst(opdracht, opties);
    });

    const veldIds = new Set(verzoek.velden.map((v) => v.id));
    const varianten = resultaat.voorstel.varianten.slice(0, 3).map((v) => {
      const velden = Object.fromEntries(v.velden.filter((x) => veldIds.has(x.id)).map((x) => [x.id, x.tekst]));
      const posttekst = verzoek.taak === "posttekst" ? v.posttekst : "";
      const altTekst = verzoek.taak === "alt-tekst" ? v.altTekst : "";
      const tekst = [...Object.values(velden), posttekst, altTekst].join("\n");
      return {
        velden, posttekst, altTekst,
        gebruikteFeiten: v.gebruikteFeiten.filter((id) => verzoek.feiten.includes(id)),
        ongedekt: [...new Set(ongedekteGetallen(tekst, bruikbaar).map((g) => g.tekst))],
      };
    });
    return { varianten, model: resultaat.model };
  }

  const gebruiktIn = async (veld: "campagne" | "feiten", id: string) =>
    (await lijstPosts(gedeeld)).filter((p) => (veld === "campagne" ? p.campagne === id : p.feiten.includes(id))).length;

  return [
    // -----------------------------------------------------------------------------------------
    // Posts
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/beheer/marketing/posts", async (c) => {
      const status = c.url.searchParams.get("status");
      const campagne = c.url.searchParams.get("campagne");
      const posts = (await lijstPosts(gedeeld))
        .filter((p) => !status || p.status === status)
        .filter((p) => !campagne || p.campagne === campagne);
      return { posts: posts.map(samenvatting) };
    }),

    route("POST", "/api/beheer/marketing/posts", async (c) => {
      const invoer = valideer(PostInvoerSchema, await c.leesJson());
      await controleerCampagne(invoer);
      const nu = new Date().toISOString();
      const { controle, ...rest } = invoer;
      const id = nieuwPostId();
      const post: Post = {
        ...metEigenUtm(rest, id), id, versie: 1, status: "concept", gepland: null, gepubliceerd: null,
        controle: controle ?? null, geschiedenis: [{ op: nu, wie: wie(c), wat: "aangemaakt" }],
        aangemaakt: nu, gewijzigd: nu,
      };
      try { await maakPost(gedeeld, post); } catch (e) { naarApiFout(e); }
      return antwoord({ status: 201, body: post });
    }),

    route("GET", "/api/beheer/marketing/posts/:id", async (c) => {
      const post = await leesPost(gedeeld, postId(c));
      if (!post) throw new ApiFout(404, "Post niet gevonden");
      return post;
    }),

    route("PUT", "/api/beheer/marketing/posts/:id", async (c) => {
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
            bijgewerkt.geschiedenis = metGeschiedenis(p, { op: nu, wie: wie(c), wat: "terug naar concept: de controle is niet meer zonder fouten" });
          }
          return bijgewerkt;
        });
      } catch (e) { naarApiFout(e); }
    }),

    route("DELETE", "/api/beheer/marketing/posts/:id", async (c) => {
      const id = postId(c);
      if (!(await wisPost(gedeeld, id))) throw new ApiFout(404, "Post niet gevonden");
      await audit(c, "marketing.post-gewist", id);
      return { ok: true };
    }),

    route("POST", "/api/beheer/marketing/posts/:id/dupliceer", async (c) => {
      const bron = await leesPost(gedeeld, postId(c));
      if (!bron) throw new ApiFout(404, "Post niet gevonden");
      const nu = new Date().toISOString();
      const titel = `Kopie van ${bron.titel}`.slice(0, 120);
      const id = nieuwPostId();
      const kopie: Post = {
        ...metEigenUtm(structuredClone(bron), id), id, versie: 1, titel, status: "concept", gepland: null, gepubliceerd: null, resultaat: null,
        geschiedenis: [{ op: nu, wie: wie(c), wat: `gedupliceerd van ${bron.id}` }], aangemaakt: nu, gewijzigd: nu,
      };
      try { await maakPost(gedeeld, kopie); } catch (e) { naarApiFout(e); }
      return antwoord({ status: 201, body: kopie });
    }),

    /**
     * Statusovergangen. Naar "gepland" of "gepubliceerd" kan alleen met een controle zonder fouten
     * (ontwerpregel 6: de controle is de poort, er is geen aparte goedkeuring). Terug naar concept
     * en archiveren kan altijd; een gearchiveerde post komt alleen via concept terug.
     */
    route("POST", "/api/beheer/marketing/posts/:id/status", async (c) => {
      const id = postId(c);
      const overgang = valideer(StatusOvergangSchema, await c.leesJson());
      // De controle in de post rekende de browser uit bij het bewaren; een feit kan daarna nog
      // zijn ingetrokken, verlopen of gewist. Dat rekent de server hier zelf na (reviewbevinding 2).
      const vandaag = vandaagAmsterdam(new Date());
      const feitenNu = new Map((await leesLijst<Feit>(gedeeld, "feiten")).map((f) => [f.id, f]));
      let vorige = "";
      try {
        const post = await werkPostBij(gedeeld, id, null, (p) => {
          vorige = p.status;
          const nu = new Date();
          const naar = overgang.naar;
          if (naar === p.status && naar !== "gepland") throw new ApiFout(409, `Deze post staat al op ${naar}`);
          if (p.status === "gearchiveerd" && naar !== "concept") throw new ApiFout(409, "Een gearchiveerde post gaat eerst terug naar concept");
          if (p.status === "gepubliceerd" && naar === "gepland") throw new ApiFout(409, "Een gepubliceerde post kan niet opnieuw worden gepland; dupliceer hem");
          if ((naar === "gepland" || naar === "gepubliceerd") && (!p.controle || p.controle.fouten > 0)) {
            throw new ApiFout(409, p.controle
              ? `De merkcontrole vond nog ${p.controle.fouten} fout${p.controle.fouten === 1 ? "" : "en"}; los die eerst op`
              : "Deze post heeft nog geen merkcontrole bij de huidige inhoud; open en bewaar hem eerst");
          }
          if (naar === "gepland" || naar === "gepubliceerd") {
            const onbruikbaar = p.feiten.filter((id) => { const f = feitenNu.get(id); return !f || feitOnbruikbaar(f, vandaag); });
            if (onbruikbaar.length) {
              throw new ApiFout(409, `Deze post leunt op ${onbruikbaar.length === 1 ? "een feit dat" : `${onbruikbaar.length} feiten die`} verlopen, ingetrokken of gewist ${onbruikbaar.length === 1 ? "is" : "zijn"}; vervang ${onbruikbaar.length === 1 ? "het" : "ze"} eerst`);
            }
          }
          const wat = (tekst: string) => ({ op: nu.toISOString(), wie: wie(c), wat: tekst });
          if (naar === "gepland") {
            if (!overgang.gepland) throw new ApiFout(400, "gepland: kies een datum en tijd");
            if (new Date(overgang.gepland).getTime() <= nu.getTime()) throw new ApiFout(400, "gepland: kies een moment in de toekomst");
            const opnieuw = p.status === "gepland";
            return { ...p, status: "gepland", gepland: overgang.gepland, gewijzigd: nu.toISOString(),
              geschiedenis: metGeschiedenis(p, wat(`${opnieuw ? "verzet naar" : "gepland op"} ${overgang.gepland}`)) };
          }
          if (naar === "gepubliceerd") {
            return { ...p, status: "gepubliceerd", gepubliceerd: { op: nu.toISOString(), url: overgang.url ?? "" }, gewijzigd: nu.toISOString(),
              geschiedenis: metGeschiedenis(p, wat("gepubliceerd")) };
          }
          if (naar === "concept") {
            // Uit het archief terughalen laat publicatie en resultaat staan (BM-18); alleen een echte terugtrekking wist ze.
            const behoud = p.status === "gearchiveerd";
            return { ...p, status: "concept", gepubliceerd: behoud ? p.gepubliceerd : null, resultaat: behoud ? p.resultaat : null, gewijzigd: nu.toISOString(), geschiedenis: metGeschiedenis(p, wat("terug naar concept")) };
          }
          return { ...p, status: "gearchiveerd", gewijzigd: nu.toISOString(), geschiedenis: metGeschiedenis(p, wat("gearchiveerd")) };
        });
        await audit(c, "marketing.status", `${id}: ${vorige} → ${post.status}`);
        return post;
      } catch (e) { naarApiFout(e); }
    }),

    /**
     * Handmatige resultaten (golf 2): alleen bij een gepubliceerde post. Alle velden `null`
     * wist het resultaat weer (bijvoorbeeld na een verkeerde invoer).
     */
    route("PUT", "/api/beheer/marketing/posts/:id/resultaat", async (c) => {
      const id = postId(c);
      const r = valideer(ResultaatInvoerSchema, await c.leesJson());
      try {
        return await werkPostBij(gedeeld, id, null, (p) => {
          if (p.status !== "gepubliceerd") throw new ApiFout(409, "Alleen een gepubliceerde post heeft resultaten");
          const nu = new Date().toISOString();
          const leeg = r.vertoningen === null && r.reacties === null && r.klikken === null;
          return { ...p, resultaat: leeg ? null : { ...r, op: nu }, gewijzigd: nu, geschiedenis: metGeschiedenis(p, { op: nu, wie: wie(c), wat: "resultaat bijgewerkt" }) };
        });
      } catch (e) { naarApiFout(e); }
    }),

    // -----------------------------------------------------------------------------------------
    // Campagnes, teksten en feiten
    // -----------------------------------------------------------------------------------------
    ...lijstRoutes<Campagne>("campagnes", "/api/beheer/marketing/campagnes", CampagneInvoerSchema, {
      naam: "campagne",
      controleer: (invoer, regels, id) => {
        if (regels.some((r) => r.id !== id && r.utmCampagne === invoer.utmCampagne)) {
          throw new ApiFout(409, `De UTM-naam "${String(invoer.utmCampagne)}" is al in gebruik bij een andere campagne`);
        }
      },
      magNietWeg: async (id) => {
        const n = await gebruiktIn("campagne", id);
        return n ? `Deze campagne hoort bij ${n} post${n === 1 ? "" : "s"}; archiveer hem in plaats van wissen` : null;
      },
    }),
    ...lijstRoutes<Tekst>("teksten", "/api/beheer/marketing/teksten", TekstInvoerSchema, { naam: "tekst" }),
    ...lijstRoutes<Feit>("feiten", "/api/beheer/marketing/feiten", FeitInvoerSchema, {
      naam: "feit",
      auditActie: "marketing.feit-gewijzigd",
      magNietWeg: async (id) => {
        const n = await gebruiktIn("feiten", id);
        return n ? `Dit feit staat in ${n} post${n === 1 ? "" : "s"}; zet het op "ingetrokken" in plaats van wissen` : null;
      },
    }),

    // -----------------------------------------------------------------------------------------
    // Ideeën (golf 2): lichter dan een post, geen versiecontrole, een PUT vervangt het hele idee.
    // -----------------------------------------------------------------------------------------
    ...lijstRoutes<Idee>("ideeen", "/api/beheer/marketing/ideeen", IdeeInvoerSchema, {
      naam: "idee",
      controleer: (invoer) => {
        if (invoer.sjabloon && !sjabloonVan(String(invoer.sjabloon))) throw new ApiFout(400, "Onbekend sjabloon");
      },
    }),

    // Startvulling (taak M4.2): de letterlijke teksten van de site in de feiten- en tekstenbank.
    // Alleen aanvullen: wat er met precies dezelfde tekst al staat, blijft zoals het is (ook een
    // feit dat Tim heeft ingetrokken). Twee keer klikken voegt dus niets dubbel toe.
    route("POST", "/api/beheer/marketing/startvulling", async (c) => {
      const nu = new Date().toISOString();
      const vul = <B extends { tekst: string }, T extends { id: string; tekst: string }>(lijst: "feiten" | "teksten", bron: readonly B[], maak: (b: B) => T) =>
        werkLijstBij<T, number>(gedeeld, lijst, (regels) => {
          const bestaand = new Set(regels.map((r) => r.tekst));
          const nieuw = bron.filter((b) => !bestaand.has(b.tekst)).map(maak);
          if (regels.length + nieuw.length > 500) throw new ApiFout(409, `Er passen niet meer dan 500 ${lijst} in de studio; ruim eerst op`);
          return { regels: [...regels, ...nieuw], uitkomst: nieuw.length };
        });
      const feiten = await vul<Startfeit, Feit>("feiten", STARTFEITEN, (f) => ({
        ...f, geldigVan: null, geldigTot: null, status: "concept", id: nieuwLijstId("feiten"), aangemaakt: nu, gewijzigd: nu, door: wie(c),
      }));
      const teksten = await vul<TekstInvoer, Tekst>("teksten", STARTTEKSTEN, (t) => ({ ...t, id: nieuwLijstId("teksten"), aangemaakt: nu, gewijzigd: nu }));
      await audit(c, "marketing.startvulling", `${feiten} feiten, ${teksten} teksten`);
      return { feiten, teksten };
    }),

    // -----------------------------------------------------------------------------------------
    // Instellingen en overzicht
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/beheer/marketing/instellingen", async () => laadMarketingInstellingen(gedeeld)),
    route("PUT", "/api/beheer/marketing/instellingen", async (c) => {
      const i = valideer(MarketingInstellingenSchema, await c.leesJson());
      await bewaarMarketingInstellingen(gedeeld, i);
      await audit(c, "marketing.instellingen", "instellingen");
      return i;
    }),

    /** Tellingen voor het overzicht van de studio én de regel op het overzicht van Platformbeheer. */
    route("GET", "/api/beheer/marketing/overzicht", async () => {
      const nu = new Date();
      const vandaag = vandaagAmsterdam(nu);
      const week = nu.getTime() + 7 * 24 * 3600 * 1000;
      const maandTerug = nu.getTime() - 30 * 24 * 3600 * 1000;
      const [posts, feiten, media, ideeen, momenten] = await Promise.all([
        lijstPosts(gedeeld), leesLijst<Feit>(gedeeld, "feiten"), lijstMedia(gedeeld), leesLijst<Idee>(gedeeld, "ideeen"),
        // ponytail: momenten zijn een extra op dit overzicht, geen voorwaarde ervoor. Ontbreken de
        // parameters van het ingestelde jaar (bv. een dataDir zonder data/parameters/<jaar>.json),
        // dan gooit momentenNu(); dat mag de rest van het overzicht niet blanco trekken (fixronde 1).
        // De losse /momenten-routes blijven zelf wél hard falen: daar is een lege lijst geen eerlijk antwoord.
        momentenNu().catch(() => [] as Moment[]),
      ]);
      const onbruikbaar = new Set(feiten.filter((f) => feitOnbruikbaar(f, vandaag)).map((f) => f.id));
      const bekend = new Set(feiten.map((f) => f.id));
      const tijd = (p: Post) => (p.gepland ? new Date(p.gepland).getTime() : Number.NaN);
      const gepland = posts.filter((p) => p.status === "gepland");
      const lopend = posts.filter((p) => p.status === "concept" || p.status === "gepland");
      const postIds = new Set(posts.map((p) => p.id));
      const geplandeDagen = gepland.filter((p) => p.gepland).map((p) => vandaagAmsterdam(new Date(p.gepland as string)));
      return {
        geplandDezeWeek: gepland.filter((p) => tijd(p) >= nu.getTime() && tijd(p) <= week).length,
        overDatum: gepland.filter((p) => tijd(p) < nu.getTime()).length,
        concepten: posts.filter((p) => p.status === "concept").length,
        gepubliceerd30: posts.filter((p) => p.status === "gepubliceerd" && p.gepubliceerd && new Date(p.gepubliceerd.op).getTime() >= maandTerug).length,
        // Een feit dat is gewist of niet (meer) bruikbaar is, telt als probleem voor elke post die er nog op leunt.
        metOnbruikbaarFeit: lopend.filter((p) => p.feiten.some((id) => onbruikbaar.has(id) || !bekend.has(id))).length,
        volgende: gepland.filter((p) => tijd(p) >= nu.getTime()).sort((a, b) => tijd(a) - tijd(b)).slice(0, 3).map(samenvatting),
        media: { aantal: media.length, bytes: media.reduce((s, m) => s + m.bytes, 0) },
        // Golf 2: ritme, momenten en resultaten.
        // Een gearchiveerde post houdt zijn publicatie: hij is wél verschenen (afsluitende review, A4).
        laatstGepubliceerd: posts.filter((p) => (p.status === "gepubliceerd" || p.status === "gearchiveerd") && p.gepubliceerd).map((p) => p.gepubliceerd!.op).sort().at(-1) ?? null,
        legeWeken: komendeWeken(vandaag, 4).filter((w) => !geplandeDagen.some((d) => d >= w.maandag && d <= w.zondag)),
        // Ook een open idee met een datum in het verleden telt: het is nog niet opgepakt, en de
        // planner toont het bovenaan als "Open ideeën van eerder" (afsluitende review, A7).
        openIdeeen: ideeen.filter((i) => !(i.post && postIds.has(i.post))).length,
        momenten: momentenIn(momenten, vandaag, plusDagen(vandaag, 60)).slice(0, 5),
        resultaten: resultatenPerSjabloon(posts, plusDagen(vandaag, -182)),
      };
    }),

    // -----------------------------------------------------------------------------------------
    // Schrijfhulp (golf M4). De feiten komen alleen als id's binnen: de server laadt ze zelf, zodat
    // er via de browser geen onbewezen claim de opdracht in kan. Elk voorstel gaat terug met de
    // getallen die in geen van die feiten staan; de editor laat zo'n voorstel niet overnemen.
    // -----------------------------------------------------------------------------------------
    route("POST", "/api/beheer/marketing/schrijfhulp", async (c) => {
      // Eén AI-aanroep tegelijk (schrijfhulp en ideeën samen) regelt `aiHulp`.
      return schrijfhulp(valideer(SchrijfhulpVerzoekSchema, await c.leesJson()));
    }),

    // -----------------------------------------------------------------------------------------
    // Ideeën voorstellen (golf 2). De browser stuurt alleen periode, aantal, kanaal, campagne-id en
    // wens; wat het model ziet, stelt de server zelf samen. Het antwoord gaat nagerekend terug als
    // voorstellen en wordt niet bewaard: pas "Zet in de planner" maakt er ideeën van.
    // -----------------------------------------------------------------------------------------
    route("POST", "/api/beheer/marketing/ideeen/voorstellen", async (c) => {
      const v = valideer(IdeeenVerzoekSchema, await c.leesJson());
      const vandaag = vandaagAmsterdam(new Date());
      if (v.tot < vandaag) throw new ApiFout(400, "Deze periode ligt helemaal in het verleden");
      const van = v.van < vandaag ? vandaag : v.van;
      // Hooguit 92 dagen, van en tot meegeteld: tot ligt uiterlijk 91 dagen na van.
      if (plusDagen(van, 91) < v.tot) throw new ApiFout(400, "Kies een periode van hooguit drie maanden");
      const [feiten, posts, ideeen, campagnes, momenten] = await Promise.all([
        leesLijst<Feit>(gedeeld, "feiten"), lijstPosts(gedeeld), leesLijst<Idee>(gedeeld, "ideeen"), leesLijst<Campagne>(gedeeld, "campagnes"),
        // Anders dan op het Overzicht horen de momenten hier bij de opdracht: zonder kalender geen ideeën.
        momentenNu().catch((fout: unknown) => {
          throw new ApiFout(503, `De actualiteitenkalender is niet te laden: ${fout instanceof Error ? fout.message : String(fout)}`);
        }),
      ]);
      const campagne = v.campagne ? campagnes.find((k) => k.id === v.campagne) ?? null : null;
      if (v.campagne && !campagne) throw new ApiFout(400, "De gekozen campagne bestaat niet (meer)");
      const dagVan = (p: Post) => (p.status === "gepland" && p.gepland ? vandaagAmsterdam(new Date(p.gepland))
        : p.status === "gepubliceerd" && p.gepubliceerd ? vandaagAmsterdam(new Date(p.gepubliceerd.op)) : null);
      const inPeriode = (d: string | null) => d !== null && d >= van && d <= v.tot;
      const opdracht: IdeeenOpdracht = {
        van, tot: v.tot, aantal: v.aantal, kanaal: v.kanaal, toelichting: v.toelichting,
        sjablonen: SJABLONEN.map((s) => ({ id: s.id, naam: s.naam, doel: s.doel })),
        feiten: feiten.filter((f) => !feitOnbruikbaar(f, vandaag)).slice(0, 60).map((f) => ({ id: f.id, tekst: f.tekst, soort: f.soort })),
        // Ook momenten net na de periode: een post vlak ervoor kan erop vooruitlopen.
        momenten: momentenIn(momenten, van, plusDagen(v.tot, 21)).map(({ sleutel, datum, tot, titel, tekst }) => ({ sleutel, datum, tot, titel, tekst })),
        bestaand: [
          ...posts.filter((p) => inPeriode(dagVan(p))).map((p) => ({ datum: dagVan(p) as string, titel: p.titel, soort: "post" as const })),
          ...ideeen.filter((i) => inPeriode(i.datum)).map((i) => ({ datum: i.datum, titel: i.titel, soort: "idee" as const })),
        ],
        campagne: campagne ? { naam: campagne.naam, doel: campagne.doel } : null,
        resultaten: resultatenPerSjabloon(posts, plusDagen(vandaag, -182)),
      };
      const r = await aiHulp("De ideeënhulp", `ideeen:${van}..${v.tot}`, (p, opties) => {
        if (!p.marketingIdeeen) throw new ApiFout(501, "De ingestelde AI-provider kan geen ideeën voorstellen; voeg ze met de hand toe");
        return p.marketingIdeeen(opdracht, opties);
      });
      await audit(c, "marketing.ideeen-voorgesteld", `${van}..${v.tot}`);
      return { voorstellen: ruimIdeeenOp(r.voorstel, opdracht), model: r.model, van };
    }),

    // -----------------------------------------------------------------------------------------
    // Feiten uit de parameters (golf M4.7): een vaste lijst met bron in docs/kennis/.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/beheer/marketing/parameters", async () => {
      const instellingen = await laadInstellingen(gedeeld);
      const jaar = rekenJaarVandaag(o.dataDir, instellingen.parameterJaar);
      return { jaar, parameters: parameterFeiten(laadParameters(jaar, o.dataDir)) };
    }),

    route("POST", "/api/beheer/marketing/parameters/:sleutel/feit", async (c) => {
      const instellingen = await laadInstellingen(gedeeld);
      const p = parameterFeiten(laadParameters(rekenJaarVandaag(o.dataDir, instellingen.parameterJaar), o.dataDir)).find((x) => x.sleutel === c.params.sleutel);
      if (!p) throw new ApiFout(404, "Onbekende parameter");
      const nu = new Date().toISOString();
      const feit = await werkLijstBij<Feit, Feit>(gedeeld, "feiten", (regels) => {
        const nieuw: Feit = {
          id: nieuwLijstId("feiten"), tekst: p.tekst, soort: "cao", bron: { soort: "kennis", verwijzing: p.bron },
          geldigVan: p.geldigVan, geldigTot: p.geldigTot, status: "concept", aangemaakt: nu, gewijzigd: nu, door: wie(c),
        };
        return { regels: [...regels, nieuw], uitkomst: nieuw };
      });
      await audit(c, "marketing.feit-gewijzigd", feit.id);
      return antwoord({ status: 201, body: feit });
    }),

    // -----------------------------------------------------------------------------------------
    // Actualiteitenkalender (golf 2): momenten uit de kennisbank en het minimumloon. Standaard de
    // komende 120 dagen; een venster telt mee zodra het de periode raakt.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/beheer/marketing/momenten", async (c) => {
      const fout = new ApiFout(400, "van en tot zijn datums (JJJJ-MM-DD), van niet na tot");
      const van = c.url.searchParams.get("van") ?? vandaagAmsterdam(new Date());
      // Eerst `van` toetsen: daar rekent de standaard voor `tot` mee.
      if (!echteDatum(van)) throw fout;
      const tot = c.url.searchParams.get("tot") ?? plusDagen(van, 120);
      if (!echteDatum(tot) || van > tot) throw fout;
      return { momenten: momentenIn(await momentenNu(), van, tot) };
    }),

    // Van een moment een concept-cao-feit maken, met de kennispagina als bron. Bestaat er al een feit
    // met precies dezelfde tekst, dan komt dat terug: twee keer klikken maakt geen dubbel feit. Is dat
    // feit ingetrokken, dan 409: "Maak post" zou het anders stil aan een nieuwe post koppelen, en een
    // tweede feit met dezelfde tekst maken zou de intrekking omzeilen (afsluitende review, A3).
    // De 404-tekst "Onbekend moment" herkent de planner (ideeen-ui.js); niet zomaar wijzigen.
    route("POST", "/api/beheer/marketing/momenten/:sleutel/feit", async (c) => {
      const m = (await momentenNu()).find((x) => x.sleutel === c.params.sleutel);
      if (!m) throw new ApiFout(404, "Onbekend moment");
      const nu = new Date().toISOString();
      const { feit, nieuw } = await werkLijstBij<Feit, { feit: Feit; nieuw: boolean }>(gedeeld, "feiten", (regels) => {
        const al = regels.find((f) => f.tekst === m.tekst);
        if (al?.status === "ingetrokken") {
          throw new ApiFout(409, "Het feit bij dit moment is ingetrokken; zet het in de Feitenbank terug op concept als u het weer wilt gebruiken");
        }
        if (al) return { regels, uitkomst: { feit: al, nieuw: false } };
        if (regels.length >= 500) throw new ApiFout(409, "Er staan al 500 feiten; ruim eerst op");
        const f: Feit = {
          id: nieuwLijstId("feiten"), tekst: m.tekst, soort: "cao", bron: { soort: "kennis", verwijzing: m.bron },
          geldigVan: null, geldigTot: m.geldigTot, status: "concept", aangemaakt: nu, gewijzigd: nu, door: wie(c),
        };
        return { regels: [...regels, f], uitkomst: { feit: f, nieuw: true } };
      });
      if (nieuw) await audit(c, "marketing.feit-gewijzigd", feit.id);
      return antwoord({ status: nieuw ? 201 : 200, body: feit });
    }),

    // -----------------------------------------------------------------------------------------
    // Media
    // -----------------------------------------------------------------------------------------
    route("POST", "/api/beheer/marketing/media", async (c) => {
      // Het verplichte vinkje uit de upload: dit beeld toont alleen het voorbeelddossier of
      // openbare informatie (ontwerpregel 7). Zonder die bevestiging bewaren we niets.
      if (c.header("x-voorbeeldgegevens") !== "ja") {
        throw new ApiFout(400, "Bevestig dat dit beeld alleen het voorbeelddossier of openbare informatie toont");
      }
      const inhoud = await c.lees(MAX_MEDIA_BYTES);
      if (!inhoud.length) throw new ApiFout(400, "Er is geen bestand meegestuurd");
      const soort = mediaSoort(inhoud);
      if (!soort) throw new ApiFout(415, "Alleen PNG, JPEG of WebP; een SVG of ander bestand kan hier niet");
      const maat = mediaAfmetingen(inhoud, soort);
      if (!maat || maat.breedte < 1 || maat.hoogte < 1) throw new ApiFout(400, "Dit beeld is onleesbaar of beschadigd");
      if (maat.breedte > 8000 || maat.hoogte > 8000) throw new ApiFout(400, "Dit beeld is groter dan 8000 pixels; verklein het eerst");
      const id = await bewaarMedia(gedeeld, inhoud, soort);
      await audit(c, "marketing.media-geupload", id);
      return antwoord({ status: 201, body: { id, bytes: inhoud.length, ...maat } });
    }, { ruweBody: true }),

    route("GET", "/api/beheer/marketing/media", async () => {
      const [media, posts] = await Promise.all([lijstMedia(gedeeld), lijstPosts(gedeeld)]);
      const gebruik = mediaGebruik(posts);
      return { media: media.map((m) => ({ ...m, gebruikt: gebruik.get(m.id) ?? 0 })) };
    }),

    route("DELETE", "/api/beheer/marketing/media/:id", async (c) => {
      const id = c.params.id;
      if (!MEDIA_ID.test(id)) throw new ApiFout(400, "Ongeldig media-id");
      // ponytail: controle en wissen zijn twee stappen; met één beheerder is een post die precies
      // daartussen het beeld kiest geen reëel scenario. Een slot over posts heen als er meer gebruikers komen.
      const n = mediaGebruik(await lijstPosts(gedeeld)).get(id) ?? 0;
      if (n) throw new ApiFout(409, `Dit beeld staat in ${n} post${n === 1 ? "" : "s"} (gearchiveerde tellen mee); haal het daar eerst weg`);
      if (!(await wisMedia(gedeeld, id))) throw new ApiFout(404, "Beeld niet gevonden");
      await audit(c, "marketing.media-gewist", id);
      return { ok: true };
    }),

    route("GET", "/api/beheer/marketing/media/:id", async (c) => {
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
