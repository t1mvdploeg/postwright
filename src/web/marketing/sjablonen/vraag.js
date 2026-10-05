// Vraag en antwoord: een veelgestelde vraag, met de bronstatussen uit de app als illustratie.
// Bron: vraag.html in de Mixed-kit. De rijen komen uit het voorbeelddossier en staan vast.
import { kop, tekst } from "./velden.js";

export default {
  id: "vraag",
  naam: "Vraag en antwoord",
  doel: "Een veelgestelde vraag met een kort antwoord, geïllustreerd met de bronstatussen.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand"],
  voorbeelddata: true,
  velden: [
    kop("Wat als informatie ontbreekt of *onduidelijk is?*", 70),
    tekst("Ontbrekende rekeninformatie krijgt de status aanname. U zoekt de juiste afspraak na, vult deze aan of bevestigt de voorgestelde waarde.", 190),
  ],
  html(v, c) {
    return `${c.symbolen}<div class="beeld">
  <header class="kopregel">${c.logo("standaard")}<span class="voorbeeld" data-veld="label">Voorbeelddossier</span></header>
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  <figure>
    <div class="papier rijen">
      <div class="rij"><strong>Werkweek</strong><span class="bedrag">40 uur</span><small>Arbeidsduur</small><span class="status status-bevestigd">${c.icoon("vink")}Bevestigd</span></div>
      <div class="rij"><strong>Pensioenbijdrage werkgever</strong><span class="bedrag">18,6%</span><small>Pensioen en vergoedingen</small><span class="status status-document">${c.icoon("document")}Uit document</span></div>
      <div class="rij"><strong>Mobiliteit</strong><span class="bedrag">€ 0,00 per maand</span><small>Vergoedingen</small><span class="status status-aanname">${c.icoon("let-op")}Aanname</span></div>
    </div>
  </figure>
  <p class="tekst" data-veld="tekst">${c.t("tekst")}</p>
</div>`;
  },
  css: `
.kop { margin-top: 7rem; max-width: 18ch; }
figure { flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
.papier { width: 84rem; transform: rotate(-2.5deg); translate: 3rem 0; }
.tekst { max-width: 44ch; font-size: 2.6rem; }
.vorm-staand .papier { transform: rotate(-2.5deg) scale(1.08); }
.vorm-staand .kop.klein { font-size: 8rem; }
.vorm-staand .tekst { font-size: 3rem; }
`,
};
