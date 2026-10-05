// The shape of everything the studio stores. A post is a RECIPE (template, fields,
// formats) and never a picture: `data/` is in git, and a recipe always produces the same
// image in the browser.
//
// The server does not know the templates itself (they are JS modules in
// `src/web/studio/`); here it only guards the shape and the limits. Whether the headline
// has exactly one emphasis is checked by the brand check in the browser, and that outcome
// travels with the content (see `check` below).
import { z } from "zod";

/**
 * The formats the studio knows; equal to the keys in `src/web/studio/formats.js`
 * (tests/formats.test.ts makes sure they do not drift apart).
 */
export const FORMAT_KEYS = [
  "li-square",
  "li-portrait",
  "li-carousel",
  "li-link",
  "li-profile",
  "li-company",
  "ig-square",
  "ig-portrait",
  "story",
  "wide",
] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Channels for which a caption exists. */
export const CHANNELS = ["linkedin", "instagram", "x", "facebook"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Deliberately only three statuses plus an archive; "approved" is not a status. */
export const POST_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Ids the server hands out itself: a prefix plus a UUID. Never anything from the browser. */
export const POST_ID = /^p-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CAMPAIGN_ID = /^c-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SNIPPET_ID = /^t-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FACT_ID = /^f-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TEMPLATE_ID = /^[a-z][a-z0-9-]{1,40}$/;
const FIELD_ID = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,49}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const IDEA_ID = /^i-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MOMENT_KEY = /^[a-z0-9-]{3,60}$/;

/**
 * An idea in the idea planner: lighter than a post. No status: "used" follows from `post`,
 * discarding means deleting. A PUT replaces the whole idea.
 */
export const IdeaInputSchema = z
  .object({
    date: z.string().regex(DATE, "date: YYYY-MM-DD"),
    title: z.string().trim().min(1).max(120),
    note: z.string().trim().max(1000).default(""),
    template: z.string().regex(TEMPLATE_ID, "invalid template").nullable().default(null),
    headline: z.string().trim().max(200).default(""),
    facts: z.array(z.string().regex(FACT_ID, "invalid fact id")).max(10).default([]),
    moment: z.string().regex(MOMENT_KEY, "invalid moment").nullable().default(null),
    campaign: z.string().regex(CAMPAIGN_ID, "invalid campaign id").nullable().default(null),
    origin: z.enum(["manual", "ai"]).default("manual"),
    post: z.string().regex(POST_ID, "invalid post id").nullable().default(null),
  })
  .strict();
export type IdeaInput = z.infer<typeof IdeaInputSchema>;
export interface Idea extends IdeaInput {
  id: string;
  created: string;
  updated: string;
}

/**
 * Manually entered figures for a published post; there is no counter on the site (open
 * question 5).
 */
export interface Result {
  impressions: number | null;
  comments: number | null;
  clicks: number | null;
  on: string;
}
const Count = z.number().int("a whole number").min(0).max(1_000_000_000).nullable();
export const ResultInputSchema = z.object({ impressions: Count, comments: Count, clicks: Count }).strict();

/** An https address or empty. Never `javascript:` or `http:`: these links end up in posts. */
const HttpsOrEmpty = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v === "") return true;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "must be empty or start with https://");

const Content = z
  .record(z.string().regex(FIELD_ID, "invalid field name"), z.string().max(2000))
  .refine((r) => Object.keys(r).length <= 40, "at most 40 fields");

const SlideSchema = z
  .object({
    kind: z.string().regex(TEMPLATE_ID, "invalid slide kind"),
    content: Content,
  })
  .strict();

/**
 * The outcome of the brand check over exactly the content that comes along in the same
 * request. The server does not re-check it (one administrator; the overflow measurement is
 * only possible in a browser), but stores it together with the content and erases it as
 * soon as the content changes without a new check. That way a changed post is never
 * scheduled with an old, green check.
 */
export const CheckSchema = z
  .object({
    errors: z.number().int().min(0).max(1000),
    attention: z.number().int().min(0).max(1000),
    on: z.iso.datetime(),
  })
  .strict();
export type Check = z.infer<typeof CheckSchema>;

/** What the browser sends on create and save. */
export const PostInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(["image", "carousel"]),
    template: z.string().regex(TEMPLATE_ID, "invalid template"),
    formats: z
      .array(z.enum(FORMAT_KEYS))
      .min(1)
      .max(FORMAT_KEYS.length)
      .refine((f) => new Set(f).size === f.length, "a format appears twice"),
    content: Content,
    slides: z.array(SlideSchema).max(20).default([]),
    caption: z.partialRecord(z.enum(CHANNELS), z.string().max(5000)).default({}),
    altText: z.string().max(1500).default(""),
    link: HttpsOrEmpty.default(""),
    facts: z.array(z.string().regex(FACT_ID, "invalid fact id")).max(50).default([]),
    campaign: z.string().regex(CAMPAIGN_ID, "invalid campaign id").nullable().default(null),
    brandVersion: z.string().trim().min(1).max(40),
    check: CheckSchema.nullable().optional(),
  })
  .strict();
