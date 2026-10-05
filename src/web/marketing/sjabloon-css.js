// Marketingstudio — de basisopmaak van alle sjablonen, overgenomen uit de merkkit
// (docs/ontwerpen/brand-kits/Mixed/mijntarieftool/sociaal/bron/sociaal.css). Drie bewuste
// wijzigingen, allemaal omdat een beeld hier in een foreignObject of een geschaald iframe staat
// in plaats van in een eigen browservenster:
//  - geen `html { font-size: calc(100vw / 108) }`: `bouwBeeld` rekent elke rem om naar pixels
//    (breedte ÷ 108), want in een foreignObject is de root het <svg>-element (spike M0);
//  - `.beeld` krijgt de maat van het formaat (`--breedte`/`--hoogte`) in plaats van 100vw/100vh;
//  - de media query voor stories is de vormklasse `.vorm-story` geworden.
// De kleuren en de letter komen niet via `@import url("../../merk.css")` maar uit `merk.json` en
// de lokaal gehoste Geist (zie `merkCss` in sjablonen.js).
export const BASIS_CSS = `/* Sjablonen voor sociale media. Eén rem is 10px op een canvas van 1080 breed en schaalt mee met de breedte,
   zodat één bron zowel 1200×1200 als 1080×1350 oplevert. Maten van de site ×1,5 (site 12px = 1,8rem). */
body { margin: 0; }
.beeld {
  --nadruk: var(--blauw);
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
  background: var(--achtergrond);
  color: var(--inkt);
}
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p, ol, ul, dl, dd { margin: 0; }
svg { display: block; }
.symbolen { position: absolute; width: 0; height: 0; }

/* Drie ondergronden, per beeld één; het accent van de kop volgt de ondergrond (The Three-Grounds Rule). */
.grond-inkt { background: var(--inkt); color: var(--wit); --nadruk: var(--lucht); --zacht: var(--bleek-blauw); --haarlijn: color-mix(in srgb, var(--bleek-blauw) 22%, var(--inkt)); }
.grond-blauw { background: var(--blauw); color: var(--wit); --nadruk: var(--bleek-blauw); --zacht: var(--zacht-blauw); --haarlijn: color-mix(in srgb, var(--wit) 32%, var(--blauw)); }

.logo { display: block; align-self: flex-start; height: 4.6rem; width: auto; }
.icoon { width: 2.4rem; height: 2.4rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.kop { font-size: 10.4rem; font-weight: 550; line-height: 1.03; letter-spacing: -.04em; text-wrap: balance; }
.kop em { font-style: normal; color: var(--nadruk); }
.kop.middel { font-size: 8.4rem; line-height: 1.06; }
.kop.klein { font-size: 6.6rem; line-height: 1.08; }
.tekst { font-size: 3rem; line-height: 1.45; color: var(--zacht); max-width: 32ch; text-wrap: pretty; }

.voet { display: flex; align-items: center; justify-content: space-between; gap: 3rem; padding-top: 3rem; border-top: .2rem solid var(--haarlijn); font-size: 2.3rem; color: var(--zacht); }
.voet strong { font-weight: 550; color: inherit; }
.voorbeeld { font-size: 2rem; color: var(--zacht); }
.kopregel { display: flex; align-items: center; justify-content: space-between; gap: 3rem; }

/* Motief: de lijnen van het merkteken op grote schaal; drie afspraken die samenkomen in één pijl omhoog. */
.route { position: absolute; z-index: -1; width: 132rem; top: -16.75rem; left: -13.5rem; fill: none; stroke: var(--route, var(--zacht-blauw)); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
.grond-inkt .route { --route: color-mix(in srgb, var(--lucht) 9%, var(--inkt)); }
.grond-blauw .route { --route: color-mix(in srgb, var(--wit) 9%, var(--blauw)); }

/* Motief: de grote bleekblauwe cirkel met een haarlijnring, zoals achter de heldcompositie. */
.cirkel { position: absolute; z-index: -2; aspect-ratio: 1; border-radius: 50%; background: var(--bleek-blauw); }
.ring { position: absolute; z-index: -1; aspect-ratio: 1; border-radius: 50%; border: .2rem solid color-mix(in srgb, var(--blauw) 18%, transparent); }
.grond-inkt .ring { border-color: var(--haarlijn); }
.grond-blauw .ring { border-color: var(--haarlijn); }

/* Papieren lagen: vlak gedraaid, nooit perspectief; lange zachte schaduw die onder het papier blijft. */
.papier { background: var(--wit); color: var(--inkt); border-radius: 1.8rem; box-shadow: 0 2.5rem 5.7rem -2.5rem rgb(16 36 62 / .24); }
.rekenkaart { background: var(--inkt); color: var(--wit); border-radius: 2.4rem; box-shadow: 0 5.2rem 8.2rem -3.7rem rgb(16 36 62 / .45); }
.label { display: flex; align-items: center; gap: 1.8rem; padding: 2.4rem 3rem; border-radius: 1.8rem; background: var(--wit); color: var(--inkt); box-shadow: 0 2.1rem 6rem -3rem rgb(16 36 62 / .4); }
.label strong { display: block; font-size: 2.2rem; font-weight: 550; }
.label small { display: block; margin-top: .4rem; font-size: 1.9rem; color: var(--gedempt); }
.vinkrondje { display: grid; place-items: center; width: 5.4rem; height: 5.4rem; border-radius: 50%; background: var(--zacht-blauw); color: var(--blauw); flex-shrink: 0; }
.documentlijn { display: block; height: .75rem; border-radius: .4rem; background: var(--lijn); }
.bedrag { font-variant-numeric: tabular-nums; letter-spacing: -.035em; white-space: nowrap; }

/* Bronstatus zoals in de app: altijd uitgeschreven. */
.status { display: inline-flex; align-items: center; gap: .8rem; padding: .7rem 1.5rem; border-radius: 99rem; font-size: 2.1rem; font-weight: 600; white-space: nowrap; }
.status .icoon { width: 2rem; height: 2rem; stroke-width: 2; }
.status-aanname { background: var(--zacht-waarschuwing); color: var(--waarschuwing); }
.status-document { background: var(--zacht-blauw); color: var(--blauw-hover); }
.status-bevestigd { background: color-mix(in srgb, var(--succes) 11%, var(--wit)); color: var(--succes); }

/* De keten: open knooppunten, een lijn, het laatste knooppunt gevuld. */
.keten { display: flex; align-items: center; gap: 1.6rem; font-size: 2.2rem; color: var(--zacht); }
.keten > span, .keten > strong { display: inline-flex; align-items: center; gap: 1.2rem; white-space: nowrap; }
.keten > span::before, .keten > strong::before { content: ""; width: 1.4rem; height: 1.4rem; border: .22rem solid var(--nadruk); border-radius: 50%; }
.keten > strong { font-weight: 550; color: inherit; }
.keten > strong::before { background: var(--nadruk); }
.keten > i { flex: 1; min-width: 3rem; height: .2rem; background: var(--haarlijn); }

/* De tariefcompositie van de heldsectie (landing-visuals.css): bron, berekening en controle als lagen.
   Maten in em, waarbij 1em = 10 sitepixels; de font-size van .compositie zet de schaal (1.25rem = 1,25× de site). */
.compositie { position: relative; isolation: isolate; width: 62em; height: 58em; font-size: 1.25rem; }
.compositie > * { position: absolute; }
.compositie .cirkel { width: 95%; top: 2.5em; right: -.8em; }
.compositie .ring { width: 100%; top: 5.5em; left: -1.5em; border-width: .15em; }
.compositie .papier { border-radius: 1.2em; box-shadow: 0 1.7em 3.8em -1.7em rgb(16 36 62 / .2); }
.bronblad { top: 2em; left: 9%; width: 26.5em; padding: 2.2em; transform: rotate(-9deg); }
.bronblad-kop { display: flex; align-items: center; gap: .9em; font-size: 1.5em; font-weight: 550; }
.bronblad-kop .icoon { width: 1.4em; height: 1.4em; color: var(--blauw); }
.bronblad .documentlijn { width: 87%; height: .5em; margin-top: 2.3em; }
.bronblad .documentlijn.kort { width: 58%; margin-top: .8em; }
.bronselectie { display: flex; align-items: center; gap: 1.2em; padding: 1em; margin-top: 1.6em; border-radius: .4em; background: var(--zacht-blauw); color: var(--blauw-hover); font-size: 1.5em; }
.bronselectie strong { margin-left: auto; font-weight: 600; }
.bronselectie .icoon { width: 1.1em; height: 1.1em; }
.rekenblad { top: 17.9em; left: 0; width: 98%; padding: 2.3em 2.5em 0; border-radius: 1.6em; transform: rotate(-3deg); box-shadow: 0 3.5em 5.5em -2.5em rgb(16 36 62 / .4); }
.rekenblad-kop { display: flex; align-items: center; justify-content: space-between; padding-bottom: 1.9em; }
.rekenblad-kop span { display: block; margin-bottom: .3em; font-size: 1.5em; color: var(--bleek-blauw); }
.rekenblad-kop strong { font-size: 2em; font-weight: 550; letter-spacing: -.02em; }
.rekenblad-kop img { width: 3.2em; height: 3.2em; }
.rekeninhoud { display: grid; grid-template-columns: 1fr 1.06fr; gap: 2.2em; align-items: center; }
.rekenregels > div { padding-block: 1.3em; border-bottom: .1em solid color-mix(in srgb, var(--wit) 17%, var(--inkt)); }
.rekenregels > div:first-child { padding-top: 0; }
.rekenregels span { display: block; font-size: 1.5em; color: var(--bleek-blauw); }
.rekenregels strong { display: block; margin-top: .15em; font-size: 2.6em; font-weight: 500; }
.rekenregels p { display: flex; align-items: center; gap: .6em; margin-top: 1.1em; font-size: 1.5em; color: var(--bleek-blauw); }
.rekenregels .icoon { width: 1.1em; height: 1.1em; color: var(--lucht); }
.uitkomst { padding: 2.1em 1.8em 1.7em; border-radius: 1.2em; background: var(--wit); color: var(--inkt); }
.uitkomst > span { display: block; font-size: 1.5em; color: var(--gedempt); }
.uitkomst > strong { display: block; margin-block: .2em 0; font-size: 5.3em; font-weight: 550; line-height: 1.2; }
.kostenbalk { display: flex; gap: .3em; height: 1.1em; margin-top: 2.2em; }
.kostenbalk i { width: 84.06%; border-radius: .2em; background: var(--blauw); }
.kostenbalk i + i { width: 15.94%; background: var(--lucht); }
.kostenlegenda { display: flex; justify-content: space-between; margin-top: .7em; font-size: 1.4em; color: var(--gedempt); }
.rekenvoet { display: flex; align-items: center; justify-content: space-between; margin-top: 2.2em; padding-block: 1.4em; border-top: .1em solid color-mix(in srgb, var(--wit) 17%, var(--inkt)); font-size: 1.5em; color: var(--bleek-blauw); }
.rekenvoet .icoon { width: 1.2em; height: 1.2em; color: var(--lucht); }
.compositie .label { right: 0; bottom: 1.3em; gap: 1.2em; padding: 1.7em 2em; border-radius: 1.2em; font-size: 1em; transform: rotate(3deg); box-shadow: 0 1.4em 4em -2em rgb(16 36 62 / .36); }
.compositie .label strong { font-size: 1.7em; }
.compositie .label small { font-size: 1.4em; }
.compositie .vinkrondje { width: 3.6em; height: 3.6em; }
.compositie .vinkrondje .icoon { width: 2em; height: 2em; }

/* Oordelen bij de loonstrookcontrole: tekst, icoon én kleur. */
.status-overeen { background: color-mix(in srgb, var(--succes) 11%, var(--wit)); color: var(--succes); }
.status-controleren { background: var(--zacht-waarschuwing); color: var(--waarschuwing); }
.status-neutraal { background: color-mix(in srgb, var(--gedempt) 11%, var(--wit)); color: var(--gedempt); }

/* Rijen in een papieren kaart: label links, waarde en status rechts, haarlijn ertussen. */
.rijen { padding: 1.2rem 3.6rem; }
.rij { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: .6rem 3rem; padding-block: 2.6rem; border-top: .15rem solid var(--lijn); }
.rij:first-child { border-top: 0; }
.rij strong { font-size: 2.8rem; font-weight: 550; letter-spacing: -.015em; }
.rij small { grid-column: 1; font-size: 2.1rem; color: var(--gedempt); }
.rij .bedrag { font-size: 2.8rem; font-weight: 550; text-align: right; }
.rij .status { grid-column: 2; grid-row: 2; justify-self: end; }
.kaartkop { display: flex; align-items: center; gap: 1.8rem; padding: 3rem 3.6rem 2.4rem; border-bottom: .15rem solid var(--lijn); }
.kaartkop > span:first-child { display: grid; place-items: center; width: 5.6rem; height: 5.6rem; border-radius: 1.2rem; background: var(--zacht-blauw); color: var(--blauw); font-size: 2.4rem; font-weight: 600; }
.kaartkop strong { display: block; font-size: 3rem; font-weight: 550; letter-spacing: -.02em; }
.kaartkop small { display: block; margin-top: .3rem; font-size: 2.1rem; color: var(--gedempt); }

/* Werkroute: genummerde stappen die een lijn verbindt; de volgorde draagt betekenis. */
.werkroute { list-style: none; padding: 0; }
.werkroute li { position: relative; display: flex; gap: 3.2rem; align-items: flex-start; padding-block: 2.6rem; }
.werkroute li + li { border-top: .15rem solid var(--haarlijn); }
.werkroute li:not(:last-child)::before { content: ""; position: absolute; left: 2.8rem; top: 9.2rem; bottom: -2.6rem; width: .15rem; background: color-mix(in srgb, var(--lucht) 45%, var(--inkt)); }
.routenummer { display: grid; place-items: center; width: 5.7rem; height: 5.7rem; flex-shrink: 0; border: .15rem solid color-mix(in srgb, var(--lucht) 45%, var(--inkt)); border-radius: 50%; color: var(--lucht); font-size: 2rem; font-variant-numeric: tabular-nums; }
.werkroute h2 { padding-top: .8rem; font-size: 3.2rem; font-weight: 550; letter-spacing: -.02em; line-height: 1.3; }
.werkroute p { margin-top: .8rem; max-width: 40ch; font-size: 2.4rem; line-height: 1.5; color: var(--zacht); }

/* Verticaal verhaal (9:16): 250px vrij boven en onder voor de bediening van het platform (uit de Codex-kit). */
.vorm-story .beeld { padding-block: 25rem; }

/* Welke stap in een carrousel: vier (of drie) knooppunten, de huidige gevuld. LinkedIn telt zelf de pagina's. */
.stapketen { display: flex; align-items: center; gap: .8rem; }
.stapketen i { width: 1.5rem; height: 1.5rem; border: .22rem solid var(--nadruk); border-radius: 50%; }
.stapketen i.nu { background: var(--nadruk); }
.stapketen b { width: 3.2rem; height: .2rem; background: var(--haarlijn); }
.beeld:not(.grond-inkt):not(.grond-blauw) .stapketen b { background: var(--bleek-blauw); }

/* De compositie van de over-ons-pagina (landing-over-ons.css): de afspraken, de blauwe kaart en de controle.
   Net als .compositie: maten in em, 1em = 10 sitepixels; de font-size van .stapel zet de schaal. */
.stapel { position: relative; isolation: isolate; width: 60em; height: 64em; font-size: 1.3rem; } /* 64em: de cirkel steekt onder de lagen uit */
.stapel > * { position: absolute; }
.stapel .cirkel { inset: 4.2em -.8em auto .8em; }
.stapel-vel { top: 1.5em; left: 8%; width: 76%; padding: 2.6em; border-radius: 1.2em; background: var(--wit); color: var(--inkt); transform: rotate(-8deg); box-shadow: 0 2em 4em -2em rgb(16 36 62 / .25); }
.stapel-vel-kop { display: flex; align-items: center; gap: .7em; margin-bottom: 1.3em; font-size: 1.4em; font-weight: 550; }
.stapel-vel-kop .icoon { width: 1.43em; height: 1.43em; color: var(--blauw); }
.stapel-vel > div:not(:first-child) { display: flex; align-items: baseline; justify-content: space-between; gap: .9em; padding-block: .92em; border-top: .08em solid var(--lijn); font-size: 1.3em; }
.stapel-vel span { color: var(--gedempt); }
.stapel-vel b { font-weight: 500; }
.stapel-kaart { top: 24.5em; right: 1%; width: 88%; padding: 2.8em; border-radius: 1.6em; background: var(--blauw); color: var(--wit); transform: rotate(4deg); box-shadow: 0 3.5em 5.5em -2.5em rgb(16 36 62 / .4); }
.stapel-kaart > svg { width: 3.4em; height: 3.4em; margin-bottom: 2.2em; }
.stapel-kaart > p { font-size: 4.2em; font-weight: 500; line-height: 1.1; letter-spacing: -.035em; }
.stapel-route { display: flex; align-items: center; justify-content: space-between; gap: .6em; margin-top: 2em; padding-top: 1.4em; border-top: .08em solid color-mix(in srgb, var(--wit) 30%, transparent); font-size: 1.3em; }
.stapel-route .icoon { width: 1.23em; height: 1.23em; }
.stapel-controle { bottom: .2em; left: 0; display: flex; align-items: center; gap: .7em; padding: 1.2em 1.4em; border-radius: .86em; background: var(--wit); color: var(--inkt); font-size: 1.4em; font-weight: 500; transform: rotate(-3deg); box-shadow: 0 1em 2.9em -1.4em rgb(16 36 62 / .36); }
.stapel-controle .icoon { width: 1.43em; height: 1.43em; color: var(--blauw); }

/* Het tariefoverzicht als PDF, zoals onder de werkroute op de site (landing-visuals.css). */
.uitvoer { position: relative; width: 37em; height: 30em; font-size: 1.6rem; }
.uitvoer-vel { width: 30em; padding: 2.4em; border-radius: .8em; background: var(--wit); color: var(--inkt); transform: rotate(-5deg); box-shadow: 0 2.2em 3.8em -2.2em rgb(16 36 62 / .4); }
.uitvoer-kop { display: flex; align-items: center; gap: .67em; color: var(--blauw); font-size: 1.2em; }
.uitvoer-kop .icoon { width: 1.4em; height: 1.4em; }
.uitvoer-kop > span:last-child { margin-left: auto; padding: .15em .5em; border-radius: .25em; background: var(--zacht-blauw); }
.uitvoer-vel > p { margin-top: 1.8em; font-size: 1.2em; color: var(--gedempt); }
.uitvoer-bedrag { display: flex; align-items: baseline; gap: .8em; margin-top: .3em; }
.uitvoer-bedrag strong { font-size: 3.7em; font-weight: 500; line-height: 1.4; }
.uitvoer-bedrag span { font-size: 1.2em; color: var(--gedempt); }
.uitvoer .documentlijn { width: 91%; height: .4em; margin-top: 1.5em; }
.uitvoer .documentlijn.kort { width: 57%; margin-top: .7em; }
.uitvoer-label { position: absolute; right: 0; bottom: 0; display: flex; align-items: center; gap: .77em; padding: 1.1em 1.5em; border-radius: .6em; background: var(--blauw); color: var(--wit); font-size: 1.3em; font-weight: 500; transform: rotate(3deg); }
.uitvoer-label .icoon { width: 1.4em; height: 1.4em; }

/* Een lijst met vinkjes in een vel, voor wat de gebruiker zelf doet. */
.vinklijst { padding: 1.4rem 3.6rem; }
.vinklijst li { display: flex; align-items: center; gap: 2rem; padding-block: 2.6rem; border-top: .15rem solid var(--lijn); font-size: 2.8rem; font-weight: 550; letter-spacing: -.015em; list-style: none; }
.vinklijst li:first-child { border-top: 0; }
.vinklijst .icoon { width: 3rem; height: 3rem; color: var(--blauw); stroke-width: 2; }
`;
