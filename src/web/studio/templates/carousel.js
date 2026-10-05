// Carousel: a document post of several slides (1080×1350), as PNGs and as a PDF.
// Three slide kinds: a cover, steps (with an illustration of your choice) and a closing
// slide. The studio works out the step chain itself from the order; LinkedIn already
// counts the pages itself.
import { groundClass, logoMode, ground, line } from "./fields.js";

const headlineField = (defaultValue) => ({
  id: "headline",
  label: "Headline",
  kind: "headline",
  required: true,
  emphasis: "exactly-one",
  max: 70,
  defaultValue,
  help: "Put exactly one phrase between *asterisks*; it gets the accent colour.",
});
const textField = (defaultValue, max = 220) => ({ id: "text", label: "Text", kind: "text", max, defaultValue });

/** The illustrations for a step slide. */
export const ILLUSTRATIONS = {
  checklist: { text: "Checklist" },
  none: { text: "No illustration" },
};

function illustration(kind, v, c) {
  if (kind !== "checklist") return "";
  const lines = [1, 2, 3]
    .filter((n) => !c.empty(`tick${n}`))
    .map((n) => `<li data-field="tick${n}">${c.icon("tick")}${c.e(`tick${n}`)}</li>`)
    .join("");
  return `<ul class="paper checklist">${lines}</ul>`;
}

function stepChain(c) {
  const d = c.slide;
  if (!d || d.steps < 2 || d.step < 1) return "";
  const nodes = Array.from({ length: d.steps }, (_, i) => `<i${i + 1 === d.step ? ' class="now"' : ""}></i>`).join(
    "<b></b>",
  );
  return `<span class="step-chain" role="img" aria-label="Step ${d.step} of ${d.steps}">${nodes}</span>`;
}

const COVER = {
  kind: "cover",
  name: "Cover",
  counts: false,
  fields: [
    ground("ink", ["ink", "accent"]),
    headlineField("On-brand posts, *without the design tool.*"),
    textField("A quick tour of Postwright in four steps.", 140),
    line("footerLeft", "Footer left", "Open source, runs on your computer.", 50),
  ],
  html(v, c) {
    return `${c.symbols}<section class="image slide ${groundClass(v.ground)}">
  ${c.route()}
  ${c.logo(logoMode(v.ground))}
  <main>
    <h1 class="headline" data-field="headline">${c.t("headline")}</h1>
    ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
  </main>
  <footer class="footer" data-field="footer"><span>${c.e("footerLeft")}</span><span>Swipe${c.icon("arrow")}</span></footer>
</section>`;
  },
};

const STEP = {
  kind: "step",
  name: "Step",
  counts: true,
  fields: [
    ground("light", ["light", "accent"]),
    {
      id: "illustration",
      label: "Illustration",
      kind: "choice",
      defaultValue: "checklist",
      options: Object.entries(ILLUSTRATIONS).map(([value, i]) => ({ value, text: i.text })),
    },
    headlineField("Explain one *step.*"),
    textField("One idea per slide keeps the post easy to read."),
    line("tick1", "Tick 1", "First point", 34, { help: "Only with the illustration Checklist." }),
    line("tick2", "Tick 2", "Second point", 34),
    line("tick3", "Tick 3", "Third point", 34),
  ],
  html(v, c) {
    const long = String(v.text ?? "").length > 150 ? " long" : "";
    const ill = illustration(v.illustration, v, c);
    return `${c.symbols}<section class="image slide ${groundClass(v.ground)}">
  <header class="headline-row">${c.logo(logoMode(v.ground))}${stepChain(c)}</header>
  ${ill ? `<figure class="ill-${v.illustration}">${ill}</figure>` : '<div class="space"></div>'}
  <h2 class="headline small" data-field="headline">${c.t("headline")}</h2>
  ${c.empty("text") ? "" : `<p class="text${long}" data-field="text">${c.t("text")}</p>`}
</section>`;
  },
};

const CLOSING = {
  kind: "closing",
  name: "Closing",
  counts: false,
  fields: [
    ground("accent", ["accent", "ink"]),
    headlineField("Make your first *post.*"),
    textField("Postwright is open source and runs on your own computer.", 140),
    line("footerLeft", "Footer left", "Try it yourself"),
    line("footerRight", "Footer right", "", 40, { help: "Empty: the website of the brand." }),
  ],
  html(v, c) {
    return `<section class="image slide ${groundClass(v.ground)}">
  ${c.route()}
  ${c.logo(logoMode(v.ground))}
  <main>
    <h2 class="headline" data-field="headline">${c.t("headline")}</h2>
    ${c.empty("text") ? "" : `<p class="text" data-field="text">${c.t("text")}</p>`}
  </main>
  <footer class="footer" data-field="footer"><span>${c.e("footerLeft")}</span><strong>${c.footer("footerRight")}</strong></footer>
</section>`;
  },
};

export default {
  id: "carousel",
  name: "Carousel",
  goal: "A document post of several slides: cover, steps and a closing slide.",
  kind: "carousel",
  formats: ["li-carousel"],
  fields: [],
  slides: [COVER, STEP, CLOSING],
  maxSlides: 20,
  /** The six slides of a new carousel: cover, four steps and a closing slide. */
  defaultSlides: [
    {
      kind: "cover",
      content: {
        ground: "ink",
        headline: "On-brand posts, *without the design tool.*",
        text: "A quick tour of Postwright in four steps.",
        footerLeft: "Open source, runs on your computer.",
      },
    },
    {
      kind: "step",
      content: {
        ground: "light",
        illustration: "checklist",
        headline: "Pick a *template.*",
        text: "Start from one of the templates and make it yours.",
        tick1: "Statements and questions",
        tick2: "Statistics and steps",
        tick3: "Carousels and LinkedIn banners",
      },
    },
    {
      kind: "step",
      content: {
        ground: "light",
        illustration: "none",
        headline: "Fill in the *fields.*",
        text: "Write the headline and the text. The preview updates as you type.",
      },
    },
    {
      kind: "step",
      content: {
        ground: "light",
        illustration: "checklist",
        headline: "Check against your *brand kit.*",
        text: "The brand check runs before a post can be scheduled.",
        tick1: "One coloured phrase per headline",
        tick2: "Contrast on the chosen background",
        tick3: "Every number backed by a fact",
      },
    },
    {
      kind: "step",
      content: {
        ground: "light",
        illustration: "none",
        headline: "*Export* and schedule.",
        text: "Download PNG, PDF or ZIP, and plan the post in the calendar.",
      },
    },
    {
      kind: "closing",
      content: {
        ground: "accent",
        headline: "Make your first *post.*",
        text: "Postwright is open source and runs on your own computer.",
        footerLeft: "Try it yourself",
        footerRight: "",
      },
    },
  ],
  css: `
main { margin-block: auto 7rem; }
main .text { margin-top: 4.4rem; }
.slide figure { flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
.slide .space { flex: 1; }
.slide > .headline { margin-top: 2rem; }
.slide > .text { margin-top: 2.6rem; }
.slide > .text.long { max-width: 42ch; font-size: 2.7rem; }
.footer .icon { width: 3rem; height: 3rem; color: var(--emphasis); }
.footer span:has(.icon) { display: inline-flex; align-items: center; gap: 1.6rem; }
/* Checklist: a list of ticks on a sheet. */
.ill-checklist .paper { width: 84rem; transform: rotate(-2.5deg); }
.ground-accent .paper { box-shadow: 0 5.2rem 8.2rem -3.7rem rgb(43 17 11 / .5); }
`,
};