export type PostInput = z.infer<typeof PostInputSchema>;

export interface HistoryEntry {
  on: string;
  who: string;
  what: string;
}

export interface Post extends Omit<PostInput, "check"> {
  id: string;
  version: number;
  status: PostStatus;
  /** ISO timestamp with offset, set on the transition to "scheduled". */
  scheduled: string | null;
  published: { on: string; url: string } | null;
  check: Check | null;
  /** Manual results, only for published posts. Old posts do not have the field. */
  result?: Result | null;
  history: HistoryEntry[];
  created: string;
  updated: string;
}

/** What the list returns: enough for library, planning and overview, without history. */
export type PostSummary = Omit<Post, "history">;

/** A status transition. `scheduled` and `url` belong only to the transition that needs them. */
export const StatusTransitionSchema = z
  .object({
    target: z.enum(POST_STATUSES),
    scheduled: z.iso.datetime({ offset: true }).optional(),
    url: HttpsOrEmpty.optional(),
  })
  .strict();

export const CampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    goal: z.string().trim().max(300).default(""),
    from: z.string().regex(DATE).nullable().default(null),
    to: z.string().regex(DATE).nullable().default(null),
    utmCampaign: z.string().regex(SLUG, "only lowercase letters, digits and hyphens"),
    archived: z.boolean().default(false),
  })
  .strict()
  .refine((c) => !c.from || !c.to || c.from <= c.to, {
    message: "the end date is before the start date",
    path: ["to"],
  });
export type CampaignInput = z.infer<typeof CampaignInputSchema>;
export interface Campaign extends CampaignInput {
  id: string;
  created: string;
  updated: string;
}

export const SNIPPET_KINDS = ["opening", "closer", "hashtags", "boilerplate"] as const;
export const SnippetInputSchema = z
  .object({
    kind: z.enum(SNIPPET_KINDS),
    name: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(3000),
  })
  .strict();
export type SnippetInput = z.infer<typeof SnippetInputSchema>;
export interface Text extends SnippetInput {
  id: string;
  created: string;
  updated: string;
}

export const FACT_KINDS = ["product", "company", "external"] as const;
export const FACT_STATUSES = ["draft", "active", "withdrawn"] as const;
export const SOURCE_KINDS = ["site", "external"] as const;

/**
 * One fact from the fact bank (no claim without a fact). "Expired" is not a status but
 * follows from `validUntil`. An external source is an https address.
 */
export const FactInputSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    kind: z.enum(FACT_KINDS),
    source: z
      .object({
        kind: z.enum(SOURCE_KINDS),
        reference: z.string().trim().min(1).max(300),
      })
      .strict(),
    validFrom: z.string().regex(DATE).nullable().default(null),
    validUntil: z.string().regex(DATE).nullable().default(null),
    status: z.enum(FACT_STATUSES).default("draft"),
  })
  .strict()
  .refine((f) => !f.validFrom || !f.validUntil || f.validFrom <= f.validUntil, {
    message: "valid until is before valid from",
    path: ["validUntil"],
  })
  .refine((f) => f.source.kind !== "external" || /^https:\/\//.test(f.source.reference), {
    message: "an external source is an https address",
    path: ["source", "reference"],
  });
export type FactInput = z.infer<typeof FactInputSchema>;
export interface Fact extends FactInput {
  id: string;
  created: string;
  updated: string;
}

export const SettingsSchema = z
  .object({
    channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length),
    formats: z.array(z.enum(FORMAT_KEYS)).min(1).max(FORMAT_KEYS.length),
    utm: z
      .object({
        medium: z.string().regex(SLUG),
        source: z.partialRecord(z.enum(CHANNELS), z.string().regex(SLUG)),
      })
      .strict(),
    bannedWords: z.array(z.string().trim().min(1).max(60)).max(100),
    defaultHashtags: z.string().max(300),
    tone: z.string().max(1500).default(""),
    writingHelp: z
      .object({
        enabled: z.boolean(),
        capUsdPerMonth: z.number().finite().min(0).max(1000),
      })
      .strict(),
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;

/**
 * The default as long as nothing is configured. LinkedIn-first; the AI help is on: without
 * an API key it gives sample answers that cost nothing. The cap is in dollars, because that
 * is how the API bills. The banned words are promises a brand can seldom keep.
 */
export const DEFAULT_SETTINGS: Settings = {
  channels: ["linkedin"],
  formats: ["li-square", "li-portrait", "li-carousel", "li-link", "li-profile", "li-company", "story"],
  utm: { medium: "social", source: { linkedin: "linkedin", instagram: "instagram", x: "x", facebook: "facebook" } },
  bannedWords: [
    "guaranteed",
    "guarantee",
    "100%",
    "always correct",
    "error-free",
    "never again",
    "best",
    "revolutionary",
  ],
  defaultHashtags: "#postwright",
  tone: "",
  writingHelp: { enabled: true, capUsdPerMonth: 10 },
};
