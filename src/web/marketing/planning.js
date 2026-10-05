// Marketingstudio — Planning: geplande en gepubliceerde posts, ideeën en momenten als lijst
// (standaard, ook op een telefoon) of als maand, de agenda-export (.ics) en de campagnes. Verzetten
// kan altijd met een datumveld; slepen in de maandweergave is een extra, nooit de enige manier.
//
// Golf 2: een periode aanvinken (in de maand een begin- en einddag aanklikken, of de twee
// datumvelden, die dezelfde keuze tonen), daarvoor ideeën laten voorstellen of er zelf een
// toevoegen. Het ideepaneel en de voorstellen staan in ideeen-ui.js.
import { bevestigDialoog, el, legeStaat, melding, veldFout } from "/app.js";
import { download } from "/marketing/render.js";
import { maakIcs } from "/marketing/ics.js";
import { aantalWerkdagen, dagVan, kiesPeriode, komendeWeken, maandRaster, plusDagen, standaardAantal, verzetNaarDag, volgendeMaand } from "/marketing/kalender.js";
import { leesbaarMoment, metOffset, naarLokaal, vandaagAmsterdam } from "/marketing/recept.js";
import { KANAAL_REGELS } from "/marketing/posttekst.js";
import { ideePaneel, korteDag, langeDag, voorstellenPaneel, vulCampagnes } from "/marketing/ideeen-ui.js";

const STATUS = { concept: "Concept", gepland: "Gepland", gepubliceerd: "Gepubliceerd", gearchiveerd: "Gearchiveerd" };
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

