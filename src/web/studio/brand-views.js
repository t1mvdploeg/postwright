// The building blocks of a brand kit page: colours, contrast per ground and the logos. Used
// for the brand of the project and for a proposal.
import { el } from "/ui.js";
import { contrastOn } from "/studio/color.js";

/** Which ground a logo variant belongs on, derived from the variant's name. */
export function groundFor(mode) {
  if (/on-ink|^white$/.test(mode)) return "ink";
  if (/on-accent/.test(mode)) return "accent";
  return "light";
}

export function colorsView(m) {
  return el(
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
}

export function contrastView(m) {
  return el("div", { class: "table-scroll" }, [
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
}

/**
 * The logos of an embedded brand (every logo is a data URI already). `extra(mode, source)` may
 * return buttons or links to put under a logo.
 */
export function logosView(m, extra = () => null) {
  return el(
    "div",
    { class: "studio-file-grid" },
    Object.entries(m.logos).map(([mode, source]) =>
      el("figure", { class: "studio-file" }, [
        el("div", { class: `studio-file-image ground-${groundFor(mode)}` }, [el("img", { src: source, alt: "" })]),
        el("figcaption", { text: mode }),
        extra(mode, source),
      ]),
    ),
  );
}
