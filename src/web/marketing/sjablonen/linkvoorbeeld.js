// Linkvoorbeeld (Open Graph, 1200×630): wat LinkedIn en andere platforms tonen bij een gedeelde link.
import { kop, tekst } from "./velden.js";

export default {
  id: "linkvoorbeeld",
  naam: "Linkvoorbeeld",
  doel: "Het beeld bij een gedeelde link (og:image): kop, ondertitel en logo.",
  soort: "beeld",
  formaten: ["li-link"],
  velden: [
    kop("On-brand posts, *without the design tool.*", 50),
    tekst("Open source, and it runs on your own computer.", 70),
  ],
  html(v, c) {
    return `<div class="beeld">
  ${c.route()}
  ${c.logo("standaard")}
  <main>
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
</div>`;
  },
  css: `
.beeld { padding: 6rem 7rem; }
main { margin-top: auto; }
.kop { max-width: 17ch; font-size: 6.4rem; }
.tekst { margin-top: 2.6rem; max-width: 40ch; font-size: 2.4rem; }
`,
};
