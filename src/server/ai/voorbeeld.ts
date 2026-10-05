// De voorbeeldgever: voorspelbare antwoorden zonder model, voor wie geen API-sleutel heeft. Elke tekst
// is herkenbaar als voorbeeld ("Sample ..."), gebruikt alleen tekst uit de meegegeven feiten en kost niets.
import { werkdagen } from "../../model/marketing-ideeen.js";
import { LEGE_USAGE, type AiProvider } from "./provider.js";

const MODEL = "voorbeeld";

export const voorbeeldProvider: AiProvider = {
  naam: "voorbeeld",

  async marketingTekst(opdracht) {
    const begin = Date.now();
    const feit = opdracht.feiten[0];
    const varianten = [0, 1, 2].map((i) => ({
      velden:
        opdracht.taak === "velden"
          ? opdracht.velden.map((v) => {
              if (v.nadruk) return { id: v.id, tekst: `Sample *headline ${i + 1}*` };
              const tekst = feit ? feit.tekst : `Sample text ${i + 1} for ${v.label.toLowerCase()}.`;
              return { id: v.id, tekst: v.max ? tekst.slice(0, v.max) : tekst };
            })
          : [],
      posttekst: opdracht.taak === "posttekst" ? `Sample caption ${i + 1}${feit ? `: ${feit.tekst}` : "."}` : "",
      altTekst: opdracht.taak === "alt-tekst" ? `Sample alt text ${i + 1} for the ${opdracht.sjabloon} image.` : "",
      gebruikteFeiten: feit ? [feit.id] : [],
    }));
    return { voorstel: { varianten }, model: MODEL, usage: LEGE_USAGE, duurMs: Date.now() - begin };
  },

  async marketingIdeeen(o) {
    const begin = Date.now();
    const dagen = werkdagen(o.van, o.tot);
    const ideeen = Array.from({ length: o.aantal }, (_, i) => {
      const m = i === 0 ? o.momenten[0] : undefined;
      return {
        datum: dagen.length ? dagen[Math.floor((i * dagen.length) / o.aantal)] : o.van,
        titel: m ? m.titel : `Sample idea ${i + 1}`,
        toelichting: m ? m.zin : "Sample answer, made without a model to try out the planner.",
        sjabloon: o.sjablonen[i % Math.max(1, o.sjablonen.length)]?.id ?? "",
        kop: `Sample *headline ${i + 1}*`,
        feiten: o.feiten[0] ? [o.feiten[0].id] : [],
        moment: m ? m.sleutel : "",
      };
    });
    return { voorstel: { ideeen }, model: MODEL, usage: LEGE_USAGE, duurMs: Date.now() - begin };
  },
};
