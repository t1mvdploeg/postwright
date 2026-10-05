// LinkedIn-bedrijfsomslag (1128×191), licht met de keten of op accent met het logo. Het
// bedrijfslogo van LinkedIn valt linksonder over de omslag; de inhoud staat rechts.
import { kop, regel } from "./velden.js";

export default {
  id: "bedrijfsomslag",
  naam: "Bedrijfsomslag",
  doel: "De omslag van de LinkedIn-bedrijfspagina.",
  soort: "beeld",
  formaten: ["li-bedrijf"],
  voorbeelddata: false,
  velden: [
    { id: "variant", label: "Variant", soort: "keuze", standaard: "licht", opties: [{ waarde: "licht", tekst: "Licht, met de keten" }, { waarde: "accent", tekst: "Accent, met het logo" }] },
    kop("Achter elk tarief een *helder verhaal.*", 45),
    regel("keten1", "Keten 1", "De afspraken", 22, { hulp: "Alleen bij de lichte variant." }),
    regel("keten2", "Keten 2", "Uw controle", 22),
    regel("keten3", "Keten 3", "Een helder dossier", 22),
    regel("keten4", "Keten 4 (gevuld)", "Een uitlegbaar tarief", 24),
  ],
  html(v, c) {
    if (v.variant === "accent") {
      return `<div class="beeld grond-accent variant-accent">
  ${c.route()}
  ${c.logo("op-accent", "omslaglogo")}
  <span class="scheiding" aria-hidden="true"></span>
  <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
</div>`;
    }
    const keten = [1, 2, 3].filter((n) => !c.leeg(`keten${n}`)).map((n) => `<span>${c.e(`keten${n}`)}</span><i></i>`).join("");
    return `<div class="beeld variant-licht">
  ${c.route()}
  <div class="inhoud">
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
    <p class="keten" data-veld="keten">${keten}<strong>${c.e("keten4")}</strong></p>
  </div>
</div>`;
  },
  css: `
.variant-licht { justify-content: center; align-items: flex-end; padding: 0 5rem; }
.route { width: 46rem; top: -9rem; left: -2rem; }
.variant-licht .kop { font-size: 3.9rem; white-space: nowrap; }
.keten { margin-top: 2.2rem; font-size: 1.5rem; gap: 1rem; }
.keten > span::before, .keten > strong::before { width: 1rem; height: 1rem; border-width: .17rem; }
.keten > i { height: .15rem; }
.variant-accent { flex-direction: row; align-items: center; justify-content: flex-end; gap: 4.4rem; padding: 0 7rem; }
.omslaglogo { height: 4.2rem; width: auto; }
.scheiding { width: .15rem; height: 8.6rem; background: var(--haarlijn); }
.variant-accent .kop { font-size: 4.2rem; line-height: 1.08; }
`,
};
