// De hulpfuncties van de studio: één plek voor de verbinding met de server, het bouwen van
// elementen en de gedeelde bouwstenen (melding, dialoog, veldfout, lege staat, icoon).
// Platte browser-ESM zonder build-stap; het bestand laadt ook in een kale Node-omgeving (tests),
// dus alles wat de DOM aanraakt zit in een functie of achter een `typeof document`-controle.

/**
 * Elk scherm praat via deze ene functie met de server. Een fout komt terug als `Error` met de
 * melding van de server (`fout`), de HTTP-status in `.status` en de ruwe inhoud in `.data`.
 */
export async function api(pad, opties = {}) {
  const init = { method: opties.method ?? "GET", headers: { "content-type": "application/json" } };
  if (opties.body !== undefined) init.body = JSON.stringify(opties.body);
  if (opties.signal) init.signal = opties.signal;
  // Een netwerkfout (TypeError; een AbortError blijft zoals hij is) of een gateway-fout zonder
  // JSON-antwoord krijgt een Nederlandse melding in plaats van "Failed to fetch"/"Fout 502".
  const GEEN_VERBINDING = "Geen verbinding met de server; probeer het opnieuw.";
  const r = await fetch(pad, init).catch((e) => { throw e instanceof TypeError ? new Error(GEEN_VERBINDING) : e; });
  const tekst = await r.text();
  let data = null;
  try { data = tekst ? JSON.parse(tekst) : null; } catch { data = null; }
  if (!r.ok) throw Object.assign(new Error(data?.fout ?? ([502, 503, 504].includes(r.status) ? GEEN_VERBINDING : `Fout ${r.status}`)), { status: r.status, data });
  return data;
}

const VELD_SELECTOR = "input:not([type=hidden]), select, textarea";
let labelTeller = 0;

/**
 * Koppelt elk `<label>` zonder `for` (en zonder veld erin) aan zijn veld, zodat een schermlezer
 * het label voorleest en een klik op het label de cursor in het veld zet. Het veld is het
 * eerstvolgende broerelement, of anders het enige veld in de ouder. Al gekoppelde labels en
 * velden blijven ongemoeid.
 * @param {ParentNode} wortel
 */
function koppelLabels(wortel) {
  for (const label of wortel.querySelectorAll("label:not([for])")) {
    if (label.querySelector(VELD_SELECTOR)) continue;
    let veld = label.nextElementSibling;
    if (!veld || !veld.matches(VELD_SELECTOR)) {
      const velden = label.parentElement ? label.parentElement.querySelectorAll(VELD_SELECTOR) : [];
      veld = velden.length === 1 ? velden[0] : null;
    }
    if (!veld) continue;
    if (!veld.id) veld.id = `veld-${++labelTeller}`;
    label.htmlFor = veld.id;
  }
}

export function el(tag, attrs = {}, kinderen = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kind of [].concat(kinderen)) if (kind !== null && kind !== undefined) e.append(kind);
  return e;
}

/**
 * Een icoon uit `/iconen.svg`. Altijd decoratief (`aria-hidden`): de tekst ernaast draagt de
 * betekenis. Lijn en kleur komen uit `.icoon` in studio.css (currentColor).
 * @param {string} naam symbool-id in /iconen.svg
 * @param {string} [klasse] extra klasse naast `icoon`
 */
export function icoon(naam, klasse = "") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", klasse ? `icoon ${klasse}` : "icoon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `/iconen.svg#${naam}`);
  svg.append(use);
  return svg;
}

/**
 * Lege staat: één vaste vorm voor "hier staat nog niets", met optioneel `actie` = `{ tekst, href }`
 * als directe link naar de plek waar je het eerste record aanmaakt.
 */
export function legeStaat(titel, tekst, actie) {
  return el("div", { class: "lege-staat" }, [
    el("b", { text: titel }),
    el("p", { text: tekst }),
    actie ? el("a", { class: "knop-link", href: actie.href, text: actie.tekst }) : null,
  ]);
}

/**
 * Toast. Het vak is een live region, zodat een schermlezer de melding voorleest zonder dat de
 * focus verspringt: `polite` voor gewone meldingen, `assertive` voor fouten. De sluitknop is er
 * voor wie een melding wil wegklikken voor de vijf seconden om zijn.
 */
