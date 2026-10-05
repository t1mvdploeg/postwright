// De vorm van alles wat de studio bewaart. Een post is een RECEPT — sjabloon, velden, formaten — en nooit een plaatje: `data/`
// staat in git, en een recept levert in de browser steeds hetzelfde beeld op.
//
// De server kent de sjablonen zelf niet (die staan als JS-modules in `src/web/marketing/`); hij
// bewaakt hier alleen de vorm en de grenzen. Of de kop precies één nadruk heeft, controleert de
// merkcontrole in de browser, en die uitkomst reist mee met de inhoud (zie `controle` hieronder).
import { z } from "zod";
import "../core/zod-nl.js";

/** De formaten die de studio kent; gelijk aan de sleutels in `src/web/marketing/formaten.js`
 *  (tests/marketing-formaten.test.ts bewaakt dat ze niet uit elkaar lopen). */
export const FORMAAT_SLEUTELS = [
  "li-vierkant", "li-staand", "li-carrousel", "li-link", "li-profiel", "li-bedrijf",
  "ig-vierkant", "ig-staand", "story", "breed",
] as const;
export type FormaatSleutel = (typeof FORMAAT_SLEUTELS)[number];

/** Kanalen waarvoor een posttekst bestaat. */
export const KANALEN = ["linkedin", "instagram", "x", "facebook"] as const;
export type Kanaal = (typeof KANALEN)[number];

/** Bewust maar drie statussen plus een archief (ontwerpregel 6); "goedgekeurd" is geen status. */
export const POST_STATUSSEN = ["concept", "gepland", "gepubliceerd", "gearchiveerd"] as const;
export type PostStatus = (typeof POST_STATUSSEN)[number];

/** Id's die de server zelf uitdeelt: voorvoegsel plus een UUID. Nooit iets uit de browser. */
export const POST_ID = /^p-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CAMPAGNE_ID = /^c-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TEKST_ID = /^t-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FEIT_ID = /^f-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SJABLOON_ID = /^[a-z][a-z0-9-]{1,40}$/;
const VELD_ID = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,49}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const IDEE_ID = /^i-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MOMENT_SLEUTEL = /^[a-z0-9-]{3,60}$/;

/**
 * Een idee in de ideeënplanner (golf 2): lichter dan een post. Geen status: "gebruikt" volgt uit
 * `post`, wegdoen is wissen (ontwerpregel 6). Een PUT vervangt het hele idee.
 */
export const IdeeInvoerSchema = z.object({
  datum: z.string().regex(DATUM, "datum: JJJJ-MM-DD"),
  titel: z.string().trim().min(1).max(120),
  toelichting: z.string().trim().max(1000).default(""),
  sjabloon: z.string().regex(SJABLOON_ID, "ongeldig sjabloon").nullable().default(null),
  kop: z.string().trim().max(200).default(""),
  feiten: z.array(z.string().regex(FEIT_ID, "ongeldig feit-id")).max(10).default([]),
  moment: z.string().regex(MOMENT_SLEUTEL, "ongeldig moment").nullable().default(null),
  campagne: z.string().regex(CAMPAGNE_ID, "ongeldig campagne-id").nullable().default(null),
  herkomst: z.enum(["hand", "ai"]).default("hand"),
  post: z.string().regex(POST_ID, "ongeldig post-id").nullable().default(null),
}).strict();
export type IdeeInvoer = z.infer<typeof IdeeInvoerSchema>;
export interface Idee extends IdeeInvoer { id: string; aangemaakt: string; gewijzigd: string }

/** Handmatige cijfers bij een gepubliceerde post; er komt geen teller op de site (open vraag 5). */
export interface Resultaat { vertoningen: number | null; reacties: number | null; klikken: number | null; op: string }
const Aantal = z.number().int("een geheel getal").min(0).max(1_000_000_000).nullable();
export const ResultaatInvoerSchema = z.object({ vertoningen: Aantal, reacties: Aantal, klikken: Aantal }).strict();

/** Een https-adres of leeg. Nooit `javascript:` of `http:`: deze links belanden in posts. */
const HttpsOfLeeg = z.string().trim().max(500).refine((v) => {
  if (v === "") return true;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}, "moet leeg zijn of met https:// beginnen");

