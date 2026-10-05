// Marketingstudio — gedeelde velddefinities voor de sjablonen, zodat "ondergrond" of "voetregel"
// overal hetzelfde heten, dezelfde opties hebben en dezelfde hulptekst.

/** De drie ondergronden van het merk: licht, inkt en accent. De kleuren staan in `merk.gronden`. */
export function ondergrond(standaard = "licht", toegestaan = ["licht", "inkt", "accent"]) {
  const namen = { licht: "Licht", inkt: "Inkt", accent: "Accent" };
  return {
    id: "ondergrond", label: "Ondergrond", soort: "keuze", standaard,
    opties: toegestaan.map((w) => ({ waarde: w, tekst: namen[w] })),
  };
}

/** Het logo dat bij een ondergrond hoort: op inkt en accent de lichte versie. */
export function logoStand(grond) {
  return grond === "inkt" ? "op-inkt" : grond === "accent" ? "op-accent" : "standaard";
}

/** De klasse van een ondergrond op `.beeld`; licht is de standaard en heeft geen klasse. */
export function grondKlasse(grond) {
  return grond === "inkt" ? "grond-inkt" : grond === "accent" ? "grond-accent" : "";
}

export function kop(standaard, max = 80, hulp = "Zet precies één frase tussen *sterretjes*; die krijgt de accentkleur.") {
  return { id: "kop", label: "Kop", soort: "kop", verplicht: true, nadruk: "precies-een", max, standaard, hulp };
}

export function tekst(standaard, max = 160, label = "Tekst") {
  return { id: "tekst", label, soort: "tekst", max, standaard };
}

export function regel(id, label, standaard, max = 60, extra = {}) {
  return { id, label, soort: "regel", max, standaard, ...extra };
}

/** De grootte van de kop: automatisch naar lengte, zoals de kit korte koppen groot zet en lange kleiner. */
export const KOPGROOTTE = {
  id: "kopgrootte", label: "Grootte van de kop", soort: "keuze", standaard: "automatisch",
  opties: [
    { waarde: "automatisch", tekst: "Automatisch" },
    { waarde: "groot", tekst: "Groot" },
    { waarde: "middel", tekst: "Middel" },
    { waarde: "klein", tekst: "Klein" },
  ],
};

/** De klasse bij een kopgrootte; "automatisch" kiest op lengte (zonder de sterretjes). */
export function kopKlasse(grootte, kopTekst) {
  const lengte = String(kopTekst ?? "").replace(/\*/g, "").length;
  const g = grootte === "automatisch" ? (lengte <= 34 ? "groot" : lengte <= 60 ? "middel" : "klein") : grootte;
  return g === "groot" ? "kop" : `kop ${g}`;
}
