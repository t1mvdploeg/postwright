// Uitkomst: de tariefcompositie uit het voorbeelddossier met een kop eronder.
// Bron: uitkomst.html in de Mixed-kit.
import { kop } from "./velden.js";
import { compositie } from "./compositie.js";

export default {
  id: "uitkomst",
  naam: "Uitkomst",
  doel: "Het tarief uit het voorbeelddossier: van uitvraag naar uurtarief in één beeld.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand"],
  voorbeelddata: true,
  velden: [kop("Achter elk tarief een *helder verhaal.*", 60)],
  html(v, c) {
    return `${c.symbolen}<div class="beeld">
  <header class="kopregel">${c.logo("standaard")}<span class="voorbeeld" data-veld="label">Voorbeelddossier</span></header>
  <figure>
    ${compositie(c)}
  </figure>
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
</div>`;
  },
  css: `
figure { flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
/* De compositie schaalt mee met de ruimte die overblijft; 58em is haar hoogte. */
.compositie { font-size: min(1.32rem, (var(--hoogte) - 43rem) / 58); translate: 2rem 0; }
.kop { max-width: 17ch; }
`,
};
