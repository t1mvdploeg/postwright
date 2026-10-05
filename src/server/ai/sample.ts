// The sample provider: predictable answers without a model, for those without an API key.
// Every text is recognisable as a sample ("Sample ..."), uses only text from the facts it
// is given and costs nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { workdays } from "../ideas.js";
import type { FormatKey } from "../../web/studio/formats.js";
import type { TemplateProposal } from "../../web/studio/own-template.js";
import { EMPTY_USAGE, type AiProvider } from "./provider.js";

const MODEL = "sample";

export const sampleProvider: AiProvider = {
  name: "sample",

  async writeText(prompt) {
    const begin = Date.now();
    const fact = prompt.facts[0];
    const variants = [0, 1, 2].map((i) => ({
      fields:
        prompt.task === "fields"
          ? prompt.fields.map((v) => {
              if (v.emphasis) return { id: v.id, text: `Sample *headline ${i + 1}*` };
              const text = fact ? fact.text : `Sample text ${i + 1} for ${v.label.toLowerCase()}.`;
              return { id: v.id, text: v.max ? text.slice(0, v.max) : text };
            })
          : [],
      caption: prompt.task === "caption" ? `Sample caption ${i + 1}${fact ? `: ${fact.text}` : "."}` : "",
      altText: prompt.task === "alt-text" ? `Sample alt text ${i + 1} for the ${prompt.template} image.` : "",
      usedFacts: fact ? [fact.id] : [],
    }));
    return { suggestion: { variants }, model: MODEL, usage: EMPTY_USAGE, durationMs: Date.now() - begin };
  },

  async suggestIdeas(o) {
    const begin = Date.now();
    const days = workdays(o.from, o.to);
    const ideas = Array.from({ length: o.count }, (_, i) => {
      const m = i === 0 ? o.moments[0] : undefined;
      return {
        date: days.length ? days[Math.floor((i * days.length) / o.count)] : o.from,
        title: m ? m.title : `Sample idea ${i + 1}`,
        note: m ? m.sentence : "Sample answer, made without a model to try out the planner.",
        template: o.templates[i % Math.max(1, o.templates.length)]?.id ?? "",
        headline: `Sample *headline ${i + 1}*`,
        facts: o.facts[0] ? [o.facts[0].id] : [],
        moment: m ? m.key : "",
      };
    });
    return { suggestion: { ideas }, model: MODEL, usage: EMPTY_USAGE, durationMs: Date.now() - begin };
  },
};

const EXAMPLE = JSON.parse(readFileSync(fileURLToPath(new URL("../template-example.json", import.meta.url)), "utf8"));

/**
 * The template that route A returns without an API key: the worked example under the name
 * "Sample template", as a single image or as a carousel. It costs nothing and is not part of
 * `AiProvider`: that interface serves the writing tasks, route A uses the brand client.
 */
export function sampleTemplate(
  kind: "image" | "carousel",
  formats: FormatKey[],
): { template: TemplateProposal; notes: string[] } {
  const common = {
    version: 1 as const,
    name: "Sample template",
    goal: "A fixed sample, made without a model.",
    css: EXAMPLE.css,
  };
  const notes = [
    "Made without a model: this is a fixed sample. Set ANTHROPIC_API_KEY to generate from your own material.",
  ];
  if (kind === "image") {
    return { template: { ...common, kind, formats, fields: EXAMPLE.fields, tree: EXAMPLE.tree }, notes };
  }
  const slide = (k: string, name: string) => ({ kind: k, name, fields: EXAMPLE.fields, tree: EXAMPLE.tree });
  const sample = (k: string, headline: string) => ({ kind: k, content: { headline } });
  return {
    template: {
      ...common,
      kind,
      formats: ["li-carousel"],
      slides: [slide("cover", "Cover"), slide("content", "Step"), slide("closing", "Closing")],
      defaultSlides: [
        sample("cover", "A sample *carousel.*"),
        sample("content", "A first *step.*"),
        sample("content", "A second *step.*"),
        sample("closing", "A sample *ending.*"),
      ],
    } as TemplateProposal,
    notes,
  };
}
