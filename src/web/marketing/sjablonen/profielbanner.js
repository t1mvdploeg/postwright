// LinkedIn-profielachtergrond (1584×396). De profielfoto valt linksonder over de banner, dus links
// staat alleen het motief. Rechts daarvan groot het merk: het teken en
// de naam in wit met de punt in het accent (in het kopveld als *.* gezet).
import { kop, regel } from "./velden.js";

export default {
  id: "profielbanner",
  naam: "Profielachtergrond",
  doel: "De achtergrond van een persoonlijk LinkedIn-profiel.",
  soort: "beeld",
  formaten: ["li-profiel"],
  velden: [kop("Postwright*.*", 30), regel("adres", "Regel eronder", "On-brand posts, without the design tool.", 60)],
  html(v, c) {
    return `<div class="beeld grond-inkt">
  ${c.route()}
  <span class="ring"></span>
  <div class="merkregel">
    ${c.logo("merkteken-op-inkt", "teken")}
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
  </div>
  ${c.leeg("adres") ? "" : `<p class="adres" data-veld="adres">${c.e("adres")}</p>`}
</div>`;
  },
  css: `
.beeld { justify-content: center; padding: 0 7rem 0 30rem; }
.route { width: 52rem; top: -12rem; left: -6rem; }
.ring { width: 34rem; top: -15rem; right: -9rem; }
.merkregel { display: flex; align-items: center; gap: 3.2rem; }
.teken { height: 11rem; width: auto; flex-shrink: 0; }
.kop { font-size: 8rem; font-weight: 630; line-height: 1; letter-spacing: -.035em; white-space: nowrap; }
.adres { margin-top: 2rem; font-size: 2rem; font-weight: 500; color: var(--accent-bleek); }
`,
};
