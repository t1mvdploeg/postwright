// Carrousel: een documentpost van meerdere dia's (1080×1350), als PNG's en als PDF.
// Bron: carrousel.html ("van uitvraag naar tarief") en carrousel-principes.html in de Mixed-kit.
// Drie diasoorten: een omslag, stappen (met een illustratie naar keuze) en een slot. De stapketen
// rekent de studio zelf uit de volgorde; LinkedIn telt zelf al de pagina's (keuze uit de kit).
import { compositie } from "./compositie.js";
import { grondKlasse, logoStand, ondergrond, regel } from "./velden.js";

const kopVeld = (standaard) => ({ id: "kop", label: "Kop", soort: "kop", verplicht: true, nadruk: "precies-een", max: 70, standaard, hulp: "Zet precies één frase tussen *sterretjes*; die krijgt de accentkleur." });
const tekstVeld = (standaard, max = 220) => ({ id: "tekst", label: "Tekst", soort: "tekst", max, standaard });

/** De illustraties bij een stapdia. `voorbeelddata`: toont cijfers of namen uit het voorbeelddossier. */
export const ILLUSTRATIES = {
  bron: { tekst: "Bron met gevonden waarde", voorbeelddata: true },
  rijen: { tekst: "Bronstatussen", voorbeelddata: true },
  dossier: { tekst: "Opdrachtgeverdossier", voorbeelddata: true },
  compositie: { tekst: "Tariefcompositie", voorbeelddata: true },
  uitvraag: { tekst: "Uitvraag arbeidsvoorwaarden", voorbeelddata: true },
  vinklijst: { tekst: "Lijst met vinkjes", voorbeelddata: false },
  uitvoer: { tekst: "Tariefoverzicht als PDF", voorbeelddata: true },
  geen: { tekst: "Geen illustratie", voorbeelddata: false },
};

function illustratie(soort, v, c) {
  switch (soort) {
    case "bron": return `<div class="bronpagina">
        <div class="papier">
          <div class="bronblad-kop">${c.icoon("document")}Uitvraag Noordhaven.pdf<span>1 / 3</span></div>
          <p class="bladtitel">Arbeidsvoorwaarden</p><small>Afspraken bij de opdrachtgever</small>
          <div class="markering"><span>De werkweek bedraagt</span><strong>40 uur.</strong></div>
          <span class="documentlijn"></span><span class="documentlijn kort"></span>
        </div>
        <div class="rekenkaart gevonden"><span>${c.icoon("document")}Gevonden in uw document</span><div><span>Werkweek</span><strong class="bedrag">40 <small>uur</small></strong></div><p><span>Uit document</span><span>Uitvraag.pdf · p. 1</span></p></div>
      </div>`;
    case "rijen": return `<div class="papier kaart rijen">
        <div class="rij"><strong>Werkweek</strong><span class="bedrag">40 uur</span><small>Arbeidsduur</small><span class="status status-bevestigd">${c.icoon("vink")}Bevestigd</span></div>
        <div class="rij"><strong>Pensioenbijdrage werkgever</strong><span class="bedrag">18,6%</span><small>Pensioen en vergoedingen</small><span class="status status-document">${c.icoon("document")}Uit document</span></div>
        <div class="rij"><strong>Mobiliteit</strong><span class="bedrag">€ 0,00 per maand</span><small>Vergoedingen</small><span class="status status-aanname">${c.icoon("let-op")}Aanname</span></div>
      </div>`;
    case "dossier": return `<div class="papier kaart">
        <div class="kaartkop"><span>N</span><div><strong>Noordhaven Techniek</strong><small>Opdrachtgeverdossier</small></div></div>
        <div class="rijen">
          <div class="rij"><strong>Werkweek</strong><span class="bedrag">40 uur</span><small>Uit document</small><span class="status status-bevestigd">${c.icoon("vink")}Bevestigd</span></div>
          <div class="rij"><strong>Vakantiedagen</strong><span class="bedrag">27 dagen</span><small>Uit document</small><span class="status status-bevestigd">${c.icoon("vink")}Bevestigd</span></div>
          <div class="rij"><strong>Mobiliteit</strong><span class="bedrag">€ 0,00 per maand</span><small>Door u bevestigd</small><span class="status status-bevestigd">${c.icoon("vink")}Bevestigd</span></div>
        </div>
        <div class="kaartvoet">${c.icoon("vink")}Bewaard bij uw opdrachtgever</div>
      </div>`;
    case "compositie": return compositie(c);
    case "uitvraag": return `<div class="papier uitvraagblad">
        <div class="uitvraagkop">${c.icoon("document")}<div><strong>Uitvraag arbeidsvoorwaarden</strong><small>Voorbeelddossier Noordhaven Techniek</small></div></div>
        <div class="rijen">
          <div class="rij"><strong>Arbeidsduur</strong><span class="bedrag">40 uur per week</span></div>
          <div class="rij"><strong>Vakantie en ADV</strong><span class="bedrag">27 + 13 dagen</span></div>
          <div class="rij"><strong>Pensioenbijdrage werkgever</strong><span class="bedrag">18,6%</span></div>
        </div>
        <p class="uitvraagvoet">Inclusief toeslagen, vergoedingen en loondoorbetaling bij ziekte.</p>
      </div>`;
    case "vinklijst": {
      const regels = [1, 2, 3].filter((n) => !c.leeg(`vink${n}`)).map((n) => `<li data-veld="vink${n}">${c.icoon("vink")}${c.e(`vink${n}`)}</li>`).join("");
      return `<ul class="papier vinklijst">${regels}</ul>`;
    }
    case "uitvoer": return `<div class="uitvoer" aria-label="Tariefoverzicht als PDF">
        <div class="uitvoer-vel"><div class="uitvoer-kop">${c.icoon("document")}<span>Tariefoverzicht</span><span>PDF</span></div><p>Voorbeelddossier Noordhaven Techniek</p><div class="uitvoer-bedrag"><strong class="bedrag">€ 62,75</strong><span>per uur</span></div><span class="documentlijn"></span><span class="documentlijn kort"></span></div>
        <div class="uitvoer-label">${c.icoon("vink")}De onderbouwing erbij.</div>
      </div>`;
    default: return "";
  }
}

