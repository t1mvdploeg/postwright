// Werkroute: genummerde stappen die een lijn verbindt; de volgorde draagt betekenis.
// Bron: werkroute.html in de Mixed-kit. Stap 4 is optioneel.
import { kop, regel } from "./velden.js";

const STAPPEN = [
  ["Lees de afspraken in", "Start met de uitvraag gelijkwaardige beloning van uw opdrachtgever."],
  ["Geef uw oordeel", "Beoordeel cao-afspraken, bronnen en openstaande aannames."],
  ["Leg de basis vast", "Bewaar de arbeidsvoorwaarden voor berekeningen én loonstrookcontrole."],
  ["Maak het tarief bespreekbaar", "Bewaar uw berekening als PDF of exporteer naar Salesforce met een ingestelde koppeling."],
];

export default {
  id: "werkroute",
  naam: "Werkroute",
  doel: "Drie of vier stappen van de werkwijze, genummerd en verbonden.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "story"],
  voorbeelddata: false,
  velden: [
    kop("Van uitvraag naar *tarief.*", 50),
    ...STAPPEN.flatMap(([titel, uitleg], i) => [
      regel(`stap${i + 1}`, `Stap ${i + 1}`, titel, 40, i < 3 ? { verplicht: true } : { hulp: "Laat leeg voor drie stappen." }),
      regel(`stap${i + 1}Tekst`, `Uitleg bij stap ${i + 1}`, uitleg, 110),
    ]),
  ],
  html(v, c) {
    const stappen = [1, 2, 3, 4].filter((n) => !c.leeg(`stap${n}`)).map((n, i) => `<li><span class="routenummer">${String(i + 1).padStart(2, "0")}</span><div><h2 data-veld="stap${n}">${c.e(`stap${n}`)}</h2>${c.leeg(`stap${n}Tekst`) ? "" : `<p data-veld="stap${n}Tekst">${c.e(`stap${n}Tekst`)}</p>`}</div></li>`);
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
