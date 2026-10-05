// Marketingstudio — de schil: toegang, navigatie en een hashrouter die per scherm een module laadt
// (`src/web/marketing/<scherm>.js`). Ontwerp: docs/ontwerpen/2026-09-24-marketingstudio.md.
//
// Een eigen pagina naast Platformbeheer, geen tab erin: de editor heeft de volle breedte nodig, de
// code laadt alleen hier, en een latere marketingrol hoeft de klantgegevens van Platformbeheer
// niet te zien.
import { api, bevestigDialoog, el, icoon, melding, uitloggen } from "/app.js";
import { laadMerk } from "/marketing/merk.js";

const NAV_GROEPEN = [
  ["Werk", [["overzicht", "Overzicht"], ["maken", "Maken"], ["bibliotheek", "Bibliotheek"], ["planning", "Planning"]]],
  ["Bronnen", [["feiten", "Feitenbank"], ["teksten", "Teksten"], ["merkkit", "Merkkit"]]],
  ["Systeem", [["instellingen", "Instellingen"]]],
];
const SCHERMEN = new Map(NAV_GROEPEN.flatMap(([, s]) => s));
// Het kiticoon per scherm, dezelfde sprite als de rest van de tool (/iconen.svg).
const SCHERM_ICOON = {
  overzicht: "start", maken: "bewerken", bibliotheek: "archief", planning: "kalender",
  feiten: "bron", teksten: "document", merkkit: "lagen", instellingen: "instellingen",
};
const MODULES = {
  overzicht: () => import("/marketing/overzicht.js"),
  maken: () => import("/marketing/maken.js"),
  bibliotheek: () => import("/marketing/bibliotheek.js"),
  planning: () => import("/marketing/planning.js"),
  feiten: () => import("/marketing/feiten.js"),
  teksten: () => import("/marketing/teksten.js"),
  merkkit: () => import("/marketing/merkkit.js"),
  instellingen: () => import("/marketing/instellingen.js"),
};

const appEl = document.getElementById("studio-app");
const navEl = document.getElementById("studio-nav");
const inhoudEl = document.getElementById("studio-inhoud");
const hoofdEl = document.getElementById("studio-hoofd");
const titelEl = document.getElementById("studio-titel");
const zijbalkEl = document.getElementById("studio-zijbalk");
const overlayEl = document.getElementById("studio-overlay");
const menuKnop = document.getElementById("studio-menu");

/** Het scherm dat nu open is, met zijn optionele haken `verlaat()` en `heeftOnbewaard()`. */
let actief = null;
let vorigeHash = "";
let renderTeller = 0;
let instellingenBelofte = null;

