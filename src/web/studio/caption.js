// The caption per channel: counting, limits, hashtags and UTM links.
// Pure.
//
// The limits are those of the platforms themselves (checked on 24 September 2026). Where
// "see more" falls differs per screen; `fold` is therefore a guideline, not a limit.

export const CHANNEL_RULES = {
  linkedin: {
    name: "LinkedIn",
    maxCharacters: 3000,
    fold: 210,
    maxHashtags: null,
    place: "https://www.linkedin.com/feed/",
  },
  instagram: {
    name: "Instagram",
    maxCharacters: 2200,
    fold: 125,
    maxHashtags: 30,
    place: "https://www.instagram.com/",
  },
  x: {
    name: "X",
    maxCharacters: 280,
    fold: null,
    maxHashtags: null,
    linkCounts: 23,
    place: "https://x.com/compose/post",
  },
  facebook: {
    name: "Facebook",
    maxCharacters: 63206,
    fold: null,
    maxHashtags: null,
    place: "https://www.facebook.com/",
  },
};

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

/** Characters as a reader counts them: an emoji or a letter with an accent is one character. */
export function countCharacters(text) {
  const t = String(text ?? "");
  if (!segmenter) return [...t].length;
  let n = 0;
  for (const _ of segmenter.segment(t)) n++;
  return n;
}

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

// Punctuation directly after a link belongs to the sentence, not to the link.
const LINK_TAIL = /[.,;:!?)\]]+$/;

/**
 * Sets the utm_content parameter to `id` (the post id) in every link with utm_source.
 * Links without utm_source are left alone: the studio did not make those. The server calls
 * this on create, save and duplicate, so that a link inserted before the first Save, or a
 * link in a copy, also points to its own post.
 */
export function setUtmContent(text, id) {
  return String(text ?? "").replace(URL_PATTERN, (raw) => {
    const tail = raw.match(LINK_TAIL)?.[0] ?? "";
    const link = tail ? raw.slice(0, -tail.length) : raw;
    let u;
    try {
      u = new URL(link);
    } catch {
      return raw;
    }
    if (!u.searchParams.has("utm_source")) return raw;
    u.searchParams.set("utm_content", id);
    return `${u.toString()}${tail}`;
  });
}

/** The length as the channel counts it: on X every link counts as 23 characters. */
export function lengthFor(channel, text) {
  const lines = CHANNEL_RULES[channel];
  const t = String(text ?? "");
  if (!lines?.linkCounts) return countCharacters(t);
  return countCharacters(t.replace(URL_PATTERN, "")) + (t.match(URL_PATTERN) ?? []).length * lines.linkCounts;
}

/**
 * What comes before "see more", and what comes after. Without a fold everything is above
 * it.
 */
export function splitAtFold(channel, text) {
  const fold = CHANNEL_RULES[channel]?.fold;
  const t = String(text ?? "");
  if (!fold) return { above: t, below: "" };
  const characters = segmenter ? [...segmenter.segment(t)].map((s) => s.segment) : [...t];
  return { above: characters.slice(0, fold).join(""), below: characters.slice(fold).join("") };
}

const HASHTAG = /(?:^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]+)/gu;

/**
 * The hashtags in a text, with duplicates (case-insensitive) and truncated ones
 * (#word-word).
 */
export function hashtags(text) {
  const t = String(text ?? "");
  const list = [...t.matchAll(HASHTAG)].map((m) => m[1]);
  const seen = new Set();
  const duplicate = [];
  for (const h of list) {
    const k = h.toLocaleLowerCase("en");
    if (seen.has(k) && !duplicate.includes(h)) duplicate.push(h);
    seen.add(k);
  }
  const truncated = [...t.matchAll(/#([\p{L}\p{N}_]+[-'’.][\p{L}\p{N}]+)/gu)].map((m) => m[1]);
  return { list, duplicate, truncated };
}

/**
 * Sets the UTM parameters on an https link. Existing parameters and the #anchor stay; only
 * `utm_*` is overwritten. Returns null for anything that is not an https address: such a
 * link does not belong in a post (and `javascript:` certainly not).
 */
export function addUtm(link, { source, medium, campaign, content } = {}) {
  let u;
  try {
    u = new URL(String(link ?? "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const set = (name, value) => {
    if (value) u.searchParams.set(name, value);
    else u.searchParams.delete(name);
  };
  set("utm_source", source);
  set("utm_medium", medium);
  set("utm_campaign", campaign);
  set("utm_content", content);
  return u.toString();
}

/** The links in a text that have no utm_source. */
export function linksWithoutUtm(text) {
  return (String(text ?? "").match(URL_PATTERN) ?? []).filter((l) => !/[?&]utm_source=/.test(l));
}

/**
 * The findings about one caption: empty, too long, too many or odd hashtags, links without
 * UTM.
 * @returns {Array<{ level: "error" | "attention", code: string, text: string, channel: string }>}
 */
export function checkCaption(channel, text) {
  const r = CHANNEL_RULES[channel];
  if (!r) return [];
  const off = [];
  const t = String(text ?? "");
  if (!t.trim()) return [{ level: "attention", code: "caption-empty", text: `No caption for ${r.name}`, channel }];
  const length = lengthFor(channel, t);
  if (length > r.maxCharacters)
    off.push({
      level: "error",
      code: "caption-too-long",
      text: `The caption for ${r.name} is ${length} characters; ${r.name} allows ${r.maxCharacters} characters`,
      channel,
    });
  const h = hashtags(t);
  if (r.maxHashtags !== null && h.list.length > r.maxHashtags) {
    off.push({
      level: "error",
      code: "too-many-hashtags",
      text: `${h.list.length} hashtags for ${r.name}; at most ${r.maxHashtags}`,
      channel,
    });
  }
  for (const d of h.duplicate)
    off.push({
      level: "attention",
      code: "hashtag-duplicate",
      text: `#${d} appears more than once (${r.name})`,
      channel,
    });
  for (const a of h.truncated)
    off.push({
      level: "attention",
      code: "hashtag-truncated",
      text: `#${a} breaks at the punctuation mark; write it as one word (${r.name})`,
      channel,
    });
  for (const l of linksWithoutUtm(t))
    off.push({
      level: "attention",
      code: "link-without-utm",
      text: `Link without UTM in the caption for ${r.name}: ${l.length > 60 ? `${l.slice(0, 57)}…` : l}`,
      channel,
    });
  return off;
}
