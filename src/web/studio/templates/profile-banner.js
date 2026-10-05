// LinkedIn profile background (1584×396). The profile photo overlaps the banner at the
// bottom left, so only the motif sits on the left. To the right of that, the brand large:
// the mark and the name in white with the full stop in the accent (set as *.* in the
// headline field).
import { headline, line } from "./fields.js";

export default {
  id: "profile-banner",
  name: "Profile banner",
  goal: "The banner of a personal LinkedIn profile.",
  kind: "image",
  formats: ["li-profile"],
  fields: [
    headline("Postwright*.*", 30),
    line("address", "Line below", "On-brand posts, without the design tool.", 60),
  ],
  html(v, c) {
    return `<div class="image ground-ink">
  ${c.route()}
  <span class="ring"></span>
  <div class="brand-rule">
    ${c.logo("mark-on-ink", "render")}
    <h1 class="headline" data-field="headline">${c.t("headline")}</h1>
  </div>
  ${c.empty("address") ? "" : `<p class="address" data-field="address">${c.e("address")}</p>`}
</div>`;
  },
  css: `
.image { justify-content: center; padding: 0 7rem 0 30rem; }
.route { width: 52rem; top: -12rem; left: -6rem; }
.ring { width: 34rem; top: -15rem; right: -9rem; }
.brand-rule { display: flex; align-items: center; gap: 3.2rem; }
.render { height: 11rem; width: auto; flex-shrink: 0; }
.headline { font-size: 8rem; font-weight: 630; line-height: 1; letter-spacing: -.035em; white-space: nowrap; }
.address { margin-top: 2rem; font-size: 2rem; font-weight: 500; color: var(--accent-pale); }
`,
};