export async function toon(container, ctx) {
  const begin = vandaagAmsterdam();
  let [{ posts }, { campagnes }, { ideeen }, momenten] = await Promise.all([
    ctx.api("/api/beheer/marketing/posts"),
    ctx.api("/api/beheer/marketing/campagnes"),
    ctx.api("/api/beheer/marketing/ideeen"),
    // De momenten zijn een extra: laden ze niet, dan werkt de planning gewoon zonder.
    ctx.api(`/api/beheer/marketing/momenten?van=${plusDagen(begin, -31)}&tot=${plusDagen(begin, 365)}`).then((r) => r?.momenten ?? [], () => []),
  ]);
  if (!ctx.geldig()) return;
  const nu = new Date();
  let weergave = "lijst";
  let { jaar, maand } = { jaar: nu.getFullYear(), maand: nu.getMonth() };
  /** De gekozen periode; los van de getoonde maand, dus bladeren houdt hem vast. */
  let periode = { van: null, tot: null };

  const kalenderHouder = el("div");
  const campagneHouder = el("div");
  const lijstKnop = el("button", { type: "button", class: "secundair", "aria-pressed": "true", text: "Lijst" });
  const maandKnop = el("button", { type: "button", class: "secundair", "aria-pressed": "false", text: "Maand" });
  const icsKnop = el("button", { type: "button", class: "secundair", text: "Agenda-export (.ics)" });

  const moment = (p) => (p.status === "gepland" ? p.gepland : p.status === "gepubliceerd" ? p.gepubliceerd?.op : null);
  /** Een idee is gebruikt als zijn post (nog) bestaat; is die gewist, dan telt het idee weer als open. */
  const gebruikt = (i) => Boolean(i.post && posts.some((p) => p.id === i.post));

  // ---------------- periode ----------------
  const kanalen = ctx.instellingen.kanalen?.length ? ctx.instellingen.kanalen : ["linkedin"];
  const vanVeld = el("input", { type: "date", id: "periode-van" });
  const totVeld = el("input", { type: "date", id: "periode-tot" });
  const periodeStand = el("p", { class: "hulptekst", role: "status", "aria-live": "polite" });
  const wisKnop = el("button", { type: "button", class: "secundair", text: "Wis keuze" });
  const toevoegKnop = el("button", { type: "button", class: "secundair", text: "Idee toevoegen" });
  const aantalVeld = el("input", { type: "number", id: "periode-aantal", min: "1", max: "20", step: "1", inputmode: "numeric" });
  const kanaalVeld = el("select", { id: "periode-kanaal" }, kanalen.map((k) => el("option", { value: k, text: KANAAL_REGELS[k]?.naam ?? k })));
  const campagneVeld = el("select", { id: "periode-campagne" });
  const wensVeld = el("textarea", { id: "periode-wens", rows: "2", maxlength: "1000", placeholder: "Bijvoorbeeld: meer over de loonstrookcontrole; voor HR bij uitzendbureaus." });
  /** Het aantal volgt de periode (twee per week) tot u het zelf aanpast; een nieuwe periode zet het terug. */
  let aantalVoor = null;

  const paneel = ideePaneel({
    ctx,
    staat: () => ({ posts, campagnes, momenten }),
    bewaard: (idee) => {
      ideeen = ideeen.some((i) => i.id === idee.id) ? ideeen.map((i) => (i.id === idee.id ? idee : i)) : [...ideeen, idee];
      teken();
    },
    gewist: (id) => { ideeen = ideeen.filter((i) => i.id !== id); teken(); },
    terugval: () => toevoegKnop,
  });

  const hulp = voorstellenPaneel({
    ctx,
    verzoek: () => {
      if (!periode.van || !periode.tot) return null;
      const aantal = Number(aantalVeld.value);
      if (!Number.isInteger(aantal) || aantal < 1 || aantal > 20) {
        veldFout(aantalVeld, "Kies een aantal van 1 tot en met 20.");
        aantalVeld.focus();
        return null;
      }
      veldFout(aantalVeld, "");
      return { van: periode.van, tot: periode.tot, aantal, kanaal: kanaalVeld.value, toelichting: wensVeld.value, campagne: campagneVeld.value || null };
    },
    momentTitel: (sleutel) => momenten.find((m) => m.sleutel === sleutel)?.titel ?? sleutel,
    naBewaren: async () => {
      ({ ideeen } = await ctx.api("/api/beheer/marketing/ideeen"));
      teken();
    },
  });

  const periodeFormulier = el("div", { hidden: "" }, [
    el("div", { class: "veldrij" }, [
      el("div", { class: "veld" }, [el("label", { for: "periode-aantal", text: "Aantal ideeën" }), aantalVeld]),
      el("div", { class: "veld" }, [el("label", { for: "periode-kanaal", text: "Kanaal" }), kanaalVeld]),
      el("div", { class: "veld" }, [el("label", { for: "periode-campagne", text: "Campagne" }), campagneVeld]),
    ]),
    el("div", { class: "veld" }, [el("label", { for: "periode-wens", text: "Wens (optioneel)" }), wensVeld]),
    el("div", { class: "knoppenrij" }, [hulp.vraag, hulp.annuleer]),
    hulp.uit,
  ]);

  const periodeKaart = el("section", { class: "kaart studio-periode", "aria-labelledby": "periode-kop" }, [
    el("h2", { id: "periode-kop", text: "Periode en ideeën" }),
    el("div", { class: "veldrij" }, [
      el("div", { class: "veld" }, [el("label", { for: "periode-van", text: "Van" }), vanVeld]),
      el("div", { class: "veld" }, [el("label", { for: "periode-tot", text: "Tot en met" }), totVeld]),
    ]),
    periodeStand,
    el("div", { class: "knoppenrij" }, [toevoegKnop, wisKnop]),
    periodeFormulier,
    hulp.element,
  ]);

  /** Zet de velden en de regel onder de datums gelijk aan `periode`, zonder de velden opnieuw te bouwen (de focus blijft staan). */
  function tekenPeriode() {
    const { van, tot } = periode;
    for (const [veld, waarde] of [[vanVeld, van ?? ""], [totVeld, tot ?? ""]]) {
      if (veld.value !== waarde) { veld.value = waarde; veldFout(veld, ""); }
    }
    const compleet = Boolean(van && tot);
    const n = compleet ? aantalWerkdagen(van, tot) : 0;
    const stand = compleet ? `${n} werkdag${n === 1 ? "" : "en"}`
      : van ? "Klik de einddag aan, of vul de einddatum in."
        : "Klik in de maand een begin- en einddag aan, of vul de datums in.";
    if (periodeStand.textContent !== stand) periodeStand.textContent = stand;
    wisKnop.disabled = !van && !tot;
    periodeFormulier.hidden = !compleet;
    const sleutel = compleet ? `${van}..${tot}` : null;
    if (compleet && sleutel !== aantalVoor) { aantalVeld.value = String(standaardAantal(van, tot)); veldFout(aantalVeld, ""); }
    aantalVoor = sleutel;
    vulCampagnes(campagneVeld, campagnes, campagneVeld.value);
  }

  /** Een datumveld gewijzigd: de periode volgt, tenzij het einde vóór het begin ligt. */
  function periodeUitVelden(bron) {
    veldFout(vanVeld, "");
    veldFout(totVeld, "");
    const van = vanVeld.value || null;
    const tot = totVeld.value || null;
    if (van && tot && tot < van) {
      veldFout(bron, bron === totVeld ? "De einddatum ligt vóór de begindatum." : "De begindatum ligt na de einddatum.");
      return;
    }
    periode = { van, tot };
    teken();
  }
  vanVeld.addEventListener("change", () => periodeUitVelden(vanVeld));
  totVeld.addEventListener("change", () => periodeUitVelden(totVeld));

  /** Een periode van buiten de velden (klik in de maand, een lege week, Wis keuze): een oude veldfout geldt dan niet meer. */
  function zetPeriode(nieuw) {
    periode = nieuw;
    veldFout(vanVeld, "");
    veldFout(totVeld, "");
    teken();
  }
  wisKnop.addEventListener("click", () => {
    zetPeriode({ van: null, tot: null });
    vanVeld.focus();
  });
  toevoegKnop.addEventListener("click", () => paneel.open({ datum: periode.van ?? vandaagAmsterdam(), titel: "" }, toevoegKnop));

  /**
   * Een dag in de maand aangeklikt. Na het hertekenen staat dezelfde dag weer onder de muis (het
   * periodepaneel erboven kan groeien of krimpen) en krijgt hij de focus terug.
   */
  function kiesDag(datum, uitbreiden) {
    const zoek = () => kalenderHouder.querySelector(`[data-datum="${datum}"]`);
    const voor = zoek()?.getBoundingClientRect().top;
    zetPeriode(kiesPeriode(periode, datum, { uitbreiden }));
    const knop = zoek();
    if (!knop) return;
    if (voor !== undefined) window.scrollBy(0, knop.getBoundingClientRect().top - voor);
    knop.focus({ preventScroll: true });
  }

  /** Een idee naar een andere dag (slepen); het hele idee gaat mee, want een PUT vervangt het. */
  async function verzetIdee(i, datum) {
    try {
      const { id, aangemaakt: _a, gewijzigd: _g, ...rest } = i;
      const nieuw = await ctx.api(`/api/beheer/marketing/ideeen/${id}`, { method: "PUT", body: { ...rest, datum } });
      ideeen = ideeen.map((x) => (x.id === id ? nieuw : x));
      paneel.bijgewerkt(nieuw);
      melding(`Idee verzet naar ${korteDag(datum)}`);
      teken();
    } catch (e) { melding(e.message, "fout"); }
  }

  /**
   * Van een moment een concept-feit maken. Via ctx.api, zodat een verlopen sessie naar de loginpagina
   * gaat. Nieuw of al bestaand krijgt dezelfde melding; een ingetrokken feit geeft 409 en die
   * foutmelding (afsluitende review, A3 en A10).
   */
  async function maakFeit(m) {
    try {
      await ctx.api(`/api/beheer/marketing/momenten/${encodeURIComponent(m.sleutel)}/feit`, { method: "POST", body: {} });
      melding("Het feit bij dit moment staat in de Feitenbank; zet het daar op actief als het nog een concept is.");
    } catch (e) { melding(e.message, "fout"); }
  }

  /** Een nieuw idee bij een moment, op de dag van de rij (niet in het verleden). */
  function ideeBijMoment(m, dag, knop) {
    const vandaag = vandaagAmsterdam();
    paneel.open({
      datum: dag < vandaag ? vandaag : dag, titel: m.titel, toelichting: m.tekst, sjabloon: null, kop: "",
      feiten: [], moment: m.sleutel, campagne: null, herkomst: "hand", post: null,
    }, knop);
  }

  async function verzet(p, iso) {
    try {
      const nieuw = await ctx.api(`/api/beheer/marketing/posts/${p.id}/status`, { method: "POST", body: { naar: "gepland", gepland: iso } });
      Object.assign(p, nieuw);
      melding(`Verzet naar ${leesbaarMoment(iso)}`);
      teken();
    } catch (e) { melding(e.message, "fout"); }
  }

  function verzetVeld(p) {
    const invoer = el("input", { type: "datetime-local", id: `verzet-${p.id}`, value: naarLokaal(p.gepland), "aria-label": `Nieuw moment voor ${p.titel}` });
    const knop = el("button", { type: "button", class: "secundair klein", text: "Verzet" });
    knop.addEventListener("click", () => {
      const iso = metOffset(invoer.value);
      if (!iso) { veldFout(invoer, "Kies een datum en tijd."); return; }
      veldFout(invoer, "");
      void verzet(p, iso);
    });
    return el("span", { class: "studio-verzet" }, [invoer, knop]);
  }

  function rij(p) {
    return el("tr", {}, [
      el("td", { text: leesbaarMoment(moment(p)) }),
      el("td", {}, [el("a", { href: `#maken/${p.id}`, text: p.titel }), p.campagne ? el("span", { class: "tabel-subtekst", text: campagnes.find((c) => c.id === p.campagne)?.naam ?? "" }) : null]),
      el("td", {}, [el("span", { class: `badge studio-badge-${p.status}`, text: STATUS[p.status] })]),
      el("td", {}, [p.status === "gepland" ? verzetVeld(p) : p.gepubliceerd?.url ? el("a", { href: p.gepubliceerd.url, target: "_blank", rel: "noopener noreferrer", text: "Bekijk de post" }) : null]),
    ]);
  }

  /** Een blok met kop en tabel; `sub` is een regel onder de kop, `onder` komt na de tabel (bv. een lege staat). */
  function tabel(titel, rijen, { sub = null, onder = null } = {}) {
    return el("section", { class: "studio-planblok" }, [
      el("h2", { text: titel }),
      sub ? el("p", { class: "hulptekst studio-planblok-sub", text: sub }) : null,
      rijen.length ? el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
        el("thead", {}, [el("tr", {}, ["Moment", "Post", "Status", ""].map((t) => el("th", { scope: "col", text: t })))]),
        el("tbody", {}, rijen),
      ])]) : null,
      onder,
    ]);
  }

  function ideeRij(i) {
    const knop = el("button", { type: "button", class: "secundair klein", "data-focus": `idee-${i.id}`, "aria-label": `Openen: ${i.titel}`, text: "Openen" });
    knop.addEventListener("click", () => paneel.open(i, knop));
    return el("tr", {}, [
      el("td", { text: korteDag(i.datum) }),
      el("td", {}, [el("span", { text: i.titel }), " ", el("span", { class: "badge studio-badge-idee", text: "Idee" })]),
      el("td", { text: gebruikt(i) ? "Idee, post gemaakt" : "Idee" }),
      el("td", {}, [knop]),
    ]);
  }

  function momentRij(m, dag) {
    const einde = m.tot === dag && m.datum !== dag;
    const feitKnop = el("button", { type: "button", class: "secundair klein", "aria-label": `Maak feit: ${m.titel}`, text: "Maak feit" });
    const ideeKnop = el("button", { type: "button", class: "secundair klein", "data-focus": `moment-${m.sleutel}-${dag}`, "aria-label": `Idee op deze dag: ${m.titel}`, text: "Idee op deze dag" });
    feitKnop.addEventListener("click", () => maakFeit(m));
    ideeKnop.addEventListener("click", () => ideeBijMoment(m, dag, ideeKnop));
    return el("tr", {}, [
      el("td", { text: korteDag(dag) }),
      el("td", {}, [el("span", { text: `${einde ? "Moment eindigt" : "Moment"}: ${m.titel}` }), el("span", { class: "tabel-subtekst", text: m.tekst })]),
      el("td", { text: "Moment" }),
      el("td", {}, [el("div", { class: "rij-acties" }, [feitKnop, ideeKnop])]),
    ]);
  }

  /** De lege staat van een week, met de knop die de week als periode kiest. */
  function legeWeek(w) {
    const knop = el("button", { type: "button", class: "secundair", text: "Ideeën voor deze week" });
    knop.addEventListener("click", () => {
      const vandaag = vandaagAmsterdam();
      zetPeriode({ van: w.maandag < vandaag ? vandaag : w.maandag, tot: w.zondag });
      vanVeld.focus();
    });
    const blok = legeStaat("Nog niets gepland", "Geen geplande post en geen idee in deze week.");
    blok.append(knop);
    return blok;
  }

  function tekenLijst() {
    const t = Date.now();
    const vandaag = vandaagAmsterdam();
    const gepland = posts.filter((p) => p.status === "gepland").sort((a, b) => new Date(a.gepland) - new Date(b.gepland));
    const overDatum = gepland.filter((p) => new Date(p.gepland).getTime() < t);
    const komend = gepland.filter((p) => new Date(p.gepland).getTime() >= t);
    const recent = posts.filter((p) => p.status === "gepubliceerd" && p.gepubliceerd && t - new Date(p.gepubliceerd.op).getTime() < 30 * 86400000)
      .sort((a, b) => new Date(b.gepubliceerd.op) - new Date(a.gepubliceerd.op));
    const blokken = [];
    // De komende zes weken altijd, plus latere weken waarin een geplande post of een idee staat.
    const weken = new Map(komendeWeken(vandaag, 6).map((w) => [w.maandag, { w, rijen: [], gevuld: false }]));
    const eerste = komendeWeken(vandaag, 1)[0].maandag;
    // Open ideeën van vóór deze week raken anders zoek: bovenaan, met dezelfde rij en knoppen als in
    // de weken. Het Overzicht telt ze ook mee. Gebruikte ideeën uit het verleden blijven weg (A7).
    const eerder = ideeen.filter((i) => i.datum < eerste && !gebruikt(i)).sort((a, b) => a.datum.localeCompare(b.datum) || a.titel.localeCompare(b.titel));
    if (eerder.length) {
      blokken.push(tabel("Open ideeën van eerder", eerder.map(ideeRij), { sub: "Nog niet opgepakt. Open een idee om het een nieuwe datum te geven, er een post van te maken of het te wissen." }));
    }
    if (overDatum.length) blokken.push(tabel("Over datum: gepland maar nog niet als gepubliceerd gemarkeerd", overDatum.map(rij)));

    const weekVan = (dag) => {
      const w = komendeWeken(dag, 1)[0];
      if (!weken.has(w.maandag)) weken.set(w.maandag, { w, rijen: [], gevuld: false });
      return weken.get(w.maandag);
    };
    // Sorteren per dag: eerst momenten, dan posts (op tijd), dan ideeën.
    for (const p of komend) {
      const b = weekVan(dagVan(p.gepland));
      b.gevuld = true;
      b.rijen.push({ sorteer: `${dagVan(p.gepland)} 1 ${new Date(p.gepland).toISOString()}`, tr: rij(p) });
    }
    for (const i of ideeen.filter((x) => x.datum >= eerste)) {
      const b = weekVan(i.datum);
      b.gevuld = true;
      b.rijen.push({ sorteer: `${i.datum} 2 ${i.titel}`, tr: ideeRij(i) });
    }
    for (const m of momenten) {
      for (const dag of new Set([m.datum, m.tot].filter(Boolean))) {
        if (dag < eerste) continue;
        const b = weken.get(komendeWeken(dag, 1)[0].maandag);
        if (b) b.rijen.push({ sorteer: `${dag} 0 ${m.titel}`, tr: momentRij(m, dag) });
      }
    }
    for (const { w, rijen, gevuld } of [...weken.values()].sort((x, y) => x.w.maandag.localeCompare(y.w.maandag))) {
      blokken.push(tabel(`Week ${w.week}${w.jaar !== nu.getFullYear() ? ` van ${w.jaar}` : ""}`, rijen.sort((x, y) => x.sorteer.localeCompare(y.sorteer)).map((x) => x.tr), {
        sub: `${korteDag(w.maandag)} t/m ${korteDag(w.zondag)}`,
        onder: gevuld ? null : legeWeek(w),
      }));
    }
    if (recent.length) blokken.push(tabel("Gepubliceerd, afgelopen 30 dagen", recent.map(rij)));
    kalenderHouder.replaceChildren(...blokken);
  }

  function tekenMaand() {
    const vandaag = vandaagAmsterdam();
    const perDag = new Map();
    const bij = (map, dag, x) => { if (!map.has(dag)) map.set(dag, []); map.get(dag).push(x); };
    for (const p of posts) {
      const m = moment(p);
      if (!m || (p.status !== "gepland" && p.status !== "gepubliceerd")) continue;
      bij(perDag, dagVan(m), p);
    }
    const momentenOp = new Map();
    for (const m of momenten) for (const dag of new Set([m.datum, m.tot].filter(Boolean))) bij(momentenOp, dag, m);
    const ideeenOp = new Map();
    for (const i of ideeen) bij(ideeenOp, i.datum, i);
    const weken = maandRaster(jaar, maand);
    const cel = ({ datum, inMaand }) => {
      const lijst = (perDag.get(datum) ?? []).sort((a, b) => new Date(moment(a)) - new Date(moment(b)));
      const inPeriode = Boolean(periode.van && datum >= periode.van && datum <= (periode.tot ?? periode.van));
      const dagKnop = el("button", {
        type: "button", class: "studio-dagnummer studio-dagkeuze", "data-datum": datum, "aria-pressed": String(inPeriode),
        "aria-label": `${langeDag(datum)} ${inPeriode ? "hoort bij" : "kiezen voor"} de periode`, text: String(Number(datum.slice(8))),
      });
      // Shift-klik zou anders tekst in de tabel selecteren; de focus zet kiesDag zelf.
      dagKnop.addEventListener("mousedown", (e) => { if (e.shiftKey) e.preventDefault(); });
      dagKnop.addEventListener("click", (e) => kiesDag(datum, e.shiftKey));
      const td = el("td", { class: `studio-dag${inMaand ? "" : " buiten"}${datum === vandaag ? " vandaag" : ""}${inPeriode ? " gekozen" : ""}` }, [
        dagKnop,
        ...lijst.map((p) => {
          const a = el("a", { href: `#maken/${p.id}`, class: `studio-chip studio-badge-${p.status}`, text: `${new Date(moment(p)).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} ${p.titel}` });
          if (p.status === "gepland") {
            a.draggable = true;
            a.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; });
          }
          return a;
        }),
        ...(momentenOp.get(datum) ?? []).map((m) => el("span", { class: "studio-moment", title: m.tekst, text: m.tot === datum && m.datum !== datum ? `Einde: ${m.titel}` : m.titel })),
        ...(ideeenOp.get(datum) ?? []).map((i) => {
          const klaar = gebruikt(i);
          const knop = el("button", {
            type: "button", class: `studio-chip studio-idee${klaar ? " gebruikt" : ""}`, "data-focus": `idee-${i.id}`, title: i.titel,
            text: `Idee: ${i.titel}`, ...(klaar ? { "aria-label": `Idee: ${i.titel} (post gemaakt)` } : {}),
          });
          knop.addEventListener("click", () => paneel.open(i, knop));
          knop.draggable = true;
          knop.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; });
          return knop;
        }),
      ]);
      td.addEventListener("dragover", (e) => { e.preventDefault(); td.classList.add("sleep-doel"); });
      td.addEventListener("dragleave", () => td.classList.remove("sleep-doel"));
      td.addEventListener("drop", (e) => {
        e.preventDefault();
        td.classList.remove("sleep-doel");
        const id = e.dataTransfer.getData("text/plain");
        // Het voorvoegsel van het id zegt wat er gesleept wordt: p- is een post, i- een idee.
        if (id.startsWith("i-")) {
          const i = ideeen.find((x) => x.id === id);
          if (!i || i.datum === datum) return;
          if (datum < vandaagAmsterdam()) { melding("Een idee kan niet naar een dag in het verleden", "fout"); return; }
          void verzetIdee(i, datum);
          return;
        }
        const p = posts.find((x) => x.id === id);
        if (!p || p.status !== "gepland" || dagVan(p.gepland) === datum) return;
        const iso = verzetNaarDag(p.gepland, datum);
        if (iso && new Date(iso).getTime() > Date.now()) void verzet(p, iso);
        else melding("Een post kan niet naar een moment in het verleden", "fout");
      });
      return td;
    };
    const vorige = el("button", { type: "button", class: "secundair klein", text: "← Vorige maand" });
    const volgende = el("button", { type: "button", class: "secundair klein", text: "Volgende maand →" });
    vorige.addEventListener("click", () => { ({ jaar, maand } = volgendeMaand(jaar, maand, -1)); teken(); });
    volgende.addEventListener("click", () => { ({ jaar, maand } = volgendeMaand(jaar, maand, 1)); teken(); });
    kalenderHouder.replaceChildren(
      el("div", { class: "studio-maandkop" }, [vorige, el("h2", { text: `${MAANDEN[maand]} ${jaar}` }), volgende]),
      el("p", { class: "hulptekst", text: "Klik een begin- en einddag aan om een periode te kiezen; shift-klik breidt hem uit, ook na bladeren. Sleep een geplande post of een idee naar een andere dag; bij een post blijft de tijd gelijk. Met het toetsenbord gebruikt u de datumvelden: bij de periode, in het ideepaneel en in de lijstweergave." }),
      el("div", { class: "tabel-scroll" }, [el("table", { class: "studio-maand" }, [
        el("caption", { class: "visueel-verborgen", text: `Posts, ideeën en momenten in ${MAANDEN[maand]} ${jaar}` }),
        el("thead", {}, [el("tr", {}, DAGEN.map((d) => el("th", { scope: "col", text: d })))]),
        el("tbody", {}, weken.map((w) => el("tr", {}, w.map(cel)))),
      ])]),
    );
  }

  function teken() {
    lijstKnop.setAttribute("aria-pressed", String(weergave === "lijst"));
    maandKnop.setAttribute("aria-pressed", String(weergave === "maand"));
    tekenPeriode();
    if (weergave === "lijst") tekenLijst(); else tekenMaand();
    paneel.ververs();
  }

  lijstKnop.addEventListener("click", () => { weergave = "lijst"; teken(); });
  maandKnop.addEventListener("click", () => { weergave = "maand"; teken(); });
  icsKnop.addEventListener("click", () => {
    const toekomst = (p) => p.gepland && new Date(p.gepland).getTime() > Date.now();
    const gepland = posts.filter((p) => p.status === "gepland" && toekomst(p));
    if (!gepland.length) { melding("Er staan geen posts in de toekomst gepland", "fout"); return; }
    // Teruggezette posts met een toekomstig moment gaan als ingetrokken mee, zodat een eerdere export opgeruimd wordt.
    const ingetrokken = posts.filter((p) => (p.status === "concept" || p.status === "gearchiveerd") && toekomst(p));
    download(maakIcs([...gepland, ...ingetrokken], { basisUrl: location.origin }), "mijntarieftool-marketing.ics", "text/calendar;charset=utf-8");
    melding(`${gepland.length} afspra${gepland.length === 1 ? "ak" : "ken"} in de agenda-export`);
  });

  // ---------------- campagnes ----------------
  function tekenCampagnes() {
    const naam = el("input", { type: "text", id: "campagne-naam", maxlength: "80" });
    const utm = el("input", { type: "text", id: "campagne-utm", maxlength: "50", placeholder: "najaar-2026" });
    const van = el("input", { type: "date", id: "campagne-van" });
    const tot = el("input", { type: "date", id: "campagne-tot" });
    const doel = el("input", { type: "text", id: "campagne-doel", maxlength: "300" });
    let bewerkt = null;
    naam.addEventListener("input", () => { if (!bewerkt && !utm.dataset.zelf) utm.value = naam.value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50); });
    utm.addEventListener("input", () => { utm.dataset.zelf = "1"; });
    const opslaan = el("button", { type: "button", text: "Campagne toevoegen" });
    const annuleren = el("button", { type: "button", class: "secundair", text: "Annuleren", hidden: "" });
    const leeg = () => { bewerkt = null; for (const v of [naam, utm, van, tot, doel]) v.value = ""; delete utm.dataset.zelf; opslaan.textContent = "Campagne toevoegen"; annuleren.hidden = true; };
    annuleren.addEventListener("click", leeg);
    opslaan.addEventListener("click", async () => {
      const body = { naam: naam.value, utmCampagne: utm.value, doel: doel.value, van: van.value || null, tot: tot.value || null, gearchiveerd: bewerkt?.gearchiveerd ?? false };
      opslaan.disabled = true; // geen dubbele aanvraag bij een dubbelklik (BM-21)
      try {
        const c = bewerkt
          ? await ctx.api(`/api/beheer/marketing/campagnes/${bewerkt.id}`, { method: "PUT", body })
          : await ctx.api("/api/beheer/marketing/campagnes", { method: "POST", body });
        campagnes = bewerkt ? campagnes.map((x) => (x.id === c.id ? c : x)) : [...campagnes, c];
        leeg();
        tekenCampagnes();
        melding("Campagne bewaard");
      } catch (e) { melding(e.message, "fout"); } finally { opslaan.disabled = false; }
    });
    const rijen = campagnes.map((c) => el("tr", {}, [
      el("td", {}, [el("b", { text: c.naam }), c.doel ? el("span", { class: "tabel-subtekst", text: c.doel }) : null]),
      el("td", { text: c.utmCampagne }),
      el("td", { text: [c.van, c.tot].filter(Boolean).join(" t/m ") || "–" }),
      el("td", { text: String(posts.filter((p) => p.campagne === c.id).length) }),
      el("td", {}, [el("div", { class: "rij-acties" }, [
        el("button", { type: "button", class: "secundair klein", text: "Bewerken", onclick: () => {
          bewerkt = c; naam.value = c.naam; utm.value = c.utmCampagne; utm.dataset.zelf = "1"; van.value = c.van ?? ""; tot.value = c.tot ?? ""; doel.value = c.doel ?? "";
          opslaan.textContent = "Wijziging bewaren"; annuleren.hidden = false; naam.focus();
        } }),
        el("button", { type: "button", class: "secundair klein", text: c.gearchiveerd ? "Terughalen" : "Archiveren", onclick: async () => {
          try {
            const { id: _i, aangemaakt: _a, gewijzigd: _g, ...rest } = c;
            const nieuw = await ctx.api(`/api/beheer/marketing/campagnes/${c.id}`, { method: "PUT", body: { ...rest, gearchiveerd: !c.gearchiveerd } });
            campagnes = campagnes.map((x) => (x.id === c.id ? nieuw : x));
            tekenCampagnes();
          } catch (e) { melding(e.message, "fout"); }
        } }),
        el("button", { type: "button", class: "secundair klein gevaar", text: "Wissen", onclick: async () => {
          if (!await bevestigDialoog(`Campagne "${c.naam}" wissen?`, { titel: "Campagne wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
          try {
            await ctx.api(`/api/beheer/marketing/campagnes/${c.id}`, { method: "DELETE" });
            campagnes = campagnes.filter((x) => x.id !== c.id);
            tekenCampagnes();
          } catch (e) { melding(e.message, "fout"); }
        } }),
      ])]),
    ]));
    campagneHouder.replaceChildren(
      el("h2", { text: "Campagnes" }),
      el("p", { class: "hulptekst", text: "Een campagne groepeert posts en geeft de UTM-campagnenaam voor de links. Zo zijn posts later toe te rekenen, ook als de site nu nog niets meet." }),
      campagnes.length
        ? el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
          el("thead", {}, [el("tr", {}, ["Campagne", "UTM-naam", "Periode", "Posts", ""].map((t) => el("th", { scope: "col", text: t })))]),
          el("tbody", {}, rijen),
        ])])
        : el("p", { class: "hulptekst", text: "Nog geen campagnes." }),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "campagne-naam", text: "Naam" }), naam]),
        el("div", { class: "veld" }, [el("label", { for: "campagne-utm", text: "UTM-campagnenaam" }), utm]),
        el("div", { class: "veld" }, [el("label", { for: "campagne-van", text: "Van" }), van]),
        el("div", { class: "veld" }, [el("label", { for: "campagne-tot", text: "Tot en met" }), tot]),
      ]),
      el("div", { class: "veld" }, [el("label", { for: "campagne-doel", text: "Doel (optioneel)" }), doel]),
      el("div", { class: "knoppenrij" }, [opslaan, annuleren]),
    );
    // De keuzelijst van campagnes bij de periode volgt de lijst hierboven.
    tekenPeriode();
  }

  container.replaceChildren(
    periodeKaart,
    paneel.element,
    el("div", { class: "kaart" }, [
      el("div", { class: "studio-balk" }, [
        el("div", { class: "knoppenrij", role: "group", "aria-label": "Weergave" }, [lijstKnop, maandKnop]),
        icsKnop,
      ]),
      kalenderHouder,
    ]),
    el("div", { class: "kaart" }, [campagneHouder]),
  );
  teken();
  tekenCampagnes();
}