const MELDING_ICOON = { info: "info", ok: "vink", fout: "let-op", waarschuwing: "let-op" };
export function melding(tekst, soort = "info") {
  let vak = document.getElementById("meldingen");
  if (!vak) {
    vak = el("div", { id: "meldingen", role: "status", "aria-live": "polite" });
    document.body.prepend(vak);
  }
  vak.setAttribute("aria-live", soort === "fout" ? "assertive" : "polite");
  const m = el("div", { class: `melding ${soort}` }, [
    icoon(MELDING_ICOON[soort] ?? "info"),
    el("span", { text: tekst }),
    el("button", { type: "button", class: "knop-stil melding-sluit", "aria-label": "Melding sluiten", onclick: () => m.remove() }, [icoon("kruis")]),
  ]);
  vak.append(m);
  setTimeout(() => m.remove(), 5000);
}

/**
 * Voegt `id` toe aan een ruimte-gescheiden `aria-describedby`-waarde zonder het tweemaal toe te
 * voegen; `zonderBeschrijving` haalt precies dat ene id er weer uit.
 */
function metBeschrijving(bestaand, id) {
  const delen = (bestaand ?? "").split(" ").filter(Boolean);
  return delen.includes(id) ? delen.join(" ") : [...delen, id].join(" ");
}
function zonderBeschrijving(bestaand, id) {
  return (bestaand ?? "").split(" ").filter((d) => d && d !== id).join(" ");
}

/**
 * Een foutmelding die bij het veld hangt en blijft staan tot hij is opgelost, in plaats van een
 * toast die na vijf seconden verdwijnt. `veld` heeft een `id` nodig; een lege `tekst` wist de
 * fout weer. Bestaat er al een element `<id>-fout`, dan wordt dat hergebruikt.
 *
 * In een `.veld` dat al drie kinderen heeft (label, invoer, hulptekst) is geen plek voor een
 * vierde: de grid van `.veldrij` geeft precies drie rijen door. Dan verbergt de fout de
 * hulptekst tijdelijk en neemt zijn rij over; de hulptekst komt terug zodra de fout is opgelost.
 */
const verborgenHulpteksten = new WeakMap();
export function veldFout(veld, tekst) {
  const foutId = `${veld.id}-fout`;
  let foutEl = document.getElementById(foutId);
  const houder = veld.closest(".veld") ?? veld.parentElement ?? veld;
  if (!tekst) {
    if (foutEl) foutEl.hidden = true;
    const hulptekst = verborgenHulpteksten.get(houder);
    if (hulptekst) { hulptekst.hidden = false; verborgenHulpteksten.delete(houder); }
    veld.removeAttribute("aria-invalid");
    if (veld.hasAttribute("aria-describedby")) {
      const rest = zonderBeschrijving(veld.getAttribute("aria-describedby"), foutId);
      if (rest) veld.setAttribute("aria-describedby", rest); else veld.removeAttribute("aria-describedby");
    }
    return;
  }
  if (!foutEl) {
    foutEl = el("p", { id: foutId, class: "foutmelding veld-fout", role: "alert" });
    if (houder.classList.contains("veld") && houder.children.length >= 3) {
      const hulptekst = houder.children[2];
      hulptekst.hidden = true;
      verborgenHulpteksten.set(houder, hulptekst);
      houder.insertBefore(foutEl, hulptekst.nextSibling);
    } else {
      houder.append(foutEl);
    }
  }
  foutEl.textContent = tekst;
  foutEl.hidden = false;
  // aria-invalid en de auto-clear-listener horen bij een waardedragend formulierveld; op een knop
  // (bijv. een algemene opslaan-fout die aan de opslaanknop hangt) betekent aria-invalid niets en
  // vuurt een input-event nooit — zo'n listener zou zich bij elke mislukte poging opnieuw
  // registreren zonder ooit op te ruimen.
  const formulierveld = ["INPUT", "SELECT", "TEXTAREA"].includes(veld.tagName);
  if (formulierveld) veld.setAttribute("aria-invalid", "true");
  veld.setAttribute("aria-describedby", metBeschrijving(veld.getAttribute("aria-describedby"), foutId));
  if (formulierveld) veld.addEventListener("input", () => veldFout(veld, ""), { once: true });
}

