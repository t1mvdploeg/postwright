// Marketingstudio — het paneel van de schrijfhulp in de editor. De server laadt de feiten zelf op
// id en rekent elk voorstel na op getallen die in geen feit staan; zo'n voorstel is hier niet met
// één klik over te nemen. Er wordt nooit iets automatisch bewaard.
import { el, melding } from "/app.js";
import { zonderNadruk } from "/marketing/sjablonen.js";

const TAKEN = [
  ["velden", "Kop en tekst van het beeld"],
  ["posttekst", "Posttekst voor het gekozen kanaal"],
  ["alt-tekst", "Alt-tekst"],
];

/** De al ingevulde inhoud van de post, voor de opdracht (BM-13): alleen de velden die de hulp kent. */
function huidigeInhoud(post, velden, kanaal) {
  const veld = Object.fromEntries(velden.map((v) => [v.id, String(post.inhoud?.[v.id] ?? "")]).filter(([, t]) => t.trim()));
  return { velden: veld, posttekst: post.posttekst?.[kanaal] ?? "", altTekst: post.altTekst ?? "" };
}

export function schrijfhulpPaneel({ ctx, sjabloon, veldenNu, postNu, kanaalNu, pasToe, zetPosttekst, zetAlt }) {
  const taak = el("select", { id: "hulp-taak" }, TAKEN.map(([w, t]) => el("option", { value: w, text: t })));
  const toelichting = el("textarea", { id: "hulp-toelichting", rows: "3", maxlength: "1000", placeholder: "Bijvoorbeeld: voor HR-managers bij uitzendbureaus, over de controle op aannames." });
  const vraag = el("button", { type: "button", text: "Vraag drie voorstellen" });
  const annuleer = el("button", { type: "button", class: "secundair", text: "Annuleren", hidden: "" });
  const stand = el("p", { class: "hulptekst", role: "status", "aria-live": "polite" });
  const uitkomst = el("div", { class: "studio-varianten" });
  let afbreken = null;

  function voorstel(v, i) {
    const regels = [];
    const t = taak.value;
    if (t === "velden") for (const [id, waarde] of Object.entries(v.velden ?? {})) {
      const veld = veldenNu().find((x) => x.id === id);
      regels.push(el("p", {}, [el("b", { text: `${veld?.label ?? id}: ` }), zonderNadruk(waarde)]));
    }
    if (t === "posttekst") regels.push(el("p", { class: "studio-varianttekst", text: v.posttekst ?? "" }));
    if (t === "alt-tekst") regels.push(el("p", { text: v.altTekst ?? "" }));
    const ongedekt = v.ongedekt ?? [];
    if (ongedekt.length) regels.push(el("p", { class: "studio-waarschuwing", text: `Bevat een getal dat in geen gekoppeld feit staat: ${ongedekt.join(", ")}. Niet over te nemen.` }));
    const gebruik = el("button", { type: "button", class: "secundair klein", text: "Gebruik deze", ...(ongedekt.length ? { disabled: "" } : {}) });
    gebruik.addEventListener("click", () => {
      if (t === "velden") pasToe(v.velden ?? {});
      else if (t === "posttekst") zetPosttekst(v.posttekst ?? "");
      else zetAlt(v.altTekst ?? "");
      melding("Voorstel overgenomen; bewaar de post om het vast te leggen");
    });
    return el("article", { class: "studio-variant" }, [el("h3", { text: `Voorstel ${i + 1}` }), ...regels, gebruik]);
  }

  vraag.addEventListener("click", async () => {
    const post = postNu();
    afbreken = new AbortController();
    vraag.disabled = true;
    annuleer.hidden = false;
    stand.textContent = "De schrijfhulp denkt na…";
    uitkomst.replaceChildren();
    try {
      const velden = veldenNu().filter((v) => v.soort !== "keuze" && v.soort !== "media")
        .map((v) => ({ id: v.id, label: v.label, soort: v.soort, max: v.max ?? null, nadruk: v.nadruk === "precies-een" }));
      const r = await fetch("/api/beheer/marketing/schrijfhulp", {
        method: "POST", signal: afbreken.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ taak: taak.value, sjabloon: sjabloon.naam, velden, kanaal: kanaalNu(), toelichting: toelichting.value, feiten: post.feiten ?? [], huidig: huidigeInhoud(post, velden, kanaalNu()) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.fout ?? `De schrijfhulp gaf een fout (${r.status})`);
      uitkomst.replaceChildren(...data.varianten.map(voorstel));
      stand.textContent = data.varianten.length ? `${data.varianten.length} voorstellen. Kosten: platform (zie Kosten in Platformbeheer).` : "Geen bruikbaar voorstel ontvangen.";
    } catch (e) {
      stand.textContent = e.name === "AbortError" ? "Afgebroken." : "";
      if (e.name !== "AbortError") melding(e.message, "fout");
    } finally {
      vraag.disabled = false;
      annuleer.hidden = true;
      afbreken = null;
    }
  });
  annuleer.addEventListener("click", () => afbreken?.abort());

  const element = el("details", { class: "blok studio-schrijfhulp" }, [
    el("summary", { text: "Schrijfhulp" }),
    el("div", { class: "blok-inhoud" }, [
      el("p", { class: "hulptekst", text: "Voorstellen uitsluitend uit de gekoppelde, actieve feiten, in de toon van de site. U kiest zelf; niets wordt automatisch bewaard." }),
      el("div", { class: "veld" }, [el("label", { for: "hulp-taak", text: "Wat moet er komen" }), taak]),
      el("div", { class: "veld" }, [el("label", { for: "hulp-toelichting", text: "Toelichting (optioneel)" }), toelichting]),
      el("div", { class: "knoppenrij" }, [vraag, annuleer]),
      stand,
      uitkomst,
    ]),
  ]);
  return { element };
}
