// Stelling: één uitspraak met een gekleurde frase, op licht, inkt of accent; de ondergrond is een veld.
import { KOPGROOTTE, grondKlasse, kop, kopKlasse, logoStand, ondergrond, regel, tekst } from "./velden.js";

export default {
  id: "stelling",
  naam: "Stelling",
  doel: "Eén uitspraak met een gekleurde frase; voor bewustwording.",
  soort: "beeld",
  formaten: ["li-vierkant", "li-staand", "ig-vierkant", "ig-staand", "story", "breed"],
  voorbeelddata: false,
  velden: [
    ondergrond("accent"),
    kop("Genoeg gezien. *Nu bent u aan zet.*", 90),
    KOPGROOTTE,
    tekst("Een uitvraag vol afspraken. Een berekening die u kunt volgen.", 160),
    regel("voetLinks", "Voetregel links", "Probeer de tool op"),
    regel("voetRechts", "Voetregel rechts", "", 40, { hulp: "Leeg: de website van het merk." }),
    { id: "motief", label: "Routemotief", soort: "keuze", standaard: "aan", opties: [{ waarde: "aan", tekst: "Tonen" }, { waarde: "uit", tekst: "Verbergen" }] },
  ],
  html(v, c) {
    return `<div class="beeld ${grondKlasse(v.ondergrond)}">
  ${v.motief === "aan" ? c.route() : ""}
  ${c.logo(logoStand(v.ondergrond))}
  <main>
    <h1 class="${kopKlasse(v.kopgrootte, v.kop)}" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
  <footer class="voet" data-veld="voet"><span>${c.e("voetLinks")}</span><strong>${c.voet("voetRechts")}</strong></footer>
</div>`;
  },
  css: `
main { margin-block: auto 7rem; }
.tekst { margin-top: 4.4rem; }
.vorm-liggend .beeld { padding: 6rem 7rem; }
.vorm-liggend .kop { font-size: 7.6rem; }
.vorm-liggend .kop.middel { font-size: 6.2rem; }
.vorm-liggend .kop.klein { font-size: 5rem; }
.vorm-liggend .tekst { margin-top: 3rem; max-width: 48ch; font-size: 2.6rem; }
.vorm-liggend main { margin-block: auto 4rem; }
.vorm-liggend .voet { padding-top: 2.4rem; font-size: 2rem; }
`,
};
