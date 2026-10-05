// Product image: a screenshot of the tool on a paper layer, with headline and text.
// New in the studio, built from the templates' building blocks (.paper, the shadow, the
// grounds).
import { groundClass, headline, logoMode, ground, text } from "./fields.js";

export default {
  id: "product-image",
  name: "Product image",
  goal: "A screenshot of the tool in the house style, with a headline and explanation.",
  kind: "image",
  formats: ["li-square", "li-portrait", "ig-square", "ig-portrait", "wide"],
  fields: [
    ground("light"),
    {
      id: "image",
      label: "Screenshot",
      kind: "media",
      required: true,
      defaultValue: "",
      help: "PNG, JPEG or WebP.",
    },
    headline("What you see is *what you export.*", 70),
    text("The preview and the exported files come from the same template.", 130),
  ],
  html(v, c) {
    const source = c.media("image");
    const screenView = source
      ? `<img class="screen-view" src="${source}" alt="">`
      : '<div class="screen-view empty">Choose a screenshot</div>';
    return `<div class="image ${groundClass(v.ground)}">
  ${c.logo(logoMode(v.ground))}
  <figure><div class="paper">${screenView}</div></figure>
  <h1 class="headline small" data-field="headline">${c.t("headline")}</h1>
  ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
</div>`;
  },
  css: `
figure { flex: 1; display: grid; place-items: center; margin: 3rem 0 5rem; min-height: 0; }
.paper { max-width: 100%; max-height: 100%; padding: 1.2rem; transform: rotate(-2deg); }
.screen-view { display: block; max-width: 86rem; max-height: calc(var(--height) - 52rem); width: auto; height: auto; border-radius: 1rem; }
.screen-view.empty { display: grid; place-items: center; width: 80rem; height: 45rem; border: .3rem dashed var(--stroke); color: var(--muted); font-size: 3rem; }
.text { margin-top: 2.4rem; }
.shape-landscape .image { padding: 6rem 7rem; display: grid; grid-template-columns: 1fr 1.25fr; grid-template-rows: auto 1fr auto; column-gap: 6rem; }
.shape-landscape .logo { grid-column: 1 / -1; }
.shape-landscape figure { grid-column: 2; grid-row: 2 / 4; margin: 0; }
.shape-landscape .headline { grid-column: 1; grid-row: 2; align-self: end; font-size: 5.6rem; }
.shape-landscape .text { grid-column: 1; grid-row: 3; font-size: 2.4rem; }
.shape-landscape .screen-view { max-width: 62rem; max-height: 44rem; }
`,
};
