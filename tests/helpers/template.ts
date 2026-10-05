// The example template and variants of it, as plain data that a test can break.
import { readFileSync } from "node:fs";

/** The worked example: a statement in tree form, as a proposal (no id, no created). */
export function exampleTemplate(): any {
  return JSON.parse(readFileSync("src/server/template-example.json", "utf8"));
}

/** The same fields and tree as a three-slide-kind carousel. */
export function carouselExample(): any {
  const e = exampleTemplate();
  const kind = (k: string, name: string) => ({ kind: k, name, fields: e.fields, tree: e.tree });
  return {
    version: 1,
    name: "Tour",
    goal: "A short tour in slides.",
    kind: "carousel",
    formats: ["li-carousel"],
    css: e.css,
    slides: [kind("cover", "Cover"), kind("content", "Step"), kind("closing", "Closing")],
    defaultSlides: [
      { kind: "cover", content: { headline: "Start *here.*" } },
      { kind: "content", content: { headline: "One *step.*" } },
      { kind: "content", content: { headline: "Another *step.*" } },
      { kind: "closing", content: { headline: "Try it *now.*" } },
    ],
  };
}

/** A proposal as a saved file. */
export const saved = (t: any, id = "own-0123abcd"): any => ({ ...t, id, created: "2026-10-05T10:00:00.000Z" });

const emptyField = {
  preset: "",
  id: "",
  label: "",
  kind: "",
  max: 0,
  defaultValue: "",
  help: "",
  required: false,
  options: [],
};
const emptyElement = { classes: [], classFrom: "", headlineOf: "", dataField: "", showIf: "" };

function nodeToAnswer(n: any): any {
  if (!("tag" in n)) return n;
  return { ...emptyElement, ...n, ...(n.children ? { children: n.children.map(nodeToAnswer) } : {}) };
}
/** A field of a template file as the model's answer writes it: every key present. */
export const fieldToAnswer = (f: any): any => ({ ...emptyField, ...f });

/** A template file as the structured answer of the model: every key present, empty where unused. */
export function answerOf(file: any, notes: string[] = []): any {
  const common = { name: file.name, goal: file.goal, css: file.css };
  if (file.kind === "image") {
    return {
      template: { ...common, fields: file.fields.map(fieldToAnswer), tree: file.tree.map(nodeToAnswer) },
      notes,
    };
  }
  return {
    template: {
      ...common,
      slides: file.slides.map((s: any) => ({
        kind: s.kind,
        name: s.name,
        fields: s.fields.map(fieldToAnswer),
        tree: s.tree.map(nodeToAnswer),
      })),
      defaultSlides: file.defaultSlides.map((d: any) => ({
        kind: d.kind,
        content: Object.entries(d.content).map(([id, value]) => ({ id, value })),
      })),
    },
    notes,
  };
}
