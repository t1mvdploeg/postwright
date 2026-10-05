// Link preview (Open Graph, 1200×630): what LinkedIn and other platforms show for a shared
// link.
import { headline, text } from "./fields.js";

export default {
  id: "link-preview",
  name: "Link preview",
  goal: "The image for a shared link (og:image): headline, subtitle and logo.",
  kind: "image",
  formats: ["li-link"],
  fields: [
    headline("On-brand posts, *without the design tool.*", 50),
    text("Open source, and it runs on your own computer.", 70),
  ],
  html(v, c) {
    return `<div class="image">
  ${c.route()}
  ${c.logo("default")}
  <main>
    <h1 class="headline" data-field="headline">${c.t("headline")}</h1>
    ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
  </main>
</div>`;
  },
  css: `
.image { padding: 6rem 7rem; }
main { margin-top: auto; }
.headline { max-width: 17ch; font-size: 6.4rem; }
.text { margin-top: 2.6rem; max-width: 40ch; font-size: 2.4rem; }
`,
};