function stapketen(c) {
  const d = c.dia;
  if (!d || d.stappen < 2 || d.stap < 1) return "";
  const knopen = Array.from({ length: d.stappen }, (_, i) => `<i${i + 1 === d.stap ? ' class="nu"' : ""}></i>`).join("<b></b>");
  return `<span class="stapketen" role="img" aria-label="Stap ${d.stap} van ${d.stappen}">${knopen}</span>`;
}

const OMSLAG = {
  soort: "omslag", naam: "Omslag", telt: false,
  velden: [
    ondergrond("inkt", ["inkt", "accent"]),
    kopVeld("Achter elk tarief een *helder verhaal.*"),
    tekstVeld("Een voorbeelddossier, van uitvraag naar tarief in vier stappen.", 140),
    regel("voetLinks", "Voetregel links", "Gelijkwaardige beloning, helder berekend.", 50),
  ],
  html(v, c) {
    return `${c.symbolen}<section class="beeld dia ${grondKlasse(v.ondergrond)}">
  ${c.route()}
  ${c.logo(logoStand(v.ondergrond))}
  <main>
    <h1 class="kop" data-veld="kop">${c.t("kop")}</h1>
    ${c.leeg("tekst") ? "" : `<p class="tekst" data-veld="tekst">${c.t("tekst")}</p>`}
  </main>
  <footer class="voet" data-veld="voet"><span>${c.e("voetLinks")}</span><span>Blader verder${c.icoon("pijl")}</span></footer>
</section>`;
  },
};

