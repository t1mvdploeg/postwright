// The studio's routes, all under `/api/`. The server stores recipes, lists, settings and
// uploaded images in the data folder; the studio renders, exports (PNG, PDF, ZIP) and
// builds the calendar export itself in the browser.
import { ApiError, response, route, type Ctx, type Route } from "./http.js";
import { readJson, path, serialize, type Storage } from "./files.js";
import {
  StorageError,
  saveSettingsFile,
  saveMedia,
  validListId,
  loadSettingsFile,
  readList,
  readMedia,
  readPost,
  listMedia,
  listPosts,
  createPost,
  mediaDimensions,
  mediaUsage,
  mediaKind,
  MEDIA_CONTENT_TYPES,
  MEDIA_ID,
  newListId,
  newPostId,
  updateList,
  updatePost,
  deleteMedia,
  deletePost,
  type ListName,
  type MediaKind,
} from "./store.js";
import {
  CampaignInputSchema,
  FactInputSchema,
  IdeaInputSchema,
  SettingsSchema,
  MOMENT_KEY,
  POST_ID,
  PostInputSchema,
  ResultInputSchema,
  StatusTransitionSchema,
  SnippetInputSchema,
  type Campaign,
  type Fact,
  type HistoryEntry,
  type Idea,
  type Settings,
  type Post,
  type PostInput,
  type PostSummary,
  type Text,
  type SnippetInput,
} from "./schema.js";
import { SAMPLE_FACTS, SAMPLE_POSTS, SAMPLE_SNIPPETS, type SampleFact } from "./sample-content.js";
import { WritingHelpRequestSchema, type WritingTask } from "./writing-help.js";
import { IdeasRequestSchema, tidyIdeas, type IdeasPrompt } from "./ideas.js";
import { allMoments, type Moment } from "./moments.js";
import { resultsPerTemplate } from "./results.js";
// Every studio link in the caption points to its own post; the same function the editor
// uses on "Insert link", so that a link pasted or duplicated before that is correct too.
import { setUtmContent } from "../web/studio/caption.js";
// For checking that an idea points to an existing template: the same template list as the
// editor.
import { TEMPLATES, template as templateOf } from "../web/studio/templates.js";
// The browser's brand check, also used here for the sample post that gets scheduled.
import { runCheck } from "../web/studio/brand-check.js";
// Date helpers: one version for server and browser (realDate does not let 2026-13-01 and
// 2026-02-30 through).
import { realDate, upcomingWeeks, plusDays } from "../web/studio/calendar.js";
import { uncoveredNumbers } from "../web/studio/numbers.js";
import { AiError, type AiProvider, type AiResult } from "./ai/provider.js";
import { aiMode, chooseProvider } from "./ai/choose.js";
import { loadBrand, type Brand } from "./brand.js";
import { book, costUsd, monthTotalUsd } from "./ai/usage.js";
import { z } from "zod";

/** Largest upload: a screenshot or photo. */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
/** How many lines `history` keeps; the oldest drop off. */
const MAX_HISTORY = 100;

const LOCAL_DATE = new Intl.DateTimeFormat("sv-SE");
/**
 * The calendar date (YYYY-MM-DD) on this computer; same approach as `localToday` in
 * `src/web/studio/recipe.js` (copied here rather than importing the whole recipe module).
 */
function localToday(now: Date): string {
  return LOCAL_DATE.format(now);
}

/** Whether a fact may no longer be used: withdrawn, still a draft, or past `validUntil`. */
export function factUnusable(f: Pick<Fact, "status" | "validUntil">, today: string): boolean {
  return f.status !== "active" || (f.validUntil !== null && f.validUntil < today);
}

function firstZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.join(".") || "input";
  return `${path}: ${issue.message}`;
}

function validate<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(400, firstZodError(r.error));
  return r.data;
}

function withHistory(p: Post, line: HistoryEntry): HistoryEntry[] {
  return [...p.history, line].slice(-MAX_HISTORY);
}

function summary(p: Post): PostSummary {
  const { history: _dropped, ...rest } = p;
  return rest;
}

/**
 * The fields that determine the image or the text. If one of them changes, a new check
 * has to come with it.
 */
function contentDiffers(
  a: Pick<Post, "template" | "content" | "slides" | "formats" | "caption" | "altText" | "link" | "facts">,
  b: typeof a,
): boolean {
  const key = (x: typeof a) =>
    JSON.stringify([x.template, x.content, x.slides, x.formats, x.caption, x.altText, x.link, x.facts]);
  return key(a) !== key(b);
}

/** Every studio link in the captions points to this post (utm_content = post id). */
function withCustomUtm<T extends { caption: PostInput["caption"] }>(p: T, id: string): T {
  return {
    ...p,
    caption: Object.fromEntries(Object.entries(p.caption).map(([k, t]) => [k, setUtmContent(t, id)])) as T["caption"],
  };
}

