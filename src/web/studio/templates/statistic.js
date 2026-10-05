// Statistic: one big number with explanation and source.
// The source is always in the image: a number without origin does not belong here.
// The number must also be in a linked fact; the brand check verifies that.
import { groundClass, headline, logoMode, ground, line } from "./fields.js";

export default {
  id: "statistic",
  name: "Statistic",
  goal: "One number that matters, with explanation and source.",
  kind: "image",
  formats: ["li-square", "li-portrait", "ig-square", "ig-portrait", "story"],
  fields: [
    ground("ink"),
    line("number", "Number", "9", 14, { required: true, help: "Short: an amount, percentage or count." }),
    line("unit", "With the number", "templates", 40),
    headline("Ready to use, *easy to make your own.*", 70),
    line("source", "Source", "Source: Postwright", 90, {
      required: true,
      help: "Where the number comes from; shown small at the bottom of the image.",
    }),
  ],
  html(v, c) {
    return `<div class="image ${groundClass(v.ground)}">
  ${c.route()}
  ${c.logo(logoMode(v.ground))}
  <main>
    <p class="number amount" data-field="number">${c.e("number")}</p>
    ${c.empty("unit") ? "" : `<p class="unit" data-field="unit">${c.e("unit")}</p>`}
    <h1 class="headline small" data-field="headline">${c.t("headline")}</h1>
  </main>
  <footer class="footer" data-field="source"><span>${c.e("source")}</span><strong>${c.brandUrl}</strong></footer>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.number { font-size: 22rem; font-weight: 550; line-height: 1; letter-spacing: -.05em; color: var(--emphasis); }
.unit { margin-top: 1.6rem; font-size: 3.4rem; color: var(--soft); }
.headline { margin-top: 5rem; max-width: 18ch; }
.footer span { max-width: 60ch; }
.shape-story .number { font-size: 24rem; }
`,
};
