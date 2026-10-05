// Marketingstudio — Overzicht: wat staat er deze week, wat is blijven liggen, en waar leunt een
// post op een feit dat niet meer klopt. Ook het ritme (laatste publicatie, lege weken),
// de actualiteitenkalender en de handmatige resultaten.
import { el, legeStaat, melding } from "/ui.js";
import { leesbaarMoment } from "/marketing/recept.js";
import { dagenGeleden } from "/marketing/kalender.js";
import { sjabloon } from "/marketing/sjablonen.js";

function statKaart(label, waarde, hulp, doel) {
  return el("a", { class: "stat-kaart", href: doel }, [
    el("span", { class: "stat-label", text: label }),
    el("strong", { text: String(waarde) }),
    el("span", { class: "stat-hulp", text: hulp }),
  ]);
}

/** JJJJ-MM-DD leesbaar in het Nederlands, zonder tijd: "6 okt". */
function leesbareDatum(d) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
}

/**
 * "vandaag", "gisteren" of "N dagen geleden", voor de statkaart Laatste publicatie. In kalenderdagen
 * in Nederland: gisteren 23.00 heet om 08.00 "gisteren", niet "vandaag".
 */
function geledenTekst(iso) {
  if (!iso) return { waarde: "–", hulp: "Nog niets gepubliceerd" };
  const n = dagenGeleden(iso);
  const waarde = n <= 0 ? "vandaag" : n === 1 ? "gisteren" : `${n} dagen geleden`;
  return { waarde, hulp: "Sinds de laatst gepubliceerde post" };
}

const getal = (n) => n.toLocaleString("nl-NL");

