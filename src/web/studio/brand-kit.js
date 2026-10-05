// Brand kit: the brand book in the tool. Colours with contrast, logos
// (SVG and PNG), the route motif and the rules. Everything comes from the active brand
// (`brand.json` and the files next to it, see `src/server/brand.ts`).
import { el, notice, projectHeaders } from "/ui.js";
import { asDataUri } from "/studio/brand.js";
import { contrastOn } from "/studio/color.js";
import { slugOf } from "/studio/formats.js";
import { download } from "/studio/render.js";

const FOLDER = "/brand";

/** Which ground a logo variant belongs on, derived from the variant's name. */
function groundFor(mode) {
  if (/on-ink|^white$/.test(mode)) return "ink";
  if (/on-accent/.test(mode)) return "accent";
  return "light";
}

/** The route motif of the brand as a data URI; null when the brand has none. */
async function motifSource() {
  const r = await fetch(`${FOLDER}/motifs/route.svg`, { headers: projectHeaders() }).catch(() => null);
  return r?.ok ? asDataUri(new Blob([await r.arrayBuffer()], { type: "image/svg+xml" })) : null;
}

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

export async function show(container, ctx) {
  const m = ctx.brand;
  const colors = el(
    "div",
    { class: "studio-colors" },
    m.colors.map((k) =>
      el("div", { class: "studio-color" }, [
        el("span", { class: "studio-swatch", style: `background:${k.hex}` }),
        el("b", { text: k.name }),
        el("code", { text: k.hex }),
        el("span", { class: "help-text", text: k.usage }),
      ]),
    ),
  );
  const contrast = el("div", { class: "table-scroll" }, [
    el("table", { class: "list" }, [
      el("thead", {}, [
        el(
          "tr",
          {},
          ["Ground", "Text on the ground"].map((t) => el("th", { scope: "col", text: t })),
        ),
      ]),
      el(
        "tbody",
        {},
        Object.keys(m.grounds).map((g) => {
          const c = contrastOn(m, g);
          return el("tr", {}, [
            el("td", { text: { light: "Light", ink: "Ink", accent: "Accent" }[g] ?? g }),
            el("td", { text: `${c.ratio}:1 ${c.ratio >= c.threshold ? "✓" : "✗"}` }),
          ]);
        }),
      ),
    ]),
  ]);

  const logos = el(
    "div",
    { class: "studio-file-grid" },
    // The loaded brand already has every logo as a data URL (see brand.js), so there is no
    // folder for it.
    Object.entries(m.logos).map(([mode, source]) => {
      const png = el("button", { type: "button", class: "secondary small", text: "PNG" });
      png.addEventListener("click", async () => {
        try {
          download(await svgToPng(source), `${slugOf(m.name)}-${mode}.png`, "image/png");
        } catch (e) {
          notice(e.message, "error");
        }
      });
      return el("figure", { class: "studio-file" }, [
        el("div", { class: `studio-file-image ground-${groundFor(mode)}` }, [el("img", { src: source, alt: "" })]),
        el("figcaption", { text: mode }),
        el("div", { class: "button-row" }, [
          el("a", { class: "button-link small", href: source, download: `${slugOf(m.name)}-${mode}.svg`, text: "SVG" }),
          png,
        ]),
      ]);
    }),
  );

  const motifUrl = await motifSource();
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

  container.replaceChildren(
    ...[
      el("section", { class: "page-intro" }, [
        el("div", {}, [
          el("p", { class: "intro-label", text: `Brand version ${m.version}` }),
          el("p", {
            text: `The brand the studio works from: ${m.name}. Put your own brand in data/projects/<slug>/brand/ (brand.json with the files next to it); the studio then uses that instead of this one.`,
          }),
        ]),
      ]),
      el("section", { class: "card" }, [
        el("h2", { text: "Colours" }),
        colors,
        el("h3", { text: "Contrast per ground (WCAG: headline 3:1, text 4.5:1)" }),
        contrast,
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
