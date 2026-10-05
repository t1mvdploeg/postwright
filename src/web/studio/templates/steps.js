// Steps: numbered steps joined by a line; the order carries meaning.
// Step 4 is optional.
import { headline, line } from "./fields.js";

const STEPS = [
  ["Pick a template", "Start from a statement, a statistic, steps or a carousel."],
  ["Fill in the fields", "Write the headline and the text; the preview updates as you type."],
  ["Check and export", "The brand check runs first. Then export PNG, PDF or ZIP."],
  ["", ""],
];

export default {
  id: "steps",
  name: "Steps",
  goal: "Three or four steps of the way of working, numbered and connected.",
  kind: "image",
  formats: ["li-square", "li-portrait", "ig-square", "ig-portrait", "story"],
  fields: [
    headline("From template to *finished post.*", 50),
    ...STEPS.flatMap(([title, explanation], i) => [
      line(
        `step${i + 1}`,
        `Step ${i + 1}`,
        title,
        40,
        i < 3 ? { required: true } : { help: "Leave empty for three steps." },
      ),
      line(`step${i + 1}Text`, `Explanation for step ${i + 1}`, explanation, 110),
    ]),
  ],
  html(v, c) {
    const steps = [1, 2, 3, 4]
      .filter((n) => !c.empty(`step${n}`))
      .map(
        (n, i) =>
          `<li><span class="route-number">${String(i + 1).padStart(2, "0")}</span><div><h2 data-field="step${n}">${c.e(`step${n}`)}</h2>${c.empty(`step${n}Text`) ? "" : `<p data-field="step${n}Text">${c.e(`step${n}Text`)}</p>`}</div></li>`,
      );
    return `<div class="image ground-ink">
  ${c.logo("on-ink")}
  <h1 class="headline small" data-field="headline">${c.t("headline")}</h1>
  <ol class="steps">${steps.join("")}</ol>
</div>`;
  },
  css: `
.headline { margin-top: auto; padding-top: 5rem; }
.steps { margin-top: 4rem; }
.shape-portrait .headline.small, .shape-story .headline.small { font-size: 8.4rem; }
.shape-portrait .steps li, .shape-story .steps li { padding-block: 3.4rem; }
.shape-portrait .steps h2, .shape-story .steps h2 { font-size: 3.6rem; }
.shape-portrait .steps p, .shape-story .steps p { font-size: 2.7rem; }
.shape-portrait .steps li:not(:last-child)::before, .shape-story .steps li:not(:last-child)::before { top: 10rem; bottom: -3.4rem; }
.shape-story .headline { margin-top: 6rem; }
`,
};