/** `#maken/p-…` → { scherm: "maken", delen: ["p-…"] }. Onbekend wordt het overzicht. */
export function leesRoute(hash) {
  const [scherm, ...delen] = String(hash ?? "").replace(/^#/, "").split("/").map(decodeURIComponent);
  return SCHERMEN.has(scherm) ? { scherm, delen } : { scherm: "overzicht", delen: [] };
}

function sluitMenu() {
  zijbalkEl.classList.remove("open");
  overlayEl.hidden = true;
  menuKnop.setAttribute("aria-expanded", "false");
}

function tekenNav(scherm) {
  navEl.replaceChildren(...NAV_GROEPEN.map(([groep, schermen]) => el("div", { class: "nav-groep" }, [
    el("span", { class: "nav-groep-label", text: groep }),
    ...schermen.map(([id, naam]) => el("a", {
      href: `#${id}`, class: id === scherm ? "actief" : "", ...(id === scherm ? { "aria-current": "page" } : {}),
      onclick: sluitMenu,
    }, [icoon(SCHERM_ICOON[id]), naam])),
  ])));
}

function laadInstellingen(opnieuw = false) {
  // Een mislukte aanroep niet bewaren, anders faalt elk scherm tot de pagina herlaadt.
  if (opnieuw || !instellingenBelofte) {
    const belofte = api("/api/beheer/marketing/instellingen").catch((e) => {
      if (instellingenBelofte === belofte) instellingenBelofte = null;
      throw e;
    });
    instellingenBelofte = belofte;
  }
  return instellingenBelofte;
}

async function teken() {
  // De spronglink van app.js springt naar #studio-hoofd; dat is geen scherm, dus de hash terugzetten.
  if (location.hash === "#studio-hoofd") {
    history.replaceState(null, "", vorigeHash || "#overzicht");
    hoofdEl.focus();
    return;
  }
  if (actief?.heeftOnbewaard?.() && location.hash !== vorigeHash) {
    const doorgaan = await bevestigDialoog("De wijzigingen aan deze post zijn nog niet bewaard en gaan verloren.", {
      titel: "Weggaan zonder bewaren?", bevestigTekst: "Weggaan en wijzigingen weggooien", gevaarlijk: true,
    });
    if (!doorgaan) { history.replaceState(null, "", vorigeHash); return; }
  }
  const mijn = ++renderTeller;
  const { scherm, delen } = leesRoute(location.hash);
  vorigeHash = location.hash || "#overzicht";
  actief?.verlaat?.();
  actief = null;
  tekenNav(scherm);
  titelEl.textContent = SCHERMEN.get(scherm);
  document.title = `${SCHERMEN.get(scherm)} — Marketingstudio — Mijntarieftool`;
  inhoudEl.replaceChildren();
  hoofdEl.setAttribute("aria-busy", "true");
  try {
    const [mod, merk, instellingen] = await Promise.all([MODULES[scherm](), laadMerk(), laadInstellingen()]);
    if (mijn !== renderTeller) return;
    const ctx = {
      api, merk, instellingen, delen,
      /** Of dit scherm nog het actieve is; een laat antwoord mag een nieuwer scherm niet overschrijven. */
      geldig: () => mijn === renderTeller,
      zetTitel: (t) => { titelEl.textContent = t; },
      navigeer: (hash) => { location.hash = hash; },
      /** Een nieuw adres zonder opnieuw te tekenen (bv. na het eerste bewaren van een nieuwe post). */
      vervangAdres: (hash) => { history.replaceState(null, "", hash); vorigeHash = hash; },
      herlaadInstellingen: async () => { ctx.instellingen = await laadInstellingen(true); return ctx.instellingen; },
    };
    actief = await mod.toon(inhoudEl, ctx) ?? mod;
  } catch (e) {
    if (mijn === renderTeller) melding(e.message, "fout");
  } finally {
    if (mijn === renderTeller) hoofdEl.removeAttribute("aria-busy");
  }
}

async function start() {
  let ik;
  try { ik = await api("/api/ik"); } catch { ik = { naam: null }; }
  if (ik.rol !== "admin") {
    // Zelfde regel als Platformbeheer: een tenantsessie gaat naar de eigen tool, zonder sessie naar de login.
    location.replace(ik.bedrijf ? "/" : "/login?door=%2Fbeheer%2Fmarketing");
    return;
  }
  appEl.hidden = false;
  document.getElementById("studio-naam").textContent = ik.naam ?? ik.email ?? "Beheerder";
  document.getElementById("studio-uitloggen").addEventListener("click", () => uitloggen("/login?door=%2Fbeheer%2Fmarketing"));
  menuKnop.addEventListener("click", () => {
    const open = zijbalkEl.classList.toggle("open");
    overlayEl.hidden = !open;
    menuKnop.setAttribute("aria-expanded", String(open));
  });
  overlayEl.addEventListener("click", sluitMenu);
  window.addEventListener("beforeunload", (e) => {
    if (actief?.heeftOnbewaard?.()) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("hashchange", () => { void teken(); });
  if (!location.hash) history.replaceState(null, "", "#overzicht");
  await teken();
}

if (typeof document !== "undefined" && document.getElementById("studio-app")) void start();
