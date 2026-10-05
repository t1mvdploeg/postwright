// Carrousel: een documentpost van meerdere dia's (1080×1350), als PNG's en als PDF.
// Drie diasoorten: een omslag, stappen (met een illustratie naar keuze) en een slot. De stapketen
// rekent de studio zelf uit de volgorde; LinkedIn telt zelf al de pagina's.
import { grondKlasse, logoStand, ondergrond, regel } from "./velden.js";

const kopVeld = (standaard) => ({
  id: "kop",
  label: "Kop",
  soort: "kop",
  verplicht: true,
  nadruk: "precies-een",
  max: 70,
  standaard,
  hulp: "Zet precies één frase tussen *sterretjes*; die krijgt de accentkleur.",
});
const tekstVeld = (standaard, max = 220) => ({ id: "tekst", label: "Tekst", soort: "tekst", max, standaard });

/** De illustraties bij een stapdia. */
export const ILLUSTRATIES = {
  vinklijst: { tekst: "Lijst met vinkjes" },
  geen: { tekst: "Geen illustratie" },
};

function illustratie(soort, v, c) {
  if (soort !== "vinklijst") return "";
  const regels = [1, 2, 3]
    .filter((n) => !c.leeg(`vink${n}`))
    .map((n) => `<li data-veld="vink${n}">${c.icoon("vink")}${c.e(`vink${n}`)}</li>`)
    .join("");
  return `<ul class="papier vinklijst">${regels}</ul>`;
}

function stapketen(c) {
  const d = c.dia;
  if (!d || d.stappen < 2 || d.stap < 1) return "";
  const knopen = Array.from({ length: d.stappen }, (_, i) => `<i${i + 1 === d.stap ? ' class="nu"' : ""}></i>`).join(
    "<b></b>",
  );
  return `<span class="stapketen" role="img" aria-label="Stap ${d.stap} van ${d.stappen}">${knopen}</span>`;
}

const OMSLAG = {
  soort: "omslag",
  naam: "Omslag",
  telt: false,
  velden: [
    ondergrond("inkt", ["inkt", "accent"]),
    kopVeld("On-brand posts, *without the design tool.*"),
    tekstVeld("A quick tour of Postwright in four steps.", 140),
    regel("voetLinks", "Voetregel links", "Open source, runs on your computer.", 50),
  ],
  html(v, c) {
    return `${c.symbolen}<section class="beeld dia ${grondKlasse(v.ondergrond)}">
  ${c.route()}
  ${c.logo(logoStand(v.ondergrond))}
  <main>
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
  <footer class="voet" data-veld="voet"><span>${c.e("voetLinks")}</span><span>Swipe${c.icoon("pijl")}</span></footer>
</section>`;
  },
};

const STAP = {
  soort: "stap",
  naam: "Stap",
  telt: true,
  velden: [
    ondergrond("licht", ["licht", "accent"]),
    {
      id: "illustratie",
      label: "Illustratie",
      soort: "keuze",
      standaard: "vinklijst",
      opties: Object.entries(ILLUSTRATIES).map(([waarde, i]) => ({ waarde, tekst: i.tekst })),
    },
    kopVeld("Explain one *step.*"),
    tekstVeld("One idea per slide keeps the post easy to read."),
    regel("vink1", "Vinkje 1", "First point", 34, { hulp: "Alleen bij de illustratie Lijst met vinkjes." }),
    regel("vink2", "Vinkje 2", "Second point", 34),
    regel("vink3", "Vinkje 3", "Third point", 34),
  ],
  html(v, c) {
    const lang = String(v.tekst ?? "").length > 150 ? " lang" : "";
    const ill = illustratie(v.illustratie, v, c);
    return `${c.symbolen}<section class="beeld dia ${grondKlasse(v.ondergrond)}">
  <header class="kopregel">${c.logo(logoStand(v.ondergrond))}${stapketen(c)}</header>
  ${ill ? `<figure class="ill-${v.illustratie}">${ill}</figure>` : '<div class="ruimte"></div>'}
  <h2 class="kop klein" data-veld="kop">${c.t("kop")}</h2>
  ${c.leeg("tekst") ? "" : `<p class="tekst${lang}" data-veld="tekst">${c.t("tekst")}</p>`}
</section>`;
  },
};