const STAP = {
  soort: "stap", naam: "Stap", telt: true,
  velden: [
    ondergrond("licht", ["licht", "accent"]),
    {
      id: "illustratie", label: "Illustratie", soort: "keuze", standaard: "rijen",
      opties: Object.entries(ILLUSTRATIES).map(([waarde, i]) => ({ waarde, tekst: i.tekst })),
    },
    kopVeld("Geef uw *oordeel.*"),
    tekstVeld("Beoordeel cao-afspraken, bronnen en openstaande aannames. U heeft het laatste woord."),
    regel("vink1", "Vinkje 1", "U beoordeelt de uitkomst", 34, { hulp: "Alleen bij de illustratie Lijst met vinkjes." }),
    regel("vink2", "Vinkje 2", "U controleert aannames", 34),
    regel("vink3", "Vinkje 3", "U bepaalt wat wordt vastgelegd", 34),
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
  soort: "slot", naam: "Slot", telt: false,
  velden: [
    ondergrond("accent", ["accent", "inkt"]),
    kopVeld("Genoeg gezien. *Nu bent u aan zet.*"),
    tekstVeld("Ontdek hoe u van document naar tarief gaat, of controleer een loonstrook.", 140),
    regel("voetLinks", "Voetregel links", "Probeer de tool op"),
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
  // Per dia bepaald door de illustratie; zie `diaHeeftVoorbeelddata`.
  voorbeelddata: false,
  velden: [],
  dias: [OMSLAG, STAP, SLOT],
  maxDias: 20,
  /** De zes dia's van de kit ("van uitvraag naar tarief"): de standaard voor een nieuwe carrousel. */
  standaardDias: [
    { soort: "omslag", inhoud: { ondergrond: "inkt", kop: "Achter elk tarief een *helder verhaal.*", tekst: "Een voorbeelddossier, van uitvraag naar tarief in vier stappen.", voetLinks: "Gelijkwaardige beloning, helder berekend." } },
    { soort: "stap", inhoud: { ondergrond: "licht", illustratie: "bron", kop: "Lees de *afspraken in.*", tekst: "Start met de uitvraag gelijkwaardige beloning van uw opdrachtgever. De AI leest de arbeidsvoorwaarden uit en zet de afspraken klaar voor uw controle." } },
    { soort: "stap", inhoud: { ondergrond: "licht", illustratie: "rijen", kop: "Geef uw *oordeel.*", tekst: "Beoordeel cao-afspraken, bronnen en openstaande aannames. U heeft het laatste woord." } },
    { soort: "stap", inhoud: { ondergrond: "licht", illustratie: "dossier", kop: "Leg de *basis vast.*", tekst: "Bewaar de arbeidsvoorwaarden voor berekeningen én loonstrookcontrole." } },
    { soort: "stap", inhoud: { ondergrond: "licht", illustratie: "compositie", kop: "Maak het tarief *bespreekbaar.*", tekst: "Bewaar uw berekening als PDF of exporteer naar Salesforce met een ingestelde koppeling." } },
    { soort: "slot", inhoud: { ondergrond: "accent", kop: "Genoeg gezien. *Nu bent u aan zet.*", tekst: "Ontdek hoe u van document naar tarief gaat, of controleer een loonstrook.", voetLinks: "Probeer de tool op", voetRechts: "" } },
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
/* Bron: de bron, met de gevonden waarde als donkere kaart erover. */
.bronpagina { position: relative; width: 84rem; translate: -2rem -5rem; }
.bronpagina .papier { padding: 3.6rem 4rem 5rem; transform: rotate(-4deg); }
.bronpagina .bronblad-kop { font-size: 2.1rem; }
.bronpagina .bronblad-kop span { margin-left: auto; color: var(--gedempt); font-weight: 400; }
.bronpagina .icoon { width: 2.8rem; height: 2.8rem; color: var(--accent); }
.bronpagina .bladtitel { margin-top: 4.4rem; font-size: 4rem; font-weight: 550; letter-spacing: -.03em; }
.bronpagina .bladtitel + small { display: block; margin-top: .6rem; font-size: 2.2rem; color: var(--gedempt); }
.bronpagina .markering { display: flex; gap: .3em; margin-top: 3.2rem; padding: 1.8rem 2rem; border-radius: .6rem; background: var(--accent-zacht); font-size: 2.6rem; }
.bronpagina .markering strong { color: var(--accent); font-weight: 600; }
.bronpagina .documentlijn { margin-top: 2.4rem; width: 90%; }
.bronpagina .documentlijn.kort { margin-top: 1.2rem; width: 62%; }
.gevonden { position: absolute; right: -4rem; bottom: -17rem; width: 44rem; padding: 2.8rem 3.2rem; transform: rotate(2deg); }
.gevonden > span { display: flex; align-items: center; gap: 1rem; font-size: 2rem; color: var(--accent-bleek); }
.gevonden .icoon { width: 2.4rem; height: 2.4rem; color: var(--accent-licht); }
.gevonden div { display: flex; align-items: baseline; justify-content: space-between; margin-top: 2.6rem; font-size: 2.6rem; }
.gevonden div strong { font-size: 6rem; font-weight: 550; letter-spacing: -.04em; }
.gevonden div strong small { font-size: 2.6rem; font-weight: 400; letter-spacing: 0; }
.gevonden p { display: flex; justify-content: space-between; margin-top: 2.2rem; padding-top: 1.8rem; border-top: .15rem solid color-mix(in srgb, var(--wit) 17%, var(--inkt)); font-size: 1.9rem; color: var(--accent-bleek); }
/* Rijen en dossier: kaarten met rijen. */
.dia .papier.kaart { width: 86rem; transform: rotate(-2.5deg) scale(1.06); }
.kaartvoet { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 2.4rem; border-top: .15rem solid var(--lijn); background: var(--accent-zacht); border-radius: 0 0 1.8rem 1.8rem; color: var(--accent-hover); font-size: 2.2rem; }
.kaartvoet .icoon { width: 2.4rem; height: 2.4rem; }
/* Compositie: de tariefcompositie op de beschikbare hoogte. */
.dia .compositie { font-size: min(1.4rem, (var(--hoogte) - 50rem) / 58); translate: 2rem 0; }
/* Uitvraag, vinklijst en uitvoer: de principes-carrousel van de kit. */
.ill-uitvraag .papier, .ill-vinklijst .papier { width: 84rem; transform: rotate(-2.5deg); }
.uitvraagkop { display: flex; align-items: center; gap: 1.6rem; padding: 3rem 3.6rem 2.4rem; border-bottom: .15rem solid var(--lijn); }
.uitvraagkop .icoon { width: 3rem; height: 3rem; color: var(--accent); }
.uitvraagkop strong { display: block; font-size: 2.6rem; font-weight: 550; letter-spacing: -.02em; }
.uitvraagkop small { display: block; margin-top: .3rem; font-size: 2rem; color: var(--gedempt); }
.uitvraagvoet { padding: 2.2rem 3.6rem 2.8rem; border-top: .15rem solid var(--lijn); font-size: 2rem; color: var(--gedempt); }
.grond-accent .papier { box-shadow: 0 5.2rem 8.2rem -3.7rem rgb(43 17 11 / .5); }
.ill-uitvoer .uitvoer { font-size: 2.2rem; }
`,
};

/** Of een dia cijfers of namen uit het voorbeelddossier toont. */
export function diaHeeftVoorbeelddata(dia) {
  return dia?.soort === "stap" && Boolean(ILLUSTRATIES[dia.inhoud?.illustratie ?? "rijen"]?.voorbeelddata);
}
