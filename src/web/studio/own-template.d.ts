// Type declaration next to own-template.js (plain browser ESM, no build step).
import type { FormatKey } from "./formats.js";
import type { Field, Template } from "./templates.js";

export const TAGS: readonly [
  "div",
  "section",
  "main",
  "header",
  "footer",
  "figure",
  "h1",
  "h2",
  "h3",
  "p",
  "span",
  "strong",
  "ul",
  "li",
];
export const AS_VALUES: readonly ["rich", "plain", "footer"];
export const ICONS: readonly ["arrow", "tick"];
export const PRESETS: readonly ["ground", "headlineSize"];
export const SLIDE_KINDS: readonly ["cover", "content", "closing"];
export const IMAGE_FORMATS: FormatKey[];
export const BRAND_VARIABLES: readonly string[];
export const ALLOWED_VARIABLES: readonly string[];
export const CSS_FUNCTIONS: readonly string[];
export const CSS_SELECTORS: readonly string[];
export const DENIED_PROPERTIES: readonly string[];
export const LIMITS: {
  name: number;
  goal: number;
  slideName: number;
  label: number;
  help: number;
  fields: number;
  options: number;
  depth: number;
  nodes: number;
  classes: number;
  literal: number;
  css: number;
  rules: number;
  file: number;
  templates: number;
  minSlides: number;
  maxSlides: number;
};

export type FieldDef =
  | { id: string; label: string; kind: "headline"; max: number; defaultValue: string }
  | { id: string; label: string; kind: "text" | "line"; max: number; defaultValue: string; help?: string }
  | { id: string; label: string; kind: "choice"; options: { value: string; text: string }[]; defaultValue: string }
  | { id: string; label: string; kind: "media"; required?: boolean; help?: string }
  | { preset: "ground" | "headlineSize"; defaultValue?: string };

export type NodeDef =
  | {
      tag: (typeof TAGS)[number];
      classes?: string[];
      classFrom?: string;
      headlineOf?: string;
      dataField?: string;
      showIf?: string;
      children?: NodeDef[];
    }
  | { field: string; as: (typeof AS_VALUES)[number] }
  | { literal: string }
  | { slot: "logo" }
  | { slot: "route" }
  | { slot: "image"; field: string }
  | { slot: "icon"; name: (typeof ICONS)[number] };

export interface SlideDef {
  kind: (typeof SLIDE_KINDS)[number];
  name: string;
  fields: FieldDef[];
  tree: NodeDef[];
}

/** A template as the model or an agent proposes it: no id, no created. */
export type TemplateProposal = {
  version: 1;
  name: string;
  goal: string;
  formats: FormatKey[];
  css: string;
} & (
  | { kind: "image"; fields: FieldDef[]; tree: NodeDef[] }
  | {
      kind: "carousel";
      slides: SlideDef[];
      defaultSlides: { kind: (typeof SLIDE_KINDS)[number]; content: Record<string, string> }[];
    }
);
/** A template as saved in `templates/<id>.json` of a project. */
export type TemplateFile = TemplateProposal & { id: string; created: string };

export function checkTemplate(
  raw: unknown,
  options?: { mode?: "proposal" | "saved" | "either" },
): { ok: true; template: TemplateProposal | TemplateFile } | { ok: false; problems: string[] };
export function compileTemplate(file: unknown): Template;
export function expandField(f: FieldDef): Field;
