// The slides of a post. An image post has slide 1 in `template` and `content` and the rest in
// `moreSlides`, each slide with its own template; a carousel keeps its slides in `slides`, all
// on the carousel template. Everything that draws, checks or exports a post asks this module
// for its images. Pure, so that vitest and the server can use it.
import { template as templateOf, allTemplates, imageCount, defaultContent } from "./templates.js";

/** Instagram's maximum; LinkedIn documents allow more. */
export const MAX_SLIDES = 20;

const MEDIA_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

/** The LinkedIn feed formats a document post (PDF) can be made from, besides the carousel's own. */
const DOCUMENT_FORMATS = ["li-square", "li-portrait"];

export function isCarousel(post) {
  return post.kind === "carousel" || templateOf(post.template)?.kind === "carousel";
}

/** Every slide of an image post as `{ template, content }`: slide 1, then the extra slides. */
export function pagesOf(post) {
  return [{ template: post.template, content: post.content ?? {} }, ...(post.moreSlides ?? [])];
}

/** The other way round: the first page is the post's own template and content. */
export function fromPages(pages) {
  const [first, ...rest] = pages;
  return { template: first.template, content: first.content, moreSlides: rest };
}

/** Per image, the arguments for `buildImage` except format, brand and media. */
export function imagesOf(post) {
  if (isCarousel(post)) {
    const slides = post.slides ?? [];
    const s = templateOf(post.template);
    const count = s ? imageCount(s, slides) : Math.max(slides.length, 1);
    return Array.from({ length: count }, (_, slide) => ({ template: post.template, content: {}, slides, slide }));
  }
  return pagesOf(post).map((p, slide) => ({ template: p.template, content: p.content ?? {}, slide }));
}

/** The slide number in a file name (1-based), or null for a post that is one image. */
export function slideNumber(post, slide) {
  return isCarousel(post) || imagesOf(post).length > 1 ? slide + 1 : null;
}

/** Every image to export: per format, every slide. */
export function imageTasks(post) {
  const images = imagesOf(post);
  return post.formats.flatMap((format) =>
    images.map((image) => ({ format, slide: slideNumber(post, image.slide), image })),
  );
}

/** The format of the PDF for LinkedIn, or null when the post gets none. */
export function pdfFormat(post) {
  if (isCarousel(post)) return "li-carousel";
  if (pagesOf(post).length < 2) return null;
  return post.formats.find((f) => DOCUMENT_FORMATS.includes(f)) ?? null;
}

/** The formats every one of these templates has; a template that no longer exists is skipped. */
export function sharedFormats(templateIds) {
  const lists = templateIds.map((id) => templateOf(id)?.formats).filter(Boolean);
  if (!lists.length) return [];
  return lists[0].filter((f) => lists.every((l) => l.includes(f)));
}

/** The templates a slide can have: image templates with at least one of these formats. */
export function slideTemplates(formats) {
  return allTemplates().filter((s) => s.kind !== "carousel" && s.formats.some((f) => formats.includes(f)));
}

/** The formats left when a slide with this template joins, and the ones that drop out. */
export function narrowFormats(formats, templateId) {
  const own = templateOf(templateId)?.formats ?? [];
  return { formats: formats.filter((f) => own.includes(f)), dropped: formats.filter((f) => !own.includes(f)) };
}

/**
 * Values that fit in `fields`: same id, a choice only as an option, an image only as a
 * media id.
 */
export function takeOver(source, fields, target) {
  for (const v of fields) {
    const w = source?.[v.id];
    if (typeof w !== "string" || !w.trim()) continue;
    if (v.kind === "choice" && !v.options.some((o) => o.value === w)) continue;
    if (v.kind === "media" && !MEDIA_ID.test(w)) continue;
    target[v.id] = w;
  }
}

/** A slide in another template, keeping the values that fit. */
export function changeSlideTemplate(page, targetId) {
  const target = templateOf(targetId);
  if (!target) throw new Error(`Unknown template: ${targetId}`);
  const content = defaultContent(target);
  takeOver(page.content, target.fields, content);
  return { template: target.id, content };
}

/** Every uploaded image a post uses, in slide 1, carousel slides and extra slides. */
export function mediaIdsOf(post) {
  return [post.content, ...(post.slides ?? []).map((d) => d.content), ...(post.moreSlides ?? []).map((d) => d.content)]
    .flatMap((i) => Object.values(i ?? {}))
    .filter((v) => MEDIA_ID.test(v));
}
