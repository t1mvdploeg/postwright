// Marketingstudio — de ideeënplanner in Planning (golf 2): het ideepaneel (een idee bekijken,
// bewerken, wissen of er een post van maken) en de AI-voorstellen over een periode. Planning
// (planning.js) houdt de lijsten en de periode bij en geeft ze via haken mee.
//
// Alle tekst van de AI gaat via `el(..., { text })` of als kindtekst de pagina in, nooit als HTML.
// Voorstellen worden pas ideeën na een vinkje en "Zet in de planner"; niets wordt vanzelf bewaard.
import { bevestigDialoog, el, melding, veldFout } from "/ui.js";
import { SJABLONEN, sjabloon as sjabloonVan, zonderNadruk } from "/marketing/sjablonen.js";
import { ideeNaarRecept, naarInvoer } from "/marketing/recept.js";

const KORT = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const LANG = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** De 404-tekst van de route moment → feit als het moment niet (meer) bestaat (api-marketing.ts; tests/marketing-momenten.test.ts legt hem vast). */
const ONBEKEND_MOMENT = "Onbekend moment";

/** JJJJ-MM-DD kort en leesbaar: "di 6 okt". */
export function korteDag(d) {
  return KORT.format(new Date(`${d}T12:00:00Z`));
}

/** JJJJ-MM-DD voluit: "dinsdag 6 oktober 2026". */
export function langeDag(d) {
  return LANG.format(new Date(`${d}T12:00:00Z`));
}

/** De keuzelijst van campagnes: "Geen campagne" plus de niet-gearchiveerde, en de huidige waarde als die gearchiveerd is. */
export function vulCampagnes(select, campagnes, waarde) {
  const zichtbaar = campagnes.filter((c) => !c.gearchiveerd || c.id === waarde);
  select.replaceChildren(
    el("option", { value: "", text: "Geen campagne" }),
    ...zichtbaar.map((c) => el("option", { value: c.id, text: c.gearchiveerd ? `${c.naam} (gearchiveerd)` : c.naam })),
  );
  select.value = zichtbaar.some((c) => c.id === waarde) ? waarde : "";
}

function veld(id, label, invoer, hulp = null) {
  return el("div", { class: "veld" }, [el("label", { for: id, text: label }), invoer, hulp]);
}

/**
 * Het ideepaneel. `staat()` geeft de actuele lijsten van de planning ({ posts, campagnes, momenten });
 * `bewaard(idee)` en `gewist(id)` werken die bij en tekenen opnieuw. `terugval()` is het element dat
 * de focus krijgt als het element dat het paneel opende er na het sluiten niet meer is.
 *
 * Focus: openen zet hem op de titel, sluiten terug op de opener. Tekent de planning intussen opnieuw
 * (na bewaren of verzetten), dan zoekt het paneel de nieuwe opener op zijn `data-focus`-sleutel.
 */
