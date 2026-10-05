// LinkedIn company cover (1128×191), light with the chain or on accent with the logo.
// LinkedIn's company logo overlaps the cover at the bottom left; the content is on the
// right.
import { headline, line } from "./fields.js";

export default {
  id: "company-cover",
  name: "Company cover",
  goal: "The cover of the LinkedIn company page.",
  kind: "image",
  formats: ["li-company"],
  fields: [
    {
      id: "variant",
      label: "Variant",
      kind: "choice",
      defaultValue: "light",
      options: [
        { value: "light", text: "Light, with the chain" },
        { value: "accent", text: "Accent, with the logo" },
      ],
    },
    headline("On-brand posts, *without the design tool.*", 45),
    line("chain1", "Chain 1", "Pick a template", 22, { help: "Light variant only." }),
    line("chain2", "Chain 2", "Fill in the fields", 22),
    line("chain3", "Chain 3", "Check your brand", 22),
    line("chain4", "Chain 4 (filled)", "Export and schedule", 24),
  ],
  html(v, c) {
    if (v.variant === "accent") {
      return `<div class="image ground-accent variant-accent">
  ${c.route()}
  ${c.logo("on-accent", "cover-logo")}
  <span class="separator" aria-hidden="true"></span>
  <h1 class="headline" data-field="headline">${c.t("headline")}</h1>
</div>`;
    }
    const chain = [1, 2, 3]
      .filter((n) => !c.empty(`chain${n}`))
      .map((n) => `<span>${c.e(`chain${n}`)}</span><i></i>`)
      .join("");
    return `<div class="image variant-light">
  ${c.route()}
  <div class="content">
    <h1 class="headline" data-field="headline">${c.t("headline")}</h1>
    <p class="chain" data-field="chain">${chain}<strong>${c.e("chain4")}</strong></p>
  </div>
</div>`;
  },
  css: `
.variant-light { justify-content: center; align-items: flex-end; padding: 0 5rem; }
.route { width: 46rem; top: -9rem; left: -2rem; }
.variant-light .headline { font-size: 3.9rem; white-space: nowrap; }
.chain { margin-top: 2.2rem; font-size: 1.5rem; gap: 1rem; }
.chain > span::before, .chain > strong::before { width: 1rem; height: 1rem; border-width: .17rem; }
.chain > i { height: .15rem; }
.variant-accent { flex-direction: row; align-items: center; justify-content: flex-end; gap: 4.4rem; padding: 0 7rem; }
.cover-logo { height: 4.2rem; width: auto; }
.separator { width: .15rem; height: 8.6rem; background: var(--hairline); }
.variant-accent .headline { font-size: 4.2rem; line-height: 1.08; }
`,
};
