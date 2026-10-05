// Marketingstudio — Teksten: herbruikbare stukken voor de posttekst (openingszinnen, afsluiters,
// hashtagsets, de vaste "over ons"-tekst). In de editor met één keuze in te voegen.
import { bevestigDialoog, el, legeStaat, melding } from "/app.js";

const SOORTEN = { opening: "Openingszinnen", afsluiter: "Afsluiters met actie", hashtags: "Hashtagsets", boilerplate: "Vaste teksten" };

export async function toon(container, ctx) {
  let { teksten } = await ctx.api("/api/beheer/marketing/teksten");
  if (!ctx.geldig()) return;
  const formHouder = el("div");
  const lijstHouder = el("div");

  function formulier(bestaand = null) {
    const soort = el("select", { id: "tekst-soort" }, Object.entries(SOORTEN).map(([w, t]) => el("option", { value: w, text: t, ...(bestaand?.soort === w ? { selected: "" } : {}) })));
    const naam = el("input", { type: "text", id: "tekst-naam", maxlength: "80", value: bestaand?.naam ?? "" });
    const tekst = el("textarea", { id: "tekst-inhoud", rows: "4", maxlength: "3000" });
    tekst.value = bestaand?.tekst ?? "";
    const opslaan = el("button", { type: "button", text: bestaand ? "Wijziging bewaren" : "Tekst toevoegen" });
    opslaan.addEventListener("click", async () => {
      const body = { soort: soort.value, naam: naam.value, tekst: tekst.value };
      opslaan.disabled = true; // geen dubbele aanvraag bij een dubbelklik (BM-21)
      try {
        const t = bestaand
          ? await ctx.api(`/api/beheer/marketing/teksten/${bestaand.id}`, { method: "PUT", body })
          : await ctx.api("/api/beheer/marketing/teksten", { method: "POST", body });
        teksten = bestaand ? teksten.map((x) => (x.id === t.id ? t : x)) : [...teksten, t];
        formHouder.replaceChildren(nieuwKnop());
        tekenLijst();
        melding("Tekst bewaard");
      } catch (e) { melding(e.message, "fout"); } finally { opslaan.disabled = false; }
    });
    formHouder.replaceChildren(el("div", { class: "kaart studio-formulier" }, [
      el("h2", { text: bestaand ? "Tekst bewerken" : "Nieuwe tekst" }),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "tekst-soort", text: "Soort" }), soort]),
        el("div", { class: "veld" }, [el("label", { for: "tekst-naam", text: "Naam (alleen voor uzelf)" }), naam]),
      ]),
      el("div", { class: "veld" }, [el("label", { for: "tekst-inhoud", text: "Tekst" }), tekst]),
      el("div", { class: "knoppenrij" }, [opslaan, el("button", { type: "button", class: "secundair", text: "Annuleren", onclick: () => formHouder.replaceChildren(nieuwKnop()) })]),
    ]));
    naam.focus();
  }

  function nieuwKnop() {
    return el("div", { class: "knoppenrij" }, [
      el("button", { type: "button", text: "Nieuwe tekst", onclick: () => formulier() }),
      el("button", { type: "button", class: "secundair", text: "Neem de teksten van de site over", onclick: startvulling }),
    ]);
  }

  /** De vaste teksten van de site (en de letterlijke claims als concept-feiten) overnemen; wat er al staat, blijft staan. */
  async function startvulling() {
    try {
      const r = await ctx.api("/api/beheer/marketing/startvulling", { method: "POST", body: {} });
      melding(r.feiten || r.teksten
        // Het concept-deel alleen als er feiten bij kwamen: bij 0 feiten staat er niets na te lopen.
        ? `${r.feiten} feit${r.feiten === 1 ? "" : "en"} en ${r.teksten} tekst${r.teksten === 1 ? "" : "en"} overgenomen.${r.feiten ? ` ${r.feiten === 1 ? "Het feit staat" : "De feiten staan"} op concept: loop ${r.feiten === 1 ? "het" : "ze"} na en zet ${r.feiten === 1 ? "het" : "ze"} op actief.` : ""}`
        : "Alles van de site stond er al");
      ({ teksten } = await ctx.api("/api/beheer/marketing/teksten"));
      tekenLijst();
    } catch (e) { melding(e.message, "fout"); }
  }

  function tekenLijst() {
    if (!teksten.length) {
      const leeg = legeStaat("Nog geen teksten", "Leg vaste stukken vast, zoals uw standaardhashtags of de korte tekst over Mijntarieftool.");
      leeg.append(el("button", { type: "button", class: "secundair", text: "Neem de teksten van de site over", onclick: startvulling }));
      lijstHouder.replaceChildren(el("div", { class: "kaart" }, [leeg]));
      return;
    }
    lijstHouder.replaceChildren(...Object.entries(SOORTEN).filter(([soort]) => teksten.some((t) => t.soort === soort)).map(([soort, titel]) => {
      const lijst = teksten.filter((t) => t.soort === soort);
      return el("section", { class: "kaart" }, [
        el("h2", { text: titel }),
        ...lijst.map((t) => el("div", { class: "studio-tekstregel" }, [
          el("div", {}, [el("b", { text: t.naam }), el("p", { class: "studio-varianttekst", text: t.tekst })]),
          el("div", { class: "rij-acties" }, [
            el("button", { type: "button", class: "secundair klein", text: "Bewerken", onclick: () => formulier(t) }),
            el("button", { type: "button", class: "secundair klein gevaar", text: "Wissen", onclick: async () => {
              if (!await bevestigDialoog(`De tekst "${t.naam}" wissen?`, { titel: "Tekst wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
              try {
                await ctx.api(`/api/beheer/marketing/teksten/${t.id}`, { method: "DELETE" });
                teksten = teksten.filter((x) => x.id !== t.id);
                tekenLijst();
              } catch (e) { melding(e.message, "fout"); }
            } }),
          ]),
        ])),
      ]);
    }));
  }

  formHouder.replaceChildren(nieuwKnop());
  container.replaceChildren(formHouder, lijstHouder);
  tekenLijst();
}
