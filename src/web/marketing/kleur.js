// Marketingstudio — contrast volgens WCAG 2.1. Dezelfde berekening als `contrastVerhouding` in
// src/server/api-huisstijl.ts (tests/marketing-merkcontrole.test.ts bewijst dat ze gelijk
// uitkomen); hier opnieuw omdat de browser geen servermodules laadt.

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

/**
 * De kleurparen per ondergrond, zoals `sociaal.css` van de kit ze zet (`--nadruk`, `--zacht`). De
 * lichte ondergrond is in de kit een oklch-waarde; #f6f8fd is het werkcanvas uit het palet, dat
 * er binnen een tiende contrast op zit.
 */
export const GRONDEN = {
  licht: { achtergrond: "#f6f8fd", tekst: "#10243e", nadruk: "#245cf0", zacht: "#5a6b84" },
  inkt: { achtergrond: "#10243e", tekst: "#ffffff", nadruk: "#55b6ff", zacht: "#cfe2ff" },
  blauw: { achtergrond: "#245cf0", tekst: "#ffffff", nadruk: "#cfe2ff", zacht: "#eaf2ff" },
};

/**
 * De contrasten op een ondergrond, met de drempel die erbij hoort: grote koptekst 3:1, lopende
 * tekst 4,5:1 (WCAG 1.4.3).
 */
export function contrastenOp(grond) {
  const g = GRONDEN[grond];
  if (!g) return [];
  return [
    { wat: "kop", verhouding: contrastVerhouding(g.tekst, g.achtergrond), drempel: 3 },
    { wat: "nadruk in de kop", verhouding: contrastVerhouding(g.nadruk, g.achtergrond), drempel: 3 },
    { wat: "lopende tekst", verhouding: contrastVerhouding(g.zacht, g.achtergrond), drempel: 4.5 },
  ];
}
