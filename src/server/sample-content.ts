// The sample content for a new user: facts and snippets about Postwright itself, and three
// sample posts. The route `POST /api/sample-content` adds them; whatever is already there
// stays as it is. Facts come in as drafts: the user reviews them and sets them to active.
import { TEMPLATES } from "../web/studio/templates.js";
import type { FactInput, SnippetInput } from "./schema.js";

export type SampleFact = Pick<FactInput, "text" | "kind" | "source">;

const site = (reference: string) => ({ kind: "site" as const, reference });

export const SAMPLE_FACTS: SampleFact[] = [
  { kind: "product", text: `Postwright ships with ${TEMPLATES.length} post templates.`, source: site("README.md") },
  { kind: "product", text: "Postwright exports PNG, PDF and ZIP in the browser.", source: site("README.md") },
  { kind: "product", text: "Postwright runs on your own computer. There is no account.", source: site("README.md") },
  { kind: "product", text: "Postwright is open source under the MIT licence.", source: site("LICENSE") },
  {
    kind: "product",
    text: "Every post is checked against your brand kit before it can be scheduled.",
    source: site("README.md"),
  },
];

export const SAMPLE_SNIPPETS: SnippetInput[] = [
  { kind: "closer", name: "Call to action", text: "Try it yourself: two commands and you are making posts." },
  { kind: "closer", name: "Sign-off", text: "Made with Postwright." },
];

/**
 * A sample post. `fact`: the text of a sample fact the post is linked to.
 * `inDays`: scheduled that many days ahead; otherwise a draft.
 */
export interface SamplePost {
  title: string;
  template: string;
  content: Record<string, string>;
  caption: string;
  altText: string;
  fact?: string;
  inDays?: number;
}

export const SAMPLE_POSTS: SamplePost[] = [
  {
    title: "Example: no account needed",
    template: "statement",
    content: {
      ground: "accent",
      headline: "Your posts. *Your computer.*",
      text: "Postwright runs locally. There is no account.",
      footerLeft: "Try it yourself",
      footerRight: "Postwright",
      motif: "show",
    },
    caption: "Postwright runs on your own computer. There is no account.",
    altText: "Statement: Your posts. Your computer.",
  },
  {
    title: "Example: templates out of the box",
    template: "statistic",
    content: {
      ground: "ink",
      number: String(TEMPLATES.length),
      unit: "post templates",
      headline: "Ready to use, *out of the box.*",
      source: "Source: README",
    },
    caption: SAMPLE_FACTS[0].text,
    altText: `The number ${TEMPLATES.length}: post templates that ship with Postwright.`,
    fact: SAMPLE_FACTS[0].text,
  },
  {
    title: "Example: from idea to scheduled post",
    template: "steps",
    content: {
      headline: "From idea to *scheduled post.*",
      step1: "Pick a template",
      step1Text: "Start from a statement, a statistic or steps.",
      step2: "Write your post",
      step2Text: "Fill in the fields and add a caption per channel.",
      step3: "Check against your brand kit",
      step3Text: "The brand check runs before you can schedule.",
      step4: "",
      step4Text: "",
    },
    caption: "From idea to scheduled post in three steps.",
    altText: "Three steps: pick a template, write your post, check it against your brand kit.",
    inDays: 7,
  },
];
