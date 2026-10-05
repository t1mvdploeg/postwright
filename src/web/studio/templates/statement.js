// Statement: a single statement with a coloured phrase, on light, ink or accent; the
// ground is a field.
import { HEADLINE_SIZE, groundClass, headline, headlineClass, logoMode, ground, line, text } from "./fields.js";

export default {
  id: "statement",
  name: "Statement",
  goal: "One statement with a coloured phrase; for awareness.",
  kind: "image",
  formats: ["li-square", "li-portrait", "ig-square", "ig-portrait", "story", "wide"],
  fields: [
    ground("accent"),
    headline("On-brand posts, *without the design tool.*", 90),
    HEADLINE_SIZE,
    text("Pick a template, fill in the fields and export. Everything runs on your own computer.", 160),
    line("footerLeft", "Footer left", "Try it yourself"),
    line("footerRight", "Footer right", "", 40, { help: "Empty: the website of the brand." }),
    {
      id: "motif",
      label: "Route motif",
      kind: "choice",
      defaultValue: "enabled",
      options: [
        { value: "enabled", text: "Show" },
        { value: "off", text: "Hide" },
      ],
    },
  ],
  html(v, c) {
    return `<div class="image ${groundClass(v.ground)}">
  ${v.motif === "enabled" ? c.route() : ""}
  ${c.logo(logoMode(v.ground))}
  <main>
    <h1 class="${headlineClass(v.headlineSize, v.headline)}" data-field="headline">${c.t("headline")}</h1>
    ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
  </main>
  <footer class="footer" data-field="footer"><span>${c.e("footerLeft")}</span><strong>${c.footer("footerRight")}</strong></footer>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.text { margin-top: 4.4rem; }
.shape-landscape .image { padding: 6rem 7rem; }
.shape-landscape .headline { font-size: 7.6rem; }
.shape-landscape .headline.medium { font-size: 6.2rem; }
.shape-landscape .headline.small { font-size: 5rem; }
.shape-landscape .text { margin-top: 3rem; max-width: 48ch; font-size: 2.6rem; }
.shape-landscape main { margin-block: auto 4rem; }
.shape-landscape .footer { padding-top: 2.4rem; font-size: 2rem; }
`,
};