export async function toon(container, ctx) {
  const o = await ctx.api("/api/overzicht");
  if (!ctx.geldig()) return;
  const mb = o.media.bytes / (1024 * 1024);
  /** De lege staat met de knop die voorbeeldinhoud toevoegt, zodat een nieuwe gebruiker meteen iets ziet. */
  const legeStaatMetVoorbeeld = () => {
    const leeg = legeStaat(
      "Niets gepland",
      "Maak een post en plan hem in; hij verschijnt dan hier en in de agenda-export.",
      { tekst: "Nieuwe post", href: "#maken" },
    );
    leeg.append(
      el("button", {
        type: "button",
        class: "secundair",
        text: "Voeg voorbeeldinhoud toe",
        onclick: async () => {
          try {
            await ctx.api("/api/startvulling", { method: "POST", body: {} });
            melding("Voorbeeldfeiten, -teksten en -posts toegevoegd");
            await toon(container, ctx);
          } catch (e) {
            melding(e.message, "fout");
          }
        },
      }),
    );
    return leeg;
  };
  const laatstePublicatie = geledenTekst(o.laatstGepubliceerd);
  container.replaceChildren(
    el("section", { class: "pagina-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: "Marketing" }),
        el("p", {
          text: "Posts maken uit de merkkit, controleren, plannen en exporteren. Elk getal hoort bij een feit met bron.",
        }),
      ]),
      el("div", { class: "knoppenrij" }, [
        el("a", { class: "knop", href: "#maken", text: "Nieuwe post" }),
        el("a", { class: "knop secundair-link", href: "#maken/nieuw/carrousel", text: "Nieuwe carrousel" }),
      ]),
    ]),
    // replaceChildren zet null om naar de tekst "null"; daarom een lege lijst in plaats van null.
    ...(o.metOnbruikbaarFeit
      ? [
          el("div", { class: "kaart studio-signaal", role: "status" }, [
            el("b", {
              text: `${o.metOnbruikbaarFeit} post${o.metOnbruikbaarFeit === 1 ? "" : "s"} leun${o.metOnbruikbaarFeit === 1 ? "t" : "en"} op een feit dat verlopen, ingetrokken of gewist is.`,
            }),
            " ",
            el("a", { href: "#bibliotheek/feit", text: "Bekijk welke" }),
          ]),
        ]
      : []),
    el("section", { class: "stat-grid zes", "aria-label": "Kerncijfers marketing" }, [
      statKaart("Gepland, komende 7 dagen", o.geplandDezeWeek, "Staat klaar om te posten", "#planning"),
      statKaart("Over datum", o.overDatum, "Gepland maar niet als gepubliceerd gemarkeerd", "#planning"),
      statKaart("Concepten", o.concepten, "Nog niet gepland", "#bibliotheek/concept"),
      statKaart("Gepubliceerd, 30 dagen", o.gepubliceerd30, "Als gepubliceerd gemarkeerd", "#bibliotheek/gepubliceerd"),
      statKaart("Laatste publicatie", laatstePublicatie.waarde, laatstePublicatie.hulp, "#bibliotheek/gepubliceerd"),
      statKaart(
        "Lege weken",
        o.legeWeken.length,
        "van de komende vier zonder geplande post (ideeën tellen niet mee)",
        "#planning",
      ),
    ]),
    el("section", { class: "overzicht-grid" }, [
      el("div", { class: "kaart overzicht-hoofd" }, [
        el("div", { class: "kaart-kop" }, [
          el("div", {}, [
            el("h2", { text: "Eerstvolgende posts" }),
            el("p", { text: "De drie eerstvolgende geplande posts" }),
          ]),
          el("a", { href: "#planning", text: "Planning" }),
        ]),
        o.volgende.length
          ? el(
              "div",
              {},
              o.volgende.map((p) =>
                el("div", { class: "status-rij" }, [
                  el("a", { href: `#maken/${p.id}`, text: p.titel }),
                  el("b", { text: leesbaarMoment(p.gepland) }),
                ]),
              ),
            )
          : legeStaatMetVoorbeeld(),
      ]),
      el("div", { class: "overzicht-zij" }, [
        el("div", { class: "kaart" }, [
          el("h2", { text: "Snel naar" }),
          el("nav", { class: "snel-naar", "aria-label": "Snel naar" }, [
            el("a", { href: "#bibliotheek", text: "Alle posts" }),
            el("a", { href: "#feiten", text: "Feitenbank" }),
            el("a", { href: "#merkkit", text: "Merkkit" }),
            el("a", { href: "#planning", text: "Agenda-export" }),
          ]),
        ]),
        el("div", { class: "kaart" }, [
          el("h2", { text: "Komende momenten" }),
          o.momenten.length
            ? el(
                "div",
                {},
                o.momenten.map((m) =>
                  el("div", { class: "status-rij" }, [el("span", { text: `${leesbareDatum(m.datum)} · ${m.titel}` })]),
                ),
              )
            : el("p", { class: "hulptekst", text: "Geen momenten in de komende 60 dagen" }),
          el("a", { href: "#planning", text: "Planning" }),
        ]),
        el("div", { class: "kaart" }, [
          el("h2", { text: "Ideeën" }),
          el("p", { text: `${o.openIdeeen} open idee${o.openIdeeen === 1 ? "" : "ën"}` }),
          el("a", { href: "#planning", text: "Naar de planner" }),
        ]),
        el("div", { class: "kaart" }, [
          el("h2", { text: "Resultaten, afgelopen halfjaar" }),
          o.resultaten.length
            ? el("div", { class: "tabel-scroll" }, [
                el("table", { class: "lijst" }, [
                  el("thead", {}, [
                    el("tr", {}, [
                      el("th", { text: "Sjabloon" }),
                      el("th", { class: "getal", text: "Posts" }),
                      el("th", { class: "getal", text: "Vertoningen" }),
                      el("th", { class: "getal", text: "Reacties" }),
                      el("th", { class: "getal", text: "Klikken" }),
                    ]),
                  ]),
                  el(
                    "tbody",
                    {},
                    o.resultaten.map((r) =>
                      el("tr", {}, [
                        el("td", { text: sjabloon(r.sjabloon)?.naam ?? r.sjabloon }),
                        el("td", { class: "getal", text: getal(r.posts) }),
                        el("td", { class: "getal", text: getal(r.vertoningen) }),
                        el("td", { class: "getal", text: getal(r.reacties) }),
                        el("td", { class: "getal", text: getal(r.klikken) }),
                      ]),
                    ),
                  ),
                ]),
              ])
            : el("p", {
                class: "hulptekst",
                text: "Vul bij een gepubliceerde post de cijfers in; ze verschijnen hier.",
              }),
        ]),
        el("div", { class: "kaart" }, [
          el("h2", { text: "Geüploade beelden" }),
          el("div", { class: "status-rij" }, [
            el("span", { text: `${o.media.aantal} beeld${o.media.aantal === 1 ? "" : "en"}` }),
            el("b", {
              class: mb > 100 ? "status-let-op" : "status-goed",
              text: `${mb.toFixed(1).replace(".", ",")} MB`,
            }),
          ]),
          mb > 100
            ? el("p", { class: "hulptekst", text: "Ruim oude schermafbeeldingen op onder Instellingen." })
            : null,
          el("a", { href: "#instellingen", text: "Beelden beheren" }),
        ]),
      ]),
    ]),
  );
}
