// Marketingstudio — Merkkit: het merkboek in de tool. Kleuren met contrast, logo's (SVG en PNG),
// het routemotief en de regels. Alles komt uit het actieve merk (`merk.json` en de bestanden
// ernaast, zie `src/server/merk.ts`).
import { el, melding } from "/ui.js";
import { contrastOp } from "/marketing/kleur.js";
import { slugVan } from "/marketing/formaten.js";
import { download } from "/marketing/render.js";

const MAP = "/marketing/merk";

/** Op welke ondergrond een logostand hoort, afgeleid uit de naam van de stand. */
function ondergrondVoor(stand) {
  if (/op-inkt|^wit$/.test(stand)) return "inkt";
  if (/op-accent/.test(stand)) return "accent";
  return "licht";
}

/** Een SVG als PNG met de langste zijde op `zijde` pixels, transparant. */
async function svgNaarPng(pad, zijde = 2048) {
  const img = new Image();
  img.src = pad;
  await img.decode();
  const schaal = zijde / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
  const c = document.createElement("canvas");
  c.width = Math.round((img.naturalWidth || zijde) * schaal);
  c.height = Math.round((img.naturalHeight || zijde) * schaal);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, nee) =>
    c.toBlob((b) => (b ? ok(b) : nee(new Error("PNG maken lukte niet in deze browser"))), "image/png"),
  );
}

export async function toon(container, ctx) {
  const m = ctx.merk;
  const kleuren = el(
    "div",
    { class: "studio-kleuren" },
    m.kleuren.map((k) =>
      el("div", { class: "studio-kleur" }, [
        el("span", { class: "studio-staal", style: `background:${k.hex}` }),
        el("b", { text: k.naam }),
        el("code", { text: k.hex }),
        el("span", { class: "hulptekst", text: k.gebruik }),
      ]),
    ),
  );
  const contrast = el("div", { class: "tabel-scroll" }, [
    el("table", { class: "lijst" }, [
      el("thead", {}, [
        el(
          "tr",
          {},
          ["Ondergrond", "Tekst op de ondergrond"].map((t) => el("th", { scope: "col", text: t })),
        ),
      ]),
      el(
        "tbody",
        {},
        Object.keys(m.gronden).map((g) => {
          const c = contrastOp(m, g);
          return el("tr", {}, [
            el("td", { text: { licht: "Licht", inkt: "Inkt", accent: "Accent" }[g] ?? g }),
            el("td", { text: `${String(c.verhouding).replace(".", ",")}:1 ${c.verhouding >= c.drempel ? "✓" : "✗"}` }),
          ]);
        }),
      ),
    ]),
  ]);

  const logos = el(
    "div",
    { class: "studio-bestandsraster" },
    // Het geladen merk heeft elk logo al als data-URL (zie merk.js), dus er hoort geen map voor.
    Object.entries(m.logos).map(([stand, bron]) => {
      const png = el("button", { type: "button", class: "secundair klein", text: "PNG" });
      png.addEventListener("click", async () => {
        try {
          download(await svgNaarPng(bron), `${slugVan(m.naam)}-${stand}.png`, "image/png");
        } catch (e) {
          melding(e.message, "fout");
        }
      });
      return el("figure", { class: "studio-bestand" }, [
        el("div", { class: `studio-bestand-beeld grond-${ondergrondVoor(stand)}` }, [
          el("img", { src: bron, alt: "" }),
        ]),
        el("figcaption", { text: stand }),
        el("div", { class: "knoppenrij" }, [
          el("a", { class: "knop-link klein", href: bron, download: `${slugVan(m.naam)}-${stand}.svg`, text: "SVG" }),
          png,
        ]),
      ]);
    }),
  );

  const motief = el("div", { class: "studio-bestandsraster" }, [
    el("figure", { class: "studio-bestand" }, [
      el("div", { class: "studio-bestand-beeld grond-inkt" }, [
        el("img", { src: `${MAP}/motieven/route.svg`, alt: "" }),
      ]),
      el("figcaption", { text: "route" }),
      el("a", { class: "knop-link klein", href: `${MAP}/motieven/route.svg`, download: "route.svg", text: "SVG" }),
    ]),
  ]);

  container.replaceChildren(
    el("section", { class: "pagina-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: `Merkversie ${m.versie}` }),
        el("p", {
          text: `Het merk waaruit de studio werkt: ${m.naam}. Een eigen merk zet u in data/brand (merk.json met de bestanden ernaast); de studio gebruikt dat dan in plaats van dit.`,
        }),
      ]),
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Kleuren" }),
      kleuren,
      el("h3", { text: "Contrast per ondergrond (WCAG: kop 3:1, tekst 4,5:1)" }),
      contrast,
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Logo's" }),
      el("p", {
        class: "hulptekst",
        text: "Op inkt en accent de lichte versie. De eenkleurige standen sparen het teken uit, zodat een foto of vreemde kleur erdoorheen komt.",
      }),
      logos,
    ]),
    el("section", { class: "kaart" }, [el("h2", { text: "Routemotief" }), motief]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Regels" }),
      el(
        "ul",
        { class: "studio-regels" },
        [
          "Precies één gekleurde frase per kop.",
          "Op inkt en accent het lichte logo.",
          "Zakelijk en rustig, zonder uitroeptekens.",
          "Elk getal komt uit een gekoppeld feit met een bron.",
          "De route is een watermerk, nooit in een accentkleur.",
        ].map((t) => el("li", { text: t })),
      ),
    ]),
  );
}