/**
 * Modale dialoog op basis van het native `<dialog>`-element: dat regelt focusopsluiting, Escape
 * en de achtergrondlaag zelf. `bouwInhoud` krijgt het formulier mee en geeft de waarde terug die
 * bij "bevestigen" hoort (`false` houdt de dialoog open); sluiten via Escape, annuleren of de
 * achtergrond levert `null`.
 */
function dialoog({ titel, bevestigTekst = "Bevestigen", annuleerTekst = "Annuleren", gevaarlijk = false, bouwInhoud }) {
  return new Promise((klaar) => {
    const form = el("form", { method: "dialog", class: "dialoog-form" });
    const waardeVan = bouwInhoud(form) ?? (() => true);

    // annuleerTekst: null laat de annuleerknop weg (voor een dialoog die alleen iets toont).
    const annuleer = annuleerTekst === null ? null : el("button", { type: "button", class: "secundair", text: annuleerTekst });
    const bevestig = el("button", { type: "submit", class: gevaarlijk ? "secundair gevaar" : "", text: bevestigTekst });
    form.append(el("div", { class: "dialoog-knoppen" }, [annuleer, bevestig].filter(Boolean)));

    const d = el("dialog", { class: "dialoog" }, [el("h2", { text: titel }), form]);
    document.body.append(d);

    // Sluiten gaat altijd via `rond`: het `close`-event is niet overal betrouwbaar, en een
    // dialoog die zijn promise nooit afrondt laat de aanroeper voor altijd hangen.
    let afgerond = false;
    const rond = (waarde) => {
      if (afgerond) return;
      afgerond = true;
      if (d.open) d.close();
      d.remove();
      klaar(waarde);
    };

    annuleer?.addEventListener("click", () => rond(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const waarde = waardeVan();
      // `false` betekent "invoer niet in orde"; de dialoog blijft dan open staan.
      if (waarde === false) return;
      rond(waarde);
    });
    // Klikken buiten de dialoog (op de ::backdrop) sluit hem, net als Escape.
    d.addEventListener("click", (e) => { if (e.target === d) rond(null); });
    d.addEventListener("cancel", () => rond(null));
    d.addEventListener("close", () => rond(null));

    d.showModal();
  });
}

/** Ja/nee-vraag. Geeft `true` bij bevestigen, `false` bij annuleren of Escape. */
export async function bevestigDialoog(vraag, opties = {}) {
  const uit = await dialoog({
    titel: opties.titel ?? "Weet u het zeker?",
    bevestigTekst: opties.bevestigTekst ?? "Ja, doorgaan",
    gevaarlijk: opties.gevaarlijk ?? false,
    bouwInhoud: (form) => { form.prepend(el("p", { text: vraag })); return () => true; },
  });
  return uit === true;
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }


/**
 * Een scrollcontainer die alleen met de muis te verschuiven is, verbergt zijn rechterkant voor
 * een toetsenbordgebruiker. Een tabindex lost dat op, maar een naamloze tabstop is zijn eigen
 * probleem; daarom eerst een naam, dan pas een tabstop. De naam komt uit een eigen aria-label,
 * de <caption> van de tabel, of de dichtstbijzijnde kop erboven. Levert dat niets op, dan blijft
 * de container zoals hij was.
 */
function afgeleidTabelLabel(vak) {
  const eigen = vak.getAttribute("aria-label");
  if (eigen?.trim()) return eigen.trim();
  if (vak.getAttribute("aria-labelledby")) return null; // al benoemd via een ander element
  const caption = vak.querySelector("table > caption");
  if (caption?.textContent?.trim()) return caption.textContent.trim();
  const KOPPEN = "h1, h2, h3, h4, h5, h6, summary";
  for (let knoop = vak.previousElementSibling; knoop; knoop = knoop.previousElementSibling) {
    const kop = knoop.matches?.(KOPPEN) ? knoop : knoop.querySelector?.(KOPPEN);
    const tekst = kop?.textContent?.trim();
    if (tekst) return tekst;
  }
  const ouder = vak.parentElement?.closest(".kaart, details.blok, section, .app-inhoud");
  const kop = ouder?.querySelector(KOPPEN);
  return kop?.textContent?.trim() || null;
}

