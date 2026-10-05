// Marketingstudio — Merkkit: het merkboek in de tool. Kleuren met contrast, logo's (SVG en PNG),
// iconen, motieven, de regels uit de kit en een generator voor de e-mailhandtekening. Alles komt
// uit src/web/marketing/merk/, byte-gelijk aan de gekozen kit (tests/marketing-merk.test.ts).
import { el, melding } from "/app.js";
import { contrastenOp } from "/marketing/kleur.js";
import { download } from "/marketing/render.js";
import { handtekeningHtml } from "/marketing/handtekening.js";

const MAP = "/marketing/merk";

/** Op welke ondergrond een logovariant hoort, afgeleid uit de bestandsnaam. */
function ondergrondVoor(pad) {
  if (/op-inkt|-wit/.test(pad)) return "inkt";
  if (/op-blauw/.test(pad)) return "blauw";
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
  return new Promise((ok, nee) => c.toBlob((b) => (b ? ok(b) : nee(new Error("PNG maken lukte niet in deze browser"))), "image/png"));
}

function naamVan(pad) { return pad.split("/").pop(); }

export async function toon(container, ctx) {
  const m = ctx.merk;
  const sprite = await fetch(`${MAP}/${m.bestanden.iconen}`).then((r) => r.text()).catch(() => "");
  if (!ctx.geldig()) return;
  const iconen = [...new DOMParser().parseFromString(sprite, "image/svg+xml").querySelectorAll("symbol")].map((s) => ({
    id: s.id,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${s.getAttribute("viewBox") ?? "0 0 24 24"}" width="24" height="24" fill="none" stroke="#10243e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${s.innerHTML.trim()}</svg>`,
  }));

  const kleuren = el("div", { class: "studio-kleuren" }, m.kleuren.map((k) => el("div", { class: "studio-kleur" }, [
    el("span", { class: "studio-staal", style: `background:${k.hex}` }),
    el("b", { text: k.naam }),
    el("code", { text: k.hex }),
    el("span", { class: "hulptekst", text: k.gebruik }),
  ])));
  const contrast = el("div", { class: "tabel-scroll" }, [el("table", { class: "lijst" }, [
    el("thead", {}, [el("tr", {}, ["Ondergrond", "Kop", "Nadruk in de kop", "Lopende tekst"].map((t) => el("th", { scope: "col", text: t })))]),
    el("tbody", {}, ["licht", "inkt", "blauw"].map((g) => el("tr", {}, [
      el("td", { text: { licht: "Licht", inkt: "Dossierinkt", blauw: "Actieblauw" }[g] }),
      ...contrastenOp(g).map((c) => el("td", { text: `${String(c.verhouding).replace(".", ",")}:1 ${c.verhouding >= c.drempel ? "✓" : "✗"}` })),
    ]))),
  ])]);

  const logos = el("div", { class: "studio-bestandsraster" }, m.bestanden.logo.filter((p) => p.endsWith(".svg")).map((pad) => {
    const bron = `${MAP}/${pad}`;
    const png = el("button", { type: "button", class: "secundair klein", text: "PNG" });
    png.addEventListener("click", async () => {
      try { download(await svgNaarPng(bron), naamVan(pad).replace(/\.svg$/, ".png"), "image/png"); } catch (e) { melding(e.message, "fout"); }
    });
    return el("figure", { class: "studio-bestand" }, [
      el("div", { class: `studio-bestand-beeld grond-${ondergrondVoor(pad)}` }, [el("img", { src: bron, alt: "" })]),
      el("figcaption", { text: naamVan(pad).replace("mijntarieftool-", "").replace(".svg", "") }),
      el("div", { class: "knoppenrij" }, [el("a", { class: "knop-link klein", href: bron, download: naamVan(pad), text: "SVG" }), png]),
    ]);
  }));

  const iconenRaster = el("div", { class: "studio-iconen" }, iconen.map((i) => {
    const kopieer = el("button", { type: "button", class: "knop-stil studio-icoon", "aria-label": `Kopieer icoon ${i.id} als SVG` }, [
      el("img", { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(i.svg)}`, alt: "" }),
      el("span", { text: i.id }),
    ]);
    kopieer.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(i.svg); melding(`Icoon "${i.id}" gekopieerd als SVG`); } catch { melding("Kopiëren lukte niet", "fout"); }
    });
    return kopieer;
  }));

  const motieven = el("div", { class: "studio-bestandsraster" }, [...m.bestanden.motieven, ...m.bestanden.profiel].map((pad) => el("figure", { class: "studio-bestand" }, [
    el("div", { class: `studio-bestand-beeld grond-${/inkt/.test(pad) ? "inkt" : /blauw/.test(pad) ? "blauw" : "licht"}` }, [el("img", { src: `${MAP}/${pad}`, alt: "" })]),
    el("figcaption", { text: naamVan(pad).replace(".svg", "") }),
    el("a", { class: "knop-link klein", href: `${MAP}/${pad}`, download: naamVan(pad), text: "SVG" }),
  ])));

  // E-mailhandtekening
  const velden = ["naam", "functie", "telefoon", "email"].map((id) => el("input", { type: id === "email" ? "email" : id === "telefoon" ? "tel" : "text", id: `ht-${id}`, maxlength: "120" }));
  const [naam, functie, telefoon, email] = velden;
  const voorbeeld = el("iframe", { class: "studio-handtekening", sandbox: "", title: "Voorbeeld van de e-mailhandtekening" });
  const logoUrl = `${location.origin}${MAP}/${m.bestanden.eMailLogo}`;
  const html = () => handtekeningHtml({ naam: naam.value, functie: functie.value, telefoon: telefoon.value, email: email.value, logoUrl });
  const ververs = () => { voorbeeld.srcdoc = `<!doctype html><html><body style="margin:16px;background:#fff">${html()}</body></html>`; };
  for (const v of velden) v.addEventListener("input", ververs);
  ververs();
  const kopieer = el("button", { type: "button", text: "Kopieer handtekening" });
  kopieer.addEventListener("click", async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html()], { type: "text/html" }), "text/plain": new Blob([[naam.value, functie.value, telefoon.value, email.value, "mijntarieftool.nl"].filter(Boolean).join("\n")], { type: "text/plain" }) })]);
      melding("Handtekening gekopieerd; plak hem in de instellingen van uw mailprogramma");
    } catch { melding("Kopiëren lukte niet; gebruik Kopieer HTML", "fout"); }
  });
  const kopieerHtml = el("button", { type: "button", class: "secundair", text: "Kopieer HTML" });
  kopieerHtml.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(html()); melding("HTML gekopieerd"); } catch { melding("Kopiëren lukte niet", "fout"); }
  });

  container.replaceChildren(
    el("section", { class: "pagina-intro" }, [el("div", {}, [
      el("p", { class: "intro-label", text: `Merkversie ${m.versie}` }),
      el("p", { text: "De merkkit waaruit de studio werkt. Wijzigt de kit, dan volgen de bestanden hier via een commit; een test bewaakt dat ze gelijk blijven." }),
    ])]),
    el("section", { class: "kaart" }, [el("h2", { text: "Kleuren" }), kleuren, el("h3", { text: "Contrast per ondergrond (WCAG: kop 3:1, tekst 4,5:1)" }), contrast]),
    el("section", { class: "kaart" }, [el("h2", { text: "Logo's" }), el("p", { class: "hulptekst", text: "Op inkt en blauw de witte versie. De eenkleurige standen sparen het teken uit, zodat een foto of vreemde kleur erdoorheen komt." }), logos]),
    el("section", { class: "kaart" }, [el("h2", { text: `Iconen (${iconen.length})` }), el("p", { class: "hulptekst", text: "Klik op een icoon om het als SVG te kopiëren. Lijn 1,7 in dossierinkt; kleur via currentColor in de sprite." }), iconenRaster]),
    el("section", { class: "kaart" }, [el("h2", { text: "Motieven en profielbeelden" }), motieven]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "Regels" }),
      el("ul", { class: "studio-regels" }, [
        "Precies één gekleurde frase per kop.",
        "Op inkt en blauw het witte logo.",
        "Beelden met cijfers of namen uit het voorbeelddossier houden het label Voorbeelddossier.",
        "De u-vorm; zakelijk en rustig, zonder uitroeptekens.",
        "Alleen feiten die ook op de site staan, en elk getal met een bron.",
        "De route is een watermerk, nooit in een accentkleur.",
      ].map((t) => el("li", { text: t }))),
    ]),
    el("section", { class: "kaart" }, [
      el("h2", { text: "E-mailhandtekening" }),
      el("p", { class: "hulptekst", text: "Het logo staat online op deze site, zodat ook Gmail en Outlook op het web het tonen." }),
      el("div", { class: "veldrij" }, [
        el("div", { class: "veld" }, [el("label", { for: "ht-naam", text: "Naam" }), naam]),
        el("div", { class: "veld" }, [el("label", { for: "ht-functie", text: "Functie" }), functie]),
        el("div", { class: "veld" }, [el("label", { for: "ht-telefoon", text: "Telefoon" }), telefoon]),
        el("div", { class: "veld" }, [el("label", { for: "ht-email", text: "E-mail" }), email]),
      ]),
      voorbeeld,
      el("div", { class: "knoppenrij" }, [kopieer, kopieerHtml]),
    ]),
  );
}