const SLOT = {
  soort: "slot",
  naam: "Slot",
  telt: false,
  velden: [
    ondergrond("accent", ["accent", "inkt"]),
    kopVeld("Make your first *post.*"),
    tekstVeld("Postwright is open source and runs on your own computer.", 140),
    regel("voetLinks", "Voetregel links", "Try it yourself"),
    regel("voetRechts", "Voetregel rechts", "", 40, { hulp: "Leeg: de website van het merk." }),
  ],
  html(v, c) {
    return `<section class="beeld dia ${grondKlasse(v.ondergrond)}">
  ${c.route()}
  ${c.logo(logoStand(v.ondergrond))}
  <main>
    <h2 class="kop" data-veld="kop">${c.t("kop")}</h2>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
  <footer class="voet" data-veld="voet"><span>${c.e("voetLinks")}</span><strong>${c.voet("voetRechts")}</strong></footer>
</section>`;
  },
};

export default {
  id: "carrousel",
  naam: "Carrousel",
  doel: "Een documentpost van meerdere dia's: omslag, stappen en een slot.",
  soort: "carrousel",
  formaten: ["li-carrousel"],
  velden: [],
  dias: [OMSLAG, STAP, SLOT],
  maxDias: 20,
  /** De zes dia's van een nieuwe carrousel: omslag, vier stappen en een slot. */
  standaardDias: [
    {
      soort: "omslag",
      inhoud: {
        ondergrond: "inkt",
        kop: "On-brand posts, *without the design tool.*",
        tekst: "A quick tour of Postwright in four steps.",
        voetLinks: "Open source, runs on your computer.",
      },
    },
    {
      soort: "stap",
      inhoud: {
        ondergrond: "licht",
        illustratie: "vinklijst",
        kop: "Pick a *template.*",
        tekst: "Start from one of the templates and make it yours.",
        vink1: "Statements and questions",
        vink2: "Numbers and routes",
        vink3: "Carousels and LinkedIn banners",
      },
    },
    {
      soort: "stap",
      inhoud: {
        ondergrond: "licht",
        illustratie: "geen",
        kop: "Fill in the *fields.*",
        tekst: "Write the headline and the text. The preview updates as you type.",
      },
    },
    {
      soort: "stap",
      inhoud: {
        ondergrond: "licht",
        illustratie: "vinklijst",
        kop: "Check against your *brand kit.*",
        tekst: "The brand check runs before a post can be scheduled.",
        vink1: "One coloured phrase per headline",
        vink2: "Contrast on the chosen background",
        vink3: "Every number backed by a fact",
      },
    },
    {
      soort: "stap",
      inhoud: {
        ondergrond: "licht",
        illustratie: "geen",
        kop: "*Export* and schedule.",
        tekst: "Download PNG, PDF or ZIP, and plan the post in the calendar.",
      },
    },
    {
      soort: "slot",
      inhoud: {
        ondergrond: "accent",
        kop: "Make your first *post.*",
        tekst: "Postwright is open source and runs on your own computer.",
        voetLinks: "Try it yourself",
        voetRechts: "",
      },
    },
  ],
  css: `
main { margin-block: auto 7rem; }
main .tekst { margin-top: 4.4rem; }
.dia figure { flex: 1; display: grid; place-items: center; margin: 0; min-height: 0; }
.dia .ruimte { flex: 1; }
.dia > .kop { margin-top: 2rem; }
.dia > .tekst { margin-top: 2.6rem; }
.dia > .tekst.lang { max-width: 42ch; font-size: 2.7rem; }
.voet .icoon { width: 3rem; height: 3rem; color: var(--nadruk); }
.voet span:has(.icoon) { display: inline-flex; align-items: center; gap: 1.6rem; }
/* Vinklijst: een lijst met vinkjes in een vel. */
.ill-vinklijst .papier { width: 84rem; transform: rotate(-2.5deg); }
.grond-accent .papier { box-shadow: 0 5.2rem 8.2rem -3.7rem rgb(43 17 11 / .5); }
`,
};
