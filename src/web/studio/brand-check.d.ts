// Type declaration next to brand-check.js (plain browser ESM, no build step).
import type { Template, Slide, Brand } from "./templates.js";
import type { Finding } from "./caption.js";
import type { Page } from "./slides.js";

export interface CheckPost {
  template: string;
  formats: string[];
  content: Record<string, string>;
  slides?: Slide[];
  moreSlides?: Page[];
  caption?: Record<string, string>;
  altText?: string;
  link?: string;
  facts?: string[];
  brandVersion?: string;
}
export interface CheckFact {
  id: string;
  text: string;
  kind?: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
}
export interface Overflow {
  format: string;
  slide?: number | null;
  field: string;
  fieldId?: string | null;
  kind: "outside-image" | "overlap" | "safe-zone";
  reason?: string;
  with?: string;
}

export function containsWord(text: unknown, word: unknown): boolean;
export function textsOf(
  post: CheckPost,
  s: Template,
): Array<{ where: string; field: string | null; slide: number | null; channel?: string; text: string }>;
export function factUsable(f: CheckFact, today: string): boolean;
export function runCheck(input: {
  post: CheckPost;
  template: Template;
  settings: { channels: string[]; bannedWords: string[] };
  facts?: CheckFact[] | null;
  today: string;
  brandVersion?: string | null;
  brand?: Pick<Brand, "grounds"> | null;
  overflow?: Overflow[];
}): { findings: Finding[]; errors: number; attention: number };
export function titleFrom(post: CheckPost, s: Template): string;
