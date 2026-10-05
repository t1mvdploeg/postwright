// Marketingstudio — de basisopmaak van alle sjablonen. Een beeld staat hier in een foreignObject
// of een geschaald iframe in plaats van in een eigen browservenster, daarom:
//  - geen `html { font-size: calc(100vw / 108) }`: `bouwBeeld` rekent elke rem om naar pixels
//    (breedte ÷ 108), want in een foreignObject is de root het <svg>-element (spike M0);
//  - `.beeld` krijgt de maat van het formaat (`--breedte`/`--hoogte`) in plaats van 100vw/100vh;
//  - de media query voor stories is de vormklasse `.vorm-story` geworden.
// De kleuren en de letter komen uit het actieve merk (zie `merkCss` in sjablonen.js).
export const BASIS_CSS = `/* Sjablonen voor sociale media. Eén rem is 10px op een canvas van 1080 breed en schaalt mee met de breedte,
   zodat één bron zowel 1200×1200 als 1080×1350 oplevert. Maten van de site ×1,5 (site 12px = 1,8rem). */
body { margin: 0; }
.beeld {
  --nadruk: var(--accent);
  --zacht: var(--gedempt);
  --haarlijn: var(--lijn);
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  width: var(--breedte);
  height: var(--hoogte);
  padding: 8rem;
  overflow: hidden;
  background: var(--grond-licht);
  color: var(--grond-licht-tekst);
}
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p, ol, ul, dl, dd { margin: 0; }
svg { display: block; }
.symbolen { position: absolute; width: 0; height: 0; }

/* Drie ondergronden, per beeld één; het accent van de kop volgt de ondergrond. De kleuren komen uit het merk (gronden). */
.grond-inkt { background: var(--grond-inkt); color: var(--grond-inkt-tekst); --nadruk: var(--accent-licht); --zacht: var(--accent-bleek); --haarlijn: color-mix(in srgb, var(--accent-bleek) 22%, var(--grond-inkt)); }
.grond-accent { background: var(--grond-accent); color: var(--grond-accent-tekst); --nadruk: var(--accent-bleek); --zacht: var(--grond-accent-tekst); --haarlijn: color-mix(in srgb, var(--grond-accent-tekst) 32%, var(--grond-accent)); }

.logo { display: block; align-self: flex-start; height: 4.6rem; width: auto; }
.icoon { width: 2.4rem; height: 2.4rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.kop { font-size: 10.4rem; font-weight: 550; line-height: 1.03; letter-spacing: -.04em; text-wrap: balance; }
.kop em { font-style: normal; color: var(--nadruk); }
.kop.middel { font-size: 8.4rem; line-height: 1.06; }
.kop.klein { font-size: 6.6rem; line-height: 1.08; }
.tekst { font-size: 3rem; line-height: 1.45; color: var(--zacht); max-width: 32ch; text-wrap: pretty; }

.voet { display: flex; align-items: center; justify-content: space-between; gap: 3rem; padding-top: 3rem; border-top: .2rem solid var(--haarlijn); font-size: 2.3rem; color: var(--zacht); }
.voet strong { font-weight: 550; color: inherit; }
.kopregel { display: flex; align-items: center; justify-content: space-between; gap: 3rem; }

/* Motief: de zigzag van de W uit het logo, als lijn op grote schaal (merk/motieven/route.svg). */
.route { position: absolute; z-index: -1; width: 132rem; top: -16.75rem; left: -13.5rem; fill: none; stroke: var(--route, var(--accent-zacht)); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
.grond-inkt .route { --route: color-mix(in srgb, var(--accent-licht) 9%, var(--grond-inkt)); }
.grond-accent .route { --route: color-mix(in srgb, var(--grond-accent-tekst) 9%, var(--grond-accent)); }

/* Motief: een haarlijnring, zoals de profielachtergrond hem gebruikt. */
.ring { position: absolute; z-index: -1; aspect-ratio: 1; border-radius: 50%; border: .2rem solid color-mix(in srgb, var(--accent) 18%, transparent); }
.grond-inkt .ring { border-color: var(--haarlijn); }
.grond-accent .ring { border-color: var(--haarlijn); }

/* Papieren lagen: vlak gedraaid, nooit perspectief; lange zachte schaduw die onder het papier blijft. */
.papier { background: var(--wit); color: var(--inkt); border-radius: 1.8rem; box-shadow: 0 2.5rem 5.7rem -2.5rem rgb(43 17 11 / .24); }
.bedrag { font-variant-numeric: tabular-nums; letter-spacing: -.035em; white-space: nowrap; }

/* De keten: open knooppunten, een lijn, het laatste knooppunt gevuld. */
.keten { display: flex; align-items: center; gap: 1.6rem; font-size: 2.2rem; color: var(--zacht); }
.keten > span, .keten > strong { display: inline-flex; align-items: center; gap: 1.2rem; white-space: nowrap; }
.keten > span::before, .keten > strong::before { content: ""; width: 1.4rem; height: 1.4rem; border: .22rem solid var(--nadruk); border-radius: 50%; }
.keten > strong { font-weight: 550; color: inherit; }
.keten > strong::before { background: var(--nadruk); }
.keten > i { flex: 1; min-width: 3rem; height: .2rem; background: var(--haarlijn); }

/* Werkroute: genummerde stappen die een lijn verbindt; de volgorde draagt betekenis. */
.werkroute { list-style: none; padding: 0; }
.werkroute li { position: relative; display: flex; gap: 3.2rem; align-items: flex-start; padding-block: 2.6rem; }
.werkroute li + li { border-top: .15rem solid var(--haarlijn); }
.werkroute li:not(:last-child)::before { content: ""; position: absolute; left: 2.8rem; top: 9.2rem; bottom: -2.6rem; width: .15rem; background: color-mix(in srgb, var(--accent-licht) 45%, var(--inkt)); }
.routenummer { display: grid; place-items: center; width: 5.7rem; height: 5.7rem; flex-shrink: 0; border: .15rem solid color-mix(in srgb, var(--accent-licht) 45%, var(--inkt)); border-radius: 50%; color: var(--accent-licht); font-size: 2rem; font-variant-numeric: tabular-nums; }
.werkroute h2 { padding-top: .8rem; font-size: 3.2rem; font-weight: 550; letter-spacing: -.02em; line-height: 1.3; }
.werkroute p { margin-top: .8rem; max-width: 40ch; font-size: 2.4rem; line-height: 1.5; color: var(--zacht); }

/* Verticaal verhaal (9:16): 250px vrij boven en onder voor de bediening van het platform (uit de Codex-kit). */
.vorm-story .beeld { padding-block: 25rem; }

/* Welke stap in een carrousel: vier (of drie) knooppunten, de huidige gevuld. LinkedIn telt zelf de pagina's. */
.stapketen { display: flex; align-items: center; gap: .8rem; }
.stapketen i { width: 1.5rem; height: 1.5rem; border: .22rem solid var(--nadruk); border-radius: 50%; }
.stapketen i.nu { background: var(--nadruk); }
.stapketen b { width: 3.2rem; height: .2rem; background: var(--haarlijn); }
.beeld:not(.grond-inkt):not(.grond-accent) .stapketen b { background: var(--accent-bleek); }

/* Een lijst met vinkjes in een vel, voor wat de gebruiker zelf doet. */
.vinklijst { padding: 1.4rem 3.6rem; }
.vinklijst li { display: flex; align-items: center; gap: 2rem; padding-block: 2.6rem; border-top: .15rem solid var(--lijn); font-size: 2.8rem; font-weight: 550; letter-spacing: -.015em; list-style: none; }
.vinklijst li:first-child { border-top: 0; }
.vinklijst .icoon { width: 3rem; height: 3rem; color: var(--accent); stroke-width: 2; }
`;
