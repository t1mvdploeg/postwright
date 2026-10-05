// The proposal of a brand kit as the user sees it before anything changes: colours, contrast,
// logos, one sample post per ground, what goes to the settings, and the button that applies it.
import { confirmDialog, el, notice } from "/ui.js";
import { embedBrand } from "/studio/brand.js";
import { showPreview } from "/studio/render.js";
import { buildImage } from "/studio/templates.js";
import { colorsView, contrastView, logosView } from "/studio/brand-views.js";

const GROUNDS = [
  ["light", "Light"],
  ["ink", "Ink"],
  ["accent", "Accent"],
];

function samplePost(brand, ground) {
  const image = buildImage({
    template: "statement",
    content: {
      ground,
      headline: `On-brand posts, *in the style of ${brand.name}.*`,
      text: "A sample post in the proposed brand kit.",
      footerLeft: brand.name,
    },
    format: "li-square",
    brand,
  });
  const box = el("div", { class: "studio-preview" });
  // The preview scales to the width of its box, so it needs to be on the page first.
  requestAnimationFrame(() =>
    showPreview(box, image, { maxHeight: 260, label: `Sample post on the ${ground} ground` }),
  );
  return box;
}

export function proposalBlock(ctx) {
  const holder = el("section", { class: "card", id: "brand-proposal", hidden: "" });

  async function refresh() {
    let result;
    try {
      result = await ctx.api("/api/brand/proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    if (!ctx.valid()) return;
    if (result.state === "none") {
      holder.hidden = true;
      return;
    }
    holder.hidden = false;
    if (result.state === "invalid") {
      holder.replaceChildren(
        el("h2", { text: "Proposal" }),
        el("p", { class: "studio-warning", text: "This proposal cannot be used yet:" }),
        el(
          "ul",
          { class: "studio-lines" },
          result.problems.map((p) => el("li", { text: p })),
        ),
        el("p", { class: "help-text", text: "Fix the files and check again, or make a new proposal." }),
      );
      return;
    }
    let brand;
    try {
      brand = await embedBrand(result.brand, "/brand-proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    const { extras } = result;
    const settingsLines = [
      extras.tone ? `Tone: ${extras.tone}` : null,
      extras.bannedWords.length ? `Banned words added: ${extras.bannedWords.join(", ")}` : null,
      extras.hashtags ? `Hashtags added: ${extras.hashtags}` : null,
    ].filter(Boolean);
    const apply = el("button", { type: "button", text: "Use this brand kit" });
    apply.addEventListener("click", async () => {
      const ok = await confirmDialog(
        `The brand kit of this project becomes "${brand.name}". The current one is kept once, as brand-previous, and posts made with it are flagged by the brand check.`,
        { title: "Use this brand kit?", confirmText: "Use this brand kit" },
      );
      if (!ok) return;
      apply.disabled = true;
      try {
        await ctx.api("/api/brand/apply", { method: "POST", body: {} });
        notice("The brand kit is applied");
        location.reload();
      } catch (e) {
        notice(e.message, "error");
        apply.disabled = false;
      }
    });
    // `replaceChildren` would write a null as the text "null", so the optional parts are filtered out.
    holder.replaceChildren(
      ...[
        el("h2", { text: `Proposal: ${brand.name}` }),
        el("p", { class: "help-text", text: `Version ${brand.version}. Nothing has changed yet.` }),
        extras.notes.length
          ? el("div", {}, [
              el("h3", { text: "Good to know" }),
              el(
                "ul",
                { class: "studio-lines" },
                extras.notes.map((n) => el("li", { text: n })),
              ),
            ])
          : null,
        el("h3", { text: "Colours" }),
        colorsView(brand),
        el("h3", { text: "Contrast per ground" }),
        contrastView(brand),
        el("h3", { text: "Logos" }),
        logosView(brand),
        el("h3", { text: "One post per ground" }),
        el(
          "div",
          { class: "studio-proposal-posts" },
          GROUNDS.map(([ground, name]) =>
            el("figure", { class: "studio-file" }, [samplePost(brand, ground), el("figcaption", { text: name })]),
          ),
        ),
        settingsLines.length
          ? el("div", {}, [
              el("h3", { text: "Goes to the settings of this project" }),
              el(
                "ul",
                { class: "studio-lines" },
                settingsLines.map((t) => el("li", { text: t })),
              ),
            ])
          : null,
        el("div", { class: "button-row" }, [apply]),
      ].filter(Boolean),
    );
  }

  refresh();
  return { element: holder, refresh };
}