const Inhoud = z.record(z.string().regex(VELD_ID, "ongeldige veldnaam"), z.string().max(2000))
  .refine((r) => Object.keys(r).length <= 40, "hooguit 40 velden");

const DiaSchema = z.object({
  soort: z.string().regex(SJABLOON_ID, "ongeldige diasoort"),
  inhoud: Inhoud,
}).strict();

/**
 * De uitkomst van de merkcontrole over precies de inhoud die in hetzelfde verzoek meekomt. De
 * server rekent haar niet na (één beheerder, geen tenantgrens; de overloopmeting kan alleen in een
 * browser), maar bewaart haar samen met de inhoud en wist haar zodra de inhoud zonder nieuwe
 * controle verandert. Zo wordt een gewijzigde post nooit met een oude, groene controle ingepland.
 */
export const ControleSchema = z.object({
  fouten: z.number().int().min(0).max(1000),
  letOp: z.number().int().min(0).max(1000),
  op: z.iso.datetime(),
}).strict();
export type Controle = z.infer<typeof ControleSchema>;

/** Wat de browser bij aanmaken en opslaan stuurt. */
export const PostInvoerSchema = z.object({
  titel: z.string().trim().min(1).max(120),
  soort: z.enum(["beeld", "carrousel"]),
  sjabloon: z.string().regex(SJABLOON_ID, "ongeldig sjabloon"),
  formaten: z.array(z.enum(FORMAAT_SLEUTELS)).min(1).max(FORMAAT_SLEUTELS.length)
    .refine((f) => new Set(f).size === f.length, "een formaat staat er dubbel in"),
  inhoud: Inhoud,
  dias: z.array(DiaSchema).max(20).default([]),
  posttekst: z.partialRecord(z.enum(KANALEN), z.string().max(5000)).default({}),
  altTekst: z.string().max(1500).default(""),
  link: HttpsOfLeeg.default(""),
  feiten: z.array(z.string().regex(FEIT_ID, "ongeldig feit-id")).max(50).default([]),
  campagne: z.string().regex(CAMPAGNE_ID, "ongeldig campagne-id").nullable().default(null),
  merkVersie: z.string().trim().min(1).max(40),
  controle: ControleSchema.nullable().optional(),
}).strict();
export type PostInvoer = z.infer<typeof PostInvoerSchema>;

export interface Geschiedenisregel { op: string; wie: string; wat: string }

export interface Post extends Omit<PostInvoer, "controle"> {
  id: string;
  versie: number;
  status: PostStatus;
  /** ISO-tijdstip met offset, gezet bij de overgang naar "gepland". */
  gepland: string | null;
  gepubliceerd: { op: string; url: string } | null;
  controle: Controle | null;
  /** Golf 2: handmatige resultaten, alleen bij gepubliceerd. Oude posts hebben het veld niet. */
  resultaat?: Resultaat | null;
  geschiedenis: Geschiedenisregel[];
  aangemaakt: string;
  gewijzigd: string;
}

/** Wat de lijst teruggeeft: genoeg voor bibliotheek, planning en overzicht, zonder geschiedenis. */
export type PostSamenvatting = Omit<Post, "geschiedenis">;

/** Een statusovergang. `gepland` en `url` horen alleen bij de overgang die ze nodig heeft. */
export const StatusOvergangSchema = z.object({
  naar: z.enum(POST_STATUSSEN),
  gepland: z.iso.datetime({ offset: true }).optional(),
  url: HttpsOfLeeg.optional(),
}).strict();

export const CampagneInvoerSchema = z.object({
  naam: z.string().trim().min(1).max(80),
  doel: z.string().trim().max(300).default(""),
  van: z.string().regex(DATUM).nullable().default(null),
  tot: z.string().regex(DATUM).nullable().default(null),
  utmCampagne: z.string().regex(SLUG, "alleen kleine letters, cijfers en streepjes"),
  gearchiveerd: z.boolean().default(false),
}).strict().refine((c) => !c.van || !c.tot || c.van <= c.tot, { message: "de einddatum ligt vóór de begindatum", path: ["tot"] });
export type CampagneInvoer = z.infer<typeof CampagneInvoerSchema>;
export interface Campagne extends CampagneInvoer { id: string; aangemaakt: string; gewijzigd: string }

