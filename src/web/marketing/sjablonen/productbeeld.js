// Productbeeld: een schermafbeelding van de tool op een papieren laag, met kop en tekst.
// Nieuw in de studio, opgebouwd uit de bouwstenen van de kit (.papier, de schaduw, de ondergronden).
// De schermafbeelding moet het voorbeelddossier tonen: dat bevestigt de beheerder bij het uploaden.
import { grondKlasse, kop, logoStand, ondergrond, tekst } from "./velden.js";

export default {
  id: "productbeeld",
  naam: "Productbeeld",
  doel: "Een schermafbeelding van de tool in de huisstijl, met kop en uitleg.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "breed"],
  voorbeelddata: true,
  velden: [
    ondergrond("licht"),
    { id: "beeld", label: "Schermafbeelding", soort: "media", verplicht: true, standaard: "", hulp: "PNG, JPEG of WebP, alleen met het voorbeelddossier of openbare informatie." },
    kop("Zie waar elk bedrag *vandaan komt.*", 70),
    tekst("Bronnen en aannames staan naast de berekening.", 130),
  ],
  html(v, c) {
    const bron = c.media("beeld");
    const schermbeeld = bron
      ? `<img class="schermbeeld" src="${bron}" alt="">`
      : '<div class="schermbeeld leeg">Kies een schermafbeelding</div>';
    return `<div class="beeld ${grondKlasse(v.ondergrond)}">
  <header class="kopregel">${c.logo(logoStand(v.ondergrond))}<span class="voorbeeld" data-veld="label">Voorbeelddossier</span></header>
  <figure><div class="papier">${schermbeeld}</div></figure>
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
</div>`;
  },
  css: `
figure { flex: 1; display: grid; place-items: center; margin: 3rem 0 5rem; min-height: 0; }
.papier { max-width: 100%; max-height: 100%; padding: 1.2rem; transform: rotate(-2deg); }
.schermbeeld { display: block; max-width: 86rem; max-height: calc(var(--hoogte) - 52rem); width: auto; height: auto; border-radius: 1rem; }
.schermbeeld.leeg { display: grid; place-items: center; width: 80rem; height: 45rem; border: .3rem dashed var(--lijn); color: var(--gedempt); font-size: 3rem; }
.tekst { margin-top: 2.4rem; }
.grond-inkt .voorbeeld, .grond-accent .voorbeeld { color: var(--zacht); }
.vorm-liggend .beeld { padding: 6rem 7rem; display: grid; grid-template-columns: 1fr 1.25fr; grid-template-rows: auto 1fr auto; column-gap: 6rem; }
.vorm-liggend .kopregel { grid-column: 1 / -1; }
.vorm-liggend figure { grid-column: 2; grid-row: 2 / 4; margin: 0; }
.vorm-liggend .kop { grid-column: 1; grid-row: 2; align-self: end; font-size: 5.6rem; }
.vorm-liggend .tekst { grid-column: 1; grid-row: 3; font-size: 2.4rem; }
.vorm-liggend .schermbeeld { max-width: 62rem; max-height: 44rem; }
`,
};
