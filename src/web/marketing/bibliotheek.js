// Marketingstudio — Bibliotheek: alle posts (recepten), met filters. Een miniatuur wordt pas
// getekend als de rij in beeld komt; een recept is klein, een beeld niet.
import { bevestigDialoog, el, legeStaat, melding } from "/ui.js";
import { SJABLONEN, bouwBeeld, sjabloon as sjabloonVan } from "/marketing/sjablonen.js";
import { toonVoorbeeld } from "/marketing/render.js";
import { laadMedia } from "/marketing/merk.js";
import { feitBruikbaar } from "/marketing/merkcontrole.js";
import { leesbaarMoment, vandaagAmsterdam } from "/marketing/recept.js";
import { KANALEN, kanalenVan } from "/marketing/formaten.js";

const STATUS = { concept: "Concept", gepland: "Gepland", gepubliceerd: "Gepubliceerd", gearchiveerd: "Gearchiveerd" };
const PER_PAGINA = 24;

export async function toon(container, ctx) {
  const [{ posts }, { campagnes }, feitenAntwoord] = await Promise.all([
    ctx.api("/api/posts"),
    ctx.api("/api/campagnes"),
    ctx.api("/api/feiten").catch(() => ({ feiten: [] })),
  ]);
  if (!ctx.geldig()) return undefined;
  const vandaag = vandaagAmsterdam();
  const bruikbaar = new Set(feitenAntwoord.feiten.filter((f) => feitBruikbaar(f, vandaag)).map((f) => f.id));
  const metProbleem = (p) => p.feiten.some((id) => !bruikbaar.has(id));

  const beginFilter = ctx.delen[0] ?? "actief";
  const status = el(
    "select",
    { id: "filter-status" },
    [
      ["actief", "Alles behalve archief"],
      ["concept", "Concept"],
      ["gepland", "Gepland"],
      ["gepubliceerd", "Gepubliceerd"],
      ["gearchiveerd", "Gearchiveerd"],
      ["feit", "Met een onbruikbaar feit"],
      ["alles", "Alles"],
    ].map(([w, t]) => el("option", { value: w, text: t, ...(w === beginFilter ? { selected: "" } : {}) })),
  );
  const campagne = el("select", { id: "filter-campagne" }, [
    el("option", { value: "", text: "Alle campagnes" }),
    ...campagnes.map((c) => el("option", { value: c.id, text: c.naam })),
  ]);
  const kanaal = el("select", { id: "filter-kanaal" }, [
    el("option", { value: "", text: "Alle kanalen" }),
    ...Object.entries(KANALEN).map(([k, naam]) => el("option", { value: k, text: naam })),
  ]);
  const sjabloonFilter = el("select", { id: "filter-sjabloon" }, [
    el("option", { value: "", text: "Alle sjablonen" }),
    ...SJABLONEN.map((s) => el("option", { value: s.id, text: s.naam })),
  ]);
  const zoek = el("input", { type: "search", id: "filter-zoek", placeholder: "Zoek op titel" });
  const tabelHouder = el("div");
  const meer = el("button", { type: "button", class: "secundair", text: "Meer tonen", hidden: "" });
  let zichtbaar = PER_PAGINA;
  let waarnemer = null;

  function gefilterd() {
    const q = zoek.value.trim().toLowerCase();
    return posts.filter((p) => {
      if (status.value === "actief" && p.status === "gearchiveerd") return false;
      if (["concept", "gepland", "gepubliceerd", "gearchiveerd"].includes(status.value) && p.status !== status.value)
        return false;
      if (status.value === "feit" && !(metProbleem(p) && p.status !== "gearchiveerd")) return false;
      if (campagne.value && p.campagne !== campagne.value) return false;
      if (kanaal.value && !kanalenVan(p).includes(kanaal.value)) return false;
      if (sjabloonFilter.value && p.sjabloon !== sjabloonFilter.value) return false;
      return !q || p.titel.toLowerCase().includes(q);
    });
  }

  async function zetStatus(p, naar) {
    try {
      const nieuw = await ctx.api(`/api/posts/${p.id}/status`, { method: "POST", body: { naar } });
      Object.assign(p, nieuw);
      teken();
    } catch (e) {
      melding(e.message, "fout");
    }
  }

  async function dupliceer(p) {
    try {
      const kopie = await ctx.api(`/api/posts/${p.id}/dupliceer`, { method: "POST", body: {} });
      ctx.navigeer(`#maken/${kopie.id}`);
    } catch (e) {
      melding(e.message, "fout");
    }
  }

  async function wis(p) {
    if (
      !(await bevestigDialoog(`De post "${p.titel}" wordt definitief gewist.`, {
        titel: "Post wissen?",
        bevestigTekst: "Wissen",
        gevaarlijk: true,
      }))
    )
      return;
    try {
      await ctx.api(`/api/posts/${p.id}`, { method: "DELETE" });
      posts.splice(posts.indexOf(p), 1);
      teken();
    } catch (e) {
      melding(e.message, "fout");
    }
  }

  function teken() {
    waarnemer?.disconnect();
    const lijst = gefilterd();
    if (!posts.length) {
      tabelHouder.replaceChildren(
        legeStaat("Nog geen posts", "Kies een sjabloon uit de merkkit en maak uw eerste post.", {
          tekst: "Nieuwe post",
          href: "#maken",
        }),
      );
      meer.hidden = true;
      return;
    }
    if (!lijst.length) {
      tabelHouder.replaceChildren(legeStaat("Geen posts met deze filters", "Pas de filters aan om meer te zien."));
      meer.hidden = true;
      return;
    }
    const campagneNaam = new Map(campagnes.map((c) => [c.id, c.naam]));
    const rijen = lijst.slice(0, zichtbaar).map((p) => {
      const s = sjabloonVan(p.sjabloon);
      const mini = el("div", { class: "studio-miniatuur klein", "aria-hidden": "true" });
      mini.dataset.id = p.id;
      const moment =
        p.status === "gepland"
          ? leesbaarMoment(p.gepland)
          : p.status === "gepubliceerd"
            ? leesbaarMoment(p.gepubliceerd?.op)
            : "–";
      return el("tr", {}, [
        el("td", { class: "studio-cel-mini" }, [mini]),
        el("td", {}, [
          el("a", { href: `#maken/${p.id}`, text: p.titel }),
          metProbleem(p) && p.status !== "gearchiveerd"
            ? el("span", { class: "badge badge-waarschuwing", text: "Feit niet bruikbaar" })
            : null,
          el("span", {
            class: "tabel-subtekst",
            text: `${s?.naam ?? p.sjabloon}${p.campagne ? ` · ${campagneNaam.get(p.campagne) ?? "campagne"}` : ""}`,
          }),
        ]),
        el("td", {}, [el("span", { class: `badge studio-badge-${p.status}`, text: STATUS[p.status] })]),
        el("td", { text: moment }),
        el("td", { text: new Date(p.gewijzigd).toLocaleDateString("nl-NL") }),
        el("td", {}, [
          el("div", { class: "rij-acties" }, [
            el("button", { type: "button", class: "secundair klein", text: "Dupliceren", onclick: () => dupliceer(p) }),
            p.status === "gearchiveerd"
              ? el("button", {
                  type: "button",
                  class: "secundair klein",
                  text: "Terughalen",
                  onclick: () => zetStatus(p, "concept"),
                })
              : el("button", {
                  type: "button",
                  class: "secundair klein",
                  text: "Archiveren",
                  onclick: () => zetStatus(p, "gearchiveerd"),
                }),
            el("button", {
              type: "button",
              class: "secundair klein gevaar",
              text: "Wissen",
              "aria-label": `Wis ${p.titel}`,
              onclick: () => wis(p),
            }),
          ]),
        ]),
      ]);
    });
    tabelHouder.replaceChildren(
      el("div", { class: "tabel-scroll" }, [
        el("table", { class: "lijst studio-bibliotheek" }, [
          el("caption", { class: "visueel-verborgen", text: "Posts in de studio" }),
          el("thead", {}, [
            el(
              "tr",
              {},
              ["Beeld", "Titel", "Status", "Gepland of gepubliceerd", "Gewijzigd", "Acties"].map((t) =>
                el("th", { scope: "col", text: t }),
              ),
            ),
          ]),
          el("tbody", {}, rijen),
        ]),
      ]),
    );
    meer.hidden = lijst.length <= zichtbaar;
    const perId = new Map(posts.map((p) => [p.id, p]));
    waarnemer = new IntersectionObserver(
      (regels) => {
        for (const r of regels) {
          if (!r.isIntersecting) continue;
          waarnemer.unobserve(r.target);
          const p = perId.get(r.target.dataset.id);
          void (async () => {
            try {
              const ids = [p.inhoud, ...p.dias.map((d) => d.inhoud)].flatMap((i) => Object.values(i ?? {}));
              const media = await laadMedia(ids);
              const beeld = bouwBeeld({
                sjabloon: p.sjabloon,
                inhoud: p.inhoud,
                dias: p.dias,
                dia: 0,
                formaat: p.formaten[0],
                merk: ctx.merk,
                media,
              });
              toonVoorbeeld(r.target, beeld, { maxHoogte: 64 });
            } catch {
              r.target.textContent = "–";
            }
          })();
        }
      },
      { rootMargin: "100px" },
    );
    for (const m of tabelHouder.querySelectorAll(".studio-miniatuur")) waarnemer.observe(m);
  }

  for (const f of [status, campagne, kanaal, sjabloonFilter])
    f.addEventListener("change", () => {
      zichtbaar = PER_PAGINA;
      teken();
    });
  zoek.addEventListener("input", () => {
    zichtbaar = PER_PAGINA;
    teken();
  });
  meer.addEventListener("click", () => {
    zichtbaar += PER_PAGINA;
    teken();
  });

  container.replaceChildren(
    el("div", { class: "kaart" }, [
      el("div", { class: "studio-filters" }, [
        el("div", { class: "veld" }, [el("label", { for: "filter-status", text: "Status" }), status]),
        el("div", { class: "veld" }, [el("label", { for: "filter-campagne", text: "Campagne" }), campagne]),
        el("div", { class: "veld" }, [el("label", { for: "filter-kanaal", text: "Kanaal" }), kanaal]),
        el("div", { class: "veld" }, [el("label", { for: "filter-sjabloon", text: "Sjabloon" }), sjabloonFilter]),
        el("div", { class: "veld" }, [el("label", { for: "filter-zoek", text: "Zoeken" }), zoek]),
      ]),
      tabelHouder,
      meer,
    ]),
  );
  teken();
  return { verlaat: () => waarnemer?.disconnect() };
}
