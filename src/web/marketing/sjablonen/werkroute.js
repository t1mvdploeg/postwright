// Werkroute: genummerde stappen die een lijn verbindt; de volgorde draagt betekenis.
// Stap 4 is optioneel.
import { kop, regel } from "./velden.js";

const STAPPEN = [
  ["Pick a template", "Start from a statement, a number, a route or a carousel."],
  ["Fill in the fields", "Write the headline and the text; the preview updates as you type."],
  ["Check and export", "The brand check runs first. Then export PNG, PDF or ZIP."],
  ["", ""],
];

export default {
  id: "werkroute",
  naam: "Werkroute",
  doel: "Drie of vier stappen van de werkwijze, genummerd en verbonden.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "story"],
  velden: [
    kop("From template to *finished post.*", 50),
    ...STAPPEN.flatMap(([titel, uitleg], i) => [
      regel(
        `stap${i + 1}`,
        `Stap ${i + 1}`,
        titel,
        40,
        i < 3 ? { verplicht: true } : { hulp: "Laat leeg voor drie stappen." },
      ),
      regel(`stap${i + 1}Tekst`, `Uitleg bij stap ${i + 1}`, uitleg, 110),
    ]),
  ],
  html(v, c) {
    const stappen = [1, 2, 3, 4]
      .filter((n) => !c.leeg(`stap${n}`))
      .map(
        (n, i) =>
          `<li><span class="routenummer">${String(i + 1).padStart(2, "0")}</span><div><h2 data-veld="stap${n}">${c.e(`stap${n}`)}</h2>${c.leeg(`stap${n}Tekst`) ? "" : `<p data-veld="stap${n}Tekst">${c.e(`stap${n}Tekst`)}</p>`}</div></li>`,
      );
    return `<div class="beeld grond-inkt">
  ${c.logo("op-inkt")}
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  <ol class="werkroute">${stappen.join("")}</ol>
</div>`;
  },
  css: `
.kop { margin-top: auto; padding-top: 5rem; }
.werkroute { margin-top: 4rem; }
.vorm-staand .kop.klein, .vorm-story .kop.klein { font-size: 8.4rem; }
.vorm-staand .werkroute li, .vorm-story .werkroute li { padding-block: 3.4rem; }
.vorm-staand .werkroute h2, .vorm-story .werkroute h2 { font-size: 3.6rem; }
.vorm-staand .werkroute p, .vorm-story .werkroute p { font-size: 2.7rem; }
.vorm-staand .werkroute li:not(:last-child)::before, .vorm-story .werkroute li:not(:last-child)::before { top: 10rem; bottom: -3.4rem; }
.vorm-story .kop { margin-top: 6rem; }
`,
};
