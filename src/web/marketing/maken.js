// Marketingstudio — Maken: de sjabloongalerij en de editor. Links de velden, in het midden het
// voorbeeld per formaat, rechts de merkcontrole, de posttekst en de status. Het recept gaat bij
// Bewaren naar de server, samen met de uitkomst van de controle over precies die inhoud.
import { bevestigDialoog, debounce, el, legeStaat, melding, veldFout } from "/app.js";
import { SJABLONEN, bouwBeeld, sjabloon as sjabloonVan, standaardInhoud, veldenVan, zonderNadruk } from "/marketing/sjablonen.js";
import { KANALEN, formaat as formaatVan } from "/marketing/formaten.js";
import { toonVoorbeeld } from "/marketing/render.js";
import { meetOverloop, ruimMeetframesOp } from "/marketing/overloop.js";
import { controleer } from "/marketing/merkcontrole.js";
import { KANAAL_REGELS, lengteVoor, splitsBijVouw, voegUtmToe } from "/marketing/posttekst.js";
import { laadMedia } from "/marketing/merk.js";
import { bouwVelden } from "/marketing/velden-ui.js";
import { exporteerPdf, exporteerPng, exporteerZip } from "/marketing/export-ui.js";
import { leesbaarMoment, metOffset, naarInvoer, naarLokaal, nieuwRecept, vandaagAmsterdam, verplaatsDia, zetOm } from "/marketing/recept.js";
import { schrijfhulpPaneel } from "/marketing/schrijfhulp-ui.js";

const STATUS_LABELS = { concept: "Concept", gepland: "Gepland", gepubliceerd: "Gepubliceerd", gearchiveerd: "Gearchiveerd" };

export async function toon(container, ctx) {
  const [eerste, tweede] = ctx.delen;
  if (!eerste) return toonGalerij(container, ctx);
  if (eerste === "nieuw") {
    if (!sjabloonVan(tweede)) { ctx.navigeer("#maken"); return undefined; }
    return toonEditor(container, ctx, { ...nieuwRecept(tweede, { formatenAan: ctx.instellingen.formaten, merkVersie: ctx.merk.versie }), status: "concept" });
  }
  const post = await ctx.api(`/api/posts/${encodeURIComponent(eerste)}`);
  if (!ctx.geldig()) return undefined;
  return toonEditor(container, ctx, post);
}

// ---------------------------------------------------------------------------------------------
// Galerij
// ---------------------------------------------------------------------------------------------

function toonGalerij(container, ctx) {
  ctx.zetTitel("Maken");
  const kaarten = SJABLONEN.map((s) => {
    const f = s.formaten[0];
    const houder = el("div", { class: "studio-miniatuur", "aria-hidden": "true" });
    const kaart = el("article", { class: "studio-sjabloonkaart" }, [
      houder,
      el("div", { class: "studio-sjabloonkaart-tekst" }, [
        el("h2", { text: s.naam }),
        el("p", { text: s.doel }),
        el("p", { class: "studio-formaatlijst", text: s.formaten.map((x) => formaatVan(x).naam).join(" · ") }),
        s.voorbeelddata ? el("span", { class: "badge badge-concept", text: "Voorbeelddossier" }) : null,
      ]),
      el("a", { class: "knop", href: `#maken/nieuw/${s.id}`, text: `${s.naam} gebruiken`, "aria-label": `Nieuwe post met sjabloon ${s.naam}` }),
    ]);
    // Miniaturen pas tekenen als ze in beeld komen: twaalf volle beelden tegelijk is zwaar.
    kaart.dataset.sjabloon = s.id;
    kaart.dataset.formaat = f;
    return kaart;
  });
  container.replaceChildren(
    el("section", { class: "pagina-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: "Kies een sjabloon" }),
        el("p", { text: "Elk sjabloon komt uit de merkkit. U vult de tekst in; opmaak, kleuren en logo volgen het merk. Een bestaande post opent u vanuit de Bibliotheek." }),
      ]),
    ]),
    el("div", { class: "studio-galerij" }, kaarten),
  );
  const waarnemer = new IntersectionObserver((regels) => {
    for (const r of regels) {
      if (!r.isIntersecting) continue;
      waarnemer.unobserve(r.target);
      const s = sjabloonVan(r.target.dataset.sjabloon);
      const beeld = bouwBeeld({ sjabloon: s.id, inhoud: standaardInhoud(s), formaat: r.target.dataset.formaat, merk: ctx.merk });
      toonVoorbeeld(r.target.querySelector(".studio-miniatuur"), beeld, { maxHoogte: 220 });
    }
  }, { rootMargin: "200px" });
  for (const k of kaarten) waarnemer.observe(k);
  return { verlaat: () => waarnemer.disconnect() };
}

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------

