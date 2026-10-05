// Type declaration next to templates.js (plain browser ESM, no build step).
import type { FormatKey, Format, Shape } from "./formats.js";

export interface ChoiceOption {
  value: string;
  text: string;
}
export interface Field {
  id: string;
  label: string;
  kind: "headline" | "text" | "line" | "choice" | "media";
  defaultValue?: string;
  max?: number;
  required?: boolean;
  emphasis?: "exactly-one";
  help?: string;
  options?: ChoiceOption[];
}

export interface TemplateContext {
  format: Format;
  shape: Shape;
  slide: { index: number; count: number; step: number; steps: number } | null;
  t(name: string): string;
  e(name: string): string;
  empty(name: string): boolean;
  footer(name: string): string;
  brandUrl: string;
  logoSource(mode: string): string;
  logo(mode: string, className?: string): string;
  media(name: string): string | null;
  icon(name: string): string;
  route(): string;
  symbols: string;
}

export interface SlideKind {
  kind: string;
  name: string;
  counts: boolean;
  fields: Field[];
  html(v: Record<string, string>, c: TemplateContext): string;
  css?: string;
}

export interface Slide {
  kind: string;
  content: Record<string, string>;
}

export interface Template {
  id: string;
  name: string;
  goal: string;
  kind: "image" | "carousel";
  formats: FormatKey[];
  fields: Field[];
  html(v: Record<string, string>, c: TemplateContext): string;
  css?: string;
  slides?: SlideKind[];
  defaultSlides?: Slide[];
  maxSlides?: number;
}

export interface Brand {
  version: string;
  name: string;
  url: string;
  font: { family: string };
  css: Record<string, string>;
  grounds: Record<"light" | "ink" | "accent", { background: string; text: string }>;
  logos: Record<string, string>;
  fontCss?: string;
}

export interface Image {
  html: string;
  css: string;
  width: number;
  height: number;
  shape: Shape;
  title: string;
}

export const TEMPLATES: Template[];
export function template(id: string): Template | null;
export function escapeHtml(text: unknown): string;
export function fontFamilyName(name: string): string;
export function countEmphasis(text: unknown): number;
export function withEmphasis(text: unknown): string;
export function withoutEmphasis(text: unknown): string;
export function emphasiseSelection(
  text: unknown,
  begin: number,
  end: number,
): { text: string; begin: number; end: number } | null;
export function remToPx(css: string, width: number): string;
export function defaultContent(s: Template, slideKind?: string | null): Record<string, string>;
export function fieldsOf(s: Template, slideKind?: string | null): Field[];
export function buildImage(o: {
  template: string;
  content?: Record<string, string>;
  slides?: Slide[];
  slide?: number;
  format: string;
  brand: Brand;
  media?: Record<string, string>;
}): Image;
export function imageCount(s: Template, slides: Slide[]): number;