export const TEKST_SOORTEN = ["opening", "afsluiter", "hashtags", "boilerplate"] as const;
export const TekstInvoerSchema = z.object({
  soort: z.enum(TEKST_SOORTEN),
  naam: z.string().trim().min(1).max(80),
  tekst: z.string().trim().min(1).max(3000),
}).strict();
export type TekstInvoer = z.infer<typeof TekstInvoerSchema>;
export interface Tekst extends TekstInvoer { id: string; aangemaakt: string; gewijzigd: string }

export const FEIT_SOORTEN = ["product", "bedrijf", "extern"] as const;
export const FEIT_STATUSSEN = ["concept", "actief", "ingetrokken"] as const;
export const BRON_SOORTEN = ["site", "extern"] as const;

/**
 * Eén feit uit de feitenbank (ontwerpregel 4: geen claim zonder feit). "Verlopen" is geen status
 * maar volgt uit `geldigTot`. Een externe bron is een https-adres.
 */
export const FeitInvoerSchema = z.object({
  tekst: z.string().trim().min(1).max(500),
  soort: z.enum(FEIT_SOORTEN),
  bron: z.object({
    soort: z.enum(BRON_SOORTEN),
    verwijzing: z.string().trim().min(1).max(300),
  }).strict(),
  geldigVan: z.string().regex(DATUM).nullable().default(null),
  geldigTot: z.string().regex(DATUM).nullable().default(null),
  status: z.enum(FEIT_STATUSSEN).default("concept"),
}).strict()
  .refine((f) => !f.geldigVan || !f.geldigTot || f.geldigVan <= f.geldigTot, { message: "geldig tot ligt vóór geldig vanaf", path: ["geldigTot"] })
  .refine((f) => f.bron.soort !== "extern" || /^https:\/\//.test(f.bron.verwijzing), {
    message: "een externe bron is een https-adres", path: ["bron", "verwijzing"],
  });
export type FeitInvoer = z.infer<typeof FeitInvoerSchema>;
export interface Feit extends FeitInvoer { id: string; aangemaakt: string; gewijzigd: string }

export const MarketingInstellingenSchema = z.object({
  kanalen: z.array(z.enum(KANALEN)).max(KANALEN.length),
  formaten: z.array(z.enum(FORMAAT_SLEUTELS)).min(1).max(FORMAAT_SLEUTELS.length),
  utm: z.object({
    medium: z.string().regex(SLUG),
    bron: z.partialRecord(z.enum(KANALEN), z.string().regex(SLUG)),
  }).strict(),
  verbodenWoorden: z.array(z.string().trim().min(1).max(60)).max(100),
  standaardHashtags: z.string().max(300),
  schrijfhulp: z.object({
    aan: z.boolean(),
    plafondUsdPerMaand: z.number().finite().min(0).max(1000),
  }).strict(),
}).strict();
export type MarketingInstellingen = z.infer<typeof MarketingInstellingenSchema>;

/**
 * De standaard zolang er niets is ingesteld. LinkedIn-first; de AI-hulp staat aan: zonder API-sleutel
 * geeft hij voorbeeldantwoorden die niets kosten. Het plafond is in dollars, want zo rekent de API.
 * De verboden woorden zijn beloftes die een merk zelden kan waarmaken.
 */
export const STANDAARD_MARKETING_INSTELLINGEN: MarketingInstellingen = {
  kanalen: ["linkedin"],
  formaten: ["li-vierkant", "li-staand", "li-carrousel", "li-link", "li-profiel", "li-bedrijf", "story"],
  utm: { medium: "social", bron: { linkedin: "linkedin", instagram: "instagram", x: "x", facebook: "facebook" } },
  verbodenWoorden: ["gegarandeerd", "garantie", "100%", "altijd correct", "foutloos", "nooit meer", "beste", "revolutionair"],
  standaardHashtags: "#postwright",
  schrijfhulp: { aan: true, plafondUsdPerMaand: 10 },
};
