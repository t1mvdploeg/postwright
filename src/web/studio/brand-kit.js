// Brand kit: the brand book of the project, and the place to create a new brand kit. Colours with
// contrast, logos, the route motif and the rules come from the active brand of the project
// (`brand.json` and the files next to it, see `src/server/brand.ts`).
import { el, icon, notice, projectHeaders } from "/ui.js";
import { asDataUri } from "/studio/brand.js";
import { fontFamilyName } from "/studio/templates.js";
import { slugOf } from "/studio/formats.js";
import { download } from "/studio/render.js";
import { colorsView, contrastView, logosView } from "/studio/brand-views.js";
import { createBlock } from "/studio/brand-create.js";
import { proposalBlock } from "/studio/brand-preview.js";

const FOLDER = "/brand";

/** An SVG as a PNG with the longest side at `side` pixels, transparent. */
async function svgToPng(path, side = 2048) {
  const img = new Image();
  img.src = path;
  await img.decode();
  const scale = side / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
  const c = document.createElement("canvas");
  c.width = Math.round((img.naturalWidth || side) * scale);
  c.height = Math.round((img.naturalHeight || side) * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) =>
    c.toBlob((b) => (b ? ok(b) : no(new Error("Making a PNG did not work in this browser"))), "image/png"),
  );
}

/** The route motif of the brand as a data URI; null when the brand has none. */
async function motifSource() {
  const r = await fetch(`${FOLDER}/motifs/route.svg`, { headers: projectHeaders() }).catch(() => null);
  return r?.ok ? asDataUri(new Blob([await r.arrayBuffer()], { type: "image/svg+xml" })) : null;
}

export async function show(container, ctx) {
  const m = ctx.brand;
  const motifUrl = await motifSource();
  if (!ctx.valid()) return;

  const logos = logosView(m, (mode, source) => {
    const isPng = source.startsWith("data:image/png");
    const name = `${slugOf(m.name)}-${mode}`;
    const row = [
      el("a", {
        class: "button-link small",
        href: source,
        download: `${name}.${isPng ? "png" : "svg"}`,
        text: isPng ? "PNG" : "SVG",
      }),
    ];
    if (!isPng) {
      const png = el("button", { type: "button", class: "secondary small", text: "PNG" });
      png.addEventListener("click", async () => {
        try {
          download(await svgToPng(source), `${name}.png`, "image/png");
        } catch (e) {
          notice(e.message, "error");
        }
      });
      row.push(png);
    }
    return el("div", { class: "button-row" }, row);
  });

  const proposal = proposalBlock(ctx);
  const create = createBlock(ctx, { onProposal: proposal.refresh });

  /** One row of the brand sheet: the title and a line on the left, the content on the right. */
  const row = (title, line, children) =>
    el("section", {}, [
      el("div", { class: "sheet-label" }, [el("h2", { text: title }), line ? el("p", { text: line }) : null]),
      ...children.filter(Boolean),
    ]);

  // The font of the brand, so the specimen is set in it (the face is a data URI already).
  const fontStyle = el("style", { text: m.fontCss });
  const family = fontFamilyName(m.font.family);
  const tone = ctx.settings.tone?.trim();

  container.replaceChildren(
    fontStyle,
    el(
      "div",
      { class: "sheet studio-brand-sheet" },
      [
        row("Identity", `${m.name}, brand version ${m.version}. The light logo goes on ink and accent.`, [
          el("div", { class: "studio-identity" }, [
            el("img", { src: m.logos.default, alt: `Logo of ${m.name}` }),
            el(
              "a",
              {
                class: "text-link",
                href: m.logos.default,
                download: `${slugOf(m.name)}-default.${m.logos.default.startsWith("data:image/png") ? "png" : "svg"}`,
              },
              ["Download ", icon("download")],
            ),
          ]),
          el("details", { class: "studio-more-logos" }, [
            el("summary", { text: `All ${Object.keys(m.logos).length} logo variants` }),
            el("p", {
              class: "help-text",
              text: "The single-colour modes leave the mark out, so a photo or an unusual colour shows through.",
            }),
            logos,
          ]),
        ]),
        row("Colours", "The palette of the brand, with what each colour is for.", [
          colorsView(m),
          el("h3", { text: "Contrast per ground (WCAG: headline 3:1, text 4.5:1)" }),
          contrastView(m),
        ]),
        row("Typography", `${family}, in every post.`, [
          el("div", { class: "studio-type-sample", style: `font-family: "${family}", sans-serif` }, [
            el("span", { text: "Clear words. Good intentions." }),
            el("p", { text: "Aa Bb Cc Dd Ee Ff Gg · 0123456789" }),
          ]),
        ]),
        row("Tone of voice", "A little guidance for the next caption.", [
          el("p", { class: tone ? "studio-tone" : "help-text", text: tone || "No tone of voice set yet." }),
          el("a", { class: "text-link", href: "#settings" }, ["Change it in Settings ", icon("arrow")]),
        ]),
        motifUrl
          ? row("Route motif", "A watermark, never in an accent colour.", [
              el("div", { class: "studio-file-grid" }, [
                el("figure", { class: "studio-file" }, [
                  el("div", { class: "studio-file-image ground-ink" }, [el("img", { src: motifUrl, alt: "" })]),
                  el("figcaption", { text: "route" }),
                  el("a", { class: "button-link small", href: motifUrl, download: "route.svg", text: "SVG" }),
                ]),
              ]),
            ])
          : null,
        row("Rules", "What every post keeps to.", [
          el(
            "ul",
            { class: "studio-lines" },
            [
              "Exactly one coloured phrase per headline.",
              "The light logo on ink and accent.",
              "Plain and calm, without exclamation marks.",
              "Every number comes from a linked fact with a source.",
              "The route is a watermark, never in an accent colour.",
            ].map((t) => el("li", { text: t })),
          ),
        ]),
      ].filter(Boolean),
    ),
    create,
    proposal.element,
  );
}
