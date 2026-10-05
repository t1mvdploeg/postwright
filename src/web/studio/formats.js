// All formats and channels in one place. Platforms change their
// dimensions; then this is the only file that has to change. Pure (no DOM), so that vitest
// tests it in Node.

/** Channels for which the studio has a caption. */
export const CHANNELS = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
};

/**
 * The formats. `safeZones` are parts of the image where the platform itself puts something
 * over it (the profile photo, the buttons of a story); no text may go there. Coordinates
 * in pixels of the image itself.
 */
export const FORMATS = [
  {
    key: "li-square",
    name: "LinkedIn square",
    channel: "linkedin",
    width: 1200,
    height: 1200,
    safeZones: [],
  },
  { key: "li-portrait", name: "LinkedIn portrait", channel: "linkedin", width: 1080, height: 1350, safeZones: [] },
  {
    key: "li-carousel",
    name: "LinkedIn carousel (PDF)",
    channel: "linkedin",
    width: 1080,
    height: 1350,
    safeZones: [],
    carousel: true,
  },
  { key: "li-link", name: "Link preview", channel: "linkedin", width: 1200, height: 630, safeZones: [] },
  // The profile photo overlaps the background at the bottom left; the left side therefore
  // stays clear.
  {
    key: "li-profile",
    name: "LinkedIn profile banner",
    channel: "linkedin",
    width: 1584,
    height: 396,
    safeZones: [{ x: 0, y: 0, width: 420, height: 396, reason: "profile-photo" }],
  },
  // The company logo overlaps the cover at the bottom left.
  {
    key: "li-company",
    name: "LinkedIn company cover",
    channel: "linkedin",
    width: 1128,
    height: 191,
    safeZones: [{ x: 0, y: 60, width: 260, height: 131, reason: "company-logo" }],
  },
  {
    key: "ig-square",
    name: "Instagram square",
    channel: "instagram",
    width: 1080,
    height: 1080,
    safeZones: [],
  },
  {
    key: "ig-portrait",
    name: "Instagram portrait",
    channel: "instagram",
    width: 1080,
    height: 1350,
    safeZones: [],
  },
  // 250 px free at the top and bottom for the platform's controls.
  {
    key: "story",
    name: "Story",
    channel: "instagram",
    width: 1080,
    height: 1920,
    safeZones: [
      { x: 0, y: 0, width: 1080, height: 250, reason: "controls at the top" },
      { x: 0, y: 1670, width: 1080, height: 250, reason: "controls at the bottom" },
    ],
  },
  { key: "wide", name: "Landscape (X, Facebook, blog)", channel: "x", width: 1600, height: 900, safeZones: [] },
];

const BY_KEY = new Map(FORMATS.map((f) => [f.key, f]));

/** The format for a key; throws on an unknown key (a bug in the code, not input). */
export function format(key) {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`Unknown format: ${key}`);
  return f;
}

/**
 * The shape of a format, for a template's layout. Media queries on the aspect ratio are
 * unreliable in a foreignObject and a scaled iframe, so the studio sets the shape as a
 * class (`shape-portrait`) on the image.
 */
export function shapeOf(f) {
  const r = f.width / f.height;
  if (r >= 2.5) return "banner";
  if (r > 1.2) return "landscape";
  if (r >= 0.95) return "square";
  if (r > 0.65) return "portrait";
  return "story";
}

/** A text as a piece of file name: lower case, without accents, only a-z, 0-9 and hyphens. */
export function slugOf(text, max = 40) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * One fixed shape for file names, so that a folder of downloads is sorted automatically:
 * `<brandName>_<campaign>_<post>_<format>_<w>x<h>[_slide-NN].<ext>`. An empty brand name or
 * campaign is dropped.
 */
export function fileName({ brand = "", campaign = "", post = "", format: key, slide = null, extension = "png" }) {
  const f = format(key);
  const share = [slugOf(brand), slugOf(campaign), slugOf(post) || "post", key, `${f.width}x${f.height}`];
  if (slide !== null) share.push(`slide-${String(slide).padStart(2, "0")}`);
  return `${share.filter(Boolean).join("_")}.${extension}`;
}

/**
 * The channels a post belongs to: those of its formats plus those for which it has a
 * caption.
 */
export function channelsOf(post) {
  const off = new Set((post.formats ?? []).map((f) => BY_KEY.get(f)?.channel).filter(Boolean));
  for (const [k, t] of Object.entries(post.caption ?? {})) if (String(t ?? "").trim()) off.add(k);
  return [...off];
}

/** Whether rectangle a touches rectangle b (tolerance in pixels). */
export function overlaps(a, b, tolerance = 0) {
  return (
    a.x < b.x + b.width - tolerance &&
    b.x < a.x + a.width - tolerance &&
    a.y < b.y + b.height - tolerance &&
    b.y < a.y + a.height - tolerance
  );
}