async function toonEditor(container, ctx, begin) {
  const s = sjabloonVan(begin.sjabloon);
  if (!s) throw new Error(`Dit recept gebruikt een onbekend sjabloon (${begin.sjabloon})`);
  const staat = {
    post: structuredClone(begin),
    formaat: begin.formaten[0],
    weergave: "beeld",
    dia: 0,
    overloop: [],
    uitslag: { bevindingen: [], fouten: 0, letOp: 0 },
    // Een nieuwe post die nog niemand heeft aangeraakt, is niets om kwijt te raken.
    onbewaard: false,
    titelHandmatig: Boolean(begin.id),
    kanaal: ctx.instellingen.kanalen[0] ?? "linkedin",
    media: {},
    feiten: null,
    campagnes: [],
    teksten: [],
    mediaLijst: [],
    meting: Promise.resolve(),
    bezig: false,
  };
  ctx.zetTitel(begin.id ? begin.titel : `Nieuw: ${s.naam}`);

  // Bronnen die de editor naast de post nodig heeft; geen ervan is onmisbaar.
  const [feiten, campagnes, teksten, mediaLijst] = await Promise.all([
    ctx.api("/api/feiten").then((r) => r.feiten).catch(() => null),
    ctx.api("/api/campagnes").then((r) => r.campagnes).catch(() => []),
    ctx.api("/api/teksten").then((r) => r.teksten).catch(() => []),
    ctx.api("/api/media").then((r) => r.media).catch(() => []),
  ]);
  if (!ctx.geldig()) return undefined;
  Object.assign(staat, { feiten, campagnes, teksten, mediaLijst });

  const dias = () => staat.post.dias ?? [];
  const huidigeInhoud = () => (s.soort === "carrousel" ? dias()[staat.dia]?.inhoud ?? {} : staat.post.inhoud);
  const huidigeVelden = () => (s.soort === "carrousel" ? veldenVan(s, dias()[staat.dia]?.soort) : s.velden);
  const campagneNaam = () => staat.campagnes.find((c) => c.id === staat.post.campagne)?.utmCampagne ?? "";

  // ---------------- opbouw ----------------
  const bewaarKnop = el("button", { type: "button", text: "Bewaren" });
  const bewaarStand = el("span", { class: "studio-bewaarstand", role: "status" });
  const exportStand = el("p", { class: "hulptekst studio-exportstand", role: "status", "aria-live": "polite" });
  const veldenHouder = el("div", { class: "studio-velden" });
  const diaHouder = el("div", { class: "studio-dias" });
  const formaatTabs = el("div", { class: "studio-tabs", role: "tablist", "aria-label": "Formaat van het voorbeeld" });
  const voorbeeld = el("div", { class: "studio-voorbeeld" });
  const zoneLaag = el("div", { class: "studio-zones", "aria-hidden": "true" });
  const voorbeeldKader = el("div", { class: "studio-voorbeeldkader" }, [voorbeeld, zoneLaag]);
  const diaNav = el("div", { class: "studio-dianav" });
  const controleLijst = el("ul", { class: "studio-controle", "aria-label": "Uitkomst van de merkcontrole" });
  const controleKop = el("h2", { text: "Merkcontrole" });
  const posttekstHouder = el("div", { class: "studio-posttekst" });
  const statusHouder = el("div", { class: "studio-status" });
  const zonesTonen = el("input", { type: "checkbox", id: "studio-zones-tonen" });
  const zoneToggle = el("label", { class: "studio-radio studio-zonestoggle" }, [zonesTonen, el("span", { text: "Veilige zones tonen" })]);
  const beeldKnop = el("button", { type: "button", class: "secundair", "aria-pressed": "true", text: "Beeld" });
  const feedKnop = el("button", { type: "button", class: "secundair", "aria-pressed": "false", text: "In de feed" });
  const weergaveGroep = el("div", { class: "studio-weergave", role: "group", "aria-label": "Weergave van het voorbeeld" }, [beeldKnop, feedKnop]);
  const feedHouder = el("div", { class: "studio-feedhouder" });

  const titelVeld = el("input", { id: "veld-titel", type: "text", maxlength: "120", value: staat.post.titel });
  titelVeld.addEventListener("input", () => { staat.post.titel = titelVeld.value; staat.titelHandmatig = true; wijzigde(false); });

  const formaatKeuze = el("fieldset", { class: "studio-keuze", id: "veld-formaten" }, [
    el("legend", { text: "Formaten" }),
    el("div", { class: "studio-keuze-opties" }, s.formaten.map((f) => {
      const vak = el("input", { type: "checkbox", value: f, ...(staat.post.formaten.includes(f) ? { checked: "" } : {}) });
      vak.addEventListener("change", () => {
        const gekozen = new Set(staat.post.formaten);
        if (vak.checked) gekozen.add(f); else gekozen.delete(f);
        staat.post.formaten = s.formaten.filter((x) => gekozen.has(x));
        if (!staat.post.formaten.includes(staat.formaat)) staat.formaat = staat.post.formaten[0] ?? s.formaten[0];
        tekenTabs();
        wijzigde();
      });
      const uit = !ctx.instellingen.formaten.includes(f);
      return el("label", { class: "studio-radio" }, [vak, el("span", { text: `${formaatVan(f).naam}${uit ? " (uit in Instellingen)" : ""}` })]);
    })),
  ]);

  const campagneKeuze = el("select", { id: "veld-campagne" }, [
    el("option", { value: "", text: "Geen campagne" }),
    ...staat.campagnes.filter((c) => !c.gearchiveerd || c.id === staat.post.campagne).map((c) => el("option", { value: c.id, text: c.naam, ...(c.id === staat.post.campagne ? { selected: "" } : {}) })),
  ]);
  campagneKeuze.addEventListener("change", () => { staat.post.campagne = campagneKeuze.value || null; wijzigde(false); });

  const feitenHouder = el("div", { class: "studio-feitkeuze", id: "veld-feiten" });

  const linkVeld = el("input", { id: "veld-link", type: "url", value: staat.post.link ?? "", placeholder: "https://mijntarieftool.nl/" });
  linkVeld.addEventListener("input", () => { staat.post.link = linkVeld.value; wijzigde(false); });
  const altVeld = el("textarea", { id: "veld-altTekst", rows: "3", maxlength: "1500" });
  altVeld.value = staat.post.altTekst ?? "";
  altVeld.addEventListener("input", () => { staat.post.altTekst = altVeld.value; wijzigde(false); });
  const altUitBeeld = el("button", { type: "button", class: "secundair klein", text: "Neem de tekst uit het beeld over" });
  altUitBeeld.addEventListener("click", () => {
    const i = s.soort === "carrousel" ? dias()[0]?.inhoud ?? {} : staat.post.inhoud;
    altVeld.value = [s.naam, zonderNadruk(i.kop ?? ""), zonderNadruk(i.tekst ?? "")].filter(Boolean).join(". ").replace(/\.\./g, ".");
    altVeld.dispatchEvent(new Event("input"));
  });

  const hulpPaneel = ctx.instellingen.schrijfhulp?.aan
    ? schrijfhulpPaneel({
      ctx, sjabloon: s,
      veldenNu: () => huidigeVelden(),
      postNu: () => staat.post,
      kanaalNu: () => staat.kanaal,
      pasToe: (velden) => {
        const doel = huidigeInhoud();
        for (const [k, v] of Object.entries(velden)) if (k in doel || huidigeVelden().some((x) => x.id === k)) doel[k] = v;
        tekenVelden();
        wijzigde();
      },
      zetPosttekst: (tekst) => { staat.post.posttekst = { ...staat.post.posttekst, [staat.kanaal]: tekst }; tekenPosttekst(); wijzigde(false); },
      zetAlt: (tekst) => { altVeld.value = tekst; altVeld.dispatchEvent(new Event("input")); },
    })
    : null;

  const exportKnoppen = el("div", { class: "knoppenrij studio-exportknoppen" }, [
    el("button", { type: "button", class: "secundair", text: s.soort === "carrousel" ? "Deze dia als PNG" : "Dit formaat als PNG", onclick: () => exporteer("png") }),
    el("button", { type: "button", class: "secundair", text: "Alles als ZIP", onclick: () => exporteer("zip") }),
    s.soort === "carrousel" ? el("button", { type: "button", class: "secundair", text: "PDF voor LinkedIn", onclick: () => exporteer("pdf") }) : null,
  ]);

  const linkerKolom = el("section", { class: "studio-kolom kaart", "aria-label": "Inhoud" }, [
    el("div", { class: "veld" }, [el("label", { for: "veld-titel", text: "Titel (alleen in de studio)" }), titelVeld]),
    s.soort === "carrousel" ? diaHouder : null,
    veldenHouder,
    hulpPaneel?.element ?? null,
    formaatKeuze,
    el("div", { class: "veld" }, [el("label", { for: "veld-campagne", text: "Campagne" }), campagneKeuze]),
    feitenHouder,
  ]);
  const middenKolom = el("section", { class: "studio-kolom studio-midden", "aria-label": "Voorbeeld" }, [
    weergaveGroep,
    formaatTabs,
    voorbeeldKader,
    feedHouder,
    diaNav,
    zoneToggle,
    exportKnoppen,
    exportStand,
  ]);
  const rechterKolom = el("section", { class: "studio-kolom", "aria-label": "Controle, tekst en status" }, [
    el("div", { class: "kaart" }, [controleKop, controleLijst]),
    el("div", { class: "kaart" }, [
      el("h2", { text: "Posttekst" }),
      posttekstHouder,
      el("div", { class: "veld" }, [el("label", { for: "veld-link", text: "Link bij de post" }), linkVeld, el("p", { class: "hulptekst", text: "Met Link invoegen komt hij met UTM in de posttekst." })]),
      el("div", { class: "veld" }, [el("label", { for: "veld-altTekst", text: "Alt-tekst van het beeld" }), altVeld, altUitBeeld]),
    ]),
    el("div", { class: "kaart" }, [el("h2", { text: "Status" }), statusHouder]),
  ]);

  container.replaceChildren(
    el("div", { class: "studio-editorbalk" }, [
      el("a", { href: "#bibliotheek", class: "studio-terug", text: "← Bibliotheek" }),
      bewaarStand,
      bewaarKnop,
    ]),
    el("div", { class: "studio-editor" }, [linkerKolom, middenKolom, rechterKolom]),
  );
  zonesTonen.addEventListener("change", () => { zoneLaag.hidden = !zonesTonen.checked; tekenZones(); });
  zoneLaag.hidden = true;
  feedHouder.hidden = true;
  beeldKnop.addEventListener("click", () => zetWeergave("beeld"));
  feedKnop.addEventListener("click", () => zetWeergave("feed"));
  bewaarKnop.addEventListener("click", () => { void bewaar(); });

  // ---------------- tekenen ----------------
  function tekenVelden() {
    veldenHouder.replaceChildren(...bouwVelden(huidigeVelden(), huidigeInhoud(), {
      media: staat.mediaLijst,
      wijzig: (id, waarde) => {
        // Altijd de inhoud van nú: na Bewaren of een statuswissel vervangt het antwoord van de
        // server staat.post, en een hier vastgehouden object zou dan niemand meer lezen
        // (reviewbevinding 1: alles na de eerste keer bewaren ging stil verloren).
        huidigeInhoud()[id] = waarde;
        // Een illustratiewissel of mediakeuze verandert welke velden ertoe doen; opnieuw opbouwen.
        if (!staat.titelHandmatig && id === "kop" && (s.soort !== "carrousel" || staat.dia === 0)) { staat.post.titel = zonderNadruk(waarde).trim().slice(0, 120); titelVeld.value = staat.post.titel; }
        // Een ander beeld gekozen: eerst als data-URI laden, anders tekent het voorbeeld de lege plek.
        if (huidigeVelden().find((v) => v.id === id)?.soort === "media") {
          void laadBeelden().then(() => { if (ctx.geldig()) { tekenVoorbeeld(); meet(); } });
        }
        wijzigde();
      },
      opUpload: (veldId) => { void upload(veldId); },
    }));
  }

  function tekenDias() {
    if (s.soort !== "carrousel") return;
    const lijst = el("ol", { class: "studio-dialijst", "aria-label": "Dia's" }, dias().map((d, i) => {
      const soort = s.dias.find((x) => x.soort === d.soort);
      const naam = `${soort?.naam ?? d.soort}${d.inhoud?.kop ? `: ${zonderNadruk(d.inhoud.kop)}` : ""}`;
      const kies = el("button", { type: "button", class: `knop-stil studio-dia${i === staat.dia ? " actief" : ""}`, "aria-current": i === staat.dia ? "true" : "false", title: naam, text: `${i + 1}. ${naam}` });
      kies.addEventListener("click", () => { staat.dia = i; tekenAlles(); });
      return el("li", {}, [kies]);
    }));
    // De acties gelden voor de gekozen dia; vier knoppen per regel past niet in een smalle kolom.
    const i = staat.dia;
    const knop = (tekst, actie, uit = false) => el("button", { type: "button", class: "secundair klein", text: tekst, ...(uit ? { disabled: "" } : {}), onclick: actie });
    const acties = el("div", { class: "studio-dia-acties", role: "group", "aria-label": `Dia ${i + 1}` }, [
      knop("↑ Omhoog", () => { staat.dia = verplaatsDia(dias(), i, -1); tekenAlles(); wijzigde(); }, i === 0),
      knop("↓ Omlaag", () => { staat.dia = verplaatsDia(dias(), i, 1); tekenAlles(); wijzigde(); }, i === dias().length - 1),
      knop("Dupliceren", () => { dias().splice(i + 1, 0, structuredClone(dias()[i])); staat.dia = i + 1; tekenAlles(); wijzigde(); }, dias().length >= (s.maxDias ?? 20)),
      knop("Wissen", () => { dias().splice(i, 1); staat.dia = Math.min(staat.dia, dias().length - 1); tekenAlles(); wijzigde(); }, dias().length <= 1),
    ]);
    const soortKeuze = el("select", { id: "nieuwe-dia", "aria-label": "Soort nieuwe dia" }, s.dias.map((d) => el("option", { value: d.soort, text: d.naam })));
    const voegToe = el("button", { type: "button", class: "secundair klein", text: "Dia toevoegen", ...(dias().length >= (s.maxDias ?? 20) ? { disabled: "" } : {}) });
    voegToe.addEventListener("click", () => {
      const soort = soortKeuze.value;
      const plek = soort === "slot" ? dias().length : Math.min(staat.dia + 1, dias().length);
      dias().splice(plek, 0, { soort, inhoud: standaardInhoud(s, soort) });
      staat.dia = plek;
      tekenAlles();
      wijzigde();
    });
    diaHouder.replaceChildren(el("h2", { text: "Dia's" }), lijst, acties, el("div", { class: "studio-dia-toevoegen" }, [soortKeuze, voegToe]));
  }

  function tekenTabs() {
    const formaten = staat.post.formaten.length ? staat.post.formaten : [s.formaten[0]];
    formaatTabs.replaceChildren(...formaten.map((f, i) => {
      const actief = f === staat.formaat;
      const tab = el("button", { type: "button", role: "tab", id: `tab-${f}`, class: `studio-tab${actief ? " actief" : ""}`, "aria-selected": String(actief), tabindex: actief ? "0" : "-1", text: formaatVan(f).naam });
      tab.addEventListener("click", () => { staat.formaat = f; tekenTabs(); tekenVoorbeeld(); });
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const volgende = formaten[(i + (e.key === "ArrowRight" ? 1 : formaten.length - 1)) % formaten.length];
        staat.formaat = volgende;
        tekenTabs();
        tekenVoorbeeld();
        formaatTabs.querySelector(`#tab-${volgende}`)?.focus();
      });
      return tab;
    }));
  }

  function beeldNu() {
    return bouwBeeld({ sjabloon: s.id, inhoud: staat.post.inhoud, dias: staat.post.dias, dia: staat.dia, formaat: staat.formaat, merk: ctx.merk, media: staat.media });
  }

  function tekenVoorbeeld() {
    if (staat.weergave === "feed") { tekenFeed(); return; }
    let beeld;
    try { beeld = beeldNu(); } catch (e) { melding(e.message, "fout"); return; }
    const i = huidigeInhoud();
    const label = `Voorbeeld ${formaatVan(staat.formaat).naam}${s.soort === "carrousel" ? `, dia ${staat.dia + 1}` : ""}: ${[zonderNadruk(i.kop ?? ""), zonderNadruk(i.tekst ?? "")].filter(Boolean).join(" ")}`;
    toonVoorbeeld(voorbeeld, beeld, { maxHoogte: 560, label });
    tekenZones();
    if (s.soort === "carrousel") {
      diaNav.replaceChildren(
        el("button", { type: "button", class: "secundair klein", text: "← Vorige dia", ...(staat.dia === 0 ? { disabled: "" } : {}), onclick: () => { staat.dia -= 1; tekenAlles(); } }),
        el("span", { text: `Dia ${staat.dia + 1} van ${dias().length}` }),
        el("button", { type: "button", class: "secundair klein", text: "Volgende dia →", ...(staat.dia >= dias().length - 1 ? { disabled: "" } : {}), onclick: () => { staat.dia += 1; tekenAlles(); } }),
      );
    }
  }

  // Golf 2, "Feedvoorbeeld": een benadering van de post zoals hij in een tijdlijn staat, met de
  // posttekst van het gekozen kanaal tot aan de vouw. Geen logo's of huisstijl van een platform.
  function tekenFeed() {
    const kanaal = staat.kanaal;
    const { boven, onder } = splitsBijVouw(kanaal, staat.post.posttekst?.[kanaal] ?? "");
    const beeldHouder = el("div", { class: "studio-voorbeeld studio-feed-beeld" });
    feedHouder.replaceChildren(
      el("article", { class: "studio-feed", "aria-label": `Benadering van de post in de tijdlijn van ${KANAAL_REGELS[kanaal].naam}` }, [
        el("header", { class: "studio-feed-kop" }, [el("img", { src: ctx.merk.logos.merkteken, alt: "" }), el("div", {}, [el("b", { text: "Mijntarieftool" }), el("span", { text: "zojuist" })])]),
        el("p", { class: "studio-feed-tekst" }, [boven.trimEnd() || "(Nog geen posttekst voor dit kanaal.)", onder ? el("span", { class: "studio-feed-meer", text: " … meer" }) : null]),
        beeldHouder,
        s.soort === "carrousel" ? el("p", { class: "studio-feed-onder", text: `Document · ${dias().length} pagina's` }) : null,
      ]),
      el("p", { class: "hulptekst", text: "Benadering: elk platform toont het net iets anders." }),
    );
    const f = staat.post.formaten.find((x) => formaatVan(x).kanaal === kanaal) ?? staat.formaat;
    try {
      toonVoorbeeld(beeldHouder, bouwBeeld({ sjabloon: s.id, inhoud: staat.post.inhoud, dias: staat.post.dias, dia: 0, formaat: f, merk: ctx.merk, media: staat.media }), { maxHoogte: 640 });
    } catch (e) { melding(e.message, "fout"); }
  }

  function zetWeergave(w) {
    staat.weergave = w;
    beeldKnop.setAttribute("aria-pressed", String(w === "beeld"));
    feedKnop.setAttribute("aria-pressed", String(w === "feed"));
    formaatTabs.hidden = w === "feed";
    voorbeeldKader.hidden = w === "feed";
    diaNav.hidden = w === "feed";
    zoneToggle.hidden = w === "feed";
    feedHouder.hidden = w !== "feed";
    tekenVoorbeeld();
  }

  function tekenZones() {
    if (zoneLaag.hidden) return;
    const f = formaatVan(staat.formaat);
    const schaal = Number(voorbeeld.style.getPropertyValue("--schaal")) || 1;
    zoneLaag.style.width = `${f.breedte * schaal}px`;
    zoneLaag.style.height = `${f.hoogte * schaal}px`;
    zoneLaag.replaceChildren(...f.veiligeZones.map((z) => el("span", {
      class: "studio-zone",
      style: `left:${z.x * schaal}px;top:${z.y * schaal}px;width:${z.breedte * schaal}px;height:${z.hoogte * schaal}px`,
      title: z.reden,
    })));
    if (!f.veiligeZones.length) zoneLaag.replaceChildren(el("span", { class: "studio-zone-geen", text: "Dit formaat heeft geen veilige zones" }));
  }

  function controleNu() {
    staat.uitslag = controleer({
      post: staat.post, sjabloon: s, instellingen: ctx.instellingen, feiten: staat.feiten,
      vandaag: vandaagAmsterdam(), merkVersie: ctx.merk.versie, overloop: staat.overloop,
    });
    return staat.uitslag;
  }

  function tekenControle() {
    const u = controleNu();
    controleKop.textContent = u.fouten ? `Merkcontrole: ${u.fouten} fout${u.fouten === 1 ? "" : "en"}` : u.letOp ? `Merkcontrole: ${u.letOp} om op te letten` : "Merkcontrole: in orde";
    const regel = (b) => {
      const teken = b.niveau === "fout" ? "Fout" : b.niveau === "let-op" ? "Let op" : "In orde";
      const tekst = el("span", { text: b.tekst });
      const inhoud = [el("b", { class: `studio-niveau niveau-${b.niveau}`, text: teken }), tekst];
      if (b.veld || b.kanaal) {
        const ga = el("button", { type: "button", class: "knop-stil studio-ganaar", text: "Ga naar", "aria-label": `Ga naar: ${b.tekst}` });
        ga.addEventListener("click", () => gaNaar(b));
        inhoud.push(ga);
      }
      return el("li", { class: `niveau-${b.niveau}` }, inhoud);
    };
    // Wat in orde is, staat ingeklapt: het paneel gaat over wat er nog moet gebeuren.
    const open = u.bevindingen.filter((b) => b.niveau !== "ok");
    const ok = u.bevindingen.filter((b) => b.niveau === "ok");
    controleLijst.replaceChildren(
      ...open.map(regel),
      ...(ok.length ? [el("li", { class: "studio-controle-ok" }, [el("details", {}, [
        el("summary", { text: `${ok.length} punt${ok.length === 1 ? "" : "en"} in orde` }),
        el("ul", { class: "studio-controle" }, ok.map(regel)),
      ])])] : []),
    );
  }

  function gaNaar(b) {
    if (b.kanaal) { staat.kanaal = b.kanaal; tekenPosttekst(); tekenStatus({ behoud: true }); feedOpnieuw(); posttekstHouder.querySelector("textarea")?.focus(); return; }
    if (b.dia !== null && b.dia !== undefined && b.dia !== staat.dia) { staat.dia = b.dia; tekenAlles(); }
    const doel = document.getElementById(`veld-${b.veld}`);
    (doel?.matches("fieldset") ? doel.querySelector("input") : doel)?.focus();
  }

  function tekenFeiten() {
    if (staat.feiten === null) { feitenHouder.replaceChildren(el("p", { class: "hulptekst", text: "De feitenbank kon niet worden geladen." })); return; }
    const zoek = el("input", { type: "search", id: "feit-zoek", placeholder: "Zoek een feit", "aria-label": "Zoek een feit" });
    const lijst = el("div", { class: "studio-feitlijst" });
    const vandaag = vandaagAmsterdam();
    const vul = () => {
      const q = zoek.value.trim().toLowerCase();
      const zichtbaar = staat.feiten.filter((f) => staat.post.feiten.includes(f.id) || (!q || f.tekst.toLowerCase().includes(q)));
      lijst.replaceChildren(...zichtbaar.slice(0, 40).map((f) => {
        const vak = el("input", { type: "checkbox", value: f.id, ...(staat.post.feiten.includes(f.id) ? { checked: "" } : {}) });
        vak.addEventListener("change", () => {
          staat.post.feiten = vak.checked ? [...new Set([...staat.post.feiten, f.id])] : staat.post.feiten.filter((x) => x !== f.id);
          wijzigde(false);
        });
        const verlopen = f.geldigTot && f.geldigTot < vandaag;
        const stand = f.status !== "actief" ? f.status : verlopen ? "verlopen" : "";
        return el("label", { class: "studio-radio" }, [vak, el("span", { text: f.tekst }), stand ? el("span", { class: "badge badge-waarschuwing", text: stand }) : null]);
      }));
      if (!staat.feiten.length) lijst.replaceChildren(el("p", { class: "hulptekst" }, ["Nog geen feiten. Zonder actief feit keurt de merkcontrole elk getal af en kan de post niet gepland worden: draai in de ", el("a", { href: "#feiten", text: "feitenbank" }), " eerst de startvulling en zet de feiten op actief."]));
      else if (!staat.feiten.some((f) => f.status === "actief")) lijst.prepend(el("p", { class: "studio-waarschuwing" }, ["Er is nog geen actief feit: de merkcontrole keurt elk getal af. Loop de concept-feiten na in de ", el("a", { href: "#feiten", text: "feitenbank" }), " en zet ze op actief."]));
    };
    zoek.addEventListener("input", vul);
    vul();
    feitenHouder.replaceChildren(
      el("div", { class: "studio-veldkop" }, [el("span", { class: "label", text: "Feiten bij deze post" }), el("a", { href: "#feiten", text: "Feitenbank" })]),
      el("p", { class: "hulptekst", text: "Elk getal in het beeld of de posttekst moet in een gekoppeld, actief feit staan." }),
      zoek, lijst,
    );
  }

  function tekenPosttekst() {
    const kanalen = ctx.instellingen.kanalen.length ? ctx.instellingen.kanalen : ["linkedin"];
    if (!kanalen.includes(staat.kanaal)) staat.kanaal = kanalen[0];
    const kanaal = staat.kanaal;
    const regels = KANAAL_REGELS[kanaal];
    const tabs = el("div", { class: "studio-tabs", role: "tablist", "aria-label": "Kanaal" }, kanalen.map((k) => {
      const t = el("button", { type: "button", role: "tab", class: `studio-tab${k === kanaal ? " actief" : ""}`, "aria-selected": String(k === kanaal), text: KANALEN[k] });
      t.addEventListener("click", () => { staat.kanaal = k; tekenPosttekst(); tekenStatus({ behoud: true }); feedOpnieuw(); });
      return t;
    }));
    const veld = el("textarea", { id: "veld-posttekst", rows: "8", "aria-label": `Posttekst voor ${regels.naam}` });
    veld.value = staat.post.posttekst?.[kanaal] ?? "";
    const teller = el("p", { class: "studio-teller" });
    const vouw = el("p", { class: "hulptekst studio-vouw" });
    const zet = () => {
      const n = lengteVoor(kanaal, veld.value);
      teller.textContent = `${n} / ${regels.maxTekens} tekens${kanaal === "x" ? " (een link telt als 23)" : ""}`;
      teller.classList.toggle("te-veel", n > regels.maxTekens);
      const { boven, onder } = splitsBijVouw(kanaal, veld.value);
      vouw.textContent = regels.vouw && onder ? `Zichtbaar vóór "meer weergeven" (ongeveer): "${boven.trim()}…"` : "";
    };
    veld.addEventListener("input", () => { staat.post.posttekst = { ...staat.post.posttekst, [kanaal]: veld.value }; zet(); wijzigde(false); feedOpnieuw(); });
    zet();
    const voegIn = (tekst) => {
      const { selectionStart: a, selectionEnd: b, value } = veld;
      const voor = value.slice(0, a);
      const scheiding = voor && !/\s$/.test(voor) ? "\n\n" : "";
      veld.value = `${voor}${scheiding}${tekst}${value.slice(b)}`;
      veld.dispatchEvent(new Event("input"));
      veld.focus();
    };
    const linkKnop = el("button", { type: "button", class: "secundair klein", text: "Link invoegen" });
    linkKnop.addEventListener("click", () => {
      const link = voegUtmToe(staat.post.link, {
        bron: ctx.instellingen.utm.bron?.[kanaal] ?? kanaal, medium: ctx.instellingen.utm.medium,
        campagne: campagneNaam(), inhoud: staat.post.id ?? "",
      });
      if (!link) { veldFout(linkVeld, "Vul eerst een link in die met https:// begint."); linkVeld.focus(); return; }
      veldFout(linkVeld, "");
      voegIn(link);
    });
    const tagKnop = el("button", { type: "button", class: "secundair klein", text: "Standaardhashtags" });
    tagKnop.addEventListener("click", () => voegIn(ctx.instellingen.standaardHashtags));
    const uitBank = el("select", { "aria-label": "Tekst uit de tekstenbank invoegen" }, [
      el("option", { value: "", text: "Uit de tekstenbank…" }),
      ...staat.teksten.map((t) => el("option", { value: t.id, text: `${t.soort}: ${t.naam}` })),
    ]);
    uitBank.addEventListener("change", () => {
      const t = staat.teksten.find((x) => x.id === uitBank.value);
      if (t) voegIn(t.tekst);
      uitBank.value = "";
    });
    const kopieer = el("button", { type: "button", class: "secundair klein", text: "Kopieer tekst" });
    kopieer.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(veld.value); melding("Posttekst gekopieerd"); } catch { veld.select(); melding("Kopiëren lukte niet; de tekst is geselecteerd", "fout"); }
    });
    posttekstHouder.replaceChildren(tabs, veld, teller, vouw, el("div", { class: "knoppenrij" }, [linkKnop, tagKnop, uitBank, kopieer]));
  }

  /** Golf 2, "Omzetten": een nieuwe conceptpost in een ander sjabloon; het origineel blijft staan. */
  function omzettenVeld() {
    const keuze = el("select", { id: "veld-omzetten" }, SJABLONEN.filter((x) => x.id !== s.id).map((x) => el("option", { value: x.id, text: x.naam })));
    const knop = el("button", { type: "button", class: "secundair", text: "Omzetten" });
    knop.addEventListener("click", async () => {
      try {
        const doel = sjabloonVan(keuze.value);
        const nieuw = await ctx.api("/api/posts", { method: "POST", body: naarInvoer(zetOm(staat.post, doel.id, { formatenAan: ctx.instellingen.formaten, merkVersie: ctx.merk.versie }), doel, null) });
        melding(`Nieuwe post als ${doel.naam} gemaakt; het origineel is ongewijzigd`);
        ctx.navigeer(`#maken/${nieuw.id}`);
      } catch (e) { melding(e.message, "fout"); }
    });
    return el("div", { class: "veld" }, [
      el("label", { for: "veld-omzetten", text: "Omzetten naar een ander sjabloon" }),
      el("div", { class: "studio-media-rij" }, [keuze, knop]),
    ]);
  }

  /** Golf 2, "Resultaten": alleen bij een gepubliceerde post, elk veld leeg of een geheel getal ≥ 0. */
  function resultaatVeld(p) {
    const vert = el("input", { type: "number", id: "veld-resultaat-vertoningen", min: "0", step: "1" });
    const reac = el("input", { type: "number", id: "veld-resultaat-reacties", min: "0", step: "1" });
    const klik = el("input", { type: "number", id: "veld-resultaat-klikken", min: "0", step: "1" });
    const vul = (veld, w) => { if (typeof w === "number") veld.value = String(w); };
    vul(vert, p.resultaat?.vertoningen);
    vul(reac, p.resultaat?.reacties);
    vul(klik, p.resultaat?.klikken);
    const bewaren = el("button", { type: "button", text: "Resultaat bewaren" });
    bewaren.addEventListener("click", async () => {
      const getal = (veld) => (veld.value.trim() === "" ? null : Number(veld.value));
      const waarden = { vertoningen: getal(vert), reacties: getal(reac), klikken: getal(klik) };
      for (const [veld, w] of [[vert, waarden.vertoningen], [reac, waarden.reacties], [klik, waarden.klikken]]) {
        if (w !== null && (!Number.isInteger(w) || w < 0)) { veldFout(veld, "Een geheel getal van 0 of meer."); veld.focus(); return; }
        veldFout(veld, "");
      }
      // Net als bij een statuswissel eerst de onbewaarde inhoud bewaren: het antwoord hieronder
      // vervangt staat.post door de serverkopie en zou die inhoud anders stil weggooien. De cijfers
      // zijn hierboven al gelezen, dus dat bewaren het statuspaneel opnieuw opbouwt, raakt ze niet.
      if (staat.onbewaard && !await bewaar()) return;
      try {
        const p2 = await ctx.api(`/api/posts/${staat.post.id}/resultaat`, { method: "PUT", body: waarden });
        staat.post = { ...staat.post, ...p2 };
        tekenStatus();
        tekenBewaarStand();
        melding("Resultaat bewaard");
      } catch (e) { melding(e.message, "fout"); }
    });
    return el("fieldset", { class: "studio-keuze", id: "veld-resultaat" }, [
      el("legend", { text: "Resultaat" }),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "veld-resultaat-vertoningen", text: "Vertoningen" }), vert]),
        el("div", { class: "veld" }, [el("label", { for: "veld-resultaat-reacties", text: "Reacties" }), reac]),
        el("div", { class: "veld" }, [el("label", { for: "veld-resultaat-klikken", text: "Klikken" }), klik]),
      ]),
      p.resultaat ? el("p", { class: "hulptekst", text: `Bijgewerkt op ${leesbaarMoment(p.resultaat.op)}` }) : null,
      bewaren,
    ]);
  }

  /**
   * Het statuspaneel opnieuw opbouwen. Met `behoud` (een kanaalwissel: alleen de teksten bij
   * "Klaar om te posten" veranderen) blijft staan wat al is ingetypt, zoals een plandatum, de link
   * van de post of de resultaatcijfers, en blijft "Klaar om te posten" open als het open stond. Na
   * een statuswissel of bewaren niet: dan hoort het paneel bij de nieuwe stand van de post.
   */
  function tekenStatus({ behoud = false } = {}) {
    const ingetypt = behoud ? [...statusHouder.querySelectorAll("input[id], select[id]")].map((x) => [x.id, x.value]) : [];
    const klaarOpen = behoud && Boolean(statusHouder.querySelector("details.studio-klaar")?.open);
    bouwStatus();
    for (const [id, waarde] of ingetypt) {
      const x = statusHouder.querySelector(`#${CSS.escape(id)}`);
      if (x) x.value = waarde;
    }
    const klaar = statusHouder.querySelector("details.studio-klaar");
    if (klaarOpen && klaar) klaar.open = true;
  }

  function bouwStatus() {
    const p = staat.post;
    const regels = [el("p", {}, [el("span", { class: `badge studio-badge-${p.status ?? "concept"}`, text: STATUS_LABELS[p.status ?? "concept"] })])];
    if (!p.id) {
      regels.push(el("p", { class: "hulptekst", text: "Nog niet bewaard. Bewaar de post om hem te kunnen plannen." }));
      statusHouder.replaceChildren(...regels, el("div", { class: "studio-statusacties" }, [omzettenVeld()]));
      return;
    }
    if (p.status === "gepland") regels.push(el("p", { text: `Gepland: ${leesbaarMoment(p.gepland)}` }));
    if (p.status === "gepubliceerd") {
      regels.push(el("p", {}, [`Gepubliceerd: ${leesbaarMoment(p.gepubliceerd?.op)}`, p.gepubliceerd?.url ? el("a", { href: p.gepubliceerd.url, target: "_blank", rel: "noopener noreferrer", text: " · bekijk de post" }) : null]));
      regels.push(resultaatVeld(p));
    }
    const acties = [omzettenVeld()];
    if (p.status === "concept" || p.status === "gepland") {
      const moment = el("input", { type: "datetime-local", id: "veld-gepland", value: p.gepland ? naarLokaal(p.gepland) : "" });
      const plan = el("button", { type: "button", text: p.status === "gepland" ? "Verzetten" : "Plannen" });
      plan.addEventListener("click", async () => {
        const iso = metOffset(moment.value);
        if (!iso) { veldFout(moment, "Kies een datum en tijd."); moment.focus(); return; }
        veldFout(moment, "");
        await zetStatus({ naar: "gepland", gepland: iso });
      });
      acties.push(el("div", { class: "veld" }, [el("label", { for: "veld-gepland", text: "Datum en tijd van plaatsen" }), moment]), plan);
    }
    if (p.status === "gepland" || p.status === "concept") {
      const r = KANAAL_REGELS[staat.kanaal];
      const url = el("input", { type: "url", id: "veld-publicatie-url", placeholder: "https://…" });
      const pub = el("button", { type: "button", class: "secundair", text: "Markeer als gepubliceerd" });
      pub.addEventListener("click", () => zetStatus({ naar: "gepubliceerd", ...(url.value.trim() ? { url: url.value.trim() } : {}) }));
      acties.push(el("details", { class: "blok studio-klaar" }, [
        el("summary", { text: "Klaar om te posten" }),
        el("div", { class: "blok-inhoud" }, [
          el("ol", { class: "studio-checklist" }, [
            el("li", {}, [el("button", { type: "button", class: "secundair klein", text: "Download de beelden (ZIP)", onclick: () => exporteer("zip") })]),
            el("li", {}, [el("button", { type: "button", class: "secundair klein", text: `Kopieer de posttekst voor ${r.naam}`, onclick: async () => { try { await navigator.clipboard.writeText(staat.post.posttekst?.[staat.kanaal] ?? ""); melding("Posttekst gekopieerd"); } catch { melding("Kopiëren lukte niet", "fout"); } } })]),
            el("li", {}, [el("a", { href: r.plaatsen, target: "_blank", rel: "noopener noreferrer", text: `Open ${r.naam}` })]),
            el("li", {}, [el("label", { for: "veld-publicatie-url", text: "Plak de link van de post (optioneel)" }), url, pub]),
          ]),
        ]),
      ]));
    }
    if (p.status !== "concept") acties.push(el("button", { type: "button", class: "secundair", text: "Terug naar concept", onclick: () => zetStatus({ naar: "concept" }) }));
    if (p.status !== "gearchiveerd") acties.push(el("button", { type: "button", class: "secundair", text: "Archiveren", onclick: () => zetStatus({ naar: "gearchiveerd" }) }));
    acties.push(
      el("button", { type: "button", class: "secundair", text: "Dupliceren", onclick: dupliceer }),
      el("button", { type: "button", class: "secundair gevaar", text: "Wissen", onclick: wis }),
    );
    statusHouder.replaceChildren(...regels, el("div", { class: "studio-statusacties" }, acties));
  }

  function tekenBewaarStand() {
    bewaarStand.textContent = staat.onbewaard ? "Niet bewaard"
      : !staat.post.id ? "Nog niet bewaard"
        : `Bewaard om ${new Date(staat.post.gewijzigd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    bewaarStand.classList.toggle("onbewaard", staat.onbewaard);
  }

  function tekenAlles() {
    tekenDias();
    tekenVelden();
    tekenTabs();
    tekenVoorbeeld();
    tekenControle();
  }

  // ---------------- gedrag ----------------
  const meet = debounce(() => { staat.meting = meetAlles(); }, 500);
  const tekenUitgesteld = debounce(() => { tekenVoorbeeld(); tekenControle(); tekenDias(); }, 120);
  const feedOpnieuw = debounce(() => { if (staat.weergave === "feed") tekenFeed(); }, 150);

  async function meetAlles() {
    const lijst = s.soort === "carrousel" ? dias().map((_, i) => i) : [0];
    const namen = {};
    const uit = [];
    for (const f of staat.post.formaten) {
      for (const dia of lijst) {
        const velden = s.soort === "carrousel" ? veldenVan(s, dias()[dia]?.soort) : s.velden;
        for (const v of velden) namen[v.id] = `de ${v.label.toLowerCase()}`;
        try {
          const beeld = bouwBeeld({ sjabloon: s.id, inhoud: staat.post.inhoud, dias: staat.post.dias, dia, formaat: f, merk: ctx.merk, media: staat.media });
          uit.push(...await meetOverloop(beeld, formaatVan(f), { dia: s.soort === "carrousel" ? dia : null, namen }));
        } catch { /* een beeld dat niet te bouwen is, meldt tekenVoorbeeld al */ }
      }
    }
    if (!ctx.geldig()) return;
    staat.overloop = uit;
    tekenControle();
  }

  function wijzigde(beeld = true) {
    staat.onbewaard = true;
    tekenBewaarStand();
    if (beeld) { tekenUitgesteld(); meet(); } else tekenControle();
  }

  async function laadBeelden() {
    const ids = [staat.post.inhoud ?? {}, ...dias().map((d) => d.inhoud ?? {})].flatMap((i) => Object.values(i));
    staat.media = { ...staat.media, ...await laadMedia(ids) };
  }

  async function upload(veldId) {
    const bestand = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
    bestand.addEventListener("change", async () => {
      const f = bestand.files?.[0];
      if (!f) return;
      try {
        const r = await fetch("/api/media", { method: "POST", headers: { "content-type": f.type || "application/octet-stream" }, body: f });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.fout ?? `Uploaden mislukte (${r.status})`);
        staat.mediaLijst = [data, ...staat.mediaLijst.filter((m) => m.id !== data.id)];
        huidigeInhoud()[veldId] = data.id;
        await laadBeelden();
        tekenVelden();
        wijzigde();
        melding("Beeld geüpload");
      } catch (e) { melding(e.message, "fout"); }
    });
    bestand.click();
  }

  async function bewaar() {
    if (staat.bezig) return false;
    if (staat.post.link && !voegUtmToe(staat.post.link, {})) { veldFout(linkVeld, "Een link moet met https:// beginnen."); linkVeld.focus(); return false; }
    veldFout(linkVeld, "");
    staat.bezig = true;
    bewaarKnop.disabled = true;
    try {
      // De controle moet over de laatste inhoud gaan, inclusief de overloopmeting.
      await meetAlles();
      const u = controleNu();
      const invoer = naarInvoer(staat.post, s, { fouten: u.fouten, letOp: u.letOp, op: new Date().toISOString() });
      const nieuw = !staat.post.id;
      const voorStatus = staat.post.status;
      const antwoord = nieuw
        ? await ctx.api("/api/posts", { method: "POST", body: invoer })
        : await ctx.api(`/api/posts/${staat.post.id}`, { method: "PUT", body: { ...invoer, versie: staat.post.versie } });
      if (!ctx.geldig()) return false;
      // De server zet utm_content op het eigen post-id; bij een nieuwe post of een link die vóór
      // het eerste bewaren is ingevoegd, wijkt de teruggekomen tekst dan af van wat hier stond.
      const afwijkendeTekst = JSON.stringify(antwoord.posttekst ?? {}) !== JSON.stringify(invoer.posttekst);
      staat.post = { ...staat.post, ...antwoord };
      staat.onbewaard = false;
      staat.titelHandmatig = true;
      if (nieuw) ctx.vervangAdres(`#maken/${antwoord.id}`);
      ctx.zetTitel(antwoord.titel);
      tekenBewaarStand();
      tekenStatus();
      // Ook de feed: die toont dezelfde posttekst (buiten de feedstand doet feedOpnieuw niets).
      if (afwijkendeTekst) { tekenPosttekst(); feedOpnieuw(); }
      if (antwoord.status === "concept" && voorStatus === "gepland") melding("De post staat weer op concept: de controle vond nog een fout", "fout");
      else melding("Bewaard");
      return true;
    } catch (e) {
      melding(e.message, "fout");
      return false;
    } finally {
      staat.bezig = false;
      bewaarKnop.disabled = false;
    }
  }

  async function zetStatus(overgang) {
    if (staat.onbewaard && !await bewaar()) return;
    try {
      const p = await ctx.api(`/api/posts/${staat.post.id}/status`, { method: "POST", body: overgang });
      staat.post = { ...staat.post, ...p };
      tekenStatus();
      tekenBewaarStand();
      melding(`Status: ${STATUS_LABELS[p.status].toLowerCase()}`);
    } catch (e) { melding(e.message, "fout"); }
  }

  async function dupliceer() {
    if (staat.onbewaard && !await bewaar()) return;
    try {
      const kopie = await ctx.api(`/api/posts/${staat.post.id}/dupliceer`, { method: "POST", body: {} });
      ctx.navigeer(`#maken/${kopie.id}`);
    } catch (e) { melding(e.message, "fout"); }
  }

  async function wis() {
    if (!await bevestigDialoog(`De post "${staat.post.titel}" wordt definitief gewist. Het recept is daarna weg.`, { titel: "Post wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
    try {
      await ctx.api(`/api/posts/${staat.post.id}`, { method: "DELETE" });
      staat.onbewaard = false;
      ctx.navigeer("#bibliotheek");
    } catch (e) { melding(e.message, "fout"); }
  }

  async function exporteer(soort) {
    if (staat.bezig) return;
    const u = controleNu();
    if (u.fouten && !await bevestigDialoog(`De merkcontrole vond nog ${u.fouten} fout${u.fouten === 1 ? "" : "en"}. Toch exporteren?`, { titel: "Exporteren met fouten?", bevestigTekst: "Toch exporteren" })) return;
    staat.bezig = true;
    for (const k of exportKnoppen.querySelectorAll("button")) k.disabled = true;
    const voortgang = (i, n) => { exportStand.textContent = `Bezig: beeld ${i} van ${n}…`; };
    try {
      exportStand.textContent = "Bezig met exporteren…";
      if (soort === "png") await exporteerPng(staat.post, s, ctx.merk, staat.formaat, staat.dia, campagneNaam());
      else if (soort === "zip") await exporteerZip(staat.post, s, ctx.merk, campagneNaam(), voortgang);
      else await exporteerPdf(staat.post, s, ctx.merk, campagneNaam(), voortgang);
      exportStand.textContent = "Klaar; de download is gestart.";
    } catch (e) {
      exportStand.textContent = "";
      melding(e.message, "fout");
    } finally {
      staat.bezig = false;
      for (const k of exportKnoppen.querySelectorAll("button")) k.disabled = false;
    }
  }

  // ---------------- start ----------------
  await laadBeelden();
  if (!ctx.geldig()) return undefined;
  tekenAlles();
  tekenFeiten();
  tekenPosttekst();
  tekenStatus();
  tekenBewaarStand();
  meet();
  const herschaal = new ResizeObserver(debounce(() => tekenVoorbeeld(), 100));
  herschaal.observe(voorbeeldKader);

  return {
    heeftOnbewaard: () => staat.onbewaard,
    verlaat: () => { herschaal.disconnect(); ruimMeetframesOp(); },
  };
}
