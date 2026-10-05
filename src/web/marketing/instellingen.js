// Marketingstudio — Instellingen: welke kanalen en formaten aan staan, de UTM-standaard, de lijst
// verboden woorden, standaardhashtags, de AI-hulp (schrijfhulp en ideeën) met haar maandplafond, en
// het beheer van geüploade beelden.
import { bevestigDialoog, el, melding } from "/app.js";
import { FORMATEN, KANALEN } from "/marketing/formaten.js";

export async function toon(container, ctx) {
  const [i, { media: mediaLijst }] = await Promise.all([ctx.herlaadInstellingen(), ctx.api("/api/beheer/marketing/media")]);
  if (!ctx.geldig()) return;
  let media = mediaLijst;

  const kanalen = Object.entries(KANALEN).map(([k, naam]) => el("label", { class: "studio-radio" }, [
    el("input", { type: "checkbox", name: "kanaal", value: k, ...(i.kanalen.includes(k) ? { checked: "" } : {}) }), el("span", { text: naam }),
  ]));
  const formaten = FORMATEN.map((f) => el("label", { class: "studio-radio" }, [
    el("input", { type: "checkbox", name: "formaat", value: f.sleutel, ...(i.formaten.includes(f.sleutel) ? { checked: "" } : {}) }),
    el("span", { text: `${f.naam} (${f.breedte}×${f.hoogte})` }),
  ]));
  const medium = el("input", { type: "text", id: "utm-medium", value: i.utm.medium, maxlength: "50" });
  const bronnen = Object.entries(KANALEN).map(([k, naam]) => el("div", { class: "veld" }, [
    el("label", { for: `utm-bron-${k}`, text: `utm_source voor ${naam}` }),
    el("input", { type: "text", id: `utm-bron-${k}`, value: i.utm.bron?.[k] ?? k, maxlength: "50" }),
  ]));
  const verboden = el("textarea", { id: "verboden-woorden", rows: "6" });
  verboden.value = i.verbodenWoorden.join("\n");
  const hashtags = el("input", { type: "text", id: "standaard-hashtags", value: i.standaardHashtags, maxlength: "300" });
  const hulpAan = el("input", { type: "checkbox", id: "schrijfhulp-aan", ...(i.schrijfhulp.aan ? { checked: "" } : {}) });
  const plafond = el("input", { type: "number", id: "schrijfhulp-plafond", min: "0", max: "1000", step: "1", value: String(i.schrijfhulp.plafondEurPerMaand) });
  const opslaan = el("button", { type: "button", text: "Instellingen bewaren" });

  opslaan.addEventListener("click", async () => {
    const body = {
      kanalen: [...container.querySelectorAll('input[name="kanaal"]:checked')].map((x) => x.value),
      formaten: [...container.querySelectorAll('input[name="formaat"]:checked')].map((x) => x.value),
      utm: {
        medium: medium.value.trim(),
        bron: Object.fromEntries(Object.keys(KANALEN).map((k) => [k, container.querySelector(`#utm-bron-${k}`).value.trim()]).filter(([, v]) => v)),
      },
      verbodenWoorden: verboden.value.split("\n").map((w) => w.trim()).filter(Boolean),
      standaardHashtags: hashtags.value.trim(),
      schrijfhulp: { aan: hulpAan.checked, plafondEurPerMaand: Number(plafond.value) || 0 },
    };
    opslaan.disabled = true; // geen dubbele aanvraag bij een dubbelklik (BM-21)
    try {
      await ctx.api("/api/beheer/marketing/instellingen", { method: "PUT", body });
      await ctx.herlaadInstellingen();
      melding("Instellingen bewaard");
    } catch (e) { melding(e.message, "fout"); } finally { opslaan.disabled = false; }
  });

  const mediaHouder = el("div");
  function tekenMedia() {
    if (!media.length) {
      mediaHouder.replaceChildren(el("p", { class: "hulptekst", text: "Nog geen geüploade beelden." }));
      return;
    }
    mediaHouder.replaceChildren(el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
      el("thead", {}, [el("tr", {}, ["Beeld", "Maat", "Gebruikt in", ""].map((t) => el("th", { scope: "col", text: t })))]),
      el("tbody", {}, media.map((m) => el("tr", {}, [
        el("td", {}, [el("img", { class: "studio-mediamini", src: `/api/beheer/marketing/media/${encodeURIComponent(m.id)}`, alt: "", loading: "lazy" })]),
        el("td", { text: `${m.breedte ?? "?"}×${m.hoogte ?? "?"} px · ${(m.bytes / 1048576).toFixed(1).replace(".", ",")} MB` }),
        el("td", { text: m.gebruikt > 0 ? `${m.gebruikt} post${m.gebruikt === 1 ? "" : "s"}` : "Niet gebruikt" }),
        el("td", {}, [el("button", {
          type: "button", class: "secundair klein gevaar", text: "Wissen", "aria-label": `Wis beeld ${m.id}`,
          ...(m.gebruikt > 0 ? { disabled: "", title: "In gebruik; haal het eerst uit de post" } : {}),
          onclick: async () => {
            if (!await bevestigDialoog("Dit beeld wordt definitief gewist.", { titel: "Beeld wissen?", bevestigTekst: "Wissen", gevaarlijk: true })) return;
            try {
              await ctx.api(`/api/beheer/marketing/media/${encodeURIComponent(m.id)}`, { method: "DELETE" });
              media = media.filter((x) => x.id !== m.id);
              tekenMedia();
              melding("Beeld gewist");
            } catch (e) { melding(e.message, "fout"); }
          },
        })]),
      ]))),
    ])]));
  }
  tekenMedia();

  container.replaceChildren(
    el("section", { class: "kaart" }, [
      el("h2", { text: "Kanalen en formaten" }),
      el("fieldset", { class: "studio-keuze" }, [el("legend", { text: "Kanalen met een posttekst" }), el("div", { class: "studio-keuze-opties" }, kanalen)]),
      el("fieldset", { class: "studio-keuze" }, [el("legend", { text: "Formaten die een nieuwe post standaard krijgt" }), el("div", { class: "studio-keuze-opties kolommen" }, formaten)]),
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Links (UTM)" }),
      el("p", { class: "hulptekst", text: "Elke link die de studio invoegt, krijgt utm_source, utm_medium, utm_campaign (van de campagne) en utm_content (het post-id)." }),
      el("div", { class: "veld" }, [el("label", { for: "utm-medium", text: "utm_medium" }), medium]),
      el("div", { class: "veldrij" }, bronnen),
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Toon en woorden" }),
      el("div", { class: "veld" }, [el("label", { for: "verboden-woorden", text: "Verboden woorden, één per regel" }), verboden, el("p", { class: "hulptekst", text: "Beloftes die de tool niet kan waarmaken. De merkcontrole meldt ze als let-op." })]),
      el("div", { class: "veld" }, [el("label", { for: "standaard-hashtags", text: "Standaardhashtags" }), hashtags]),
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "AI-hulp: schrijfhulp en ideeën" }),
      el("p", { class: "hulptekst", text: "Stelt teksten voor uit gekoppelde feiten, en ideeën voor een periode in de planner. Kost API-geld als platformkosten; zichtbaar onder Kosten in Platformbeheer. Eén maandplafond voor beide." }),
      el("label", { class: "studio-radio" }, [hulpAan, el("span", { text: "AI-hulp aan" })]),
      el("div", { class: "veld" }, [el("label", { for: "schrijfhulp-plafond", text: "Maandplafond in euro" }), plafond]),
    ]),
    el("div", { class: "knoppenrij" }, [opslaan]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Geüploade beelden" }),
      el("p", { class: "hulptekst", text: "Een beeld dat nog in een post staat (ook gearchiveerd) kan hier niet worden gewist; haal het daar eerst uit." }),
      mediaHouder,
    ]),
  );
}
