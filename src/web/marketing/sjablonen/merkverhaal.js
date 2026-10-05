// Merkverhaal: de compositie van de pagina Over ons (afspraken, de blauwe kaart, de controle).
// Bron: merkverhaal.html in de Mixed-kit.
import { kop, regel, tekst } from "./velden.js";

export default {
  id: "merkverhaal",
  naam: "Merkverhaal",
  doel: "De gedachte achter het merk: eerst begrijpen, dan berekenen. Ook als story.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "story"],
  voorbeelddata: false,
  velden: [
    kop("Meer grip op het tarief. *Meer ruimte voor mensen.*", 70),
    tekst("Achter iedere berekening zit iemand die aan het werk gaat.", 120),
    { id: "kaart", label: "Tekst op de blauwe kaart", soort: "tekst", max: 40, standaard: "Eerst begrijpen.\nDan berekenen.", hulp: "Een nieuwe regel begint op een nieuwe regel in het veld." },
    regel("controle", "Tekst op het controlelabel", "Technologie helpt. U houdt de regie.", 45),
  ],
  html(v, c) {
    return `${c.symbolen}<div class="beeld">
  ${c.logo("standaard")}
  <figure>
    <div class="stapel" aria-label="Van losse arbeidsvoorwaarden naar één helder geheel: uitvraag, controle en tarief">
      <span class="cirkel"></span>
      <div class="stapel-vel">
        <div class="stapel-vel-kop">${c.icoon("document")}De afspraken achter het werk</div>
        <div><span>Arbeidsduur</span><b>Werkweek &amp; roosters</b></div>
        <div><span>Beloning</span><b>Loon &amp; toeslagen</b></div>
        <div><span>Verlof</span><b>Vakantie &amp; ADV</b></div>
        <div><span>Pensioen</span><b>Regeling &amp; bijdrage</b></div>
      </div>
      <div class="stapel-kaart">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#10243e"/><path d="M7 9h5l4 4m-9 3h10m-10 7h5l4-4m0-3h4l5-6m-4 0h4v4" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p data-veld="kaart">${c.t("kaart")}</p>
        <div class="stapel-route"><span>Uitvraag</span>${c.icoon("pijl")}<span>Controle</span>${c.icoon("pijl")}<span>Tarief</span></div>
      </div>
      <div class="stapel-controle" data-veld="controle">${c.icoon("vink")}${c.e("controle")}</div>
    </div>
  </figure>
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
</div>`;
  },
  css: `
figure { flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
/* De compositie schaalt mee met de ruimte die overblijft; 64em is haar hoogte. */
.stapel { font-size: min(1.3rem, (var(--hoogte) - 50rem) / 64); }
.vorm-story .stapel { font-size: min(1.3rem, (var(--hoogte) - 100rem) / 64); }
.kop { max-width: 18ch; }
.tekst { margin-top: 2.4rem; }
`,
};
