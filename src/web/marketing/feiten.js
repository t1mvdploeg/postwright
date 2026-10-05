// Marketingstudio — Feitenbank: de claims en getallen die in marketing mogen, elk met bron en
// geldigheid (ontwerpregel 4). Een nieuw feit begint als concept; pas als Tim het heeft nagelopen
// en op "actief" zet, telt het mee in de getallencheck.
import { bevestigDialoog, el, legeStaat, melding } from "/app.js";
import { haalGetallen } from "/marketing/getallen.js";
import { feitBruikbaar } from "/marketing/merkcontrole.js";
import { vandaagAmsterdam } from "/marketing/recept.js";

const SOORTEN = { product: "Product", voorbeelddossier: "Voorbeelddossier", cao: "Cao en wet", bedrijf: "Bedrijf" };
const BRONNEN = { site: "De site", kennis: "Kennisbank (docs/kennis)", parameter: "Parameters (data/parameters)", extern: "Externe bron (https)" };
const STATUSSEN = { concept: "Concept", actief: "Actief", ingetrokken: "Ingetrokken" };

export async function toon(container, ctx) {
  let [{ feiten }, { posts }] = await Promise.all([ctx.api("/api/beheer/marketing/feiten"), ctx.api("/api/beheer/marketing/posts")]);
  if (!ctx.geldig()) return;
  const vandaag = vandaagAmsterdam();
  const gebruik = (id) => posts.filter((p) => p.feiten.includes(id) && p.status !== "gearchiveerd").length;

  const filterSoort = el("select", { id: "feit-filter-soort" }, [el("option", { value: "", text: "Alle soorten" }), ...Object.entries(SOORTEN).map(([w, t]) => el("option", { value: w, text: t }))]);
  const filterStatus = el("select", { id: "feit-filter-status" }, [
    el("option", { value: "", text: "Alle statussen" }), ...Object.entries(STATUSSEN).map(([w, t]) => el("option", { value: w, text: t })), el("option", { value: "verlopen", text: "Verlopen" }),
  ]);
  const zoek = el("input", { type: "search", id: "feit-zoek-lijst", placeholder: "Zoek in de feiten" });
  const lijstHouder = el("div");
  const formHouder = el("div");
  const parameterHouder = el("div");

  function formulier(bestaand = null) {
    const f = bestaand ?? { tekst: "", soort: "product", bron: { soort: "site", verwijzing: "" }, geldigVan: null, geldigTot: null, status: "concept" };
    const tekst = el("textarea", { id: "feit-tekst", rows: "2", maxlength: "500" });
    tekst.value = f.tekst;
    const soort = el("select", { id: "feit-soort" }, Object.entries(SOORTEN).map(([w, t]) => el("option", { value: w, text: t, ...(w === f.soort ? { selected: "" } : {}) })));
    const bronSoort = el("select", { id: "feit-bronsoort" }, Object.entries(BRONNEN).map(([w, t]) => el("option", { value: w, text: t, ...(w === f.bron.soort ? { selected: "" } : {}) })));
    const verwijzing = el("input", { type: "text", id: "feit-verwijzing", maxlength: "300", value: f.bron.verwijzing, placeholder: "src/web/landing.html, sectie demo tarief" });
    const van = el("input", { type: "date", id: "feit-van", value: f.geldigVan ?? "" });
    const tot = el("input", { type: "date", id: "feit-tot", value: f.geldigTot ?? "" });
    const status = el("select", { id: "feit-status" }, Object.entries(STATUSSEN).map(([w, t]) => el("option", { value: w, text: t, ...(w === f.status ? { selected: "" } : {}) })));
    const getallen = el("p", { class: "hulptekst", "aria-live": "polite" });
    const zetGetallen = () => {
      const g = haalGetallen(tekst.value);
      getallen.textContent = g.length ? `Dit feit dekt: ${g.map((x) => x.tekst).join(", ")}` : "Geen getallen in dit feit.";
    };
    tekst.addEventListener("input", zetGetallen);
    zetGetallen();
    const hulpBron = el("p", { class: "hulptekst", text: "Een cao-feit verwijst naar docs/kennis/… of data/parameters/… (geen cao-feit zonder bron). Een externe bron is een https-adres." });
    const opslaan = el("button", { type: "button", text: bestaand ? "Wijziging bewaren" : "Feit toevoegen" });
    const annuleren = el("button", { type: "button", class: "secundair", text: "Annuleren" });
    annuleren.addEventListener("click", () => formHouder.replaceChildren(nieuwKnop()));
    opslaan.addEventListener("click", async () => {
      const body = {
        tekst: tekst.value, soort: soort.value, bron: { soort: bronSoort.value, verwijzing: verwijzing.value },
        geldigVan: van.value || null, geldigTot: tot.value || null, status: status.value,
      };
      opslaan.disabled = true; // geen dubbele aanvraag bij een dubbelklik (BM-21)
      try {
        const uit = bestaand
          ? await ctx.api(`/api/beheer/marketing/feiten/${bestaand.id}`, { method: "PUT", body })
          : await ctx.api("/api/beheer/marketing/feiten", { method: "POST", body });
        feiten = bestaand ? feiten.map((x) => (x.id === uit.id ? uit : x)) : [...feiten, uit];
        formHouder.replaceChildren(nieuwKnop());
        tekenLijst();
        melding("Feit bewaard");
      } catch (e) { melding(e.message, "fout"); } finally { opslaan.disabled = false; }
    });
    formHouder.replaceChildren(el("div", { class: "kaart studio-formulier" }, [
      el("h2", { text: bestaand ? "Feit bewerken" : "Nieuw feit" }),
      el("div", { class: "veld" }, [el("label", { for: "feit-tekst", text: "Het feit, zoals het in marketing mag staan" }), tekst, getallen]),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "feit-soort", text: "Soort" }), soort]),
        el("div", { class: "veld" }, [el("label", { for: "feit-status", text: "Status" }), status]),
        el("div", { class: "veld" }, [el("label", { for: "feit-van", text: "Geldig vanaf" }), van]),
        el("div", { class: "veld" }, [el("label", { for: "feit-tot", text: "Geldig tot en met" }), tot]),
      ]),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "feit-bronsoort", text: "Soort bron" }), bronSoort]),
        el("div", { class: "veld" }, [el("label", { for: "feit-verwijzing", text: "Bron" }), verwijzing]),
      ]),
      hulpBron,
      el("div", { class: "knoppenrij" }, [opslaan, annuleren]),
    ]));
    tekst.focus();
  }

  function nieuwKnop() {
    return el("div", { class: "knoppenrij" }, [
      el("button", { type: "button", text: "Nieuw feit", onclick: () => formulier() }),
      el("button", { type: "button", class: "secundair", text: "Feit uit de parameters…", onclick: () => { void toonParameters(); } }),
      el("button", { type: "button", class: "secundair", text: "Neem de teksten van de site over", onclick: startvulling }),
    ]);
  }

  /** De letterlijke claims en cijfers van de site (en de vaste teksten) overnemen; wat er al staat, blijft staan. */
  async function startvulling() {
    try {
      const r = await ctx.api("/api/beheer/marketing/startvulling", { method: "POST", body: {} });
      melding(r.feiten || r.teksten
        // Het concept-deel alleen als er feiten bij kwamen: bij 0 feiten staat er niets na te lopen.
        ? `${r.feiten} feit${r.feiten === 1 ? "" : "en"} en ${r.teksten} tekst${r.teksten === 1 ? "" : "en"} overgenomen.${r.feiten ? ` ${r.feiten === 1 ? "Het feit staat" : "De feiten staan"} op concept: loop ${r.feiten === 1 ? "het" : "ze"} na en zet ${r.feiten === 1 ? "het" : "ze"} op actief.` : ""}`
        : "Alles van de site stond er al");
      ({ feiten } = await ctx.api("/api/beheer/marketing/feiten"));
      tekenLijst();
    } catch (e) { melding(e.message, "fout"); }
  }

  async function toonParameters() {
    let lijst;
    try { lijst = (await ctx.api("/api/beheer/marketing/parameters")).parameters; } catch (e) { melding(e.message, "fout"); return; }
    parameterHouder.replaceChildren(el("div", { class: "kaart" }, [
      el("h2", { text: "Feit uit de parameters" }),
      el("p", { class: "hulptekst", text: "Actuele waarden uit data/parameters, met de kennispagina als bron en de volgende ingangsdatum als einde. Het feit komt als concept binnen; zet het op actief nadat u het hebt nagelopen." }),
      lijst.length
        ? el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
          el("thead", {}, [el("tr", {}, ["Parameter", "Waarde", "Geldig", "Bron", ""].map((t) => el("th", { scope: "col", text: t })))]),
          el("tbody", {}, lijst.map((p) => el("tr", {}, [
            el("td", { text: p.naam }),
            el("td", { text: p.tekst }),
            el("td", { text: `${p.geldigVan ?? "–"} t/m ${p.geldigTot ?? "nu"}` }),
            el("td", { text: p.bron }),
            el("td", {}, [el("button", { type: "button", class: "secundair klein", text: "Maak feit", onclick: async () => {
              try {
                const f = await ctx.api(`/api/beheer/marketing/parameters/${encodeURIComponent(p.sleutel)}/feit`, { method: "POST", body: {} });
                feiten = [...feiten, f];
                tekenLijst();
                melding("Feit toegevoegd als concept");
              } catch (e) { melding(e.message, "fout"); }
            } })]),
          ]))),
        ])])
        : el("p", { class: "hulptekst", text: "Geen parameters beschikbaar." }),
      el("button", { type: "button", class: "secundair", text: "Sluiten", onclick: () => parameterHouder.replaceChildren() }),
    ]));
  }

  function tekenLijst() {
    const q = zoek.value.trim().toLowerCase();
    const lijst = feiten.filter((f) => {
      if (filterSoort.value && f.soort !== filterSoort.value) return false;
      const verlopen = f.geldigTot && f.geldigTot < vandaag;
      if (filterStatus.value === "verlopen" ? !verlopen : filterStatus.value && f.status !== filterStatus.value) return false;
      return !q || f.tekst.toLowerCase().includes(q) || f.bron.verwijzing.toLowerCase().includes(q);
    });
    if (!feiten.length) {
      const leeg = legeStaat("Nog geen feiten", "Begin met de claims die al letterlijk op de site staan, en de cijfers van het voorbeelddossier.");
      leeg.append(el("button", { type: "button", class: "secundair", text: "Neem de teksten van de site over", onclick: startvulling }));
      lijstHouder.replaceChildren(leeg);
      return;
    }
    lijstHouder.replaceChildren(el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
      el("thead", {}, [el("tr", {}, ["Feit", "Soort", "Bron", "Geldig tot", "Status", "In posts", ""].map((t) => el("th", { scope: "col", text: t })))]),
      el("tbody", {}, lijst.map((f) => {
        const bruikbaar = feitBruikbaar(f, vandaag);
        const verlopen = f.geldigTot && f.geldigTot < vandaag;
        const bron = f.bron.soort === "extern" ? el("a", { href: f.bron.verwijzing, target: "_blank", rel: "noopener noreferrer", text: f.bron.verwijzing }) : f.bron.verwijzing;
        return el("tr", {}, [
          el("td", { text: f.tekst }),
          el("td", { text: SOORTEN[f.soort] }),
          el("td", {}, [bron]),
          el("td", { text: f.geldigTot ?? "–" }),
          el("td", {}, [el("span", { class: `badge ${bruikbaar ? "badge-akkoord" : "badge-waarschuwing"}`, text: verlopen && f.status === "actief" ? "Verlopen" : STATUSSEN[f.status] })]),
          el("td", { text: String(gebruik(f.id)) }),
          el("td", {}, [el("div", { class: "rij-acties" }, [
            el("button", { type: "button", class: "secundair klein", text: "Bewerken", onclick: () => formulier(f) }),
            el("button", { type: "button", class: "secundair klein gevaar", text: "Wissen", onclick: async () => {
              if (!await bevestigDialoog(`Het feit "${f.tekst}" wissen?`, { titel: "Feit wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
              try {
                await ctx.api(`/api/beheer/marketing/feiten/${f.id}`, { method: "DELETE" });
                feiten = feiten.filter((x) => x.id !== f.id);
                tekenLijst();
              } catch (e) { melding(e.message, "fout"); }
            } }),
          ])]),
        ]);
      })),
    ])]));
  }

  for (const f of [filterSoort, filterStatus]) f.addEventListener("change", tekenLijst);
  zoek.addEventListener("input", tekenLijst);
  formHouder.replaceChildren(nieuwKnop());
  container.replaceChildren(
    el("section", { class: "pagina-intro" }, [el("div", {}, [
      el("p", { class: "intro-label", text: "Geen claim zonder bron" }),
      el("p", { text: "Elk getal in een post moet in een gekoppeld, actief feit staan. Een verlopen of ingetrokken feit houdt het plannen tegen. De controle herkent geen getallen in woorden (\"acht procent\"); lees dus zelf ook na." }),
    ])]),
    formHouder,
    parameterHouder,
    el("div", { class: "kaart" }, [
      el("div", { class: "studio-filters" }, [
        el("div", { class: "veld" }, [el("label", { for: "feit-filter-soort", text: "Soort" }), filterSoort]),
        el("div", { class: "veld" }, [el("label", { for: "feit-filter-status", text: "Status" }), filterStatus]),
        el("div", { class: "veld" }, [el("label", { for: "feit-zoek-lijst", text: "Zoeken" }), zoek]),
      ]),
      lijstHouder,
    ]),
  );
  tekenLijst();
}
