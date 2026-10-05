// Exporting: one PNG, all formats as a ZIP, and a PDF for LinkedIn.
// Everything happens in the browser: no upload, no body limit, and what you download is
// what the preview showed.
import { buildImage } from "/studio/templates.js";
import { fileName, format as formatOf, slugOf, CHANNELS } from "/studio/formats.js";
import { download, renderToBlob } from "/studio/render.js";
import { createZip } from "/studio/zip.js";
import { createPdf } from "/studio/pdf.js";
import { loadMedia } from "/studio/brand.js";
import { imagesOf, imageTasks, isCarousel, mediaIdsOf, pdfFormat, slideNumber } from "/studio/slides.js";

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/** The caption per channel as a readable text file, for the ZIP. */
export function captionFile(post) {
  const sections = Object.entries(post.caption ?? {})
    .filter(([, t]) => t?.trim())
    .map(([k, t]) => `== ${CHANNELS[k] ?? k} ==\n${t.trim()}\n`);
  if (post.altText?.trim())
    sections.push(`== Alt text ==
${post.altText.trim()}\n`);
  return sections.join("\n") || "(No caption yet.)\n";
}

/**
 * All images of a post: per format, every slide.
 * @param {(step: number, total: number) => void} progress
 */
export async function allImages(post, brand, progress = () => {}) {
  const media = await loadMedia(mediaIdsOf(post));
  const tasks = imageTasks(post);
  const out = [];
  for (const [i, t] of tasks.entries()) {
    progress(i + 1, tasks.length);
    out.push({ format: t.format, slide: t.slide, image: buildImage({ ...t.image, format: t.format, brand, media }) });
  }
  return out;
}

/**
 * The start of the name of a zip or pdf: `<brand>_<campaign>_<post>`; empty parts are
 * dropped.
 */
const baseName = (brand, campaign, title, fallback) =>
  [slugOf(brand.name), slugOf(campaign), slugOf(title) || fallback].filter(Boolean).join("_");

const pdfName = (post, brand, campaign) =>
  isCarousel(post)
    ? `${baseName(brand, campaign, post.title, "carousel")}_carousel.pdf`
    : `${baseName(brand, campaign, post.title, "post")}_document.pdf`;

export async function exportPng(post, brand, key, slide, campaign) {
  const media = await loadMedia(mediaIdsOf(post));
  const image = buildImage({ ...imagesOf(post)[slide], format: key, brand, media });
  const name = fileName({
    brand: brand.name,
    campaign,
    post: post.title,
    format: key,
    slide: slideNumber(post, slide),
  });
  download(await renderToBlob(image), name, "image/png");
}

export async function exportZip(post, brand, campaign, progress) {
  const images = await allImages(post, brand, () => {});
  const files = [];
  for (const [i, b] of images.entries()) {
    progress?.(i + 1, images.length);
    files.push({
      name: fileName({ brand: brand.name, campaign, post: post.title, format: b.format, slide: b.slide }),
      bytes: await bytes(await renderToBlob(b.image)),
    });
  }
  if (pdfFormat(post))
    files.push({ name: pdfName(post, brand, campaign), bytes: await documentPdf(post, brand, () => {}) });
  files.push({ name: "caption.txt", bytes: captionFile(post) });
  const { history: _dropped, ...recipe } = post;
  files.push({ name: "recipe.json", bytes: `${JSON.stringify(recipe, null, 2)}\n` });
  download(createZip(files), `${baseName(brand, campaign, post.title, "post")}.zip`, "application/zip");
}

/** Every slide as a page of one PDF, in the format `pdfFormat` picks. */
async function documentPdf(post, brand, progress) {
  const key = pdfFormat(post);
  if (!key) throw new Error("This post has no LinkedIn format for a PDF");
  const media = await loadMedia(mediaIdsOf(post));
  const f = formatOf(key);
  const images = imagesOf(post);
  const pages = [];
  for (const [i, args] of images.entries()) {
    progress(i + 1, images.length);
    const image = buildImage({ ...args, format: key, brand, media });
    pages.push({ jpeg: await bytes(await renderToBlob(image, "image/jpeg", 0.92)), width: f.width, height: f.height });
  }
  return createPdf(pages, { title: post.title });
}

export async function exportPdf(post, brand, campaign, progress) {
  download(await documentPdf(post, brand, progress), pdfName(post, brand, campaign), "application/pdf");
}
