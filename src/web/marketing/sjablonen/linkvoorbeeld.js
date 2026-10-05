// Linkvoorbeeld (Open Graph, 1200×630): wat LinkedIn en andere platforms tonen bij een gedeelde link.
// Bron: og-afbeelding.html in de Mixed-kit.
import { kop, tekst } from "./velden.js";
import { compositie } from "./compositie.js";

export default {
  id: "linkvoorbeeld",
  naam: "Linkvoorbeeld",
  doel: "Het beeld bij een gedeelde link (og:image), met de tariefcompositie.",
  soort: "beeld",
  formaten: ["li-link"],
  voorbeelddata: true,
  velden: [
    kop("Achter elk tarief een *helder verhaal.*", 50),
    tekst("Gelijkwaardige beloning, helder berekend.", 70),
  ],
  html(v, c) {
    return `${c.symbolen}<div class="beeld">
  <span class="voorbeeld" data-veld="label">Voorbeelddossier</span>
  <div class="links">
    ${c.logo("standaard")}
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </div>
  <figure>${compositie(c)}</figure>
</div>`;
  },
  css: `
.beeld { flex-direction: row; gap: 2rem; padding: 6rem 0 6rem 7rem; }
.links { display: flex; flex-direction: column; flex: 0 0 38rem; }
.kop { margin-top: auto; font-size: 5.6rem; }
.tekst { margin-top: 2.6rem; font-size: 2.2rem; }
figure { flex: 1; margin: 0; display: grid; place-items: center; }
.compositie { font-size: calc((var(--hoogte) - 11rem) / 58); }
.beeld > .voorbeeld { position: absolute; top: 6.4rem; right: 7rem; }
`,
};