/**
 * Zet (of haalt weg) de tabstop en de regio-rol van een scrollcontainer. Wat deze functie zelf
 * heeft toegevoegd, haalt ze ook zelf weer weg (`data-regio-afgeleid`); een aria-label of role
 * die de pagina zélf heeft gezet blijft onaangeroerd.
 */
function zetTabelScrollTabstop(vak, smal) {
  if (!smal) {
    vak.removeAttribute("tabindex");
    const eerderGezet = vak.dataset.regioAfgeleid ?? "";
    if (eerderGezet.includes("rol")) vak.removeAttribute("role");
    if (eerderGezet.includes("label")) vak.removeAttribute("aria-label");
    delete vak.dataset.regioAfgeleid;
    return;
  }
  const alBenoemd = vak.hasAttribute("aria-label") || vak.hasAttribute("aria-labelledby");
  const naam = alBenoemd ? true : afgeleidTabelLabel(vak);
  if (!naam) {
    vak.removeAttribute("tabindex");
    return;
  }
  const gezet = [];
  if (!alBenoemd) { vak.setAttribute("aria-label", naam); gezet.push("label"); }
  if (!vak.hasAttribute("role")) { vak.setAttribute("role", "region"); gezet.push("rol"); }
  if (gezet.length) vak.dataset.regioAfgeleid = gezet.join("+");
  vak.setAttribute("tabindex", "0");
}

// Alleen in de browser: in een kale Node-omgeving bestaan document en ResizeObserver niet.
if (typeof document !== "undefined" && typeof ResizeObserver !== "undefined") {
  // De werkbalk kan bij zoom of lange paginatitels over meerdere regels lopen. Meet zijn echte
  // hoogte, zodat ankers en tabelkoppen er altijd onder blijven.
  const werkbalk = document.querySelector(".app-werkbalk");
  if (werkbalk) {
    new ResizeObserver(() => {
      const hoogte = werkbalk.getBoundingClientRect().height;
      if (hoogte > 0) werkbalk.closest(".app-shell").style.setProperty("--kop-hoogte", `${hoogte}px`);
    }).observe(werkbalk);
  }
  // `.tabel-scroll` krijgt overflow-x pas als hij te weinig ruimte heeft (`.smal`, zie studio.css),
  // anders breekt de sticky kolomkop. "Te weinig ruimte" is de werkelijke breedte, niet die van het venster.
  const TABEL_SCROLL_BREUK = 900;
  const tabelScrollObserver = new ResizeObserver((items) => {
    for (const item of items) {
      const smal = item.contentRect.width <= TABEL_SCROLL_BREUK;
      item.target.classList.toggle("smal", smal);
      zetTabelScrollTabstop(item.target, smal);
    }
  });
  // Elk scherm bouwt zijn tabellen en velden pas na het laden op (fetch + el()). Een
  // MutationObserver op <body> ziet elke `.tabel-scroll` en elk label zodra het verschijnt, en
  // meldt verwijderde tabellen weer af zodat er niets blijft hangen.
  new MutationObserver((mutaties) => {
    for (const m of mutaties) {
      for (const knoop of m.addedNodes) {
        if (knoop.nodeType !== Node.ELEMENT_NODE) continue;
        if (knoop.matches(".tabel-scroll")) tabelScrollObserver.observe(knoop);
        knoop.querySelectorAll?.(".tabel-scroll").forEach((e) => tabelScrollObserver.observe(e));
        koppelLabels(knoop.parentNode ?? knoop);
      }
      for (const knoop of m.removedNodes) {
        if (knoop.nodeType !== Node.ELEMENT_NODE) continue;
        if (knoop.matches(".tabel-scroll")) tabelScrollObserver.unobserve(knoop);
        knoop.querySelectorAll?.(".tabel-scroll").forEach((e) => tabelScrollObserver.unobserve(e));
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(".tabel-scroll").forEach((e) => tabelScrollObserver.observe(e));
  koppelLabels(document);
}
