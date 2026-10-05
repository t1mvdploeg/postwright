// Type declaration next to recipe.js (plain browser ESM, no build step).
import type { Slide, Template } from "./templates.js";

export interface Recipe {
  title: string;
  kind: "image" | "carousel";
  template: string;
  formats: string[];
  content: Record<string, string>;
  slides: Slide[];
  caption: Record<string, string>;
  altText: string;
  link: string;
  facts: string[];
  campaign: string | null;
  brandVersion: string;
}

export function localToday(now?: Date): string;
export function withOffset(local: string): string | null;
export function toLocal(iso: string): string;
export function readableMoment(iso: string): string;
export function newRecipe(id: string, options?: { enabledFormats?: string[]; brandVersion?: string }): Recipe;
export function toInput(
  post: Partial<Recipe>,
  s: Template,
  check: { errors: number; attention: number; on: string } | null,
): Recipe & { check: unknown };
export function moveSlide(slides: Slide[], index: number, direction: number): number;
export function ideaToRecipe(
  idea: { template: string; title: string; headline?: string; facts?: string[]; campaign?: string | null },
  options?: { enabledFormats?: string[]; brandVersion?: string },
): Recipe;
export function convert(
  post: Partial<Recipe> & { template: string; title: string },
  targetId: string,
  options?: { enabledFormats?: string[]; brandVersion?: string },
): Recipe;
