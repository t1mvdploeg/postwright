// Question and answer: a frequently asked question with a short answer, on a light ground.
import { headline, text } from "./fields.js";

export default {
  id: "question",
  name: "Question and answer",
  goal: "A frequently asked question with a short answer.",
  kind: "image",
  formats: ["li-square", "li-portrait", "ig-square", "ig-portrait"],
  fields: [
    headline("Do I need an account *to use Postwright?*", 70),
    text("No. Postwright runs on your own computer and there is no account.", 190),
  ],
  html(v, c) {
    return `<div class="image">
  ${c.logo("default")}
  <main>
    <h1 class="headline medium" data-field="headline">${c.t("headline")}</h1>
    ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
  </main>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.text { margin-top: 4.4rem; max-width: 36ch; }
.shape-portrait .headline.medium { font-size: 9.2rem; }
.shape-portrait .text { font-size: 3.4rem; }
`,
};
