// What the model decides when it makes a template, as a schema for structured output. The
// model fills in every key (an empty string or list means "not used"; a structured-output
// schema has no room for dozens of optional keys), and `answerToFile` drops the empty ones to
// get the shape of a template file. That is a change of format and nothing else: the result goes
// through `checkTemplate`, which refuses what is wrong and never repairs it.
//
// A tree of nodes is recursive, and a schema for structured output is not, so it is unrolled to
// the depth that `checkTemplate` allows (`LIMITS.depth`).
import { z } from "zod";
import {
  AS_VALUES,
  ICONS,
  LIMITS,
  PRESETS,
  SLIDE_KINDS,
  TAGS,
  type NodeDef,
  type TemplateProposal,
} from "../web/studio/own-template.js";
import type { FormatKey } from "../web/studio/formats.js";

const id = z.string().max(24);

const FieldAnswerSchema = z.strictObject({
  preset: z.enum(["", ...PRESETS]),
  id,
  label: z.string().max(LIMITS.label),
  kind: z.enum(["", "headline", "text", "line", "choice", "media"]),
  max: z.number().int().min(0).max(400),
  defaultValue: z.string().max(400),
  help: z.string().max(LIMITS.help),
  required: z.boolean(),
  options: z.array(z.strictObject({ value: z.string().max(31), text: z.string().max(30) })).max(LIMITS.options),
});
const FieldsSchema = z.array(FieldAnswerSchema).max(LIMITS.fields);

const leaves = [
  z.strictObject({ field: id, as: z.enum(AS_VALUES) }),
  z.strictObject({ literal: z.string().max(LIMITS.literal) }),
  z.strictObject({ slot: z.literal("logo") }),
  z.strictObject({ slot: z.literal("route") }),
  z.strictObject({ slot: z.literal("image"), field: id }),
  z.strictObject({ slot: z.literal("icon"), name: z.enum(ICONS) }),
] as const;

/** A node that may have `levels - 1` more levels below it. */
function nodeSchema(levels: number): z.ZodType {
  const element = {
    tag: z.enum(TAGS),
    classes: z.array(z.string().max(31)).max(LIMITS.classes),
    classFrom: id,
    headlineOf: id,
    dataField: id,
    showIf: id,
  };
  return z.union([
    z.strictObject(levels > 1 ? { ...element, children: z.array(nodeSchema(levels - 1)).max(LIMITS.nodes) } : element),
    ...leaves,
  ]);
}
const TreeSchema = z.array(nodeSchema(LIMITS.depth)).max(LIMITS.nodes);

const Common = {
  name: z.string().max(LIMITS.name),
  goal: z.string().max(LIMITS.goal),
  css: z.string().max(LIMITS.css),
};
const Notes = z.array(z.string().max(300)).max(10);

export const ImageAnswerSchema = z.strictObject({
  template: z.strictObject({ ...Common, fields: FieldsSchema, tree: TreeSchema }),
  notes: Notes,
});
export const CarouselAnswerSchema = z.strictObject({
  template: z.strictObject({
    ...Common,
    slides: z
      .array(
        z.strictObject({
          kind: z.enum(SLIDE_KINDS),
          name: z.string().max(LIMITS.slideName),
          fields: FieldsSchema,
          tree: TreeSchema,
        }),
      )
      .max(SLIDE_KINDS.length),
    defaultSlides: z
      .array(
        z.strictObject({
          kind: z.enum(SLIDE_KINDS),
          content: z.array(z.strictObject({ id, value: z.string().max(400) })).max(LIMITS.fields),
        }),
      )
      .max(LIMITS.maxSlides),
  }),
  notes: Notes,
});
/** The schema for the kind of template that is asked for. */
export const answerSchema = (kind: "image" | "carousel") =>
  kind === "image" ? ImageAnswerSchema : CarouselAnswerSchema;

type AnswerField = z.infer<typeof FieldAnswerSchema>;

function fieldToFile(f: AnswerField): unknown {
  if (f.preset) return f.defaultValue ? { preset: f.preset, defaultValue: f.defaultValue } : { preset: f.preset };
  const base = { id: f.id, label: f.label, kind: f.kind };
  const help = f.help ? { help: f.help } : {};
  switch (f.kind) {
    case "headline":
      return { ...base, max: f.max, defaultValue: f.defaultValue };
    case "text":
    case "line":
      return { ...base, max: f.max, defaultValue: f.defaultValue, ...help };
    case "choice":
      return { ...base, options: f.options, defaultValue: f.defaultValue };
    case "media":
      return { ...base, ...(f.required ? { required: true } : {}), ...help };
    default:
      return base; // an empty kind: checkTemplate refuses it and says so
  }
}

function nodeToFile(n: any): NodeDef {
  if (!("tag" in n)) return n; // a leaf already has the shape of the file
  const out: Record<string, unknown> = { tag: n.tag };
  if (n.classes.length) out.classes = n.classes;
  for (const k of ["classFrom", "headlineOf", "dataField", "showIf"]) if (n[k] !== "") out[k] = n[k];
  if (n.children?.length) out.children = n.children.map(nodeToFile);
  return out as NodeDef;
}

/** A model's answer as a template proposal (not yet checked). `kind` and `formats` are the user's choice, not the model's. */
export function answerToFile(
  answer: z.infer<typeof ImageAnswerSchema> | z.infer<typeof CarouselAnswerSchema>,
  kind: "image" | "carousel",
  formats: FormatKey[],
): unknown {
  const t: any = answer.template;
  const common = { version: 1, name: t.name, goal: t.goal, kind, formats, css: t.css };
  if (kind === "image") return { ...common, fields: t.fields.map(fieldToFile), tree: t.tree.map(nodeToFile) };
  return {
    ...common,
    slides: t.slides.map((s: any) => ({
      kind: s.kind,
      name: s.name,
      fields: s.fields.map(fieldToFile),
      tree: s.tree.map(nodeToFile),
    })),
    defaultSlides: t.defaultSlides.map((d: any) => ({
      kind: d.kind,
      content: Object.fromEntries(d.content.map((c: { id: string; value: string }) => [c.id, c.value])),
    })),
  };
}

export type { TemplateProposal };
