// Brand kit: the brand book of the project, and the place to create a new brand kit. Colours with
// contrast, logos, the route motif and the rules come from the active brand of the project
// (`brand.json` and the files next to it, see `src/server/brand.ts`).
import { el, notice, projectHeaders } from "/ui.js";
import { asDataUri } from "/studio/brand.js";
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

  const motifCard = motifUrl
    ? el("section", { class: "card" }, [
        el("h2", { text: "Route motif" }),
        el("div", { class: "studio-file-grid" }, [
          el("figure", { class: "studio-file" }, [
            el("div", { class: "studio-file-image ground-ink" }, [el("img", { src: motifUrl, alt: "" })]),
            el("figcaption", { text: "route" }),
            el("a", { class: "button-link small", href: motifUrl, download: "route.svg", text: "SVG" }),
          ]),
        ]),
      ])
    : null;

  const proposal = proposalBlock(ctx);
  const create = createBlock(ctx, { onProposal: proposal.refresh });

  container.replaceChildren(
    ...[
      el("section", { class: "page-intro" }, [
        el("div", {}, [
          el("p", { class: "intro-label", text: `Brand version ${m.version}` }),
          el("p", {
            text: `The brand this project works from: ${m.name}. Create a new brand kit below, or put your own brand.json and files in the brand folder of this project.`,
          }),
        ]),
      ]),
      create,
      proposal.element,
      el("section", { class: "card" }, [
        el("h2", { text: "Colours" }),
        colorsView(m),
        el("h3", { text: "Contrast per ground (WCAG: headline 3:1, text 4.5:1)" }),
        contrastView(m),
      ]),
      el("section", { class: "card" }, [
        el("h2", { text: "Logos" }),
        el("p", {
          class: "help-text",
          text: "On ink and accent, the light version. The single-colour modes leave the mark out, so a photo or an unusual colour shows through.",
        }),
        logos,
      ]),
      motifCard,
      el("section", { class: "card" }, [
        el("h2", { text: "Rules" }),
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
  );
}
