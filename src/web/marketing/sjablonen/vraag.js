// Vraag en antwoord: een veelgestelde vraag met een kort antwoord, op een lichte ondergrond.
import { kop, tekst } from "./velden.js";

export default {
  id: "vraag",
  naam: "Vraag en antwoord",
  doel: "Een veelgestelde vraag met een kort antwoord.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand"],
  velden: [
    kop("Do I need an account *to use Postwright?*", 70),
    tekst("No. Postwright runs on your own computer and there is no account.", 190),
  ],
  html(v, c) {
    return `<div class="beeld">
  ${c.logo("standaard")}
  <main>
    <h1 class="kop middel" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.tekst { margin-top: 4.4rem; max-width: 36ch; }
.vorm-staand .kop.middel { font-size: 9.2rem; }
.vorm-staand .tekst { font-size: 3.4rem; }
`,
};
