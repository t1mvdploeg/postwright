// Loonstrookcontrole: een loonstrook naast het dossier gelegd, op actieblauw.
// Bron: loonstrook.html in de Mixed-kit. Noor de Vries en de bedragen zijn het voorbeelddossier.
import { kop, tekst } from "./velden.js";

export default {
  id: "loonstrook",
  naam: "Loonstrook",
  doel: "De loonstrookcontrole: bevindingen per onderdeel, uit het voorbeelddossier.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand"],
  voorbeelddata: true,
  velden: [
    kop("Van loonstrook naar *inzicht.*", 50),
    tekst("Vergelijk een loonstrook met het opdrachtgeverdossier en bekijk de bevindingen per onderdeel.", 150),
  ],
  html(v, c) {
    return `${c.symbolen}<div class="beeld grond-blauw">
  <header class="kopregel">${c.logo("op-blauw")}<span class="voorbeeld" data-veld="label">Voorbeelddossier</span></header>
  <figure>
    <div class="papier">
      <div class="kaartkop"><span>NV</span><div><strong>Noor de Vries</strong><small>Loonstrook · september 2026</small></div></div>
      <div class="rijen">
        <div class="rij"><strong>Bruto-uurloon</strong><span class="bedrag">€ 24,50</span><small>Naast het dossier gelegd</small><span class="status status-overeen">${c.icoon("vink")}Komt overeen</span></div>
        <div class="rij"><strong>Vakantiebijslag</strong><span class="bedrag">8,33%</span><small>Naast het dossier gelegd</small><span class="status status-overeen">${c.icoon("vink")}Komt overeen</span></div>
        <div class="rij"><strong>Pensioencompensatie</strong><span class="bedrag">—</span><small>Vraagt uw aandacht</small><span class="status status-controleren">${c.icoon("let-op")}Controleren</span></div>
      </div>
    </div>
    <div class="rekenkaart"><strong>Naast de afspraken gelegd.</strong><small>Zie wat uw aandacht vraagt.</small></div>
  </figure>
  <h1 class="kop klein" data-veld="kop">${c.t("kop")}</h1>
  ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
</div>`;
  },
  css: `
figure { position: relative; flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
.papier { width: 76rem; transform: rotate(-4deg) scale(.88); translate: -3rem 0; box-shadow: 0 5.2rem 8.2rem -3.7rem rgb(16 36 62 / .5); }
.kaartkop > span:first-child { font-size: 2rem; }
.rekenkaart { position: absolute; right: -1rem; top: 3rem; padding: 2.6rem 3.2rem; border-radius: 1.8rem; transform: rotate(3deg); }
.rekenkaart strong { display: block; font-size: 2.4rem; font-weight: 550; }
.rekenkaart small { display: block; margin-top: .4rem; font-size: 2rem; color: var(--bleek-blauw); }
.tekst { margin-top: 2rem; }
figure { margin-block: 2rem 5rem; }
.vorm-staand .papier { transform: rotate(-4deg) scale(1.1); }
.vorm-staand .rekenkaart { top: 9rem; }
`,
};
