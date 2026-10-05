// The example template and variants of it, as plain data that a test can break.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { message } from "./brand-ai.js";

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

/** Writes a saved template into the `templates/` folder of a project and returns its id. */
export function writeOwn(projectDir: string, template: any = exampleTemplate(), id = "own-0123abcd"): string {
  mkdirSync(join(projectDir, "templates"), { recursive: true });
  writeFileSync(join(projectDir, "templates", `${id}.json`), JSON.stringify(saved(template, id), null, 2));
  return id;
}

/** The reply of the model that holds a template: 100,000 tokens in and 10,000 out, which is $0.60 at Opus 5.5 prices. */
export const templateReply = (file: any = exampleTemplate(), notes: string[] = ["Based on the statements."]) =>
  message({ text: JSON.stringify(answerOf(file, notes)) });

/** Writes a proposal as an agent would: `template.json`, and `extras.json` when there are extras. */
export function writeTemplateProposal(projectDir: string, template: any = exampleTemplate(), extras?: unknown): string {
  const dir = join(projectDir, "template-input", "proposal");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "template.json"), JSON.stringify(template, null, 2));
  if (extras !== undefined) writeFileSync(join(dir, "extras.json"), JSON.stringify(extras, null, 2));
  return dir;
}
