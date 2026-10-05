// Cijfer: één groot getal met uitleg en bron, bijvoorbeeld cao-nieuws uit de parameters.
// Nieuw in de studio. De bron staat altijd in beeld: een getal zonder herkomst hoort hier niet
// (ontwerpregel 4). Het getal moet ook in een gekoppeld feit staan; dat controleert de merkcontrole.
import { grondKlasse, kop, logoStand, ondergrond, regel } from "./velden.js";

export default {
  id: "cijfer",
  naam: "Cijfer",
  doel: "Eén getal dat ertoe doet, met uitleg en bron; voor cao-nieuws.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "story"],
  voorbeelddata: false,
  velden: [
    ondergrond("inkt"),
    regel("getal", "Getal", "€ 14,40", 14, { verplicht: true, hulp: "Kort: een bedrag, percentage of aantal." }),
    regel("eenheid", "Bij het getal", "bruto per uur", 40),
    kop("Het minimumloon per *1 juli 2026.*", 70),
    regel("bron", "Bron", "Bron: …", 90, { verplicht: true, hulp: "Waar het getal vandaan komt; staat klein onderin het beeld." }),
  ],
  html(v, c) {
    return `<div class="beeld ${grondKlasse(v.ondergrond)}">
  ${c.route()}
  ${c.logo(logoStand(v.ondergrond))}
  <main>
    <p class="getal bedrag" data-veld="getal">${c.e("getal")}</p>
    ${c.leeg("eenheid") ? "" : `<p class="eenheid" data-veld="eenheid">${c.e("eenheid")}</p>`}
    <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  </main>
  <footer class="voet" data-veld="bron"><span>${c.e("bron")}</span><strong>mijntarieftool.nl</strong></footer>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.getal { font-size: 22rem; font-weight: 550; line-height: 1; letter-spacing: -.05em; color: var(--nadruk); }
.eenheid { margin-top: 1.6rem; font-size: 3.4rem; color: var(--zacht); }
.kop { margin-top: 5rem; max-width: 18ch; }
.voet span { max-width: 60ch; }
.vorm-story .getal { font-size: 24rem; }
`,
};
