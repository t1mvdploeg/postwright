// Marketingstudio — alle formaten en kanalen op één plek. Platforms veranderen hun maten; dan is
// dit het enige bestand dat om moet. Puur (geen DOM), zodat vitest het in Node test.

/** Kanalen waarvoor de studio een posttekst kent. */
export const KANALEN = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
};

/**
 * De formaten. `veiligeZones` zijn stukken van het beeld waar het platform zelf iets overheen
 * legt (de profielfoto, de knoppen van een story); daar mag geen tekst staan. Coördinaten in
 * pixels van het beeld zelf.
 */
export const FORMATEN = [
  { sleutel: "li-vierkant", naam: "LinkedIn vierkant", kanaal: "linkedin", breedte: 1200, hoogte: 1200, veiligeZones: [] },
  { sleutel: "li-staand", naam: "LinkedIn staand", kanaal: "linkedin", breedte: 1080, hoogte: 1350, veiligeZones: [] },
  { sleutel: "li-carrousel", naam: "LinkedIn carrousel (PDF)", kanaal: "linkedin", breedte: 1080, hoogte: 1350, veiligeZones: [], carrousel: true },
  { sleutel: "li-link", naam: "Linkvoorbeeld", kanaal: "linkedin", breedte: 1200, hoogte: 630, veiligeZones: [] },
  // De profielfoto valt linksonder over de achtergrond; de linkerkant blijft daarom vrij.
  { sleutel: "li-profiel", naam: "LinkedIn profielachtergrond", kanaal: "linkedin", breedte: 1584, hoogte: 396, veiligeZones: [{ x: 0, y: 0, breedte: 420, hoogte: 396, reden: "profielfoto" }] },
  // Het bedrijfslogo valt linksonder over de omslag.
  { sleutel: "li-bedrijf", naam: "LinkedIn bedrijfsomslag", kanaal: "linkedin", breedte: 1128, hoogte: 191, veiligeZones: [{ x: 0, y: 60, breedte: 260, hoogte: 131, reden: "bedrijfslogo" }] },
  { sleutel: "ig-vierkant", naam: "Instagram vierkant", kanaal: "instagram", breedte: 1080, hoogte: 1080, veiligeZones: [] },
  { sleutel: "ig-staand", naam: "Instagram staand", kanaal: "instagram", breedte: 1080, hoogte: 1350, veiligeZones: [] },
  // 250 px boven en onder vrij voor de bediening van het platform.
  { sleutel: "story", naam: "Story", kanaal: "instagram", breedte: 1080, hoogte: 1920, veiligeZones: [
    { x: 0, y: 0, breedte: 1080, hoogte: 250, reden: "bediening bovenin" },
    { x: 0, y: 1670, breedte: 1080, hoogte: 250, reden: "bediening onderin" },
  ] },
  { sleutel: "breed", naam: "Liggend (X, Facebook, blog)", kanaal: "x", breedte: 1600, hoogte: 900, veiligeZones: [] },
];

const PER_SLEUTEL = new Map(FORMATEN.map((f) => [f.sleutel, f]));

/** Het formaat bij een sleutel; gooit bij een onbekende sleutel (een fout in de code, geen invoer). */
export function formaat(sleutel) {
  const f = PER_SLEUTEL.get(sleutel);
  if (!f) throw new Error(`Onbekend formaat: ${sleutel}`);
  return f;
}

/**
 * De vorm van een formaat, voor de opmaak van een sjabloon. Media queries op de beeldverhouding
 * zijn in een foreignObject en een geschaald iframe niet betrouwbaar, dus de studio zet de vorm als klasse (`vorm-staand`) op het beeld.
 */
export function vormVan(f) {
  const r = f.breedte / f.hoogte;
  if (r >= 2.5) return "banner";
  if (r > 1.2) return "liggend";
  if (r >= 0.95) return "vierkant";
  if (r > 0.65) return "staand";
  return "story";
}

/** Een tekst als stukje bestandsnaam: kleine letters, zonder accenten, alleen a-z, 0-9 en streepjes. */
export function slugVan(tekst, max = 40) {
  return String(tekst ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Eén vaste vorm voor bestandsnamen, zodat een map met downloads vanzelf gesorteerd staat:
 * `<merknaam>_<campagne>_<post>_<formaat>_<b>x<h>[_dia-NN].<ext>`. Een lege merknaam of campagne valt weg.
 */
export function bestandsnaam({ merk = "", campagne = "", post = "", formaat: sleutel, dia = null, extensie = "png" }) {
  const f = formaat(sleutel);
  const delen = [slugVan(merk), slugVan(campagne), slugVan(post) || "post", sleutel, `${f.breedte}x${f.hoogte}`];
  if (dia !== null) delen.push(`dia-${String(dia).padStart(2, "0")}`);
  return `${delen.filter(Boolean).join("_")}.${extensie}`;
}

/** De kanalen waar een post bij hoort: die van zijn formaten plus die waarvoor hij een posttekst heeft. */
export function kanalenVan(post) {
  const uit = new Set((post.formaten ?? []).map((f) => PER_SLEUTEL.get(f)?.kanaal).filter(Boolean));
  for (const [k, t] of Object.entries(post.posttekst ?? {})) if (String(t ?? "").trim()) uit.add(k);
  return [...uit];
}

/** Of rechthoek a rechthoek b raakt (tolerantie in pixels). */
export function overlapt(a, b, tolerantie = 0) {
  return a.x < b.x + b.breedte - tolerantie && b.x < a.x + a.breedte - tolerantie
    && a.y < b.y + b.hoogte - tolerantie && b.y < a.y + a.hoogte - tolerantie;
}
