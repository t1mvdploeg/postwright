// Marketingstudio — contrast volgens WCAG 2.1. De kleurparen per ondergrond staan in het merk
// (`merk.gronden`), niet hier. Zelfstandig: de browser laadt geen servermodules.

function luminantie(hex) {
  const deel = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * deel(0) + 0.7152 * deel(1) + 0.0722 * deel(2);
}

/** Contrastverhouding tussen twee hexkleuren (#rrggbb); 1 = gelijk, 21 = zwart op wit. Afgerond op 0,01. */
export function contrastVerhouding(a, b) {
  const la = luminantie(a);
  const lb = luminantie(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** De drempel voor tekst op een ondergrond: WCAG 1.4.3, lopende tekst 4,5:1. */
export const DREMPEL = 4.5;

/** Het contrast van de tekst op een ondergrond van het merk, met de drempel erbij; null bij een onbekende ondergrond. */
export function contrastOp(merk, grond) {
  const g = merk.gronden[grond];
  return g ? { verhouding: contrastVerhouding(g.tekst, g.achtergrond), drempel: DREMPEL } : null;
}