export function ideePaneel({ ctx, staat, bewaard, gewist, terugval }) {
  let idee = null;
  let opener = null;
  let openerSleutel = null;
  let bezig = false;
  /** De formulierwaarden bij openen (of na bewaren of verzetten): wat daarvan afwijkt, is niet bewaard. */
  let begin = null;

  const kop = el("h2", { text: "Idee" });
  const datum = el("input", { type: "date", id: "idee-datum", required: "" });
  const titel = el("input", { type: "text", id: "idee-titel", maxlength: "120", required: "" });
  const toelichting = el("textarea", { id: "idee-toelichting", rows: "3", maxlength: "1000" });
  const sjabloon = el("select", { id: "idee-sjabloon" }, [
    el("option", { value: "", text: "Nog geen sjabloon" }),
    ...SJABLONEN.map((s) => el("option", { value: s.id, text: s.naam })),
  ]);
  const kopVeld = el("input", { type: "text", id: "idee-kop", maxlength: "200", "aria-describedby": "idee-kop-hulp" });
  const campagne = el("select", { id: "idee-campagne" });
  const info = el("div", { class: "studio-ideeinfo" });
  const bewaarKnop = el("button", { type: "button", text: "Bewaren" });
  const maakKnop = el("button", { type: "button", class: "secundair", text: "Maak post" });
  const openKnop = el("button", { type: "button", class: "secundair", text: "Open post" });
  const wisKnop = el("button", { type: "button", class: "secundair gevaar", text: "Wissen" });
  const sluitKnop = el("button", { type: "button", class: "secundair", text: "Sluiten" });
  const knoppen = [bewaarKnop, maakKnop, openKnop, wisKnop, sluitKnop];

  const element = el("section", { class: "kaart studio-ideepaneel", role: "region", "aria-label": "Idee", hidden: "" }, [
    kop,
    el("div", { class: "veldrij" }, [
      veld("idee-datum", "Datum", datum),
      veld("idee-sjabloon", "Sjabloon", sjabloon),
      veld("idee-campagne", "Campagne", campagne),
    ]),
    veld("idee-titel", "Titel", titel),
    veld("idee-toelichting", "Toelichting (optioneel)", toelichting),
    veld("idee-kop", "Voorstel voor de kop (optioneel)", kopVeld, el("p", { class: "hulptekst", id: "idee-kop-hulp", text: "Zet één frase tussen *sterretjes*" })),
    info,
    el("div", { class: "knoppenrij" }, knoppen),
  ]);

  const gebruikt = () => Boolean(idee?.post && staat().posts.some((p) => p.id === idee.post));

  function invoer() {
    return {
      datum: datum.value, titel: titel.value.trim(), toelichting: toelichting.value.trim(),
      sjabloon: sjabloon.value || null, kop: kopVeld.value.trim(), feiten: [...(idee.feiten ?? [])],
      moment: idee.moment ?? null, campagne: campagne.value || null, herkomst: idee.herkomst ?? "hand", post: idee.post ?? null,
    };
  }

  const formulier = () => ({
    datum: datum.value, titel: titel.value.trim(), toelichting: toelichting.value.trim(),
    sjabloon: sjabloon.value, kop: kopVeld.value.trim(), campagne: campagne.value,
  });

  /** Of er in het open paneel iets is ingetypt of gekozen dat nog niet is bewaard. */
  function onbewaard() {
    if (!idee || element.hidden || !begin) return false;
    const nu = formulier();
    return Object.keys(nu).some((k) => nu[k] !== begin[k]);
  }

  /** Of het formulier afwijkt van het bewaarde idee; een nieuw idee is altijd "gewijzigd". */
  function gewijzigd() {
    if (!idee.id) return true;
    const nu = invoer();
    return ["datum", "titel", "toelichting", "sjabloon", "kop", "campagne"].some((k) => (nu[k] ?? "") !== (idee[k] ?? ""));
  }

  function controleer() {
    const fouten = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum.value)) { veldFout(datum, "Kies een datum."); fouten.push(datum); }
    if (!titel.value.trim()) { veldFout(titel, "Geef het idee een titel."); fouten.push(titel); }
    fouten[0]?.focus();
    return !fouten.length;
  }

  async function bewaar() {
    if (!controleer()) return null;
    const body = invoer();
    const nieuw = idee.id
      ? await ctx.api(`/api/ideeen/${idee.id}`, { method: "PUT", body })
      : await ctx.api("/api/ideeen", { method: "POST", body });
    idee = { ...nieuw };
    begin = formulier();
    bewaard(nieuw);
    return nieuw;
  }

  /** Van idee naar concept-post: eerst het feit bij het moment, dan de post, dan het post-id op het idee. */
  async function maakPost(i) {
    let feiten = [...i.feiten];
    if (i.moment) {
      try {
        const f = await ctx.api(`/api/momenten/${encodeURIComponent(i.moment)}/feit`, { method: "POST", body: {} });
        // Het momentfeit vooraan: een idee draagt hooguit tien feiten, en bij het bijwerken van het
        // idee hieronder valt dan een AI-feit af, niet dit.
        feiten = [f.id, ...feiten.filter((x) => x !== f.id)];
      } catch (e) {
        // Bestaat het moment niet meer, dan zonder dat feit en zonder melding. Elke andere fout (een
        // ingetrokken feit, een volle feitenbank, geen verbinding) wel melden: de post mist dan een feit.
        if (e.message !== ONBEKEND_MOMENT) melding(`De post wordt gemaakt zonder het feit bij het moment: ${e.message}`, "fout");
      }
    }
    const campagneNu = staat().campagnes.some((c) => c.id === i.campagne && !c.gearchiveerd) ? i.campagne : null;
    const s = sjabloonVan(i.sjabloon);
    const recept = ideeNaarRecept({ ...i, feiten, campagne: campagneNu }, { formatenAan: ctx.instellingen.formaten, merkVersie: ctx.merk.versie });
    const post = await ctx.api("/api/posts", { method: "POST", body: naarInvoer(recept, s, null) });
    const { id, aangemaakt: _a, gewijzigd: _g, ...rest } = i;
    try {
      // Een idee draagt hooguit tien feiten (serverschema); de post krijgt ze allemaal.
      await ctx.api(`/api/ideeen/${id}`, { method: "PUT", body: { ...rest, feiten: feiten.slice(0, 10), post: post.id } });
    } catch (e) {
      // De post bestaat al. Hier toch als gebruikt tonen: nog eens "Maak post" gaf een tweede, losse post.
      staat().posts.push(post);
      if (idee?.id === id) { idee.post = post.id; tekenInfo(); }
      melding(`De post is gemaakt, maar niet aan het idee gekoppeld: ${e.message}. U vindt hem in de Bibliotheek.`, "fout");
    }
    ctx.navigeer(`#maken/${post.id}`);
  }

  /**
   * Voert een knopactie uit met alle knoppen uit, en meldt een fout. Een uitgeschakelde knop verliest
   * de focus; staat die daarna nergens (en is het paneel nog open), dan gaat hij terug naar de knop.
   */
  async function metKnoppenUit(actie) {
    if (bezig) return;
    bezig = true;
    const knop = document.activeElement;
    for (const k of knoppen) k.disabled = true;
    try { await actie(); } catch (e) { melding(e.message, "fout"); } finally {
      bezig = false;
      for (const k of knoppen) k.disabled = false;
      const kwijt = !document.activeElement || document.activeElement === document.body;
      if (kwijt && !element.hidden && knop instanceof HTMLElement && knop.isConnected) knop.focus();
    }
  }

  function tekenInfo() {
    const m = idee.moment ? staat().momenten.find((x) => x.sleutel === idee.moment) : null;
    const n = idee.feiten?.length ?? 0;
    info.replaceChildren(...[
      idee.moment ? `Bij moment: ${m ? `${m.titel} (${korteDag(m.datum)})` : idee.moment}` : null,
      n ? `${n} gekoppeld${n === 1 ? " feit" : "e feiten"}` : "Geen gekoppelde feiten",
      idee.herkomst === "ai" ? "Voorgesteld door de AI-hulp" : null,
      gebruikt() ? "Van dit idee is al een post gemaakt." : null,
    ].filter(Boolean).map((t) => el("p", { class: "hulptekst", text: t })));
    kop.textContent = idee.id ? "Idee" : "Nieuw idee";
    maakKnop.hidden = gebruikt();
    openKnop.hidden = !gebruikt();
    wisKnop.hidden = !idee.id;
  }

  /**
   * Een idee in het paneel openen. Niet tijdens een lopende actie (bewaren, post maken, wissen): die
   * werkt op het idee dat nu open staat. Staat er iets onbewaards in het paneel, dan eerst vragen of
   * dat weg mag; hetzelfde idee nog eens aanklikken laat het ingetypte gewoon staan.
   */
  async function open(nieuwIdee, bron = null) {
    if (bezig) return;
    const vanaf = bron ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (onbewaard()) {
      if (idee.id && idee.id === nieuwIdee.id) { titel.focus(); return; }
      const weg = await bevestigDialoog("In het idee dat nu open staat, is iets gewijzigd dat nog niet is bewaard. Die wijzigingen gaan verloren als u een ander idee opent.", {
        titel: "Wijzigingen weggooien?", bevestigTekst: "Weggooien en openen", gevaarlijk: true,
      });
      if (!weg || bezig) return;
    }
    idee = { feiten: [], moment: null, campagne: null, herkomst: "hand", post: null, sjabloon: null, kop: "", toelichting: "", ...nieuwIdee };
    opener = vanaf;
    openerSleutel = opener?.dataset?.focus ?? null;
    for (const v of [datum, titel, toelichting, sjabloon, kopVeld, campagne]) veldFout(v, "");
    datum.value = idee.datum ?? "";
    titel.value = idee.titel ?? "";
    toelichting.value = idee.toelichting ?? "";
    sjabloon.value = idee.sjabloon && sjabloonVan(idee.sjabloon) ? idee.sjabloon : "";
    kopVeld.value = idee.kop ?? "";
    vulCampagnes(campagne, staat().campagnes, idee.campagne);
    begin = formulier();
    tekenInfo();
    element.hidden = false;
    titel.focus();
  }

  function sluit() {
    element.hidden = true;
    const zelfde = openerSleutel ? document.querySelector(`[data-focus="${CSS.escape(openerSleutel)}"]`) : null;
    const doel = opener?.isConnected ? opener : zelfde ?? terugval();
    idee = null;
    begin = null;
    opener = null;
    openerSleutel = null;
    doel?.focus();
  }

  bewaarKnop.addEventListener("click", () => metKnoppenUit(async () => {
    if (await bewaar()) { melding("Idee bewaard"); sluit(); }
  }));
  maakKnop.addEventListener("click", () => metKnoppenUit(async () => {
    if (!sjabloon.value) { veldFout(sjabloon, "Kies eerst een sjabloon."); sjabloon.focus(); return; }
    const i = gewijzigd() ? await bewaar() : idee;
    if (i) await maakPost(i);
  }));
  openKnop.addEventListener("click", () => ctx.navigeer(`#maken/${idee.post}`));
  wisKnop.addEventListener("click", async () => {
    if (!idee?.id || bezig) return;
    if (!await bevestigDialoog(`Idee "${idee.titel}" wissen?`, { titel: "Idee wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
    const id = idee.id;
    await metKnoppenUit(async () => {
      await ctx.api(`/api/ideeen/${id}`, { method: "DELETE" });
      gewist(id);
      melding("Idee gewist");
      sluit();
    });
  });
  sluitKnop.addEventListener("click", sluit);
  element.addEventListener("keydown", (e) => { if (e.key === "Escape" && !element.hidden && !bezig) { e.preventDefault(); sluit(); } });

  return {
    element,
    open,
    /** Een idee is buiten het paneel verzet (slepen): de nieuwe datum overnemen, de rest van het formulier laten staan. */
    bijgewerkt(nieuw) {
      if (!idee || idee.id !== nieuw.id) return;
      idee = { ...nieuw };
      datum.value = nieuw.datum;
      // De nieuwe datum is bewaard; de rest van wat er is ingetypt, blijft onbewaard.
      if (begin) begin.datum = nieuw.datum;
      veldFout(datum, "");
    },
    /** Het idee is buiten het paneel veranderd (bv. de lijsten opnieuw geladen): info en knoppen bijwerken. */
    ververs() { if (idee) tekenInfo(); },
  };
}

/**
 * De AI-voorstellen over een periode. `verzoek()` geeft de body voor de server, of null als er nog
 * iets mist (dan zet de planning zelf de veldfout). `momentTitel(sleutel)` geeft de naam van een
 * moment; `naBewaren()` laadt de ideeën opnieuw en tekent de planning.
 *
 * Geeft de knoppen (`vraag`, `annuleer`), de hulpregel als de AI-hulp uit staat (`uit`) en het
 * blok met de uitkomst (`element`) los terug, zodat de planning ze in het periodepaneel zet.
 */
export function voorstellenPaneel({ ctx, verzoek, momentTitel, naBewaren }) {
  const aan = Boolean(ctx.instellingen.schrijfhulp?.aan);
  const vraag = el("button", { type: "button", text: "Ideeën voorstellen", ...(aan ? {} : { disabled: "" }) });
  const annuleer = el("button", { type: "button", class: "secundair", text: "Annuleren", hidden: "" });
  const uit = aan ? null : el("p", { class: "hulptekst" }, ["De AI-hulp staat uit. ", el("a", { href: "#instellingen", text: "Zet hem aan onder Instellingen" }), "."]);
  const stand = el("p", { class: "hulptekst", role: "status", "aria-live": "polite" });
  const lijst = el("div", { class: "studio-varianten" });
  const zet = el("button", { type: "button", text: "Zet 0 in de planner" });
  const weg = el("button", { type: "button", class: "secundair", text: "Weggooien" });
  const acties = el("div", { class: "knoppenrij", hidden: "" }, [zet, weg]);
  let afbreken = null;
  let voorstellen = [];
  let campagneVanVerzoek = null;
  /** Voor unieke id's van de waarschuwingen, over meerdere aanvragen heen. */
  let volgnummer = 0;

  function telOp() {
    const n = voorstellen.filter((x) => x.vink.checked).length;
    zet.textContent = `Zet ${n} in de planner`;
    zet.disabled = !n;
  }

  function tekenLijst() {
    lijst.replaceChildren(...voorstellen.map((x) => x.article));
    acties.hidden = !voorstellen.length;
    telOp();
  }

  function voorstel(v) {
    const ongedekt = v.ongedekt ?? [];
    // De waarschuwing hoort bij het vinkje: een schermlezer leest hem voor bij het aanvinken.
    const waarschuwing = ongedekt.length ? `voorstel-ongedekt-${++volgnummer}` : null;
    const vink = el("input", { type: "checkbox", ...(waarschuwing ? { "aria-describedby": waarschuwing } : {}) });
    vink.checked = !ongedekt.length;
    vink.addEventListener("change", telOp);
    const s = v.sjabloon ? sjabloonVan(v.sjabloon) : null;
    const article = el("article", { class: "studio-variant" }, [
      el("label", { class: "studio-radio studio-voorsteltitel" }, [vink, el("b", { text: `${korteDag(v.datum)} · ${v.titel}` })]),
      v.toelichting ? el("p", { text: v.toelichting }) : null,
      el("p", { class: "hulptekst", text: s ? `Sjabloon: ${s.naam}` : "Nog geen sjabloon" }),
      v.kop ? el("p", {}, [el("b", { text: "Kop: " }), zonderNadruk(v.kop)]) : null,
      v.moment ? el("p", { class: "hulptekst", text: `Bij: ${momentTitel(v.moment)}` }) : null,
      waarschuwing ? el("p", { class: "studio-waarschuwing", id: waarschuwing, text: `Bevat een getal zonder bron: ${ongedekt.join(", ")}. Loop dit na voordat u het gebruikt.` }) : null,
    ]);
    return { v, vink, article };
  }

  function leeg() {
    voorstellen = [];
    tekenLijst();
  }

  vraag.addEventListener("click", async () => {
    const body = verzoek();
    if (!body) return;
    afbreken = new AbortController();
    vraag.disabled = true;
    annuleer.hidden = false;
    annuleer.focus();
    stand.textContent = "De AI denkt na…";
    leeg();
    try {
      // Via ctx.api, zodat een verlopen sessie naar de loginpagina gaat; Annuleren breekt de fetch af
      // met een AbortError, en die is geen foutmelding.
      const data = await ctx.api("/api/ideeen/voorstellen", { method: "POST", body, signal: afbreken.signal });
      campagneVanVerzoek = body.campagne;
      voorstellen = (data?.voorstellen ?? []).map(voorstel);
      tekenLijst();
      const n = voorstellen.length;
      const vanaf = data?.van && data.van !== body.van ? `, vanaf vandaag (${korteDag(data.van)})` : "";
      stand.textContent = n ? `${n} voorstel${n === 1 ? "" : "len"}${vanaf}` : "Geen bruikbaar voorstel ontvangen.";
    } catch (e) {
      stand.textContent = e.name === "AbortError" ? "Afgebroken." : "";
      if (e.name !== "AbortError") melding(e.message, "fout");
    } finally {
      const hadFocus = document.activeElement === annuleer;
      vraag.disabled = false;
      annuleer.hidden = true;
      afbreken = null;
      if (hadFocus) (voorstellen[0]?.vink ?? vraag).focus();
    }
  });
  annuleer.addEventListener("click", () => afbreken?.abort());

  zet.addEventListener("click", async () => {
    const gekozen = voorstellen.filter((x) => x.vink.checked);
    if (!gekozen.length) return;
    for (const k of [zet, weg, vraag]) k.disabled = true;
    let bewaard = 0;
    try {
      // Na elkaar, zodat bij een fout precies bekend is wat er wél staat.
      for (const x of gekozen) {
        const { datum, titel, toelichting, sjabloon, kop, feiten, moment } = x.v;
        await ctx.api("/api/ideeen", {
          method: "POST",
          body: { datum, titel, toelichting, sjabloon, kop, feiten, moment, campagne: campagneVanVerzoek, herkomst: "ai", post: null },
        });
        bewaard++;
        voorstellen = voorstellen.filter((y) => y !== x);
      }
    } catch (e) {
      melding(`${bewaard} van de ${gekozen.length} ideeën bewaard; de rest staat nog in de lijst. ${e.message}`, "fout");
    }
    const alles = bewaard === gekozen.length;
    if (alles) { voorstellen = []; stand.textContent = ""; } else {
      // De statusregel noemde nog het aantal van vóór het bewaren.
      const n = voorstellen.length;
      stand.textContent = `Nog ${n} voorstel${n === 1 ? "" : "len"} in de lijst`;
    }
    for (const k of [zet, weg]) k.disabled = false;
    vraag.disabled = !aan;
    tekenLijst();
    if (bewaard) {
      try { await naBewaren(); } catch (e) { melding(e.message, "fout"); }
    }
    if (alles) {
      melding(`${bewaard} idee${bewaard === 1 ? "" : "ën"} in de planner gezet`);
      vraag.focus();
    } else zet.focus();
  });
  weg.addEventListener("click", () => {
    leeg();
    stand.textContent = "";
    vraag.focus();
  });

  return { vraag, annuleer, uit, element: el("div", { class: "studio-voorstellen" }, [stand, lijst, acties]) };
}