function toApiError(e: unknown): never {
  if (e instanceof StorageError) throw new ApiError(e.status, e.message);
  throw e;
}

const CustomMomentsSchema = z
  .array(
    z
      .object({
        key: z.string().regex(MOMENT_KEY, "only lowercase letters, digits and hyphens"),
        date: z.string().refine(realDate, "not a real date (YYYY-MM-DD)"),
        title: z.string().trim().min(1).max(80),
        sentence: z.string().trim().max(300).default(""),
      })
      .strict(),
  )
  .max(500);

/**
 * The user's own moments from `<data folder>/marketing/moments.json`: a list with `key`,
 * `date`, `title` and `sentence`. The file is optional; a broken file gives a 500 with its
 * name, so that the user knows what to check.
 */
export async function readCustomMoments(o: Storage): Promise<Moment[]> {
  try {
    const list = await readJson<unknown>(path(o, "marketing", "moments.json"));
    if (list === null) return [];
    const r = CustomMomentsSchema.safeParse(list);
    if (!r.success) throw new Error(firstZodError(r.error));
    return r.data.map((m) => ({ ...m, kind: "custom" as const }));
  } catch (e) {
    throw new ApiError(500, `marketing/moments.json cannot be read: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * `provider`: the AI the routes use; without it they use `chooseProvider()` (key from the
 * environment).
 */
export function createRoutes(o: { dataDir: string; provider?: AiProvider }): Route[] {
  const shared: Storage = { dir: o.dataDir };
  const provider = o.provider ?? chooseProvider();
  /** The settings; an unreadable file becomes a 500 with its name (never silently the default). */
  const loadSettings = () => loadSettingsFile(shared).catch(toApiError);

  function postId(c: Ctx): string {
    const id = c.params.id;
    if (!POST_ID.test(id)) throw new ApiError(400, "Invalid post id");
    return id;
  }

  /** A campaign attached to a post must exist; otherwise the post points to nothing. */
  async function checkCampaign(input: PostInput): Promise<void> {
    if (!input.campaign) return;
    const campaigns = await readList<Campaign>(shared, "campaigns");
    if (!campaigns.some((k) => k.id === input.campaign))
      throw new ApiError(400, "The chosen campaign no longer exists");
  }

  /** Generic routes for a small list (campaigns, snippets): list, new, update, delete. */
  function listRoutes<T extends { id: string; created: string; updated: string }>(
    list: ListName,
    path: string,
    schema: z.ZodType,
    options: {
      name: string;
      /** Extra check before saving (uniqueness); throws an ApiError. */
      runCheck?: (input: Record<string, unknown>, lines: T[], id: string | null) => void;
      /** Why this entry may not be deleted, or null. */
      isProtected?: (id: string) => Promise<string | null>;
    },
  ): Route[] {
    const idFrom = (c: Ctx) => {
      if (!validListId(list, c.params.id)) throw new ApiError(400, `Invalid ${options.name}-id`);
      return c.params.id;
    };
    return [
      route("GET", path, async () => ({ [list]: await readList<T>(shared, list) })),
      route("POST", path, async (c) => {
        const input = validate(schema, await c.readJson()) as Record<string, unknown>;
        const now = new Date().toISOString();
        const line = await updateList<T, T>(shared, list, (lines) => {
          options.runCheck?.(input, lines, null);
          if (lines.length >= 500) throw new ApiError(409, `There are already 500 ${list}; clear some out first`);
          const isNew = { ...input, id: newListId(list), created: now, updated: now } as unknown as T;
          return { lines: [...lines, isNew], outcome: isNew };
        });
        return response({ status: 201, body: line });
      }),
      route("PUT", `${path}/:id`, async (c) => {
        const id = idFrom(c);
        const input = validate(schema, await c.readJson()) as Record<string, unknown>;
        const line = await updateList<T, T>(shared, list, (lines) => {
          const i = lines.findIndex((r) => r.id === id);
          if (i < 0) throw new ApiError(404, `${options.name[0].toUpperCase()}${options.name.slice(1)} not found`);
          options.runCheck?.(input, lines, id);
          const isNew = { ...lines[i], ...input, id, updated: new Date().toISOString() } as T;
          const copy = [...lines];
          copy[i] = isNew;
          return { lines: copy, outcome: isNew };
        });
        return line;
      }),
      route("DELETE", `${path}/:id`, async (c) => {
        const id = idFrom(c);
        const reason = await options.isProtected?.(id);
        if (reason) throw new ApiError(409, reason);
        const remove = await updateList<T, boolean>(shared, list, (lines) => {
          const remaining = lines.filter((r) => r.id !== id);
          return { lines: remaining, outcome: remaining.length !== lines.length };
        });
        if (!remove) throw new ApiError(404, `${options.name[0].toUpperCase()}${options.name.slice(1)} not found`);
        return { ok: true };
      }),
    ];
  }

  /** The user's own moments, or an empty list if the file does not exist. */
  const customMoments = () => readCustomMoments(shared);

  /** Look up a moment by key: an annual day (the key is its date) or a custom moment. */
  async function findMoment(key: string): Promise<Moment | undefined> {
    const custom = await customMoments();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
    return (date ? allMoments(date, date, custom) : custom).find((m) => m.key === key);
  }

  /**
   * The sample posts of the sample content, each with its own title. A post that already
   * exists is skipped. The scheduled post gets a real check (the same as in the browser,
   * minus the overflow measurement); the drafts are stored without one: the editor checks
   * them when it opens.
   */
  async function fillPosts(settings: Settings, brand: Brand): Promise<number> {
    const [existing, facts] = await Promise.all([listPosts(shared), readList<Fact>(shared, "facts")]);
    let isNew = 0;
    for (const s of SAMPLE_POSTS) {
      const tpl = templateOf(s.template);
      if (!tpl || existing.some((p) => p.title === s.title)) continue;
      const id = newPostId();
      const now = new Date();
      const factId = s.fact ? facts.find((f) => f.text === s.fact)?.id : undefined;
      const post: Post = {
        id,
        version: 1,
        title: s.title,
        kind: "image",
        template: s.template,
        formats: [tpl.formats[0]],
        content: s.content,
        slides: [],
        caption: { linkedin: s.caption },
        altText: s.altText,
        link: "",
        facts: factId ? [factId] : [],
        campaign: null,
        brandVersion: brand.version,
        status: "draft",
        scheduled: null,
        published: null,
        check: null,
        result: null,
        history: [{ on: now.toISOString(), who: "", what: "created" }],
        created: now.toISOString(),
        updated: now.toISOString(),
      };
      if (s.inDays !== undefined) {
        const c = runCheck({
          post,
          template: tpl,
          settings,
          facts,
          today: localToday(now),
          brandVersion: brand.version,
          brand,
        });
        post.check = { errors: c.errors, attention: c.attention, on: now.toISOString() };
        if (c.errors === 0) {
          post.status = "scheduled";
          post.scheduled = new Date(now.getTime() + s.inDays * 24 * 3600 * 1000).toISOString();
          post.history = withHistory(post, {
            on: now.toISOString(),
            who: "",
            what: `scheduled for ${post.scheduled}`,
          });
        }
      }
      try {
        await createPost(shared, post);
      } catch (e) {
        toApiError(e);
      }
      isNew++;
    }
    return isNew;
  }

  /**
   * One AI call of the studio (writing help or ideas): switch, monthly cap, provider and
   * booking. One call at a time for both, otherwise fast clicks read the same amount and
   * together exceed the cap. The cap applies only to the live provider; the sample provider
   * costs nothing. Every call is booked, a failed one too (with the tokens already spent).
   */
  async function aiHelp<T>(name: string, task: string, call: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
    return serialize("marketing-ai", async () => {
      const currentSettings = await loadSettings();
      if (!currentSettings.writingHelp.enabled)
        throw new ApiError(409, `${name} is off; set AI help on under Settings`);
      const cap = currentSettings.writingHelp.capUsdPerMonth;
      if (provider.name === "anthropic" && (await monthTotalUsd(o.dataDir, new Date())) >= cap) {
        throw new ApiError(429, `The monthly cap for AI help ($ ${cap}) has been reached`);
      }
      const modelName = aiMode(provider).model ?? "sample";
      let result: AiResult<T>;
      try {
        result = await call();
      } catch (error) {
        const usd = error instanceof AiError && error.usage ? costUsd(modelName, error.usage) : 0;
        await book(o.dataDir, { timestamp: new Date().toISOString(), model: modelName, task, usd, ok: false });
        throw new ApiError(
          502,
          `${name} did not give a usable answer: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await book(o.dataDir, {
        timestamp: new Date().toISOString(),
        model: result.model,
        task,
        usd: costUsd(result.model, result.usage),
        ok: true,
      });
      return result;
    });
  }

  async function writingHelp(request: z.infer<typeof WritingHelpRequestSchema>) {
    const today = localToday(new Date());
    const allFacts = await readList<Fact>(shared, "facts");
    const facts = request.facts.map((id) => allFacts.find((f) => f.id === id));
    if (facts.some((f) => !f || factUnusable(f, today))) {
      throw new ApiError(
        400,
        "A linked fact does not exist or is not active; the writing help only works with active facts",
      );
    }
    const usable = facts as Fact[];

    const brand = await loadBrand(o.dataDir);
    const settings = await loadSettings();
    const prompt: WritingTask = {
      task: request.task,
      template: request.template,
      fields: request.fields,
      channel: request.channel,
      note: request.note,
      current: request.current,
      facts: usable.map((f) => ({ id: f.id, text: f.text, source: f.source.reference })),
      brand: { brandName: brand.name, bannedWords: settings.bannedWords },
    };
    const result = await aiHelp("The writing help", `writingHelp:${request.task}`, () => provider.writeText(prompt));

    const fieldIds = new Set(request.fields.map((v) => v.id));
    const variants = result.suggestion.variants.slice(0, 3).map((v) => {
      const fields = Object.fromEntries(v.fields.filter((x) => fieldIds.has(x.id)).map((x) => [x.id, x.text]));
      const caption = request.task === "caption" ? v.caption : "";
      const altText = request.task === "alt-text" ? v.altText : "";
      const text = [...Object.values(fields), caption, altText].join("\n");
      return {
        fields,
        caption,
        altText,
        usedFacts: v.usedFacts.filter((id) => request.facts.includes(id)),
        uncovered: [...new Set(uncoveredNumbers(text, usable).map((g) => g.text))],
      };
    });
    return { variants, model: result.model, sample: provider.name === "sample" };
  }

  const usedIn = async (field: "campaign" | "facts", id: string) =>
    (await listPosts(shared)).filter((p) => (field === "campaign" ? p.campaign === id : p.facts.includes(id))).length;

  const routes: Route[] = [
    // -----------------------------------------------------------------------------------------
    // Posts
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/posts", async (c) => {
      const status = c.url.searchParams.get("status");
      const campaign = c.url.searchParams.get("campaign");
      const posts = (await listPosts(shared))
        .filter((p) => !status || p.status === status)
        .filter((p) => !campaign || p.campaign === campaign);
      return { posts: posts.map(summary) };
    }),

    route("POST", "/api/posts", async (c) => {
      const input = validate(PostInputSchema, await c.readJson());
      await checkCampaign(input);
      const now = new Date().toISOString();
      const { check, ...rest } = input;
      const id = newPostId();
      const post: Post = {
        ...withCustomUtm(rest, id),
        id,
        version: 1,
        status: "draft",
        scheduled: null,
        published: null,
        check: check ?? null,
        history: [{ on: now, who: "", what: "created" }],
        created: now,
        updated: now,
      };
      try {
        await createPost(shared, post);
      } catch (e) {
        toApiError(e);
      }
      return response({ status: 201, body: post });
    }),

    route("GET", "/api/posts/:id", async (c) => {
      const post = await readPost(shared, postId(c));
      if (!post) throw new ApiError(404, "Post not found");
      return post;
    }),

    route("PUT", "/api/posts/:id", async (c) => {
      const id = postId(c);
      const body = await c.readJson<Record<string, unknown>>();
      const version = body.version;
      if (typeof version !== "number" || !Number.isInteger(version)) throw new ApiError(400, "version: missing");
      const { version: _v, ...rest } = body;
      const input = validate(PostInputSchema, rest);
      await checkCampaign(input);
      try {
        return await updatePost(shared, id, version, (p) => {
          const now = new Date().toISOString();
          const { check, ...raw } = input;
          const fields = withCustomUtm(raw, id);
          // The check belongs to exactly this content. If changed content arrives without a new
          // check, the old one is worth nothing.
          const newCheck = check !== undefined ? check : contentDiffers(p, fields) ? null : p.check;
          const updated: Post = { ...p, ...fields, check: newCheck, updated: now };
          // A scheduled post that no longer passes the check goes back to draft: it would otherwise
          // stay on the calendar with an error in it.
          if (p.status === "scheduled" && (!newCheck || newCheck.errors > 0)) {
            updated.status = "draft";
            updated.history = withHistory(p, {
              on: now,
              who: "",
              what: "back to draft: the check no longer passes",
            });
          }
          return updated;
        });
      } catch (e) {
        toApiError(e);
      }
    }),

    route("DELETE", "/api/posts/:id", async (c) => {
      const id = postId(c);
      if (!(await deletePost(shared, id))) throw new ApiError(404, "Post not found");
      return { ok: true };
    }),

    route("POST", "/api/posts/:id/duplicate", async (c) => {
      const source = await readPost(shared, postId(c));
      if (!source) throw new ApiError(404, "Post not found");
      const now = new Date().toISOString();
      const title = `Copy of ${source.title}`.slice(0, 120);
      const id = newPostId();
      const copy: Post = {
        ...withCustomUtm(structuredClone(source), id),
        id,
        version: 1,
        title,
        status: "draft",
        scheduled: null,
        published: null,
        result: null,
        history: [{ on: now, who: "", what: `duplicated from ${source.id}` }],
        created: now,
        updated: now,
      };
      try {
        await createPost(shared, copy);
      } catch (e) {
        toApiError(e);
      }
      return response({ status: 201, body: copy });
    }),

    /**
     * Status transitions. Moving to "scheduled" or "published" is only possible with a check
     * without errors (the check is the gate, there is no separate approval). Back to draft
     * and archiving are always possible; an archived post only comes back via draft.
     */
    route("POST", "/api/posts/:id/status", async (c) => {
      const id = postId(c);
      const transition = validate(StatusTransitionSchema, await c.readJson());
      // The check in the post was computed by the browser when saving; a fact may have been
      // withdrawn, expired or deleted since. The server re-checks that here itself.
      const today = localToday(new Date());
      const currentFacts = new Map((await readList<Fact>(shared, "facts")).map((f) => [f.id, f]));
      try {
        return await updatePost(shared, id, null, (p) => {
          const now = new Date();
          const target = transition.target;
          if (target === p.status && target !== "scheduled")
            throw new ApiError(409, `This post already has the status ${target}`);
          if (p.status === "archived" && target !== "draft")
            throw new ApiError(409, "An archived post goes back to draft first");
          if (p.status === "published" && target === "scheduled")
            throw new ApiError(409, "A published post cannot be scheduled again; duplicate it");
          if ((target === "scheduled" || target === "published") && (!p.check || p.check.errors > 0)) {
            throw new ApiError(
              409,
              p.check
                ? `The brand check still found ${p.check.errors} error${p.check.errors === 1 ? "" : "s"}; fix those first`
                : "This post has no brand check yet for its current content; open and save it first",
            );
          }
          if (target === "scheduled" || target === "published") {
            const unusable = p.facts.filter((id) => {
              const f = currentFacts.get(id);
              return !f || factUnusable(f, today);
            });
            if (unusable.length) {
              throw new ApiError(
                409,
                `This post relies on ${unusable.length === 1 ? "a fact that has" : `${unusable.length} facts that have`} expired, been withdrawn or been deleted; replace ${unusable.length === 1 ? "it" : "them"} first`,
              );
            }
          }
          const what = (text: string) => ({ on: now.toISOString(), who: "", what: text });
          if (target === "scheduled") {
            if (!transition.scheduled) throw new ApiError(400, "scheduled: choose a date and time");
            if (new Date(transition.scheduled).getTime() <= now.getTime())
              throw new ApiError(400, "scheduled: choose a time in the future");
            const retry = p.status === "scheduled";
            return {
              ...p,
              status: "scheduled",
              scheduled: transition.scheduled,
              updated: now.toISOString(),
              history: withHistory(p, what(`${retry ? "rescheduled to" : "scheduled for"} ${transition.scheduled}`)),
            };
          }
          if (target === "published") {
            return {
              ...p,
              status: "published",
              published: { on: now.toISOString(), url: transition.url ?? "" },
              updated: now.toISOString(),
              history: withHistory(p, what("published")),
            };
          }
          if (target === "draft") {
            // Restoring from the archive leaves publication and result in place; only a real
            // withdrawal erases them.
            const keep = p.status === "archived";
            return {
              ...p,
              status: "draft",
              published: keep ? p.published : null,
              result: keep ? p.result : null,
              updated: now.toISOString(),
              history: withHistory(p, what("back to draft")),
            };
          }
          return {
            ...p,
            status: "archived",
            updated: now.toISOString(),
            history: withHistory(p, what("archived")),
          };
        });
      } catch (e) {
        toApiError(e);
      }
    }),

    /**
     * Manual results: only for a published post. All fields `null` clears the result again
     * (for example after a wrong entry).
     */
    route("PUT", "/api/posts/:id/result", async (c) => {
      const id = postId(c);
      const r = validate(ResultInputSchema, await c.readJson());
      try {
        return await updatePost(shared, id, null, (p) => {
          if (p.status !== "published") throw new ApiError(409, "Only a published post has results");
          const now = new Date().toISOString();
          const empty = r.impressions === null && r.comments === null && r.clicks === null;
          return {
            ...p,
            result: empty ? null : { ...r, on: now },
            updated: now,
            history: withHistory(p, { on: now, who: "", what: "result updated" }),
          };
        });
      } catch (e) {
        toApiError(e);
      }
    }),

    // -----------------------------------------------------------------------------------------
    // Campaigns, snippets and facts
    // -----------------------------------------------------------------------------------------
    ...listRoutes<Campaign>("campaigns", "/api/campaigns", CampaignInputSchema, {
      name: "campaign",
      runCheck: (input, lines, id) => {
        if (lines.some((r) => r.id !== id && r.utmCampaign === input.utmCampaign)) {
          throw new ApiError(409, `The UTM name "${String(input.utmCampaign)}" is already used by another campaign`);
        }
      },
      isProtected: async (id) => {
        const n = await usedIn("campaign", id);
        return n ? `This campaign belongs to ${n} post${n === 1 ? "" : "s"}; archive it instead of deleting it` : null;
      },
    }),
    ...listRoutes<Text>("snippets", "/api/snippets", SnippetInputSchema, { name: "text" }),
    ...listRoutes<Fact>("facts", "/api/facts", FactInputSchema, {
      name: "fact",
      isProtected: async (id) => {
        const n = await usedIn("facts", id);
        return n
          ? `This fact is in ${n} post${n === 1 ? "" : "s"}; set it to "withdrawn" instead of deleting it`
          : null;
      },
    }),

    // -----------------------------------------------------------------------------------------
    // Ideas: lighter than a post, no version check, a PUT replaces the whole idea.
    // -----------------------------------------------------------------------------------------
    ...listRoutes<Idea>("ideas", "/api/ideas", IdeaInputSchema, {
      name: "idea",
      runCheck: (input) => {
        if (input.template && !templateOf(String(input.template))) throw new ApiError(400, "Unknown template");
      },
    }),

    // Sample content: sample facts, snippets and posts about Postwright itself. Top-up only:
    // whatever is already there with exactly the same text (or the same title) stays as it is,
    // including a fact the user has withdrawn. Clicking twice therefore adds no duplicates.
    route("POST", "/api/sample-content", async () => {
      // Settings and brand first: if those are broken, nothing has been written yet.
      const settings = await loadSettings();
      const brand = await loadBrand(o.dataDir);
      const now = new Date().toISOString();
      const fill = <B extends { text: string }, T extends { id: string; text: string }>(
        list: "facts" | "snippets",
        source: readonly B[],
        create: (b: B) => T,
      ) =>
        updateList<T, number>(shared, list, (lines) => {
          const existing = new Set(lines.map((r) => r.text));
          const isNew = source.filter((b) => !existing.has(b.text)).map(create);
          if (lines.length + isNew.length > 500)
            throw new ApiError(409, `No more than 500 ${list} fit in the studio; clear some out first`);
          return { lines: [...lines, ...isNew], outcome: isNew.length };
        });
      const facts = await fill<SampleFact, Fact>("facts", SAMPLE_FACTS, (f) => ({
        ...f,
        validFrom: null,
        validUntil: null,
        status: "draft",
        id: newListId("facts"),
        created: now,
        updated: now,
      }));
      const snippets = await fill<SnippetInput, Text>("snippets", SAMPLE_SNIPPETS, (t) => ({
        ...t,
        id: newListId("snippets"),
        created: now,
        updated: now,
      }));
      const posts = await fillPosts(settings, brand);
      return { facts, snippets, posts };
    }),

    // -----------------------------------------------------------------------------------------
    // Settings and overview
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/settings", async () => loadSettings()),
    route("PUT", "/api/settings", async (c) => {
      const i = validate(SettingsSchema, await c.readJson());
      // Read first: a file that cannot be read is reported and not silently overwritten.
      await loadSettings();
      await saveSettingsFile(shared, i);
      return i;
    }),

    /** Counts for the studio's overview page. */
    route("GET", "/api/overview", async () => {
      const now = new Date();
      const today = localToday(now);
      const week = now.getTime() + 7 * 24 * 3600 * 1000;
      const monthBack = now.getTime() - 30 * 24 * 3600 * 1000;
      const [posts, facts, media, ideas, custom] = await Promise.all([
        listPosts(shared),
        readList<Fact>(shared, "facts"),
        listMedia(shared),
        readList<Idea>(shared, "ideas"),
        customMoments(),
      ]);
      const unusable = new Set(facts.filter((f) => factUnusable(f, today)).map((f) => f.id));
      const known = new Set(facts.map((f) => f.id));
      const time = (p: Post) => (p.scheduled ? new Date(p.scheduled).getTime() : Number.NaN);
      const scheduled = posts.filter((p) => p.status === "scheduled");
      const running = posts.filter((p) => p.status === "draft" || p.status === "scheduled");
      const postIds = new Set(posts.map((p) => p.id));
      const scheduledDays = scheduled
        .filter((p) => p.scheduled)
        .map((p) => localToday(new Date(p.scheduled as string)));
      return {
        scheduledThisWeek: scheduled.filter((p) => time(p) >= now.getTime() && time(p) <= week).length,
        overdue: scheduled.filter((p) => time(p) < now.getTime()).length,
        drafts: posts.filter((p) => p.status === "draft").length,
        published30: posts.filter(
          (p) => p.status === "published" && p.published && new Date(p.published.on).getTime() >= monthBack,
        ).length,
        // A fact that has been deleted or is no longer usable counts as a problem for every post
        // that still relies on it.
        withUnusableFact: running.filter((p) => p.facts.some((id) => unusable.has(id) || !known.has(id))).length,
        next: scheduled
          .filter((p) => time(p) >= now.getTime())
          .sort((a, b) => time(a) - time(b))
          .slice(0, 3)
          .map(summary),
        media: { count: media.length, bytes: media.reduce((s, m) => s + m.bytes, 0) },
        // Rhythm, moments and results.
        // An archived post keeps its publication: it did go out.
        lastPublished:
          posts
            .filter((p) => (p.status === "published" || p.status === "archived") && p.published)
            .map((p) => p.published!.on)
            .sort()
            .at(-1) ?? null,
        emptyWeeks: upcomingWeeks(today, 4).filter((w) => !scheduledDays.some((d) => d >= w.monday && d <= w.sunday)),
        // An open idea with a date in the past counts too: it has not been picked up yet, and the
        // planner shows it at the top as "Open ideas from earlier".
        openIdeas: ideas.filter((i) => !(i.post && postIds.has(i.post))).length,
        moments: allMoments(today, plusDays(today, 60), custom).slice(0, 5),
        results: resultsPerTemplate(posts, plusDays(today, -182)),
      };
    }),

    // -----------------------------------------------------------------------------------------
    // AI: the mode (live or sample), the writing help and suggesting ideas. The key appears in
    // no response. For the writing help the facts arrive only as ids: the server loads them
    // itself, so that no unproven claim can get into the task via the browser. Each suggestion
    // goes back with the numbers that appear in none of those facts; the editor does not let
    // such a suggestion be adopted.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/ai", () => aiMode(provider)),

    route("POST", "/api/writing-help", async (c) =>
      writingHelp(validate(WritingHelpRequestSchema, await c.readJson())),
    ),

    // Suggesting ideas. The browser sends only period, count, channel, campaign id and wish;
    // what the model sees is assembled by the server itself. The response goes back re-checked
    // and is not stored: only "Add to planner" turns it into ideas.
    route("POST", "/api/ideas/suggest", async (c) => {
      const v = validate(IdeasRequestSchema, await c.readJson());
      const today = localToday(new Date());
      if (v.to < today) throw new ApiError(400, "This period lies entirely in the past");
      const from = v.from < today ? today : v.from;
      // At most 92 days, from and to both counted: `to` is at most 91 days after `from`.
      if (plusDays(from, 91) < v.to) throw new ApiError(400, "Choose a period of at most three months");
      const [facts, posts, ideas, campaigns, custom] = await Promise.all([
        readList<Fact>(shared, "facts"),
        listPosts(shared),
        readList<Idea>(shared, "ideas"),
        readList<Campaign>(shared, "campaigns"),
        customMoments(),
      ]);
      const campaign = v.campaign ? (campaigns.find((k) => k.id === v.campaign) ?? null) : null;
      if (v.campaign && !campaign) throw new ApiError(400, "The chosen campaign no longer exists");
      const dayOf = (p: Post) =>
        p.status === "scheduled" && p.scheduled
          ? localToday(new Date(p.scheduled))
          : p.status === "published" && p.published
            ? localToday(new Date(p.published.on))
            : null;
      const inPeriod = (d: string | null) => d !== null && d >= from && d <= v.to;
      const prompt: IdeasPrompt = {
        from,
        to: v.to,
        count: v.count,
        channel: v.channel,
        note: v.note,
        templates: TEMPLATES.map((s) => ({ id: s.id, name: s.name, goal: s.goal })),
        facts: facts
          .filter((f) => !factUnusable(f, today))
          .slice(0, 60)
          .map((f) => ({ id: f.id, text: f.text, kind: f.kind })),
        // Also moments just after the period: a post shortly before can lead up to them.
        moments: allMoments(from, plusDays(v.to, 21), custom).map(({ key, date, title, sentence }) => ({
          key,
          date,
          title,
          sentence,
        })),
        existing: [
          ...posts
            .filter((p) => inPeriod(dayOf(p)))
            .map((p) => ({ date: dayOf(p) as string, title: p.title, kind: "post" as const })),
          ...ideas
            .filter((i) => inPeriod(i.date))
            .map((i) => ({ date: i.date, title: i.title, kind: "idea" as const })),
        ],
        campaign: campaign ? { name: campaign.name, goal: campaign.goal } : null,
        results: resultsPerTemplate(posts, plusDays(today, -182)),
        brand: {
          brandName: (await loadBrand(o.dataDir)).name,
          bannedWords: (await loadSettings()).bannedWords,
        },
      };
      const r = await aiHelp("The idea help", `ideas:${from}..${v.to}`, () => provider.suggestIdeas(prompt));
      return {
        suggestions: tidyIdeas(r.suggestion, prompt),
        model: r.model,
        from,
        sample: provider.name === "sample",
      };
    }),

    // -----------------------------------------------------------------------------------------
    // Calendar: the annual days plus the custom moments. By default the next 120 days.
    // -----------------------------------------------------------------------------------------
    route("GET", "/api/moments", async (c) => {
      const error = new ApiError(400, "from and to are dates (YYYY-MM-DD), from not after to");
      const from = c.url.searchParams.get("from") ?? localToday(new Date());
      // Validate `from` first: the default for `to` is calculated from it.
      if (!realDate(from)) throw error;
      const to = c.url.searchParams.get("to") ?? plusDays(from, 120);
      if (!realDate(to) || from > to) throw error;
      return { moments: allMoments(from, to, await customMoments()) };
    }),

    // Turn a moment into a draft fact. If a fact with exactly the same text already exists,
    // that one is returned: clicking twice does not create a duplicate fact. If that fact has
    // been withdrawn, 409: "Create post" would otherwise silently link it to a new post, and
    // creating a second fact with the same text would bypass the withdrawal.
    // The planner recognises the 404 text "Unknown moment" (ideas-ui.js); do not change it
    // casually.
    route("POST", "/api/moments/:key/fact", async (c) => {
      const m = await findMoment(c.params.key);
      if (!m) throw new ApiError(404, "Unknown moment");
      const text = `${m.title}: ${m.sentence}`;
      const now = new Date().toISOString();
      const { fact, isNew } = await updateList<Fact, { fact: Fact; isNew: boolean }>(shared, "facts", (lines) => {
        const already = lines.find((f) => f.text === text);
        if (already?.status === "withdrawn") {
          throw new ApiError(
            409,
            "The fact for this moment is withdrawn; set it back to draft in the Fact bank if you want to use it again",
          );
        }
        if (already) return { lines, outcome: { fact: already, isNew: false } };
        if (lines.length >= 500) throw new ApiError(409, "There are already 500 facts; clear some out first");
        const f: Fact = {
          id: newListId("facts"),
          text,
          kind: "external",
          source: { kind: "site", reference: `moment ${m.key}` },
          validFrom: null,
          validUntil: null,
          status: "draft",
          created: now,
          updated: now,
        };
        return { lines: [...lines, f], outcome: { fact: f, isNew: true } };
      });
      return response({ status: isNew ? 201 : 200, body: fact });
    }),

    // -----------------------------------------------------------------------------------------
    // Media
    // -----------------------------------------------------------------------------------------
    route(
      "POST",
      "/api/media",
      async (c) => {
        const content = await c.read(MAX_MEDIA_BYTES);
        if (!content.length) throw new ApiError(400, "No file was sent");
        const kind = mediaKind(content);
        if (!kind) throw new ApiError(400, "Only PNG, JPEG or WebP; an SVG or other file is not allowed here");
        const size = mediaDimensions(content, kind);
        if (!size || size.width < 1 || size.height < 1) throw new ApiError(400, "This image is unreadable or damaged");
        if (size.width > 8000 || size.height > 8000)
          throw new ApiError(400, "This image is larger than 8000 pixels; reduce it first");
        const id = await saveMedia(shared, content, kind);
        return response({ status: 201, body: { id, bytes: content.length, ...size } });
      },
      { rawBody: true },
    ),

    route("GET", "/api/media", async () => {
      const [media, posts] = await Promise.all([listMedia(shared), listPosts(shared)]);
      const usage = mediaUsage(posts);
      return { media: media.map((m) => ({ ...m, used: usage.get(m.id) ?? 0 })) };
    }),

    route("DELETE", "/api/media/:id", async (c) => {
      const id = c.params.id;
      if (!MEDIA_ID.test(id)) throw new ApiError(400, "Invalid media id");
      // Deliberate limitation: checking and deleting are two steps; with a single administrator,
      // a post that picks the image in exactly that gap is not a realistic scenario. A lock
      // across posts if more users come.
      const n = mediaUsage(await listPosts(shared)).get(id) ?? 0;
      if (n)
        throw new ApiError(
          409,
          `This image is in ${n} post${n === 1 ? "" : "s"} (archived ones count); remove it from there first`,
        );
      if (!(await deleteMedia(shared, id))) throw new ApiError(404, "Image not found");
      return { ok: true };
    }),

    route("GET", "/api/media/:id", async (c) => {
      const id = c.params.id;
      if (!MEDIA_ID.test(id)) throw new ApiError(400, "Invalid media id");
      const content = await readMedia(shared, id);
      if (!content) throw new ApiError(404, "Image not found");
      return response({
        contentType: MEDIA_CONTENT_TYPES[id.slice(id.lastIndexOf(".") + 1) as MediaKind],
        headers: {
          "content-security-policy": "default-src 'none'; sandbox",
          // Content-addressed: the same id is always the same file.
          "cache-control": "private, max-age=86400, immutable",
        },
        body: content,
      });
    }),
  ];
  // A file the user has broken comes back everywhere as a readable error with its name.
  return routes.map((r) => ({
    ...r,
    handler: async (c: Ctx) => {
      try {
        return await r.handler(c);
      } catch (e) {
        return toApiError(e);
      }
    },
  }));
}
