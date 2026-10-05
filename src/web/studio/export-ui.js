// Exporting: one PNG, all formats as a ZIP, and a carousel as a PDF.
// Everything happens in the browser: no upload, no body limit, and what you download is
// what the preview showed.
import { buildImage, imageCount } from "/studio/templates.js";
import { fileName, format as formatOf, slugOf, CHANNELS } from "/studio/formats.js";
import { download, renderToBlob } from "/studio/render.js";
import { createZip } from "/studio/zip.js";
import { createPdf } from "/studio/pdf.js";
import { loadMedia } from "/studio/brand.js";

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function mediaIds(post) {
  const all = [post.content ?? {}, ...(post.slides ?? []).map((d) => d.content ?? {})];
  return all.flatMap((i) => Object.values(i)).filter((v) => /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(v));
}

/** The caption per channel as a readable text file, for the ZIP. */
export function captionFile(post) {
  const share = Object.entries(post.caption ?? {})
    .filter(([, t]) => t?.trim())
    .map(([k, t]) => `== ${CHANNELS[k] ?? k} ==\n${t.trim()}\n`);
  if (post.altText?.trim())
    share.push(`== Alt text ==
${post.altText.trim()}\n`);
  return share.join("\n") || "(No caption yet.)\n";
}

/**
 * All images of a post: per format, and for a carousel per slide.
 * @param {(step: number, total: number) => void} progress
 */
export async function allImages(post, s, brand, progress = () => {}) {
  const media = await loadMedia(mediaIds(post));
  const tasks = post.formats.flatMap((f) =>
    Array.from({ length: imageCount(s, post.slides ?? []) }, (_, slide) => ({ f, slide })),
  );
  const off = [];
  for (const [i, t] of tasks.entries()) {
    progress(i + 1, tasks.length);
    const image = buildImage({
      template: s.id,
      content: post.content,
      slides: post.slides,
      slide: t.slide,
      format: t.f,
      brand,
      media,
    });
    off.push({ ...t, image });
  }
  return off;
}

/**
 * The start of the name of a zip or pdf: `<brand>_<campaign>_<post>`; empty parts are
 * dropped.
 */
const baseName = (brand, campaign, title, fallback) =>
  [slugOf(brand.name), slugOf(campaign), slugOf(title) || fallback].filter(Boolean).join("_");

export async function exportPng(post, s, brand, key, slide, campaign) {
  const media = await loadMedia(mediaIds(post));
  const image = buildImage({
    template: s.id,
    content: post.content,
    slides: post.slides,
    slide,
    format: key,
    brand,
    media,
  });
  const name = fileName({
    brand: brand.name,
    campaign,
    post: post.title,
    format: key,
    slide: s.kind === "carousel" ? slide + 1 : null,
  });
  download(await renderToBlob(image), name, "image/png");
}

export async function exportZip(post, s, brand, campaign, progress) {
  const images = await allImages(post, s, brand, () => {});
  const files = [];
  for (const [i, b] of images.entries()) {
    progress?.(i + 1, images.length);
    files.push({
      name: fileName({
        brand: brand.name,
        campaign,
        post: post.title,
        format: b.f,
        slide: s.kind === "carousel" ? b.slide + 1 : null,
      }),
      bytes: await bytes(await renderToBlob(b.image)),
    });
  }
  if (s.kind === "carousel") {
    const pdf = await carouselPdf(post, s, brand, () => {});
    files.push({ name: `${baseName(brand, campaign, post.title, "carousel")}_carousel.pdf`, bytes: pdf });
  }
  files.push({ name: "caption.txt", bytes: captionFile(post) });
  const { history: _dropped, ...recipe } = post;
  files.push({ name: "recipe.json", bytes: `${JSON.stringify(recipe, null, 2)}\n` });
  const name = `${baseName(brand, campaign, post.title, "post")}.zip`;
  download(createZip(files), name, "application/zip");
}

async function carouselPdf(post, s, brand, progress) {
  const media = await loadMedia(mediaIds(post));
  const f = formatOf("li-carousel");
  const pages = [];
  const count = imageCount(s, post.slides ?? []);
  for (let slide = 0; slide < count; slide++) {
    progress(slide + 1, count);
    const image = buildImage({ template: s.id, slides: post.slides, slide, format: "li-carousel", brand, media });
    pages.push({
      jpeg: await bytes(await renderToBlob(image, "image/jpeg", 0.92)),
      width: f.width,
      height: f.height,
    });
  }
  return createPdf(pages, { title: post.title });
}

export async function exportPdf(post, s, brand, campaign, progress) {
  const pdf = await carouselPdf(post, s, brand, progress);
  download(pdf, `${baseName(brand, campaign, post.title, "carousel")}_carousel.pdf`, "application/pdf");
}
