// Type declaration next to slides.js (plain browser ESM, no build step).
import type { Slide, Template } from "./templates.js";

export interface Page {
  template: string;
  content: Record<string, string>;
}
export interface PostSlides {
  kind?: "image" | "carousel";
  template: string;
  content?: Record<string, string>;
  slides?: Slide[];
  moreSlides?: Page[];
  formats?: string[];
}
export interface ImageArgs {
  template: string;
  content: Record<string, string>;
  slides?: Slide[];
  slide: number;
}

export const MAX_SLIDES: 20;
export function isCarousel(post: PostSlides): boolean;
export function pagesOf(post: PostSlides): Page[];
export function fromPages(pages: Page[]): { template: string; content: Record<string, string>; moreSlides: Page[] };
export function imagesOf(post: PostSlides): ImageArgs[];
export function slideNumber(post: PostSlides, slide: number): number | null;
export function imageTasks(
  post: PostSlides & { formats: string[] },
): { format: string; slide: number | null; image: ImageArgs }[];
export function pdfFormat(post: PostSlides & { formats: string[] }): string | null;
export function sharedFormats(templateIds: string[]): string[];
export function slideTemplates(formats: string[]): Template[];
export function narrowFormats(formats: string[], templateId: string): { formats: string[]; dropped: string[] };
export function takeOver(
  source: Record<string, string> | undefined,
  fields: Template["fields"],
  target: Record<string, string>,
): void;
export function changeSlideTemplate(page: Page, targetId: string): Page;
export function mediaIdsOf(post: PostSlides): string[];
